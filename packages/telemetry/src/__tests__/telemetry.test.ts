import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryReporter, createTelemetryReporter } from '../TelemetryReporter.js';
import { getSessionIdSync } from '../Session.js';
import { flush } from '../flush.js';
import { VitalsReporter } from '../VitalsReporter.js';
import { EventCapture } from '../EventCapture.js';
import { ErrorMonitor } from '../ErrorMonitor.js';

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

describe('getSessionIdSync', () => {
  it('returns a 16-char hex string', () => {
    const id = getSessionIdSync();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same day', () => {
    expect(getSessionIdSync()).toBe(getSessionIdSync());
  });
});

describe('getSessionId (async)', () => {
  it('returns a 16-char hex string', async () => {
    const { getSessionId } = await import('../Session.js');
    const id = await getSessionId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// flush
// ---------------------------------------------------------------------------

describe('flush', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses sendBeacon when available', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });

    const events = [{ type: 'custom', name: 'test', timestamp: 1, sessionId: 'abc', url: '/' }];
    flush('https://example.com/t', events as never);
    expect(sendBeacon).toHaveBeenCalledOnce();
  });

  it('falls back to fetch when sendBeacon returns false', async () => {
    const sendBeacon = vi.fn().mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('fetch', fetchMock);

    flush('https://example.com/t', [{ type: 'custom', name: 'x', timestamp: 1, sessionId: 'a', url: '/' }] as never);
    await Promise.resolve(); // let the promise resolve
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/t',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });

  it('does nothing for empty event array', () => {
    const sendBeacon = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon });
    flush('https://example.com/t', []);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// EventCapture — clicks
// ---------------------------------------------------------------------------

describe('EventCapture clicks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('captures click on a button', () => {
    const capture = new EventCapture();
    const clicks: unknown[] = [];
    capture.startClicks((e) => clicks.push(e));

    const btn = document.createElement('button');
    btn.textContent = 'Save';
    document.body.appendChild(btn);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicks).toHaveLength(1);
    expect((clicks[0] as { elementTag: string }).elementTag).toBe('button');
    expect((clicks[0] as { elementName: string }).elementName).toBe('Save');
    capture.stop();
  });

  it('ignores clicks on non-interactive elements', () => {
    const capture = new EventCapture();
    const clicks: unknown[] = [];
    capture.startClicks((e) => clicks.push(e));

    const div = document.createElement('div');
    document.body.appendChild(div);
    div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicks).toHaveLength(0);
    capture.stop();
  });

  it('prefers aria-label over text content', () => {
    const capture = new EventCapture();
    const clicks: { elementName: string }[] = [];
    capture.startClicks((e) => clicks.push(e));

    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Close dialog');
    btn.textContent = '×';
    document.body.appendChild(btn);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicks[0].elementName).toBe('Close dialog');
    capture.stop();
  });
});

// ---------------------------------------------------------------------------
// EventCapture — submits
// ---------------------------------------------------------------------------

describe('EventCapture submits', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('captures form submissions', () => {
    const capture = new EventCapture();
    const submits: unknown[] = [];
    capture.startSubmits((e) => submits.push(e));

    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'text';
    form.appendChild(input);
    document.body.appendChild(form);
    form.dispatchEvent(new Event('submit', { bubbles: true }));

    expect(submits).toHaveLength(1);
    expect((submits[0] as { fieldCount: number }).fieldCount).toBe(1);
    capture.stop();
  });
});

// ---------------------------------------------------------------------------
// ErrorMonitor
// ---------------------------------------------------------------------------

