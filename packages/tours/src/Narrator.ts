import type { NarratorLike } from './types.js';

/** Wraps any NarratorLike (e.g. pixeer's VoiceAgent) for tour narration.
 *  Falls back to console.log when no narrator is provided. */
export class Narrator {
  constructor(private readonly impl: NarratorLike | null = null) {}

  async speak(text: string): Promise<void> {
    if (this.impl) {
      await this.impl.speak(text);
    }
  }

  cancel(): void {
    this.impl?.cancelSpeech?.();
  }

  get available(): boolean {
    return this.impl !== null;
  }
}
