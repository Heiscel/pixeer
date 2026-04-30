import type { AuditReport, AuditOptions, AuditRuleId, AuditViolation } from './types.js';
import { checkContrast } from './ContrastChecker.js';
import { checkTouchTargets } from './TouchTargetChecker.js';
import { checkKeyboardNavigability } from './KeyboardChecker.js';
import { checkFormLabels } from './FormLabelChecker.js';
import { checkFocusVisibleContrast } from './FocusChecker.js';

const STATIC_RULES: AuditRuleId[] = [
  'color-contrast-aa',
  'color-contrast-aaa',
  'focus-visible-contrast',
  'touch-target-size',
  'keyboard-navigability',
  'form-label',
  'form-placeholder-as-label',
  'aria-describedby',
];

/**
 * Run a static accessibility and UI quality audit on the current page.
 *
 * @example
 * const report = await runAudit({ contrastLevel: 'aa', exclude: ['color-contrast-aaa'] });
 * if (report.summary.critical > 0) throw new Error('Critical violations found');
 */
export async function runAudit(options: AuditOptions = {}): Promise<AuditReport> {
  const {
    include,
    exclude,
    root = document.body,
    includePassed = false,
    contrastLevel = 'aa',
    minTouchTargetSize = 24, // WCAG 2.2 SC 2.5.8 Level AA minimum
    maxElements = 500,
  } = options;

  // Determine which rules to run
  const rulesToRun = STATIC_RULES.filter((id) => {
    if (include) return include.includes(id);
    if (exclude) return !exclude.includes(id);
    return true;
  });

  const allViolations: AuditViolation[] = [];
  const passedRules: AuditRuleId[] = [];

  const runRule = (ruleId: AuditRuleId, checker: () => AuditViolation[]): void => {
    if (!rulesToRun.includes(ruleId)) return;
    const results = checker();
    if (results.length === 0) {
      passedRules.push(ruleId);
    } else {
      allViolations.push(...results);
    }
  };

  // Color contrast — AA
  runRule('color-contrast-aa', () => checkContrast(root, 'aa', maxElements));

  // Color contrast — AAA (only if not excluded)
  runRule('color-contrast-aaa', () => checkContrast(root, 'aaa', maxElements));

  // WCAG 2.2 focus indicator contrast (SC 2.4.13)
  runRule('focus-visible-contrast', () => checkFocusVisibleContrast(root, maxElements));

  // Touch target size — WCAG 2.2 SC 2.5.8 (24px AA) or SC 2.5.5 (44px, stricter)
  runRule('touch-target-size', () => checkTouchTargets(root, minTouchTargetSize, maxElements));

  // Keyboard navigability
  runRule('keyboard-navigability', () => checkKeyboardNavigability(root, maxElements));

  // Form labels (runs all three sub-rules at once, filter by ruleId after)
  const formViolations = checkFormLabels(root, maxElements);
  const formRuleIds: AuditRuleId[] = ['form-label', 'form-placeholder-as-label', 'aria-describedby'];
  for (const ruleId of formRuleIds) {
    if (!rulesToRun.includes(ruleId)) continue;
    const ruleViolations = formViolations.filter((v) => v.ruleId === ruleId);
    if (ruleViolations.length === 0) {
      passedRules.push(ruleId);
    } else {
      allViolations.push(...ruleViolations);
    }
  }

  const summary = {
    critical: allViolations.filter((v) => v.severity === 'critical').length,
    warning: allViolations.filter((v) => v.severity === 'warning').length,
    info: allViolations.filter((v) => v.severity === 'info').length,
    total: allViolations.length,
  };

  return {
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    title: typeof document !== 'undefined' ? document.title : '',
    violations: allViolations,
    summary,
    passed: includePassed ? passedRules : [],
    metadata: {
      rulesRun: rulesToRun,
      rootElement: root === document.body ? 'body' : selectorHint(root),
      contrastLevel,
      minTouchTargetSize,
    },
  };
}

function selectorHint(el: Element): string {
  if (el.id) return `#${el.id}`;
  if (el.className) return `.${String(el.className).split(' ')[0]}`;
  return el.tagName.toLowerCase();
}
