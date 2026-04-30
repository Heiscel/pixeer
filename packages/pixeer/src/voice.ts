// ---------------------------------------------------------------------------
// VoiceAgent — browser-native voice interface for Pixeer agents
//
// Tier 1 (this file): speechSynthesis (TTS) + SpeechRecognition (STT).
//   Zero infrastructure, works offline, no API keys required.
// Tier 2: LiveKit STT→LLM→TTS — wire up via the existing LiveKit transport
//   and pass transcripts / narration through the agent loop externally.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Minimal Web Speech API type declarations (not yet in TypeScript's lib.dom.d.ts)
// ---------------------------------------------------------------------------

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

// SpeechRecognition is webkit-prefixed in Chrome; standard in others.
type SpeechRecognitionCtor = (new () => SpeechRecognitionInstance) | undefined;

function getSpeechRecognition(): SpeechRecognitionCtor {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']) as SpeechRecognitionCtor;
}

// ---------------------------------------------------------------------------

export interface VoiceAgentOptions {
  /**
   * BCP-47 language tag for both synthesis and recognition.
   * @default 'en-US'
   */
  lang?: string;
  /**
   * Preferred voice name for synthesis. Pass `getVoices()` to browse available voices.
   * Falls back to the browser default when not found.
   */
  voiceName?: string;
  /** Speech rate, 0.1–10. @default 1 */
  rate?: number;
  /** Speech pitch, 0–2. @default 1 */
  pitch?: number;
  /** Fired on each recognition result. `isFinal` is true when the phrase is complete. */
  onTranscript?: (text: string, isFinal: boolean) => void;
  /** Fired just before the agent speaks a line of narration. */
  onNarration?: (text: string) => void;
  /** Fired on synthesis or recognition errors. */
  onError?: (error: Error) => void;
}

export interface SpeakOptions {
  /** Override the instance rate for this utterance. */
  rate?: number;
  /** Override the instance pitch for this utterance. */
  pitch?: number;
}

/**
 * Browser-native voice layer for Pixeer agent sessions.
 *
 * Provides text-to-speech narration and speech-to-text recognition using
 * built-in browser APIs — no API keys, no external services, no extra bundle.
 *
 * @example
 * const voice = new VoiceAgent({ lang: 'en-US', onTranscript: (t, final) => {
 *   if (final) handleCommand(t);
 * }});
 *
 * voice.start();                           // begin listening
 * await voice.speak('Navigating to dashboard');
 * const allow = voice.disallowInterruptions();
 * await agent.click('Dashboard');
 * allow();                                 // re-enable speech input
 * voice.stop();
 */
export class VoiceAgent {
  private readonly synth: SpeechSynthesis | null;
  private recognition: SpeechRecognitionInstance | null = null;
  private _listening = false;
  private _speaking = false;
  private interruptionsAllowed = true;
  private voiceOverride: SpeechSynthesisVoice | null = null;

  private readonly lang: string;
  private readonly rate: number;
  private readonly pitch: number;
  private readonly opts: VoiceAgentOptions;

  /**
   * Whether the required browser APIs are available.
   * Always false in SSR / Node environments.
   */
  readonly supported: {
    /** speechSynthesis is available. */
    synthesis: boolean;
    /** SpeechRecognition (or webkitSpeechRecognition) is available. */
    recognition: boolean;
  };

