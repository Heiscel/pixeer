import type { ClickEvent, SubmitEvent, NavigateEvent } from './types.js';

type ClickCallback    = (e: Omit<ClickEvent,    'sessionId' | 'url'>) => void;
type SubmitCallback   = (e: Omit<SubmitEvent,   'sessionId' | 'url'>) => void;
type NavigateCallback = (e: Omit<NavigateEvent, 'sessionId' | 'url'>) => void;

export class EventCapture {
  private cleanups: (() => void)[] = [];
  private prevUrl = typeof location !== 'undefined' ? location.href : '';

  startClicks(cb: ClickCallback): void {
    const handler = (event: Event) => {
      const target = (event.target as Element | null)?.closest(
        'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"]',
      );
      if (!target) return;

      cb({
        type: 'click',
        timestamp: Date.now(),
        elementName: getAccessibleName(target),
        elementTag: target.tagName.toLowerCase(),
        elementRole: target.getAttribute('role') ?? undefined,
      });
    };

    document.addEventListener('click', handler, true);
    this.cleanups.push(() => document.removeEventListener('click', handler, true));
  }

  startSubmits(cb: SubmitCallback): void {
    const handler = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form) return;

      cb({
        type: 'submit',
        timestamp: Date.now(),
        formName: form.getAttribute('aria-label') ?? form.id ?? form.name ?? undefined,
        fieldCount: form.querySelectorAll('input, select, textarea').length,
      });
    };

    document.addEventListener('submit', handler, true);
    this.cleanups.push(() => document.removeEventListener('submit', handler, true));
  }

  startNavigation(cb: NavigateCallback): void {
    // SPA navigation: intercept pushState / replaceState
    const patchHistory = (method: 'pushState' | 'replaceState') => {
      const original = history[method].bind(history);
      history[method] = (...args: Parameters<typeof history.pushState>) => {
        original(...args);
        const from = this.prevUrl;
        const to   = location.href;
        if (from !== to) {
          this.prevUrl = to;
          cb({ type: 'navigate', timestamp: Date.now(), from, to, trigger: method });
        }
      };
      return () => { history[method] = original; };
    };

    const unpatchPush    = patchHistory('pushState');
    const unpatchReplace = patchHistory('replaceState');

    const popHandler = () => {
      const from = this.prevUrl;
      const to   = location.href;
      this.prevUrl = to;
      cb({ type: 'navigate', timestamp: Date.now(), from, to, trigger: 'popstate' });
    };

    window.addEventListener('popstate', popHandler);

    this.cleanups.push(() => {
      unpatchPush();
      unpatchReplace();
      window.removeEventListener('popstate', popHandler);
    });
  }

  stop(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
}

function getAccessibleName(el: Element): string {
  return (
    el.getAttribute('aria-label') ??
    el.getAttribute('aria-labelledby')?.split(' ').map((id) => document.getElementById(id)?.textContent).join(' ') ??
    el.getAttribute('title') ??
    (el instanceof HTMLInputElement ? el.placeholder : undefined) ??
    el.textContent?.trim().slice(0, 50) ??
    el.tagName.toLowerCase()
  );
}