describe('ErrorMonitor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('captures JS errors via window error event', () => {
    const monitor = new ErrorMonitor();
    const errors: unknown[] = [];
    monitor.start((e) => errors.push(e), () => []);

    const event = new ErrorEvent('error', {
      message: 'Test error',
      filename: 'app.js',
      lineno: 42,
      colno: 5,
      error: new Error('Test error'),
    });
    window.dispatchEvent(event);

    expect(errors).toHaveLength(1);
    expect((errors[0] as { message: string }).message).toBe('Test error');
    expect((errors[0] as { line: number }).line).toBe(42);
    monitor.stop();
  });

  it('captures unhandled promise rejections', async () => {
    const monitor = new ErrorMonitor();
    const errors: unknown[] = [];
    monitor.start((e) => errors.push(e), () => []);

    // happy-dom doesn't have PromiseRejectionEvent — construct a plain event with the same shape
    const rejEvent = Object.assign(new Event('unhandledrejection'), {
      reason: new Error('async fail'),
      promise: Promise.resolve(),
    });
    window.dispatchEvent(rejEvent);

    expect(errors).toHaveLength(1);
    expect((errors[0] as { isUnhandledRejection: boolean }).isUnhandledRejection).toBe(true);
    monitor.stop();
  });

  it('includes breadcrumbs in error report', () => {
    const monitor = new ErrorMonitor();
    const errors: { breadcrumbs: unknown[] }[] = [];
    const crumbs = [{ elementName: 'Login', elementTag: 'button', timestamp: 100 }];
    monitor.start((e) => errors.push(e as { breadcrumbs: unknown[] }), () => crumbs);

    const event = new ErrorEvent('error', { message: 'oops', error: new Error('oops') });
    window.dispatchEvent(event);

    expect(errors[0].breadcrumbs).toHaveLength(1);
    expect((errors[0].breadcrumbs[0] as { elementName: string }).elementName).toBe('Login');
    monitor.stop();
  });
});

// ---------------------------------------------------------------------------
// TelemetryReporter — ring buffer
// ---------------------------------------------------------------------------

describe('TelemetryReporter ring buffer', () => {
  it('drops oldest event when buffer is full', () => {
    const reporter = new TelemetryReporter({ bufferSize: 3, vitals: false, autoCapture: false, navigation: false, errors: false });
    reporter.track('a');
    reporter.track('b');
    reporter.track('c');
    reporter.track('d'); // should drop 'a'

    const buf = reporter.getBuffer();
    expect(buf).toHaveLength(3);
    const names = buf.filter((e) => e.type === 'custom').map((e) => (e as { name: string }).name);
    expect(names).toEqual(['b', 'c', 'd']);
  });

  it('drainBuffer empties the buffer', () => {
    const reporter = new TelemetryReporter({ vitals: false, autoCapture: false, navigation: false, errors: false });
    reporter.track('x');
    const drained = reporter.drainBuffer();
    expect(drained).toHaveLength(1);
    expect(reporter.getBuffer()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TelemetryReporter — sampling + filter
// ---------------------------------------------------------------------------

describe('TelemetryReporter sampling and filter', () => {
  it('drops events when sampleRate is 0', () => {
    const reporter = new TelemetryReporter({ sampleRate: 0, vitals: false, autoCapture: false, navigation: false, errors: false });
    reporter.track('dropped');
    expect(reporter.getBuffer()).toHaveLength(0);
  });

  it('keeps all events when sampleRate is 1', () => {
    const reporter = new TelemetryReporter({ sampleRate: 1, vitals: false, autoCapture: false, navigation: false, errors: false });
    reporter.track('kept');
    expect(reporter.getBuffer()).toHaveLength(1);
  });

  it('custom filter can drop events', () => {
    const reporter = new TelemetryReporter({
      vitals: false, autoCapture: false, navigation: false, errors: false,
      filter: (e) => e.type !== 'custom',
    });
    reporter.track('filtered-out');
    expect(reporter.getBuffer()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TelemetryReporter — flush
// ---------------------------------------------------------------------------

describe('TelemetryReporter flush', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls sendBeacon with buffered events', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });

    const reporter = new TelemetryReporter({
      endpoint: 'https://t.example.com/events',
      vitals: false, autoCapture: false, navigation: false, errors: false,
    });
    reporter.track('pageview');
    reporter.flush();

    expect(sendBeacon).toHaveBeenCalledOnce();
    expect(reporter.getBuffer()).toHaveLength(0); // cleared after flush
  });

  it('does nothing when no endpoint is set', () => {
    const sendBeacon = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon });

    const reporter = new TelemetryReporter({ vitals: false, autoCapture: false, navigation: false, errors: false });
    reporter.track('x');
    reporter.flush();
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createTelemetryReporter factory
// ---------------------------------------------------------------------------

describe('createTelemetryReporter', () => {
  it('returns a started TelemetryReporter', () => {
    const reporter = createTelemetryReporter({ vitals: false, autoCapture: false, navigation: false, errors: false });
    expect(reporter).toBeInstanceOf(TelemetryReporter);
    reporter.stop();
  });
});
