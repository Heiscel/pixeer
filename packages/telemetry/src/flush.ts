import type { TelemetryEvent } from './types.js';

/** Flush events to an endpoint. Uses sendBeacon with fetch keepalive fallback. */
export function flush(endpoint: string, events: TelemetryEvent[]): void {
  if (events.length === 0) return;
  const body = JSON.stringify(events);

  // sendBeacon is fire-and-forget and survives page unload
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    if (sent) return;
  }

  // Fallback: fetch with keepalive survives page navigation
  void fetch(endpoint, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {
    // Silently drop on network failure — telemetry must never throw
  });
}

/** Register flush on page visibility change and pagehide (unload replacement). */
export function registerFlushOnHide(fn: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') fn();
  };
  const onPageHide = () => fn();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}
