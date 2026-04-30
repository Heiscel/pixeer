// ---------------------------------------------------------------------------
// Core event types
// ---------------------------------------------------------------------------

export type TelemetryEventType =
  | 'vital'
  | 'click'
  | 'submit'
  | 'navigate'
  | 'error'
  | 'custom';

export interface BaseTelemetryEvent {
  type: TelemetryEventType;
  timestamp: number;
  sessionId: string;
  url: string;
}

// Web Vitals
export type VitalName = 'LCP' | 'INP' | 'CLS' | 'TTFB';

export interface VitalEvent extends BaseTelemetryEvent {
  type: 'vital';
  name: VitalName;
  value: number;
  /** 'good' | 'needs-improvement' | 'poor' per Google thresholds */
  rating: VitalRating;
}

export type VitalRating = 'good' | 'needs-improvement' | 'poor';

// Interaction events — annotated with accessible element info, not pixels
export interface ClickEvent extends BaseTelemetryEvent {
  type: 'click';
  /** Accessible name of the clicked element */
  elementName: string;
  /** Tag name: button, a, input, etc. */
  elementTag: string;
  /** ARIA role if set */
  elementRole?: string;
}

export interface SubmitEvent extends BaseTelemetryEvent {
  type: 'submit';
  formName?: string;
  fieldCount: number;
}

export interface NavigateEvent extends BaseTelemetryEvent {
  type: 'navigate';
  from: string;
  to: string;
  /** 'popstate' | 'pushState' | 'replaceState' | 'load' */
  trigger: string;
}

// Error events
export interface ErrorEvent extends BaseTelemetryEvent {
  type: 'error';
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
  /** For resource errors: the element that failed (img, script, link) */
  resourceTag?: string;
  resourceSrc?: string;
  /** For promise rejections */
  isUnhandledRejection?: boolean;
  /** Last N click events before the error — breadcrumb trail */
  breadcrumbs?: Pick<ClickEvent, 'elementName' | 'elementTag' | 'timestamp'>[];
}

// Custom events (user-defined)
export interface CustomEvent extends BaseTelemetryEvent {
  type: 'custom';
  name: string;
  properties?: Record<string, unknown>;
}

export type TelemetryEvent =
  | VitalEvent
  | ClickEvent
  | SubmitEvent
  | NavigateEvent
  | ErrorEvent
  | CustomEvent;

// ---------------------------------------------------------------------------
// TelemetryReporter options
// ---------------------------------------------------------------------------

export interface TelemetryOptions {
  /**
   * Endpoint to flush events to. Uses sendBeacon (+ fetch keepalive fallback).
   * If omitted, events are only stored in the ring buffer.
   */
  endpoint?: string;
  /** Ring buffer capacity. Default: 100 */
  bufferSize?: number;
  /** Max breadcrumb actions to keep per error. Default: 10 */
  breadcrumbLimit?: number;
  /** Capture Web Vitals. Default: true */
  vitals?: boolean;
  /** Auto-capture clicks and form submissions. Default: true */
  autoCapture?: boolean;
  /** Monitor SPA navigation. Default: true */
  navigation?: boolean;
  /** Monitor JS errors and unhandled rejections. Default: true */
  errors?: boolean;
  /** Custom event filter — return false to drop an event */
  filter?: (event: TelemetryEvent) => boolean;
  /** Sampling rate 0–1. Default: 1 (100%) */
  sampleRate?: number;
  /** Flush interval in ms. 0 = only flush on page hide. Default: 0 */
  flushIntervalMs?: number;
}
