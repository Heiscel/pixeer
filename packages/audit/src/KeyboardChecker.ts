import type { AuditViolation } from './types.js';
import { selectorOf, describeElement } from './selector.js';

/** Native elements that are already keyboard accessible. */
const NATIVELY_FOCUSABLE = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
]);

/** ARIA roles that imply keyboard interaction. */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'checkbox', 'radio', 'switch', 'tab', 'slider',
  'spinbutton', 'textbox', 'combobox', 'listbox', 'searchbox',
  'treeitem', 'gridcell', 'columnheader', 'rowheader',
]);

export function checkKeyboardNavigability(root: Element, maxElements: number): AuditViolation[] {
  const violations: AuditViolation[] = [];

  // Find all elements that look interactive via CSS but aren't keyboard accessible
  const allElements = Array.from(root.querySelectorAll<HTMLElement>('*')).slice(0, maxElements);

  for (const el of allElements) {
    if (!isRendered(el)) continue;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const tabindex = el.getAttribute('tabindex');

    // Skip natively focusable elements and elements with explicit tabindex
    if (NATIVELY_FOCUSABLE.has(tag)) continue;
    if (tabindex !== null) continue;
    if (role && INTERACTIVE_ROLES.has(role)) {
      // Has interactive role but no tabindex — keyboard inaccessible
      violations.push({
        ruleId: 'keyboard-navigability',
        severity: 'critical',
        message: `Element with role="${role}" is not keyboard accessible — add tabindex="0"`,
        selector: selectorOf(el),
        element: describeElement(el),
        actual: 'no tabindex',
        expected: 'tabindex="0"',
        context: { tag, role },
      });
      continue;
    }

    // Elements that look clickable via cursor: pointer but aren't interactive
    const style = window.getComputedStyle(el);
    const hasClickHandler = el.onclick !== null;
    if (style.cursor === 'pointer' && hasClickHandler) {
      violations.push({
        ruleId: 'keyboard-navigability',
        severity: 'warning',
        message: `Element with cursor:pointer and click handler is not keyboard accessible — add role and tabindex="0"`,
        selector: selectorOf(el),
        element: describeElement(el),
        actual: 'cursor:pointer, no role/tabindex',
        expected: 'role + tabindex="0"',
        context: { tag, cursor: style.cursor },
      });
    }
  }

  return violations;
}

function isRendered(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}
