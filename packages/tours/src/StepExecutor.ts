import type { TourStep, TourStepContext } from './types.js';

/** Waits for a selector to appear in the DOM within the given timeout. */
export function waitForSelector(selector: string, timeoutMs: number): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`[Pixeer Tours] Timed out waiting for selector: "${selector}"`));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

/** Scroll an element into view, centering it when possible. */
export function scrollIntoView(element: Element, behavior: ScrollBehavior = 'smooth'): Promise<void> {
  element.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
  // Give the browser time to complete the scroll before we measure bounding rects.
  return new Promise((resolve) => setTimeout(resolve, behavior === 'smooth' ? 300 : 0));
}

export class StepExecutor {
  async execute(step: TourStep, ctx: TourStepContext): Promise<void> {
    if (step.awaitSelector) {
      await waitForSelector(step.awaitSelector, step.awaitTimeoutMs ?? 5000);
    }

    switch (step.type) {
      case 'highlight':
        // Highlight-only steps: the Highlighter is handled by Tour. Nothing to execute here.
        break;

      case 'click': {
        const el = document.querySelector<HTMLElement>(step.selector);
        if (!el) {
          if (step.optional) return;
          throw new Error(`[Pixeer Tours] click: element not found for selector "${step.selector}"`);
        }
        el.click();
        break;
      }

      case 'type': {
        const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(step.selector);
        if (!el) {
          throw new Error(`[Pixeer Tours] type: element not found for selector "${step.selector}"`);
        }
        if (step.clearFirst) {
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // Dispatch events compatible with React/Vue/Angular synthetic event systems
        el.focus();
        el.value = step.text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }

      case 'navigate': {
        window.location.href = step.url;
        break;
      }

      case 'wait': {
        await new Promise<void>((resolve) => setTimeout(resolve, step.ms));
        break;
      }

      case 'narrate':
        // Narration is handled by Narrator in Tour — nothing to execute here.
        break;

      case 'custom':
        await step.execute(ctx);
        break;

      default:
        // Exhaustiveness check
        step satisfies never;
    }
  }
}
