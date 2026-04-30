import type { PixeerAnalytics } from './analytics.js';
import type { TraceEvent, TraceEventType } from './analytics.js';

// ---------------------------------------------------------------------------
// PixeerSpan — fluent builder for a single trace span
// ---------------------------------------------------------------------------

export interface SpanOptions {
  traceId?: string;
  parentSpanId?: string;
  model?: string;
  system?: string;
  operationName?: string;
}

export class PixeerSpan {
  private readonly startMs: number;
  private _output: unknown;
  private _error: string | undefined;
  private _inputTokens: number | undefined;
  private _outputTokens: number | undefined;
  private _meta: Record<string, unknown> | undefined;

  /** @internal */
  constructor(
    private readonly analytics: PixeerAnalytics,
    readonly type: TraceEventType,
    readonly name: string,
    private readonly input: unknown,
    private readonly opts: SpanOptions & { spanId: string },
  ) {
    this.startMs = Date.now();
  }

  setOutput(output: unknown): this {
    this._output = output;
    return this;
  }

  setTokens(inputTokens: number, outputTokens: number): this {
    this._inputTokens = inputTokens;
    this._outputTokens = outputTokens;
    return this;
  }

  setError(error: string | Error): this {
    this._error = error instanceof Error ? error.message : error;
    return this;
  }

  setMeta(meta: Record<string, unknown>): this {
    this._meta = { ...this._meta, ...meta };
    return this;
  }

  /** Close the span and record it in analytics. */
  end(): TraceEvent {
    const event: Omit<TraceEvent, 'sessionId'> = {
      type: this.type,
      traceId: this.opts.traceId ?? this.analytics.sessionId,
      spanId: this.opts.spanId,
      parentSpanId: this.opts.parentSpanId,
      timestamp: this.startMs,
      durationMs: Date.now() - this.startMs,
      name: this.name,
      input: this.input,
      output: this._output,
      error: this._error,
      model: this.opts.model,
      system: this.opts.system,
      operationName: this.opts.operationName,
      inputTokens: this._inputTokens,
      outputTokens: this._outputTokens,
      meta: this._meta,
    };
    this.analytics.trace(event);
    return { ...event, sessionId: this.analytics.sessionId };
  }
}

// ---------------------------------------------------------------------------
// PixeerTracer — creates and records spans
// ---------------------------------------------------------------------------

export class PixeerTracer {
  constructor(private readonly analytics: PixeerAnalytics) {}

  /**
   * Start a span for an LLM call.
   *
   * @example
   * const span = tracer.llm('claude-sonnet-4-6', messages, { system: 'anthropic', traceId });
   * const response = await callLLM(messages);
   * span.setOutput(response).setTokens(inputTok, outputTok).end();
   */
  llm(model: string, input: unknown, opts: SpanOptions = {}): PixeerSpan {
    return new PixeerSpan(this.analytics, 'llm:call', `llm:${model}`, input, {
      ...opts,
      spanId: newSpanId(),
      model,
      operationName: opts.operationName ?? 'chat',
    });
  }

  /**
   * Start a span for a tool invocation.
   *
   * @example
   * const span = tracer.tool('pixeer_click', { name: 'Submit' }, { parentSpanId: llmSpanId });
   * const result = await agent.click('Submit');
   * span.setOutput({ success: result }).end();
   */
  tool(toolName: string, input: unknown, opts: SpanOptions = {}): PixeerSpan {
    return new PixeerSpan(this.analytics, 'tool:call', `tool:${toolName}`, input, {
      ...opts,
      spanId: newSpanId(),
      operationName: opts.operationName ?? 'tool_call',
    });
  }

  /**
   * Start a generic span (decision, navigation, custom step).
   */
  span(type: TraceEventType, name: string, input?: unknown, opts: SpanOptions = {}): PixeerSpan {
    return new PixeerSpan(this.analytics, type, name, input, {
      ...opts,
      spanId: newSpanId(),
    });
  }

  /** Generate a new trace ID to group spans for one agent task. */
  newTraceId(): string {
    return newTraceId();
  }
}

// ---------------------------------------------------------------------------
// ID generation (OTel-compatible hex strings)
// ---------------------------------------------------------------------------

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 32-char hex trace ID (128 bits) */
export function newTraceId(): string {
  return randomHex(16);
}

/** 16-char hex span ID (64 bits) */
export function newSpanId(): string {
  return randomHex(8);
}
