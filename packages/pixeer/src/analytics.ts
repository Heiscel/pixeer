// ---------------------------------------------------------------------------
// Bridge event types (existing)
// ---------------------------------------------------------------------------

export type PixeerEventType =
  | 'bridge:init'
  | 'bridge:dispose'
  | 'action:start'
  | 'action:success'
  | 'action:error'
  | 'snapshot:taken';

export interface PixeerEvent {
  type: PixeerEventType;
  method: string;
  sessionId: string;
  timestamp: number;
  durationMs?: number;
  success?: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface PixeerStats {
  sessionId: string;
  startedAt: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  successRate: number;
  methodCounts: Record<string, number>;
  methodErrors: Record<string, number>;
  avgDurationMs: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Trace event types (Step 12 — deterministic replay)
// ---------------------------------------------------------------------------

export type TraceEventType =
  | 'llm:call'
  | 'llm:response'
  | 'tool:call'
  | 'tool:result'
  | 'decision'
  | 'navigate'
  | 'error';

/**
 * A structured execution trace event — records one step of agent reasoning.
 * Designed to be OTel-span-compatible so traces can be exported to Grafana,
 * Datadog, or any OTLP-compatible backend.
 *
 * LLM-specific fields follow OpenTelemetry GenAI semantic conventions v1.37+.
 */
export interface TraceEvent {
  type: TraceEventType;
  /** Shared across all spans that belong to one agent task / user request. */
  traceId: string;
  /** Unique ID for this span. */
  spanId: string;
  /** Parent span ID — links this span to the call that triggered it. */
  parentSpanId?: string;
  sessionId: string;
  timestamp: number;
  /** Wall-clock duration in milliseconds. Set when the span closes. */
  durationMs?: number;
  /** Human-readable name, e.g. "dom.click" or "gpt-4o reasoning". */
  name: string;
  /** Input payload sent to the LLM or tool. */
  input?: unknown;
  /** Output / response received. */
  output?: unknown;
  error?: string;

  // --- OTel GenAI semantic conventions (gen_ai.*) ---
  /** gen_ai.model.name — versioned model ID, e.g. "claude-sonnet-4-6" */
  model?: string;
  /** gen_ai.system — provider, e.g. "anthropic" | "openai" | "google_vertex_ai" */
  system?: string;
  /** gen_ai.operation.name — e.g. "chat" | "completion" | "tool_call" */
  operationName?: string;
  /** gen_ai.usage.input_tokens */
  inputTokens?: number;
  /** gen_ai.usage.output_tokens */
  outputTokens?: number;

  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// OTLP export types
// ---------------------------------------------------------------------------

interface OTLPAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
}

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTLPAttribute[];
  status: { code: number; message?: string };
}

export interface OTLPExport {
  resourceSpans: Array<{
    resource: { attributes: OTLPAttribute[] };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: OTLPSpan[];
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BridgeEventHandler = (event: PixeerEvent) => void;

function generateSessionId(): string {
  return `px_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function msToNano(ms: number): string {
  return String(ms * 1_000_000);
}

function toOTLPAttr(key: string, value: unknown): OTLPAttribute {
  if (typeof value === 'boolean') return { key, value: { boolValue: value } };
  if (typeof value === 'number') return { key, value: { intValue: String(value) } };
  return { key, value: { stringValue: String(value ?? '') } };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PixeerAnalyticsOptions {
  sessionId?: string;
  /**
   * Maximum number of bridge events retained in history.
   * Oldest events are dropped when the cap is reached.
   * Emits a synthetic `bufferOverflow` meta flag on the next event after overflow.
   * @default 10_000
   */
  maxHistory?: number;
  /**
   * Maximum number of trace events retained.
   * @default 5_000
   */
  maxTrace?: number;
}

// ---------------------------------------------------------------------------
// PixeerAnalytics
// ---------------------------------------------------------------------------

export class PixeerAnalytics {
  private handlers = new Map<string, BridgeEventHandler[]>();
  private history: PixeerEvent[] = [];
  private traces: TraceEvent[] = [];
  private durations: Record<string, number[]> = {};
  private didOverflow = false;

  private readonly maxHistory: number;
  private readonly maxTrace: number;

  readonly sessionId: string;
  readonly startedAt: number;

  constructor(sessionIdOrOptions?: string | PixeerAnalyticsOptions) {
    const opts: PixeerAnalyticsOptions =
      typeof sessionIdOrOptions === 'string'
        ? { sessionId: sessionIdOrOptions }
        : (sessionIdOrOptions ?? {});

    this.sessionId = opts.sessionId ?? generateSessionId();
    this.startedAt = Date.now();
    this.maxHistory = opts.maxHistory ?? 10_000;
    this.maxTrace = opts.maxTrace ?? 5_000;
  }

  // ---------------------------------------------------------------------------
  // Bridge events
  // ---------------------------------------------------------------------------

  emit(event: PixeerEvent): void {
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
      this.didOverflow = true;
    }

    const stored: PixeerEvent = this.didOverflow
      ? { ...event, meta: { ...event.meta, bufferOverflow: true } }
      : event;
    this.didOverflow = false;

    this.history.push(stored);

    if (event.durationMs !== undefined) {
      if (!this.durations[event.method]) this.durations[event.method] = [];
      this.durations[event.method].push(event.durationMs);
    }

    (this.handlers.get(event.type) ?? []).forEach((h) => h(stored));
    (this.handlers.get('*') ?? []).forEach((h) => h(stored));
  }

  on(type: PixeerEventType | '*', handler: BridgeEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
    return () => {
      const list = this.handlers.get(type) ?? [];
      this.handlers.set(type, list.filter((h) => h !== handler));
    };
  }

  getStats(): PixeerStats {
    const actions = this.history.filter(
      (e) => e.type === 'action:success' || e.type === 'action:error',
    );
    const successes = actions.filter((e) => e.type === 'action:success');
    const failures = actions.filter((e) => e.type === 'action:error');

    const methodCounts: Record<string, number> = {};
    const methodErrors: Record<string, number> = {};
    const avgDurationMs: Record<string, number> = {};

    for (const e of actions) {
      methodCounts[e.method] = (methodCounts[e.method] ?? 0) + 1;
      if (e.type === 'action:error') {
        methodErrors[e.method] = (methodErrors[e.method] ?? 0) + 1;
      }
    }

    for (const [method, durations] of Object.entries(this.durations)) {
      avgDurationMs[method] = durations.reduce((a, b) => a + b, 0) / durations.length;
    }

    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      totalActions: actions.length,
      successfulActions: successes.length,
      failedActions: failures.length,
      successRate: actions.length > 0 ? successes.length / actions.length : 1,
      methodCounts,
      methodErrors,
      avgDurationMs,
    };
  }

  getHistory(): PixeerEvent[] {
    return [...this.history];
  }

  flush(): PixeerEvent[] {
    const copy = [...this.history];
    this.history = [];
    this.durations = {};
    this.didOverflow = false;
    return copy;
  }

  clear(): void {
    this.history = [];
    this.traces = [];
    this.durations = {};
    this.didOverflow = false;
    this.handlers.clear();
  }

  // ---------------------------------------------------------------------------
  // Execution trace (Step 12 — deterministic replay)
  // ---------------------------------------------------------------------------

  /**
   * Record one step of agent execution as an OTel-compatible trace span.
   * Use this to capture LLM calls, tool invocations, and decisions so the
   * full reasoning chain can be replayed without hitting real backends.
   *
   * @example
   * analytics.trace({
   *   type: 'tool:call',
   *   traceId: currentTraceId,
   *   spanId: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
   *   name: 'dom.click',
   *   input: { name: 'Submit' },
   *   timestamp: Date.now(),
   * });
   */
  trace(event: Omit<TraceEvent, 'sessionId'>): void {
    if (this.traces.length >= this.maxTrace) {
      this.traces.shift();
    }
    this.traces.push({ ...event, sessionId: this.sessionId });
  }

  /** Return all recorded trace spans. */
  getTrace(): TraceEvent[] {
    return [...this.traces];
  }

  /** Return and clear all recorded trace spans. */
  flushTrace(): TraceEvent[] {
    const copy = [...this.traces];
    this.traces = [];
    return copy;
  }

  /**
   * Export the current trace as an OTLP JSON payload compatible with
   * Grafana, Datadog, Jaeger, and any OpenTelemetry-compatible backend.
   *
   * POST the result to your collector's `/v1/traces` endpoint:
   * ```ts
   * await fetch('https://otel-collector/v1/traces', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify(analytics.exportOTLP()),
   * });
   * ```
   */
  exportOTLP(): OTLPExport {
    const spans: OTLPSpan[] = this.traces.map((t) => {
      const startNs = msToNano(t.timestamp);
      const endNs = msToNano(t.timestamp + (t.durationMs ?? 0));

      const attributes: OTLPAttribute[] = [
        toOTLPAttr('pixeer.session_id', t.sessionId),
        toOTLPAttr('pixeer.event_type', t.type),
      ];

      // OTel GenAI semantic conventions v1.37+
      if (t.model)         attributes.push(toOTLPAttr('gen_ai.model.name', t.model));
      if (t.system)        attributes.push(toOTLPAttr('gen_ai.system', t.system));
      if (t.operationName) attributes.push(toOTLPAttr('gen_ai.operation.name', t.operationName));
      if (t.inputTokens !== undefined)  attributes.push(toOTLPAttr('gen_ai.usage.input_tokens', t.inputTokens));
      if (t.outputTokens !== undefined) attributes.push(toOTLPAttr('gen_ai.usage.output_tokens', t.outputTokens));

      if (t.input !== undefined)  attributes.push(toOTLPAttr('pixeer.input', JSON.stringify(t.input)));
      if (t.output !== undefined) attributes.push(toOTLPAttr('pixeer.output', JSON.stringify(t.output)));
      if (t.error) attributes.push(toOTLPAttr('pixeer.error', t.error));
      if (t.meta) {
        for (const [k, v] of Object.entries(t.meta)) {
          attributes.push(toOTLPAttr(`pixeer.meta.${k}`, v));
        }
      }

      return {
        traceId: t.traceId,
        spanId: t.spanId,
        ...(t.parentSpanId ? { parentSpanId: t.parentSpanId } : {}),
        name: t.name,
        kind: 3, // CLIENT
        startTimeUnixNano: startNs,
        endTimeUnixNano: endNs,
        attributes,
        status: { code: t.error ? 2 : 1 }, // 2 = ERROR, 1 = OK
      };
    });

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              toOTLPAttr('service.name', 'pixeer'),
              toOTLPAttr('pixeer.session_id', this.sessionId),
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'pixeer', version: '0.0.1' },
              spans,
            },
          ],
        },
      ],
    };
  }
}
