import type { AuditViolation } from './types.js';
import { selectorOf, describeElement } from './selector.js';

/** Interactive elements that must meet touch target size requirements. */
const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]';

export function checkTouchTargets(
  root: Element,
  minSize: number,
  maxElements: number,
): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const elements = Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)).slice(0, maxElements);

  for (const el of elements) {
    if (!isRendered(el)) continue;

    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    if (w < minSize || h < minSize) {
      violations.push({
        ruleId: 'touch-target-size',
        severity: 'warning',
        message: `Interactive element is ${w}×${h}px, below the recommended minimum of ${minSize}×${minSize}px`,
        selector: selectorOf(el),
        element: describeElement(el),
        actual: `${w}×${h}px`,
        expected: `${minSize}×${minSize}px`,
        context: { width: w, height: h, minSize },
      });
    }
  }

  return violations;
}

function isRendered(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    el.offsetParent !== null
  );
}
