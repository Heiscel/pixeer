import type { AuditViolation } from './types.js';
import { parseColor, relativeLuminance, contrastRatio, resolveBackground } from './color.js';
import { selectorOf, describeElement } from './selector.js';

/**
 * WCAG 2.2 SC 2.4.13 Focus Appearance (Level AA):
 * Visible focus indicators must have a contrast ratio of at least 3:1 against
 * adjacent unfocused colors.
 *
 * We approximate this by:
 * 1. Finding interactive elements with a visible outline/box-shadow on :focus
 * 2. Checking the focus ring color against the element's background
 *
 * Note: We can only check computed styles at rest (not :focus pseudo-state) in
 * a static audit. We flag elements that have no focus style at all, and check
 * explicit `outline-color` when defined.
 */
export function checkFocusVisibleContrast(root: Element, maxElements: number): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const interactiveSelector =
    'a[href], button, input, select, textarea, [tabindex="0"], [role="button"], [role="link"]';
  const elements = Array.from(root.querySelectorAll<HTMLElement>(interactiveSelector)).slice(
    0,
    maxElements,
  );

  for (const el of elements) {
    if (!isRendered(el)) continue;

    const style = window.getComputedStyle(el);

    // Check if the element explicitly suppresses focus visibility
    const outlineStyle = style.outlineStyle;
    const outlineWidth = parseFloat(style.outlineWidth ?? '0');
    const boxShadow = style.boxShadow ?? '';

    const hasSuppressedFocus =
      outlineStyle === 'none' &&
      (boxShadow === 'none' || !boxShadow) &&
      !el.getAttribute('data-focus-visible-added');

    if (hasSuppressedFocus) {
      violations.push({
        ruleId: 'focus-visible-contrast',
        severity: 'warning',
        message: `Interactive element suppresses the focus indicator (outline:none) with no CSS alternative — keyboard users cannot see focus`,
        selector: selectorOf(el),
        element: describeElement(el),
        actual: 'outline: none',
        expected: 'visible focus indicator with 3:1 contrast (WCAG 2.2 SC 2.4.13)',
        context: { outlineStyle, outlineWidth, boxShadow },
      });
      continue;
    }

    // If outline color is explicitly set, check its contrast against the background
    if (outlineWidth > 0 && outlineStyle !== 'none') {
      const outlineColorStr = style.outlineColor;
      const outlineParsed = parseColor(outlineColorStr);
      if (outlineParsed) {
        const bg = resolveBackground(el);
        const focusLum = relativeLuminance(outlineParsed[0], outlineParsed[1], outlineParsed[2]);
        const bgLum = relativeLuminance(bg[0], bg[1], bg[2]);
        const ratio = contrastRatio(focusLum, bgLum);

        if (ratio < 3) {
          violations.push({
            ruleId: 'focus-visible-contrast',
            severity: 'critical',
            message: `Focus indicator contrast ratio ${ratio.toFixed(2)}:1 is below the WCAG 2.2 minimum of 3:1`,
            selector: selectorOf(el),
            element: describeElement(el),
            actual: `${ratio.toFixed(2)}:1`,
            expected: '3:1',
            context: {
              outlineColor: outlineColorStr,
              background: `rgb(${Math.round(bg[0])},${Math.round(bg[1])},${Math.round(bg[2])})`,
              outlineWidth: `${outlineWidth}px`,
            },
          });
        }
      }
    }
  }

  return violations;
}

function isRendered(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}
