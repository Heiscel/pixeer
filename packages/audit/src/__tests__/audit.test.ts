import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startMonitor } from '../LiveMonitor.js';
import { runAudit } from '../Auditor.js';
import { checkContrast } from '../ContrastChecker.js';
import { checkTouchTargets } from '../TouchTargetChecker.js';
import { checkKeyboardNavigability } from '../KeyboardChecker.js';
import { checkFormLabels } from '../FormLabelChecker.js';
import { checkFocusVisibleContrast } from '../FocusChecker.js';
import { parseColor, relativeLuminance, contrastRatio, requiredRatio } from '../color.js';
import { exitCodeForReport, formatGitHubAnnotations, formatTextSummary } from '../ci.js';
import type { AuditReport } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function html(content: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = content;
  document.body.appendChild(div);
  return div;
}

function cleanup(): void {
  document.body.innerHTML = '';
}

// Override getComputedStyle to return controlled values for elements we create.
// happy-dom's getComputedStyle returns mostly empty strings, so we need to patch.
function mockComputedStyle(el: Element, props: Partial<CSSStyleDeclaration>): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
    if (target === el) {
      return { ...window.getComputedStyle(el), ...props } as CSSStyleDeclaration;
    }
    return window.getComputedStyle(target);
  });
}

// ---------------------------------------------------------------------------
// color.ts
// ---------------------------------------------------------------------------

describe('parseColor', () => {
  it('parses rgb()', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual([255, 0, 0, 1]);
  });

  it('parses rgba() with alpha', () => {
    expect(parseColor('rgba(0, 128, 0, 0.5)')).toEqual([0, 128, 0, 0.5]);
  });

  it('returns null for unsupported format', () => {
    expect(parseColor('#ff0000')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('returns 0 for black', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
  });

  it('returns 1 for white', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 3);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    const black = relativeLuminance(0, 0, 0);
    const white = relativeLuminance(255, 255, 255);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 0);
  });

  it('returns 1 for same color', () => {
    const l = relativeLuminance(128, 128, 128);
    expect(contrastRatio(l, l)).toBeCloseTo(1, 3);
  });

  it('is symmetric', () => {
    const l1 = relativeLuminance(255, 0, 0);
    const l2 = relativeLuminance(255, 255, 255);
    expect(contrastRatio(l1, l2)).toBeCloseTo(contrastRatio(l2, l1), 10);
  });
});

describe('requiredRatio', () => {
  it('requires 4.5:1 for normal text AA', () => {
    expect(requiredRatio(16, '400', 'aa')).toBe(4.5);
  });

  it('requires 3:1 for large text AA (>=24px)', () => {
    expect(requiredRatio(24, '400', 'aa')).toBe(3);
  });

  it('requires 3:1 for bold large text AA (>=18.67px)', () => {
    expect(requiredRatio(19, '700', 'aa')).toBe(3);
  });

  it('requires 7:1 for normal text AAA', () => {
    expect(requiredRatio(16, '400', 'aaa')).toBe(7);
  });

  it('requires 4.5:1 for large text AAA', () => {
    expect(requiredRatio(24, '400', 'aaa')).toBe(4.5);
  });
});

// ---------------------------------------------------------------------------
// Touch target checker
// ---------------------------------------------------------------------------

describe('checkTouchTargets', () => {
  afterEach(cleanup);

  it('flags a button smaller than 24px', () => {
    // We need to mock getBoundingClientRect since happy-dom returns 0s
    const root = html('<button id="tiny">Click</button>');
    const btn = root.querySelector('#tiny')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 20, height: 20, top: 0, left: 0, right: 20, bottom: 20,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
    // Also mock offsetParent to make isRendered pass
    Object.defineProperty(btn, 'offsetParent', { get: () => document.body });

    const violations = checkTouchTargets(root, 24, 500);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe('touch-target-size');
    expect(violations[0].actual).toBe('20×20px');
  });

  it('does not flag a button meeting 24px', () => {
    const root = html('<button id="ok">Click</button>');
    const btn = root.querySelector('#ok')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 44, height: 44, top: 0, left: 0, right: 44, bottom: 44,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
    Object.defineProperty(btn, 'offsetParent', { get: () => document.body });

    const violations = checkTouchTargets(root, 24, 500);
    expect(violations).toHaveLength(0);
  });

  it('uses WCAG 2.2 default of 24px', async () => {
    const { runAudit } = await import('../Auditor.js');
    const root = html('<button id="b">X</button>');
    const btn = root.querySelector('#b')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 22, height: 22, top: 0, left: 0, right: 22, bottom: 22,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
    Object.defineProperty(btn, 'offsetParent', { get: () => document.body });

    const report = await runAudit({ root, include: ['touch-target-size'] });
    // 22px < 24px default → should flag
    const touchViolations = report.violations.filter((v) => v.ruleId === 'touch-target-size');
    expect(touchViolations.length).toBeGreaterThan(0);
  });

  afterEach(() => vi.restoreAllMocks());
});

