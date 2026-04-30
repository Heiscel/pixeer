import type { TraceEvent, TraceEventType } from './analytics.js';

// ---------------------------------------------------------------------------
// ReplayEngine — step through a recorded agent trace
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  index: number;
  timestamp: number;
  /** Relative ms from the first event in the trace */
  relativeMs: number;
  type: TraceEventType;
  name: string;
  durationMs?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  /** Input/output payloads serialized for display */
  inputSummary: string;
  outputSummary: string;
}

export interface ReplayDiff {
  added: TraceEvent[];
  removed: TraceEvent[];
  changed: Array<{ a: TraceEvent; b: TraceEvent; fields: string[] }>;
}

export class ReplayEngine {
  private cursor = 0;

  constructor(private readonly events: TraceEvent[]) {}

  get length(): number {
    return this.events.length;
  }

  get position(): number {
    return this.cursor;
  }

  /** Reset the cursor to the start. */
  reset(): void {
    this.cursor = 0;
  }

  /** Advance one step and return the event, or null at the end. */
  step(): TraceEvent | null {
    if (this.cursor >= this.events.length) return null;
    return this.events[this.cursor++];
  }

  /** Peek at the next event without advancing. */
  peek(): TraceEvent | null {
    return this.events[this.cursor] ?? null;
  }

  /** Find the first event matching a predicate. */
  findStep(predicate: (event: TraceEvent) => boolean): TraceEvent | undefined {
    return this.events.find(predicate);
  }

  /** Find all events of a given type. */
  stepsByType(type: TraceEventType): TraceEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /** Return all events for a specific traceId. */
  byTrace(traceId: string): TraceEvent[] {
    return this.events.filter((e) => e.traceId === traceId);
  }

  /** Get a human-readable timeline of all events. */
  getTimeline(): TimelineEntry[] {
    const base = this.events[0]?.timestamp ?? 0;
    return this.events.map((e, i) => ({
      index: i,
      timestamp: e.timestamp,
      relativeMs: e.timestamp - base,
      type: e.type,
      name: e.name,
      durationMs: e.durationMs,
      model: e.model,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      error: e.error,
      inputSummary: summarize(e.input),
      outputSummary: summarize(e.output),
    }));
  }

  /** Render a compact text timeline — useful for debugging and logging. */
  formatTimeline(): string {
    const entries = this.getTimeline();
    if (entries.length === 0) return '(empty trace)';

    const lines = entries.map((e) => {
      const dur = e.durationMs !== undefined ? ` [${e.durationMs}ms]` : '';
      const tokens =
        e.inputTokens !== undefined
          ? ` {in:${e.inputTokens} out:${e.outputTokens ?? 0}}`
          : '';
      const err = e.error ? ` ❌ ${e.error}` : '';
      const model = e.model ? ` (${e.model})` : '';
      return `+${e.relativeMs}ms  ${e.type.padEnd(14)} ${e.name}${model}${dur}${tokens}${err}`;
    });

    const totalDuration = (entries.at(-1)?.timestamp ?? 0) - (entries[0]?.timestamp ?? 0);
    const llmCalls = entries.filter((e) => e.type === 'llm:call').length;
    const toolCalls = entries.filter((e) => e.type === 'tool:call').length;
    const totalIn  = entries.reduce((n, e) => n + (e.inputTokens ?? 0), 0);
    const totalOut = entries.reduce((n, e) => n + (e.outputTokens ?? 0), 0);
    const errors   = entries.filter((e) => e.error).length;

    lines.push('');
    lines.push(`Summary: ${entries.length} spans | ${llmCalls} LLM calls | ${toolCalls} tool calls | ${totalDuration}ms total`);
    if (totalIn > 0) lines.push(`Tokens:  ${totalIn} input / ${totalOut} output`);
    if (errors > 0)  lines.push(`Errors:  ${errors}`);

    return lines.join('\n');
  }

  /**
   * Diff two traces — useful for comparing runs of the same task.
   * Matches events by spanId; unmatched = added/removed.
   */
  static diff(a: TraceEvent[], b: TraceEvent[]): ReplayDiff {
    const aById = new Map(a.map((e) => [e.spanId, e]));
    const bById = new Map(b.map((e) => [e.spanId, e]));

    const added: TraceEvent[]   = b.filter((e) => !aById.has(e.spanId));
    const removed: TraceEvent[] = a.filter((e) => !bById.has(e.spanId));
    const changed: ReplayDiff['changed'] = [];

    for (const ae of a) {
      const be = bById.get(ae.spanId);
      if (!be) continue;
      const fields = diffFields(ae, be);
      if (fields.length > 0) changed.push({ a: ae, b: be, fields });
    }

    return { added, removed, changed };
  }

  /** Export the trace as JSONL (one event per line) — for storage and streaming. */
  toJSONL(): string {
    return this.events.map((e) => JSON.stringify(e)).join('\n');
  }

  /** Reconstruct a ReplayEngine from a JSONL string. */
  static fromJSONL(jsonl: string): ReplayEngine {
    const events = jsonl
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TraceEvent);
    return new ReplayEngine(events);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarize(value: unknown, maxLen = 80): string {
  if (value === undefined || value === null) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

function diffFields(a: TraceEvent, b: TraceEvent): string[] {
  const keys: (keyof TraceEvent)[] = [
    'type', 'name', 'input', 'output', 'error',
    'model', 'system', 'operationName', 'inputTokens', 'outputTokens', 'durationMs',
  ];
  return keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
