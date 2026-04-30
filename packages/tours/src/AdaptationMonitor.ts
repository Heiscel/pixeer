import type { TourScript, TourStep } from './types.js';

/** Result of checking whether a step is ready to execute */
export interface StepReadiness {
  ready: boolean;
  /** Selector that caused the failure, if any */
  missedSelector?: string;
}

/**
 * Watches the DOM for changes that might affect tour step readiness.
 * Useful for SPA navigation — steps that require certain selectors to be present
 * will wait until AdaptationMonitor signals readiness.
 */
export class AdaptationMonitor {
  private observer: MutationObserver | null = null;
  private listeners = new Set<() => void>();

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => {
      this.listeners.forEach((fn) => fn());
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false,
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.listeners.clear();
  }

  /** Subscribe to DOM change notifications. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  checkStep(step: TourStep): StepReadiness {
    if (step.awaitSelector && !document.querySelector(step.awaitSelector)) {
      return { ready: false, missedSelector: step.awaitSelector };
    }

    if ('selector' in step && step.selector) {
      const sel = step.selector as string;
      if (!document.querySelector(sel)) {
        if ('optional' in step && step.optional) {
          return { ready: true };
        }
        return { ready: false, missedSelector: sel };
      }
    }

    return { ready: true };
  }

  /** Returns selectors referenced across the entire script that don't exist yet. */
  auditScript(script: TourScript): string[] {
    const missing: string[] = [];
    for (const act of script.acts) {
      for (const step of act.steps) {
        if ('selector' in step && step.selector) {
          const sel = step.selector as string;
          if (!document.querySelector(sel) && !missing.includes(sel)) {
            missing.push(sel);
          }
        }
      }
    }
    return missing;
  }
}
