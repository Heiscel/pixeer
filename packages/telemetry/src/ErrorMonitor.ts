import type { ErrorEvent, ClickEvent } from './types.js';

type ErrorCallback = (e: Omit<ErrorEvent, 'sessionId' | 'url'>) => void;

export class ErrorMonitor {
  private cleanups: (() => void)[] = [];

  start(cb: ErrorCallback, breadcrumbs: () => Pick<ClickEvent, 'elementName' | 'elementTag' | 'timestamp'>[]): void {
    // Capturing phase catches both JS errors AND resource load failures (images, scripts, etc.)
    const errorHandler = (event: Event) => {
      if (event instanceof ErrorEvent) {
        // JS runtime error
        cb({
          type: 'error',
          timestamp: Date.now(),
          message: event.message,
          stack: event.error instanceof Error ? event.error.stack : undefined,
          source: event.filename,
          line: event.lineno,
          col: event.colno,
          breadcrumbs: breadcrumbs(),
        });
      } else {
        // Resource error (img/script/link failed to load)
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const src =
          target.getAttribute('src') ??
          target.getAttribute('href') ??
          undefined;
        cb({
          type: 'error',
          timestamp: Date.now(),
          message: `Failed to load resource: ${src ?? target.tagName.toLowerCase()}`,
          resourceTag: target.tagName.toLowerCase(),
          resourceSrc: src,
          breadcrumbs: breadcrumbs(),
        });
      }
    };

    window.addEventListener('error', errorHandler, true);
    this.cleanups.push(() => window.removeEventListener('error', errorHandler, true));

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection');
      const stack   = reason instanceof Error ? reason.stack : undefined;
      cb({
        type: 'error',
        timestamp: Date.now(),
        message,
        stack,
        isUnhandledRejection: true,
        breadcrumbs: breadcrumbs(),
      });
    };

    window.addEventListener('unhandledrejection', rejectionHandler);
    this.cleanups.push(() => window.removeEventListener('unhandledrejection', rejectionHandler));
  }

  stop(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
}
