import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PixeerAnalytics } from '../analytics';
import { createPixeerBridge } from '../bridge';
import type { PixeerTransport } from '../types';

function makeTransport() {
  const handlers = new Map<string, (p: string) => Promise<string>>();
  const transport: PixeerTransport = {
    onMethod(method, handler) { handlers.set(method, handler); },
    dispose: vi.fn(),
  };
  return {
    transport,
    call(method: string, payload: unknown = {}) {
      const h = handlers.get(method);
      if (!h) throw new Error(`No handler: ${method}`);
      return h(JSON.stringify(payload));
    },
  };
}

describe('PixeerAnalytics', () => {
  let analytics: PixeerAnalytics;

  beforeEach(() => {
    analytics = new PixeerAnalytics('test-session');
  });

  it('generates a sessionId', () => {
    const a = new PixeerAnalytics();
    expect(a.sessionId).toMatch(/^px_/);
  });

  it('accepts a custom sessionId', () => {
    expect(analytics.sessionId).toBe('test-session');
  });

  it('emits events and records them in history', () => {
    analytics.emit({
      type: 'action:success',
      method: 'dom.click',
      sessionId: 'test-session',
      timestamp: Date.now(),
      durationMs: 42,
      success: true,
    });

    const history = analytics.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].method).toBe('dom.click');
    expect(history[0].type).toBe('action:success');
  });

  it('on() fires handler for matching event type', () => {
    const handler = vi.fn();
    analytics.on('action:success', handler);

    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    analytics.emit({ type: 'action:error', method: 'dom.type', sessionId: 'test-session', timestamp: Date.now() });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('on("*") fires for every event type', () => {
    const handler = vi.fn();
    analytics.on('*', handler);

    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    analytics.emit({ type: 'action:error', method: 'dom.type', sessionId: 'test-session', timestamp: Date.now() });
    analytics.emit({ type: 'snapshot:taken', method: 'dom.getContext', sessionId: 'test-session', timestamp: Date.now() });

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('on() returns an unsubscribe function', () => {
    const handler = vi.fn();
    const off = analytics.on('action:success', handler);

    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    off();
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('getStats() returns correct counts and success rate', () => {
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now(), durationMs: 10 });
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now(), durationMs: 20 });
    analytics.emit({ type: 'action:error', method: 'dom.type', sessionId: 'test-session', timestamp: Date.now(), durationMs: 5 });

    const stats = analytics.getStats();
    expect(stats.totalActions).toBe(3);
    expect(stats.successfulActions).toBe(2);
    expect(stats.failedActions).toBe(1);
    expect(stats.successRate).toBeCloseTo(2 / 3);
    expect(stats.methodCounts['dom.click']).toBe(2);
    expect(stats.methodCounts['dom.type']).toBe(1);
    expect(stats.methodErrors['dom.type']).toBe(1);
    expect(stats.methodErrors['dom.click']).toBeUndefined();
    expect(stats.avgDurationMs['dom.click']).toBeCloseTo(15);
    expect(stats.sessionId).toBe('test-session');
  });

  it('getStats() returns successRate of 1 when no actions recorded', () => {
    const stats = analytics.getStats();
    expect(stats.totalActions).toBe(0);
    expect(stats.successRate).toBe(1);
  });

  it('flush() returns history and clears it', () => {
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    const flushed = analytics.flush();
    expect(flushed).toHaveLength(1);
    expect(analytics.getHistory()).toHaveLength(0);
  });

  it('clear() wipes history and handlers', () => {
    const handler = vi.fn();
    analytics.on('action:success', handler);
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });

    analytics.clear();

    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    expect(analytics.getHistory()).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('createPixeerBridge analytics integration', () => {
  let analytics: PixeerAnalytics;
  let mock: ReturnType<typeof makeTransport>;

  beforeEach(() => {
    document.body.innerHTML = '';
    analytics = new PixeerAnalytics('bridge-session');
    mock = makeTransport();
    createPixeerBridge(mock.transport, { analytics, transportName: 'test' });
  });

  it('emits bridge:init on creation', () => {
    const inits = analytics.getHistory().filter((e) => e.type === 'bridge:init');
    expect(inits).toHaveLength(1);
    expect(inits[0].meta?.transport).toBe('test');
  });

  it('emits action:start and action:success for a successful click', async () => {
    document.body.innerHTML = '<button>Go</button>';
    const btn = document.querySelector('button')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });

    await mock.call('dom.click', { name: 'Go' });

    const events = analytics.getHistory().filter((e) => e.method === 'dom.click');
    expect(events.map((e) => e.type)).toEqual(['action:start', 'action:success']);
    const success = events.find((e) => e.type === 'action:success')!;
    expect(success.success).toBe(true);
    expect(success.durationMs).toBeTypeOf('number');
  });

  it('emits action:error for a failed action', async () => {
    await mock.call('dom.click', {});

    const errors = analytics.getHistory().filter(
      (e) => e.type === 'action:error' && e.method === 'dom.click',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].success).toBe(false);
  });

  it('emits snapshot:taken with context metadata on dom.getContext', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    await mock.call('dom.getContext');

    const snapshots = analytics.getHistory().filter((e) => e.type === 'snapshot:taken');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].meta?.elementCount).toBeTypeOf('number');
    expect(snapshots[0].meta?.estimatedTokens).toBeTypeOf('number');
  });

  it('emits bridge:dispose on dispose()', () => {
    const bridge = createPixeerBridge(makeTransport().transport, { analytics, transportName: 'test' });
    bridge.dispose();

    const disposes = analytics.getHistory().filter((e) => e.type === 'bridge:dispose');
    expect(disposes).toHaveLength(1);
  });

  it('exposes analytics on the returned bridge handle', () => {
    const bridge = createPixeerBridge(makeTransport().transport, { analytics });
    expect(bridge.analytics).toBe(analytics);
  });

  it('getStats() after bridge actions returns correct method breakdown', async () => {
    document.body.innerHTML = '<button>Ok</button>';
    const btn = document.querySelector('button')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });

    await mock.call('dom.click', { name: 'Ok' });
    await mock.call('dom.click', { name: 'Ok' });
    await mock.call('dom.scroll', { direction: 'down' });

    const stats = analytics.getStats();
    expect(stats.methodCounts['dom.click']).toBe(2);
    expect(stats.methodCounts['dom.scroll']).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  it('on() hook fires when bridge action completes', async () => {
    const successHandler = vi.fn();
    analytics.on('action:success', successHandler);

    document.body.innerHTML = '<button>Tap</button>';
    const btn = document.querySelector('button')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });

    await mock.call('dom.click', { name: 'Tap' });
    expect(successHandler).toHaveBeenCalledOnce();
    expect(successHandler.mock.calls[0][0].method).toBe('dom.click');
  });
});

