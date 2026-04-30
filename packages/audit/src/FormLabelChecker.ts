import type { AuditViolation } from './types.js';
import { selectorOf, describeElement } from './selector.js';

const LABELABLE_INPUTS = new Set([
  'text', 'email', 'password', 'search', 'tel', 'url', 'number',
  'date', 'time', 'datetime-local', 'month', 'week', 'color',
  'range', 'file', 'checkbox', 'radio', '',
]);

export function checkFormLabels(root: Element, maxElements: number): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const inputs = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select',
    ),
  ).slice(0, maxElements);

  for (const el of inputs) {
    // Skip hidden inputs
    if (el instanceof HTMLInputElement && !LABELABLE_INPUTS.has(el.type)) continue;
    if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
    if (!isRendered(el)) continue;

    const hasAriaLabel = !!el.getAttribute('aria-label')?.trim();
    const hasAriaLabelledBy = !!el.getAttribute('aria-labelledby')?.trim();
    const hasTitle = !!el.getAttribute('title')?.trim();

    // Check for associated <label>
    let hasLabel = hasAriaLabel || hasAriaLabelledBy || hasTitle;

    if (!hasLabel && el.id) {
      const label = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) hasLabel = true;
    }
    if (!hasLabel) {
      const wrappingLabel = el.closest('label');
      if (wrappingLabel) hasLabel = true;
    }

    if (!hasLabel) {
      const placeholder = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.placeholder
        : '';

      if (placeholder) {
        // Placeholder exists but no real label — flag both issues
        violations.push({
          ruleId: 'form-placeholder-as-label',
          severity: 'warning',
          message: `Input uses placeholder as its only label — placeholders disappear on focus and are not announced reliably by screen readers`,
          selector: selectorOf(el),
          element: describeElement(el),
          actual: `placeholder="${placeholder}"`,
          expected: '<label> or aria-label',
          context: { placeholder },
        });
      } else {
        violations.push({
          ruleId: 'form-label',
          severity: 'critical',
          message: `Form control has no accessible label`,
          selector: selectorOf(el),
          element: describeElement(el),
          actual: 'no label',
          expected: '<label>, aria-label, or aria-labelledby',
        });
      }
    }

    // Check for aria-describedby on inputs that likely need it (validation/error messages)
    const hasDescribedBy = !!el.getAttribute('aria-describedby')?.trim();
    const isRequiredInput = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
    if (isRequiredInput && !hasDescribedBy) {
      const errorPattern = /error|invalid|message|hint|help/i;
      const id = el.id;
      const nearbyMessage = id
        ? root.querySelector(`[id*="error"], [id*="message"], [aria-live]`)
        : null;
      if (nearbyMessage) {
        violations.push({
          ruleId: 'aria-describedby',
          severity: 'info',
          message: `Required input may have nearby error/hint text that isn't linked via aria-describedby`,
          selector: selectorOf(el),
          element: describeElement(el),
          actual: 'no aria-describedby',
          expected: 'aria-describedby pointing to error/hint element',
          context: { nearbyElementId: nearbyMessage.id || undefined },
        });
      }
    }
  }

  return violations;
}

function isRendered(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    (el as HTMLInputElement).type !== 'hidden'
  );
}
