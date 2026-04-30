import type { VitalEvent, VitalName, VitalRating } from './types.js';

// PerformanceEventTiming is not in TS lib.dom — declare the minimum we need
interface PerformanceEventTiming extends PerformanceEntry {
  readonly interactionId: number;
  readonly processingStart: DOMHighResTimeStamp;
}

// LayoutShift is not in TS lib.dom
interface LayoutShiftEntry extends PerformanceEntry {
  readonly hadRecentInput: boolean;
  readonly value: number;
}

type VitalCallback = (event: Omit<VitalEvent, 'sessionId' | 'url'>) => void;

// WCAG thresholds (Google Core Web Vitals 2024)
const THRESHOLDS: Record<VitalName, [number, number]> = {
  LCP:  [2500, 4000],  // good < 2500ms, poor > 4000ms
  INP:  [200,  500],   // good < 200ms,  poor > 500ms
  CLS:  [0.1,  0.25],  // good < 0.1,    poor > 0.25
  TTFB: [800,  1800],  // good < 800ms,  poor > 1800ms
};

function rate(name: VitalName, value: number): VitalRating {
  const [good, poor] = THRESHOLDS[name];
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
}

export class VitalsReporter {
  private observers: PerformanceObserver[] = [];
  private inpMax = 0;
  private clsSum = 0;

  start(cb: VitalCallback): void {
    if (typeof PerformanceObserver === 'undefined') return;

    this._observe('largest-contentful-paint', (list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        const value = last.startTime;
        cb({ type: 'vital', name: 'LCP', value, rating: rate('LCP', value), timestamp: Date.now() });
      }
    });

    // INP: observe all 'event' entries, track max interaction duration
    this._observe('event', (list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEventTiming;
        if (e.interactionId && e.duration > this.inpMax) {
          this.inpMax = e.duration;
          cb({ type: 'vital', name: 'INP', value: this.inpMax, rating: rate('INP', this.inpMax), timestamp: Date.now() });
        }
      }
    }, { durationThreshold: 1 });

    // CLS: accumulate layout shifts that aren't caused by user input
    this._observe('layout-shift', (list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as LayoutShiftEntry;
        if (!shift.hadRecentInput) {
          this.clsSum += shift.value;
          cb({ type: 'vital', name: 'CLS', value: this.clsSum, rating: rate('CLS', this.clsSum), timestamp: Date.now() });
        }
      }
    });

    // TTFB: from navigation entry
    this._observe('navigation', (list) => {
      const nav = list.getEntries()[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        const value = nav.responseStart - nav.requestStart;
        cb({ type: 'vital', name: 'TTFB', value, rating: rate('TTFB', value), timestamp: Date.now() });
      }
    });
  }

  stop(): void {
    this.observers.forEach((o) => o.disconnect());
    this.observers = [];
  }

  private _observe(
    type: string,
    cb: (list: PerformanceObserverEntryList) => void,
    extra?: Record<string, unknown>,
  ): void {
    try {
      const po = new PerformanceObserver(cb);
      po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      this.observers.push(po);
    } catch {
      // Entry type not supported in this browser — skip silently
    }
  }
}