describe('PixeerAnalytics — PixeerAnalyticsOptions constructor', () => {
  it('accepts options object with sessionId', () => {
    const a = new PixeerAnalytics({ sessionId: 'opts-session' });
    expect(a.sessionId).toBe('opts-session');
  });

  it('generates sessionId when not provided in options', () => {
    const a = new PixeerAnalytics({});
    expect(a.sessionId).toMatch(/^px_/);
  });
});

describe('PixeerAnalytics — circular event buffer', () => {
  it('drops oldest event when maxHistory is reached', () => {
    const a = new PixeerAnalytics({ maxHistory: 3 });
    for (let i = 0; i < 4; i++) {
      a.emit({ type: 'action:success', method: `m${i}`, sessionId: 'x', timestamp: i });
    }
    const history = a.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].method).toBe('m1');
    expect(history[2].method).toBe('m3');
  });

  it('attaches bufferOverflow meta flag on the event after overflow', () => {
    const a = new PixeerAnalytics({ maxHistory: 2 });
    a.emit({ type: 'action:success', method: 'm0', sessionId: 'x', timestamp: 0 });
    a.emit({ type: 'action:success', method: 'm1', sessionId: 'x', timestamp: 1 });
    // This emit triggers overflow
    a.emit({ type: 'action:success', method: 'm2', sessionId: 'x', timestamp: 2 });

    const history = a.getHistory();
    const overflowEvent = history.find((e) => e.meta?.bufferOverflow === true);
    expect(overflowEvent).toBeDefined();
    expect(overflowEvent!.method).toBe('m2');
  });

  it('only sets bufferOverflow once per overflow', () => {
    const a = new PixeerAnalytics({ maxHistory: 1 });
    a.emit({ type: 'action:success', method: 'm0', sessionId: 'x', timestamp: 0 });
    a.emit({ type: 'action:success', method: 'm1', sessionId: 'x', timestamp: 1 });
    a.emit({ type: 'action:success', method: 'm2', sessionId: 'x', timestamp: 2 });

    const history = a.getHistory();
    const overflows = history.filter((e) => e.meta?.bufferOverflow === true);
    expect(overflows.length).toBeLessThanOrEqual(1);
  });
});

