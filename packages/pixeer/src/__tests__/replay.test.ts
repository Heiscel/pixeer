import { describe, it, expect } from 'vitest';
import { PixeerAnalytics } from '../analytics.js';
import { PixeerTracer, newTraceId, newSpanId } from '../tracer.js';
import { ReplayEngine } from '../replay.js';
import type { TraceEvent } from '../analytics.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnalytics(): PixeerAnalytics {
  return new PixeerAnalytics();
}

function makeTrace(count: number, baseTs = 1000): TraceEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'tool:call' as const,
    traceId: 'trace-001',
    spanId: `span-${i.toString().padStart(3, '0')}`,
    sessionId: 'sess-1',
    timestamp: baseTs + i * 100,
    durationMs: 10,
    name: `tool:step_${i}`,
  }));
}

// ---------------------------------------------------------------------------
// newTraceId / newSpanId
// ---------------------------------------------------------------------------

describe('newTraceId / newSpanId', () => {
  it('newTraceId returns 32-char hex', () => {
    expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('newSpanId returns 16-char hex', () => {
    expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newTraceId()));
    expect(ids.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// PixeerTracer
// ---------------------------------------------------------------------------

describe('PixeerTracer', () => {
  it('records an llm span with GenAI attributes', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    const traceId = tracer.newTraceId();

    const span = tracer.llm('claude-sonnet-4-6', [{ role: 'user', content: 'Hello' }], {
      traceId,
      system: 'anthropic',
    });
    span.setOutput({ role: 'assistant', content: 'Hi!' });
    span.setTokens(10, 5);
    span.end();

    const trace = analytics.getTrace();
    expect(trace).toHaveLength(1);
    expect(trace[0].type).toBe('llm:call');
    expect(trace[0].model).toBe('claude-sonnet-4-6');
    expect(trace[0].system).toBe('anthropic');
    expect(trace[0].inputTokens).toBe(10);
    expect(trace[0].outputTokens).toBe(5);
    expect(trace[0].traceId).toBe(traceId);
    expect(trace[0].operationName).toBe('chat');
  });

  it('records a tool span with parent link', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    const traceId = tracer.newTraceId();
    const parentId = newSpanId();

    const span = tracer.tool('pixeer_click', { name: 'Submit' }, { traceId, parentSpanId: parentId });
    span.setOutput({ success: true }).end();

    const trace = analytics.getTrace();
    expect(trace[0].type).toBe('tool:call');
    expect(trace[0].name).toBe('tool:pixeer_click');
    expect(trace[0].parentSpanId).toBe(parentId);
    expect(trace[0].operationName).toBe('tool_call');
  });

  it('records duration on end()', async () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    const span = tracer.span('decision', 'agent:decide');
    await new Promise((r) => setTimeout(r, 5));
    span.end();
    const trace = analytics.getTrace();
    expect(trace[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures errors via setError()', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    const span = tracer.tool('pixeer_click', {});
    span.setError(new Error('element not found')).end();
    expect(analytics.getTrace()[0].error).toBe('element not found');
  });

  it('setMeta merges metadata', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    const span = tracer.span('decision', 'decide');
    span.setMeta({ foo: 1 }).setMeta({ bar: 2 }).end();
    expect(analytics.getTrace()[0].meta).toEqual({ foo: 1, bar: 2 });
  });
});

// ---------------------------------------------------------------------------
// exportOTLP — GenAI attributes
// ---------------------------------------------------------------------------

describe('exportOTLP with GenAI attributes', () => {
  it('emits gen_ai.* attributes for LLM spans', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    tracer.llm('gpt-4o', 'prompt', { system: 'openai', operationName: 'chat' })
      .setTokens(100, 50).end();

    const otlp = analytics.exportOTLP();
    const attrs = otlp.resourceSpans[0].scopeSpans[0].spans[0].attributes;
    const get = (key: string) => attrs.find((a) => a.key === key)?.value;

    expect(get('gen_ai.model.name')).toEqual({ stringValue: 'gpt-4o' });
    expect(get('gen_ai.system')).toEqual({ stringValue: 'openai' });
    expect(get('gen_ai.operation.name')).toEqual({ stringValue: 'chat' });
    expect(get('gen_ai.usage.input_tokens')).toEqual({ intValue: '100' });
    expect(get('gen_ai.usage.output_tokens')).toEqual({ intValue: '50' });
  });

  it('timestamps are nanosecond strings', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    tracer.span('decision', 'test').end();
    const span = analytics.exportOTLP().resourceSpans[0].scopeSpans[0].spans[0];
    // Should be a string of digits representing nanoseconds
    expect(span.startTimeUnixNano).toMatch(/^\d+$/);
    expect(BigInt(span.startTimeUnixNano)).toBeGreaterThan(0n);
  });

  it('error spans have status code 2', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    tracer.tool('bad_tool', {}).setError('timeout').end();
    const span = analytics.exportOTLP().resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.status.code).toBe(2);
  });

  it('successful spans have status code 1', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    tracer.tool('ok_tool', {}).setOutput({ success: true }).end();
    const span = analytics.exportOTLP().resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.status.code).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ReplayEngine
// ---------------------------------------------------------------------------

describe('ReplayEngine', () => {
  it('step() advances through events', () => {
    const engine = new ReplayEngine(makeTrace(3));
    expect(engine.step()?.name).toBe('tool:step_0');
    expect(engine.step()?.name).toBe('tool:step_1');
    expect(engine.step()?.name).toBe('tool:step_2');
    expect(engine.step()).toBeNull();
  });

  it('peek() does not advance', () => {
    const engine = new ReplayEngine(makeTrace(2));
    expect(engine.peek()?.name).toBe('tool:step_0');
    expect(engine.peek()?.name).toBe('tool:step_0');
    expect(engine.position).toBe(0);
  });

  it('reset() returns to start', () => {
    const engine = new ReplayEngine(makeTrace(3));
    engine.step();
    engine.step();
    engine.reset();
    expect(engine.position).toBe(0);
  });

  it('findStep() finds by predicate', () => {
    const engine = new ReplayEngine(makeTrace(5));
    const found = engine.findStep((e) => e.name === 'tool:step_3');
    expect(found?.name).toBe('tool:step_3');
  });

  it('stepsByType() filters by type', () => {
    const analytics = makeAnalytics();
    const tracer = new PixeerTracer(analytics);
    tracer.llm('gpt-4o', 'a').end();
    tracer.tool('click', {}).end();
    tracer.llm('gpt-4o', 'b').end();

    const engine = new ReplayEngine(analytics.getTrace());
    expect(engine.stepsByType('llm:call')).toHaveLength(2);
    expect(engine.stepsByType('tool:call')).toHaveLength(1);
  });

  it('byTrace() filters by traceId', () => {
    const events: TraceEvent[] = [
      ...makeTrace(2).map((e) => ({ ...e, traceId: 'trace-A' })),
      ...makeTrace(3).map((e) => ({ ...e, traceId: 'trace-B' })),
    ];
    const engine = new ReplayEngine(events);
    expect(engine.byTrace('trace-A')).toHaveLength(2);
    expect(engine.byTrace('trace-B')).toHaveLength(3);
  });

  it('getTimeline() computes relative timestamps', () => {
    const engine = new ReplayEngine(makeTrace(3, 5000));
    const timeline = engine.getTimeline();
    expect(timeline[0].relativeMs).toBe(0);
    expect(timeline[1].relativeMs).toBe(100);
    expect(timeline[2].relativeMs).toBe(200);
  });

  it('formatTimeline() produces a non-empty string', () => {
    const engine = new ReplayEngine(makeTrace(2));
    const output = engine.formatTimeline();
    expect(output).toContain('tool:call');
    expect(output).toContain('Summary:');
  });

  it('formatTimeline() handles empty trace', () => {
    expect(new ReplayEngine([]).formatTimeline()).toBe('(empty trace)');
  });

  it('toJSONL() serializes one event per line', () => {
    const engine = new ReplayEngine(makeTrace(3));
    const jsonl = engine.toJSONL();
    expect(jsonl.split('\n')).toHaveLength(3);
    JSON.parse(jsonl.split('\n')[0]); // should not throw
  });

  it('fromJSONL() round-trips correctly', () => {
    const original = makeTrace(3);
    const engine = new ReplayEngine(original);
    const restored = ReplayEngine.fromJSONL(engine.toJSONL());
    expect(restored.length).toBe(3);
    expect(restored.step()?.name).toBe('tool:step_0');
  });
});

// ---------------------------------------------------------------------------
// ReplayEngine.diff
// ---------------------------------------------------------------------------

describe('ReplayEngine.diff', () => {
  it('detects added spans', () => {
    const a = makeTrace(2);
    const b = [...makeTrace(2), { ...makeTrace(1)[0], spanId: 'span-new', name: 'tool:extra' }];
    const diff = ReplayEngine.diff(a, b);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].spanId).toBe('span-new');
  });

  it('detects removed spans', () => {
    const a = makeTrace(3);
    const b = makeTrace(2);
    const diff = ReplayEngine.diff(a, b);
    expect(diff.removed).toHaveLength(1);
  });

  it('detects changed fields', () => {
    const a = makeTrace(1);
    const b = [{ ...a[0], name: 'tool:changed' }];
    const diff = ReplayEngine.diff(a, b);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].fields).toContain('name');
  });

  it('returns empty diff for identical traces', () => {
    const trace = makeTrace(3);
    const diff = ReplayEngine.diff(trace, [...trace]);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });
});
