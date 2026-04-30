import type { TelemetryEvent, TelemetryOptions, ClickEvent } from './types.js';
import { getSessionId, getSessionIdSync } from './Session.js';
import { VitalsReporter } from './VitalsReporter.js';
import { EventCapture } from './EventCapture.js';
import { ErrorMonitor } from './ErrorMonitor.js';
import { flush, registerFlushOnHide } from './flush.js';

export class TelemetryReporter {
  private buffer: TelemetryEvent[] = [];
  private breadcrumbs: Pick<ClickEvent, 'elementName' | 'elementTag' | 'timestamp'>[] = [];
  private sessionId = getSessionIdSync();
  private vitals = new VitalsReporter();
  private capture = new EventCapture();
  private errors = new ErrorMonitor();
  private cleanups: (() => void)[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly opts: Required<TelemetryOptions>;

  constructor(options: TelemetryOptions = {}) {
    this.opts = {
      endpoint: options.endpoint ?? '',
      bufferSize: options.bufferSize ?? 100,
      breadcrumbLimit: options.breadcrumbLimit ?? 10,
      vitals: options.vitals ?? true,
      autoCapture: options.autoCapture ?? true,
      navigation: options.navigation ?? true,
      errors: options.errors ?? true,
      filter: options.filter ?? (() => true),
      sampleRate: options.sampleRate ?? 1,
      flushIntervalMs: options.flushIntervalMs ?? 0,
    };

    // Resolve async session ID and swap out the sync fallback
    void getSessionId().then((id) => { this.sessionId = id; });
  }

  start(): void {
    if (this.opts.vitals) {
      this.vitals.start((partial) => {
        this._emit({ ...partial, sessionId: this.sessionId, url: this._url() } as TelemetryEvent);
      });
    }

    if (this.opts.autoCapture) {
      this.capture.startClicks((partial) => {
        const event: ClickEvent = { ...partial, sessionId: this.sessionId, url: this._url() };
        // Keep a rolling breadcrumb trail for error context
        this.breadcrumbs.push({ elementName: event.elementName, elementTag: event.elementTag, timestamp: event.timestamp });
        if (this.breadcrumbs.length > this.opts.breadcrumbLimit) this.breadcrumbs.shift();
        this._emit(event);
      });
      this.capture.startSubmits((partial) => {
        this._emit({ ...partial, sessionId: this.sessionId, url: this._url() });
      });
    }

    if (this.opts.navigation) {
      this.capture.startNavigation((partial) => {
        this._emit({ ...partial, sessionId: this.sessionId, url: this._url() });
      });
    }

    if (this.opts.errors) {
      this.errors.start(
        (partial) => {
          this._emit({ ...partial, sessionId: this.sessionId, url: this._url() });
        },
        () => [...this.breadcrumbs],
      );
    }

    if (this.opts.endpoint) {
      const unregister = registerFlushOnHide(() => this.flush());
      this.cleanups.push(unregister);

      if (this.opts.flushIntervalMs > 0) {
        this.flushTimer = setInterval(() => this.flush(), this.opts.flushIntervalMs);
      }
    }
  }

  stop(): void {
    this.vitals.stop();
    this.capture.stop();
    this.errors.stop();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Manually record a custom event */
  track(name: string, properties?: Record<string, unknown>): void {
    this._emit({
      type: 'custom',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      url: this._url(),
      name,
      properties,
    });
  }

  /** Flush the buffer to the configured endpoint. No-op if no endpoint set. */
  flush(): void {
    if (!this.opts.endpoint || this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    flush(this.opts.endpoint, batch);
  }

  /** Read buffered events without flushing */
  getBuffer(): readonly TelemetryEvent[] {
    return this.buffer;
  }

  /** Drain the buffer without sending */
  drainBuffer(): TelemetryEvent[] {
    return this.buffer.splice(0);
  }

  private _emit(event: TelemetryEvent): void {
    // Sampling
    if (this.opts.sampleRate < 1 && Math.random() > this.opts.sampleRate) return;
    // User filter
    if (!this.opts.filter(event)) return;
    // Ring buffer — drop oldest on overflow
    if (this.buffer.length >= this.opts.bufferSize) this.buffer.shift();
    this.buffer.push(event);
  }

  private _url(): string {
    return typeof location !== 'undefined' ? location.href : '';
  }
}

/** Create and immediately start a TelemetryReporter. */
export function createTelemetryReporter(options: TelemetryOptions = {}): TelemetryReporter {
  const reporter = new TelemetryReporter(options);
  reporter.start();
  return reporter;
}
