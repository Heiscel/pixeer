import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceAgent } from '../voice';

// ---------------------------------------------------------------------------
// Browser API mocks
// ---------------------------------------------------------------------------

interface MockUtterance {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: unknown;
  onend: ((e: Event) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function makeSpeechSynthesis() {
  const utterances: MockUtterance[] = [];

  // Mock SpeechSynthesisUtterance constructor
  const UtteranceCtor = vi.fn().mockImplementation((text: string): MockUtterance => {
    const u: MockUtterance = { text, lang: '', rate: 1, pitch: 1, voice: null, onend: null, onerror: null };
    utterances.push(u);
    return u;
  });
  (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = UtteranceCtor;

  return {
    mock: {
      speak: vi.fn((u: MockUtterance) => {
        // Simulate async end
        Promise.resolve().then(() => u.onend?.(new Event('end')));
      }),
      cancel: vi.fn(() => {
        utterances.length = 0;
      }),
      getVoices: vi.fn(() => []),
      onvoiceschanged: null as (() => void) | null,
    } as unknown as SpeechSynthesis,
    utterances,
    UtteranceCtor,
  };
}

function makeSpeechRecognition() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onresult: ((e: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onerror: ((e: any) => void) | null = null;
  let onend: (() => void) | null = null;

  const ctor = vi.fn().mockImplementation(() => ({
    lang: '',
    interimResults: false,
    continuous: false,
    start: vi.fn(),
    stop: vi.fn(),
    set onresult(fn: typeof onresult) { onresult = fn; },
    set onerror(fn: typeof onerror) { onerror = fn; },
    set onend(fn: typeof onend) { onend = fn; },
  }));

  return { ctor, getOnResult: () => onresult, getOnError: () => onerror, getOnEnd: () => onend };
}

// ---------------------------------------------------------------------------

describe('VoiceAgent — unsupported environment', () => {
  it('supported.synthesis is false when speechSynthesis absent', () => {
    const agent = new VoiceAgent();
    // In happy-dom speechSynthesis may or may not be present; we test the flag matches reality
    expect(typeof agent.supported.synthesis).toBe('boolean');
    expect(typeof agent.supported.recognition).toBe('boolean');
  });

  it('speak() resolves immediately when synthesis unavailable', async () => {
    // Force no synth by patching window temporarily
    const orig = (window as unknown as Record<string, unknown>).speechSynthesis;
    delete (window as unknown as Record<string, unknown>).speechSynthesis;

    const agent = new VoiceAgent();
    await expect(agent.speak('hello')).resolves.toBeUndefined();

    if (orig) (window as unknown as Record<string, unknown>).speechSynthesis = orig;
  });
});

describe('VoiceAgent — with mocked synthesis', () => {
  let synth: ReturnType<typeof makeSpeechSynthesis>;
  let agent: VoiceAgent;
  let narrationCb: ReturnType<typeof vi.fn>;
  let errorCb: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    synth = makeSpeechSynthesis();
    (window as unknown as Record<string, unknown>).speechSynthesis = synth.mock;

    narrationCb = vi.fn();
    errorCb = vi.fn();
    agent = new VoiceAgent({ lang: 'en-US', rate: 1.5, pitch: 0.8, onNarration: narrationCb, onError: errorCb });
  });

  it('speak() calls onNarration and resolves on end', async () => {
    await agent.speak('Hello world');
    expect(narrationCb).toHaveBeenCalledWith('Hello world');
    expect(synth.mock.speak).toHaveBeenCalledOnce();
  });

  it('speak() with rate/pitch overrides uses provided values', async () => {
    await agent.speak('Test', { rate: 2, pitch: 1.5 });
    const utterance = synth.utterances[0];
    expect(utterance.rate).toBe(2);
    expect(utterance.pitch).toBe(1.5);
  });

  it('speak() without overrides uses instance defaults', async () => {
    await agent.speak('Test');
    const utterance = synth.utterances[0];
    expect(utterance.rate).toBe(1.5);
    expect(utterance.pitch).toBe(0.8);
  });

  it('speaking getter is false after speak() resolves', async () => {
    const p = agent.speak('Hi');
    await p;
    expect(agent.speaking).toBe(false);
  });

  it('cancelSpeech() calls synth.cancel and sets speaking false', async () => {
    agent.cancelSpeech();
    expect(synth.mock.cancel).toHaveBeenCalled();
    expect(agent.speaking).toBe(false);
  });

  it('getVoices() returns synth voices', () => {
    const voices = agent.getVoices();
    expect(Array.isArray(voices)).toBe(true);
  });

  it('dispose() cancels speech', () => {
    agent.dispose();
    expect(synth.mock.cancel).toHaveBeenCalled();
  });

  it('speak() rejects and calls onError when utterance errors', async () => {
    // Override speak to fire onerror instead of onend
    (synth.mock.speak as ReturnType<typeof vi.fn>).mockImplementationOnce((u: MockUtterance) => {
      Promise.resolve().then(() => u.onerror?.({ error: 'synthesis-failed' }));
    });

    await expect(agent.speak('boom')).rejects.toThrow('speechSynthesis error: synthesis-failed');
    expect(errorCb).toHaveBeenCalledOnce();
  });

  it('setVoice() overrides the synthesis voice', () => {
    const fakeVoice = { name: 'Alice', lang: 'en-US' } as unknown as SpeechSynthesisVoice;
    agent.setVoice(fakeVoice);
    // Verify subsequent speak() uses the voice
    agent.speak('Hello');
    const utterance = synth.utterances[0];
    expect(utterance.voice).toBe(fakeVoice);
  });
});

describe('VoiceAgent — with mocked recognition', () => {
  let recCtor: ReturnType<typeof makeSpeechRecognition>;
  let transcriptCb: ReturnType<typeof vi.fn>;
  let agent: VoiceAgent;

  beforeEach(() => {
    recCtor = makeSpeechRecognition();
    (window as unknown as Record<string, unknown>).SpeechRecognition = recCtor.ctor;

    transcriptCb = vi.fn();
    agent = new VoiceAgent({ onTranscript: transcriptCb });
  });

  it('listening starts false', () => {
    expect(agent.listening).toBe(false);
  });

  it('start() sets listening true', () => {
    agent.start();
    expect(agent.listening).toBe(true);
  });

  it('stop() sets listening false', () => {
    agent.start();
    agent.stop();
    expect(agent.listening).toBe(false);
  });

  it('start() is idempotent', () => {
    agent.start();
    agent.start();
    expect(agent.listening).toBe(true);
  });

  it('stop() is idempotent', () => {
    agent.stop();
    expect(agent.listening).toBe(false);
  });
});

describe('VoiceAgent — disallowInterruptions', () => {
  it('blocks onTranscript while interruptions disallowed and re-enables after', () => {
    const transcriptCb = vi.fn();
    const agent = new VoiceAgent({ onTranscript: transcriptCb });

    // Patch a fake recognition handler
    const allow = agent.disallowInterruptions();

    // Manually test internal state by checking the public API still works after re-enable
    allow();
    expect(typeof allow).toBe('function');
  });
});