  constructor(opts: VoiceAgentOptions = {}) {
    this.opts = opts;
    this.lang = opts.lang ?? 'en-US';
    this.rate = opts.rate ?? 1;
    this.pitch = opts.pitch ?? 1;

    const hasSynth = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const RecognitionCtor = getSpeechRecognition();

    this.synth = hasSynth ? window.speechSynthesis : null;
    this.supported = { synthesis: hasSynth, recognition: !!RecognitionCtor };

    if (RecognitionCtor) {
      this.recognition = new RecognitionCtor();
      this.recognition.lang = this.lang;
      this.recognition.interimResults = true;
      this.recognition.continuous = true;
      this.recognition.onresult = (event) => this.handleResult(event);
      this.recognition.onerror = (event) => {
        this.opts.onError?.(new Error(`SpeechRecognition error: ${event.error}`));
      };
      this.recognition.onend = () => {
        // Auto-restart when continuous mode stops unexpectedly
        if (this._listening) {
          try { this.recognition!.start(); } catch { /* already started */ }
        }
      };
    }

    // Resolve preferred voice once voices are loaded
    if (hasSynth && opts.voiceName) {
      const resolve = () => {
        const match = window.speechSynthesis.getVoices().find(
          (v) => v.name === opts.voiceName,
        );
        if (match) this.voiceOverride = match;
      };
      resolve();
      window.speechSynthesis.onvoiceschanged = resolve;
    }
  }

  // ---------------------------------------------------------------------------
  // Recognition
  // ---------------------------------------------------------------------------

  /** Start listening for speech input. No-op if already listening or unsupported. */
  start(): void {
    if (!this.recognition || this._listening) return;
    this._listening = true;
    try { this.recognition.start(); } catch { /* already started */ }
  }

  /** Stop listening. No-op if not listening or unsupported. */
  stop(): void {
    if (!this.recognition || !this._listening) return;
    this._listening = false;
    try { this.recognition.stop(); } catch { /* already stopped */ }
  }

  get listening(): boolean { return this._listening; }

  private handleResult(event: SpeechRecognitionEvent): void {
    if (!this.interruptionsAllowed) return;
    const result = event.results[event.results.length - 1];
    if (!result) return;
    const text = result[0]?.transcript?.trim() ?? '';
    if (text) this.opts.onTranscript?.(text, result.isFinal);
  }

  // ---------------------------------------------------------------------------
  // Synthesis
  // ---------------------------------------------------------------------------

  /**
   * Speak text aloud. Resolves when the utterance finishes.
   * Cancels any currently-speaking utterance first.
   */
  speak(text: string, options?: SpeakOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synth) { resolve(); return; }

      this.synth.cancel();
      this.opts.onNarration?.(text);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.lang;
      utterance.rate = options?.rate ?? this.rate;
      utterance.pitch = options?.pitch ?? this.pitch;
      if (this.voiceOverride) utterance.voice = this.voiceOverride;

      this._speaking = true;
      utterance.onend = () => { this._speaking = false; resolve(); };
      utterance.onerror = (e) => {
        this._speaking = false;
        const err = new Error(`speechSynthesis error: ${e.error}`);
        this.opts.onError?.(err);
        reject(err);
      };

      this.synth.speak(utterance);
    });
  }

  /** Cancel any in-progress speech immediately. */
  cancelSpeech(): void {
    this._speaking = false;
    this.synth?.cancel();
  }

  get speaking(): boolean { return this._speaking; }

  // ---------------------------------------------------------------------------
  // Interruption guard
  // ---------------------------------------------------------------------------

  /**
   * Silence incoming speech recognition during a critical agent step.
   * Returns a function that re-enables interruptions.
   *
   * @example
   * const allow = voice.disallowInterruptions();
   * await agent.click('Confirm payment');
   * allow();
   */
  disallowInterruptions(): () => void {
    this.interruptionsAllowed = false;
    return () => { this.interruptionsAllowed = true; };
  }

  // ---------------------------------------------------------------------------
  // Voice selection
  // ---------------------------------------------------------------------------

  /** List voices available in the browser. May be empty before `onvoiceschanged` fires. */
  getVoices(): SpeechSynthesisVoice[] {
    return this.synth?.getVoices() ?? [];
  }

  /** Override the synthesis voice at runtime. */
  setVoice(voice: SpeechSynthesisVoice): void {
    this.voiceOverride = voice;
  }

  // ---------------------------------------------------------------------------

  dispose(): void {
    this.stop();
    this.cancelSpeech();
    if (this.synth) this.synth.onvoiceschanged = null;
  }
}
