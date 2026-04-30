import type { AuditViolation, AuditRuleId } from './types.js';
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  resolveBackground,
  requiredRatio,
} from './color.js';
import { selectorOf, describeElement } from './selector.js';

const TEXT_TAGS = new Set(['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'label', 'li', 'td', 'th', 'button', 'legend', 'caption', 'dt', 'dd', 'blockquote', 'figcaption']);

export function checkContrast(
  root: Element,
  level: 'aa' | 'aaa',
  maxElements: number,
): AuditViolation[] {
  const ruleId: AuditRuleId = level === 'aaa' ? 'color-contrast-aaa' : 'color-contrast-aa';
  const violations: AuditViolation[] = [];

  // Gather text-bearing elements
  const selector = [...TEXT_TAGS].join(',');
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector)).slice(0, maxElements);

  for (const el of elements) {
    // Skip hidden elements
    if (!isVisible(el)) continue;
    // Skip elements with no meaningful text
    const text = el.textContent?.trim() ?? '';
    if (!text) continue;

    const style = window.getComputedStyle(el);
    const fgParsed = parseColor(style.color);
    if (!fgParsed) continue;

    const bg = resolveBackground(el);
    const fgLum = relativeLuminance(fgParsed[0], fgParsed[1], fgParsed[2]);
    const bgLum = relativeLuminance(bg[0], bg[1], bg[2]);
    const ratio = contrastRatio(fgLum, bgLum);

    const fontSize = parseFloat(style.fontSize); // px
    const required = requiredRatio(fontSize, style.fontWeight, level);

    if (ratio < required) {
      violations.push({
        ruleId,
        severity: level === 'aa' ? 'critical' : 'warning',
        message: `Color contrast ratio ${ratio.toFixed(2)}:1 is below the WCAG ${level.toUpperCase()} minimum of ${required.toFixed(1)}:1`,
        selector: selectorOf(el),
        element: describeElement(el),
        actual: `${ratio.toFixed(2)}:1`,
        expected: `${required.toFixed(1)}:1`,
        context: {
          foreground: style.color,
          background: `rgb(${Math.round(bg[0])},${Math.round(bg[1])},${Math.round(bg[2])})`,
          fontSize: `${fontSize}px`,
          fontWeight: style.fontWeight,
        },
      });
    }
  }

  return violations;
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}