describe('PixeerAnalytics — trace', () => {
  let a: PixeerAnalytics;

  beforeEach(() => {
    a = new PixeerAnalytics('trace-session');
  });

  it('trace() records events retrievable via getTrace()', () => {
    a.trace({ type: 'tool:call', traceId: 'tr1', spanId: 'sp1', name: 'dom.click', timestamp: 100, input: { name: 'Submit' } });
    const trace = a.getTrace();
    expect(trace).toHaveLength(1);
    expect(trace[0].name).toBe('dom.click');
    expect(trace[0].sessionId).toBe('trace-session');
  });

  it('trace() attaches sessionId automatically', () => {
    a.trace({ type: 'llm:call', traceId: 't', spanId: 's', name: 'gpt', timestamp: 0 });
    expect(a.getTrace()[0].sessionId).toBe('trace-session');
  });

  it('getTrace() returns a copy', () => {
    a.trace({ type: 'decision', traceId: 't', spanId: 's', name: 'd', timestamp: 0 });
    const t1 = a.getTrace();
    t1.pop();
    expect(a.getTrace()).toHaveLength(1);
  });

  it('flushTrace() returns traces and clears them', () => {
    a.trace({ type: 'navigate', traceId: 't', spanId: 's', name: 'nav', timestamp: 0 });
    const flushed = a.flushTrace();
    expect(flushed).toHaveLength(1);
    expect(a.getTrace()).toHaveLength(0);
  });

  it('drops oldest trace when maxTrace is reached', () => {
    const b = new PixeerAnalytics({ maxTrace: 2 });
    b.trace({ type: 'tool:call', traceId: 't', spanId: 's1', name: 'a', timestamp: 0 });
    b.trace({ type: 'tool:call', traceId: 't', spanId: 's2', name: 'b', timestamp: 1 });
    b.trace({ type: 'tool:call', traceId: 't', spanId: 's3', name: 'c', timestamp: 2 });
    const trace = b.getTrace();
    expect(trace).toHaveLength(2);
    expect(trace[0].name).toBe('b');
  });

  it('clear() also clears traces', () => {
    a.trace({ type: 'error', traceId: 't', spanId: 's', name: 'e', timestamp: 0 });
    a.clear();
    expect(a.getTrace()).toHaveLength(0);
  });
});

describe('PixeerAnalytics — exportOTLP', () => {
  it('returns a valid OTLP resourceSpans structure', () => {
    const a = new PixeerAnalytics('otlp-session');
    a.trace({ type: 'tool:call', traceId: 'abc123', spanId: 'def456', name: 'dom.click', timestamp: 1_000, durationMs: 50, input: { name: 'Submit' } });

    const otlp = a.exportOTLP();
    expect(otlp.resourceSpans).toHaveLength(1);

    const rs = otlp.resourceSpans[0];
    expect(rs.resource.attributes.some((a) => a.key === 'service.name')).toBe(true);

    const spans = rs.scopeSpans[0].spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].traceId).toBe('abc123');
    expect(spans[0].spanId).toBe('def456');
    expect(spans[0].name).toBe('dom.click');
    expect(spans[0].kind).toBe(3);
    expect(spans[0].status.code).toBe(1);
  });

  it('sets error status code when trace event has error', () => {
    const a = new PixeerAnalytics('s');
    a.trace({ type: 'error', traceId: 't', spanId: 's', name: 'fail', timestamp: 0, error: 'boom' });
    const span = a.exportOTLP().resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.status.code).toBe(2);
  });

  it('includes parentSpanId when set', () => {
    const a = new PixeerAnalytics('s');
    a.trace({ type: 'tool:result', traceId: 't', spanId: 's2', parentSpanId: 's1', name: 'result', timestamp: 0 });
    const span = a.exportOTLP().resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.parentSpanId).toBe('s1');
  });

  it('omits parentSpanId when not set', () => {
    const a = new PixeerAnalytics('s');
    a.trace({ type: 'llm:response', traceId: 't', spanId: 's', name: 'resp', timestamp: 0 });
    const span = a.exportOTLP().resourceSpans[0].scopeSpans[0].spans[0];
    expect('parentSpanId' in span).toBe(false);
  });

  it('converts timestamp and durationMs to nanosecond strings', () => {
    const a = new PixeerAnalytics('s');
    a.trace({ type: 'tool:call', traceId: 't', spanId: 's', name: 'x', timestamp: 1000, durationMs: 200 });
    const span = a.exportOTLP().resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.startTimeUnixNano).toBe('1000000000');
    expect(span.endTimeUnixNano).toBe('1200000000');
  });

  it('includes input/output/meta as OTLP attributes', () => {
    const a = new PixeerAnalytics('s');
    a.trace({ type: 'tool:call', traceId: 't', spanId: 's', name: 'x', timestamp: 0, input: { q: 1 }, output: { r: 2 }, meta: { foo: 'bar' } });
    const attrs = a.exportOTLP().resourceSpans[0].scopeSpans[0].spans[0].attributes;
    expect(attrs.some((a) => a.key === 'pixeer.input')).toBe(true);
    expect(attrs.some((a) => a.key === 'pixeer.output')).toBe(true);
    expect(attrs.some((a) => a.key === 'pixeer.meta.foo')).toBe(true);
  });
});