// ---------------------------------------------------------------------------
// Keyboard checker
// ---------------------------------------------------------------------------

describe('checkKeyboardNavigability', () => {
  afterEach(cleanup);

  it('flags interactive role without tabindex', () => {
    const root = html('<div role="button">Submit</div>');
    const violations = checkKeyboardNavigability(root, 500);
    const kbViolations = violations.filter((v) => v.ruleId === 'keyboard-navigability');
    expect(kbViolations.length).toBeGreaterThan(0);
    expect(kbViolations[0].severity).toBe('critical');
  });

  it('does not flag native button', () => {
    const root = html('<button>Click</button>');
    const violations = checkKeyboardNavigability(root, 500);
    expect(violations).toHaveLength(0);
  });

  it('does not flag element with explicit tabindex', () => {
    const root = html('<div role="button" tabindex="0">OK</div>');
    const violations = checkKeyboardNavigability(root, 500);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Form label checker
// ---------------------------------------------------------------------------

describe('checkFormLabels', () => {
  afterEach(cleanup);

  it('flags input with no label', () => {
    const root = html('<input type="text" id="name" />');
    const violations = checkFormLabels(root, 500);
    const v = violations.filter((v) => v.ruleId === 'form-label');
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].severity).toBe('critical');
  });

  it('does not flag input with associated label', () => {
    const root = html('<label for="email">Email</label><input type="email" id="email" />');
    const violations = checkFormLabels(root, 500);
    expect(violations.filter((v) => v.ruleId === 'form-label')).toHaveLength(0);
  });

  it('does not flag input with aria-label', () => {
    const root = html('<input type="text" aria-label="Username" />');
    const violations = checkFormLabels(root, 500);
    expect(violations.filter((v) => v.ruleId === 'form-label')).toHaveLength(0);
  });

  it('flags placeholder used as label', () => {
    const root = html('<input type="text" placeholder="Enter your name" />');
    const violations = checkFormLabels(root, 500);
    const v = violations.filter((v) => v.ruleId === 'form-placeholder-as-label');
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].severity).toBe('warning');
  });

  it('does not flag input wrapped in label', () => {
    const root = html('<label>Name <input type="text" /></label>');
    const violations = checkFormLabels(root, 500);
    expect(violations.filter((v) => v.ruleId === 'form-label')).toHaveLength(0);
  });

  it('does not flag hidden inputs', () => {
    const root = html('<input type="hidden" name="csrf" value="abc" />');
    const violations = checkFormLabels(root, 500);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Focus checker
// ---------------------------------------------------------------------------

describe('checkFocusVisibleContrast', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('flags button with outline:none and no alternative', () => {
    const root = html('<button id="nofocus">Submit</button>');
    const btn = root.querySelector('#nofocus') as HTMLElement;

    vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
      if (target === btn) {
        return {
          display: 'inline-block',
          visibility: 'visible',
          outlineStyle: 'none',
          outlineWidth: '0px',
          boxShadow: 'none',
        } as unknown as CSSStyleDeclaration;
      }
      return { display: 'block', visibility: 'visible', outlineStyle: 'none', outlineWidth: '0px', boxShadow: 'none' } as unknown as CSSStyleDeclaration;
    });

    const violations = checkFocusVisibleContrast(root, 500);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe('focus-visible-contrast');
    expect(violations[0].severity).toBe('warning');
  });

  it('flags low-contrast outline color', () => {
    const root = html('<button id="lowfocus">Submit</button>');
    const btn = root.querySelector('#lowfocus') as HTMLElement;

    vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
      if (target === btn || target === document.documentElement) {
        return {
          display: 'inline-block',
          visibility: 'visible',
          outlineStyle: 'solid',
          outlineWidth: '2',   // parsed as parseFloat('2') = 2
          outlineColor: 'rgb(200, 200, 200)',  // very light grey = low contrast on white bg
          boxShadow: 'none',
          backgroundColor: 'rgba(0,0,0,0)',
        } as unknown as CSSStyleDeclaration;
      }
      return { display: 'block', visibility: 'visible', backgroundColor: 'rgb(255,255,255)', outlineStyle: 'none', outlineWidth: '0' } as unknown as CSSStyleDeclaration;
    });

    const violations = checkFocusVisibleContrast(root, 500);
    const focusViolations = violations.filter((v) => v.ruleId === 'focus-visible-contrast');
    expect(focusViolations.length).toBeGreaterThan(0);
    expect(focusViolations[0].severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// runAudit — integration
// ---------------------------------------------------------------------------

describe('runAudit', () => {
  afterEach(cleanup);

  it('returns a valid AuditReport structure', async () => {
    const root = html('<p>Hello world</p>');
    const report = await runAudit({ root, include: ['form-label'] });
    expect(report).toMatchObject({
      timestamp: expect.any(String),
      url: expect.any(String),
      violations: expect.any(Array),
      summary: {
        critical: expect.any(Number),
        warning: expect.any(Number),
        info: expect.any(Number),
        total: expect.any(Number),
      },
      passed: expect.any(Array),
    });
  });

  it('respects include filter', async () => {
    const root = html('<input type="text" />');
    const report = await runAudit({ root, include: ['form-label'] });
    const ruleIds = new Set(report.violations.map((v) => v.ruleId));
    expect(ruleIds.has('form-label') || ruleIds.size === 0).toBe(true);
    // No touch-target violations since it was excluded
    expect(ruleIds.has('touch-target-size')).toBe(false);
  });

  it('respects exclude filter', async () => {
    const root = html('<input type="text" />');
    const report = await runAudit({ root, exclude: ['form-label', 'form-placeholder-as-label', 'aria-describedby'] });
    expect(report.violations.every((v) => v.ruleId !== 'form-label')).toBe(true);
  });

  it('includePassed adds passed rule IDs', async () => {
    const root = html('<label for="e">Email</label><input type="email" id="e" />');
    const report = await runAudit({ root, include: ['form-label'], includePassed: true });
    expect(report.passed).toContain('form-label');
  });

  it('summary counts match violations array', async () => {
    const root = html('<input type="text" /><input type="text" />');
    const report = await runAudit({ root, include: ['form-label'] });
    const { critical, warning, info, total } = report.summary;
    expect(critical + warning + info).toBe(total);
    expect(total).toBe(report.violations.length);
  });

  it('minTouchTargetSize option is respected', async () => {
    const root = html('<button id="mid">Click</button>');
    const btn = root.querySelector('#mid')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 30, height: 30, top: 0, left: 0, right: 30, bottom: 30,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
    Object.defineProperty(btn, 'offsetParent', { get: () => document.body });

    // 30px passes the 24px WCAG 2.2 default
    const report24 = await runAudit({ root, include: ['touch-target-size'], minTouchTargetSize: 24 });
    expect(report24.violations.filter((v) => v.ruleId === 'touch-target-size')).toHaveLength(0);

    // 30px fails against the stricter 44px SC 2.5.5 requirement
    const report44 = await runAudit({ root, include: ['touch-target-size'], minTouchTargetSize: 44 });
    expect(report44.violations.filter((v) => v.ruleId === 'touch-target-size').length).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// CI helpers
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    timestamp: '2026-04-30T00:00:00.000Z',
    url: 'http://localhost/',
    title: 'Test',
    violations: [],
    summary: { critical: 0, warning: 0, info: 0, total: 0 },
    passed: [],
    ...overrides,
  };
}

describe('exitCodeForReport', () => {
  it('returns 0 for a clean report', () => {
    expect(exitCodeForReport(makeReport())).toBe(0);
  });

  it('returns 1 for critical violations (failOnCritical default)', () => {
    const report = makeReport({
      violations: [{ ruleId: 'form-label', severity: 'critical', message: 'bad' }],
      summary: { critical: 1, warning: 0, info: 0, total: 1 },
    });
    expect(exitCodeForReport(report)).toBe(1);
  });

  it('returns 0 for warnings when failOnWarning is false (default)', () => {
    const report = makeReport({
      violations: [{ ruleId: 'touch-target-size', severity: 'warning', message: 'small' }],
      summary: { critical: 0, warning: 1, info: 0, total: 1 },
    });
    expect(exitCodeForReport(report)).toBe(0);
  });

  it('returns 1 for warnings when failOnWarning is true', () => {
    const report = makeReport({
      violations: [{ ruleId: 'touch-target-size', severity: 'warning', message: 'small' }],
      summary: { critical: 0, warning: 1, info: 0, total: 1 },
    });
    expect(exitCodeForReport(report, { failOnWarning: true })).toBe(1);
  });
});

describe('formatGitHubAnnotations', () => {
  it('formats critical as ::error', () => {
    const report = makeReport({
      violations: [{ ruleId: 'form-label', severity: 'critical', message: 'Missing label', selector: 'input#name' }],
    });
    const output = formatGitHubAnnotations(report);
    expect(output).toMatch(/^::error title=form-label::/);
    expect(output).toContain('Missing label');
    expect(output).toContain('input#name');
  });

  it('formats warning as ::warning', () => {
    const report = makeReport({
      violations: [{ ruleId: 'touch-target-size', severity: 'warning', message: 'Too small' }],
    });
    const output = formatGitHubAnnotations(report);
    expect(output).toMatch(/^::warning title=touch-target-size::/);
  });

  it('formats info as ::notice', () => {
    const report = makeReport({
      violations: [{ ruleId: 'aria-describedby', severity: 'info', message: 'Consider linking' }],
    });
    const output = formatGitHubAnnotations(report);
    expect(output).toMatch(/^::notice title=aria-describedby::/);
  });

  it('returns empty string for clean report', () => {
    expect(formatGitHubAnnotations(makeReport())).toBe('');
  });

  it('produces one line per violation', () => {
    const report = makeReport({
      violations: [
        { ruleId: 'form-label', severity: 'critical', message: 'A' },
        { ruleId: 'touch-target-size', severity: 'warning', message: 'B' },
      ],
    });
    expect(formatGitHubAnnotations(report).split('\n')).toHaveLength(2);
  });
});

describe('formatTextSummary', () => {
  it('shows clean message for no violations', () => {
    const output = formatTextSummary(makeReport());
    expect(output).toContain('No violations found');
  });

  it('shows critical count in summary line', () => {
    const report = makeReport({
      violations: [{ ruleId: 'form-label', severity: 'critical', message: 'Missing label' }],
      summary: { critical: 1, warning: 0, info: 0, total: 1 },
    });
    const output = formatTextSummary(report);
    expect(output).toContain('1 critical');
    expect(output).toContain('form-label');
  });
});

// ---------------------------------------------------------------------------
// Live monitor
// ---------------------------------------------------------------------------

describe('startMonitor — rage click detection', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('detects rage clicks and fires onRageClick callback', () => {
    const onRageClick = vi.fn();
    const monitor = startMonitor({
      rageClickWindowMs: 500,
      rageClickThreshold: 3,
      trackLayoutShift: false,
      onRageClick,
    });

    const btn = document.createElement('button');
    document.body.appendChild(btn);

    // Simulate 3 rapid clicks
    const click = () => btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click(); click(); click();

    expect(onRageClick).toHaveBeenCalledOnce();
    expect(monitor.violations[0].ruleId).toBe('rage-click');
    monitor.stop();
  });

  it('does not fire below the threshold', () => {
    const onRageClick = vi.fn();
    const monitor = startMonitor({
      rageClickThreshold: 3,
      trackLayoutShift: false,
      onRageClick,
    });

    const btn = document.createElement('button');
    document.body.appendChild(btn);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onRageClick).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('stop() returns accumulated violations', () => {
    const monitor = startMonitor({ trackLayoutShift: false });
    const violations = monitor.stop();
    expect(Array.isArray(violations)).toBe(true);
  });
});
