// ---------------------------------------------------------------------------
// Violation severity and rule IDs
// ---------------------------------------------------------------------------

export type AuditSeverity = 'critical' | 'warning' | 'info';

export type AuditRuleId =
  | 'color-contrast-aa'
  | 'color-contrast-aaa'
  | 'focus-visible-contrast'
  | 'touch-target-size'
  | 'keyboard-navigability'
  | 'form-label'
  | 'form-placeholder-as-label'
  | 'aria-describedby'
  | 'layout-shift-attribution'
  | 'rage-click';

// ---------------------------------------------------------------------------
// Violation
// ---------------------------------------------------------------------------

export interface AuditViolation {
  ruleId: AuditRuleId;
  severity: AuditSeverity;
  message: string;
  /** CSS selector path to the violating element */
  selector?: string;
  /** Short human-readable element description (tag, text, role) */
  element?: string;
  /** Current measured value that failed, e.g. "2.8:1" */
  actual?: string;
  /** Required value, e.g. "4.5:1" */
  expected?: string;
  /** Additional structured context */
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface AuditReport {
  timestamp: string;
  url: string;
  title: string;
  violations: AuditViolation[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  /** Rule IDs that ran and found zero violations */
  passed: AuditRuleId[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AuditOptions {
  /** Limit to these rules. Default: all static rules. */
  include?: AuditRuleId[];
  /** Skip these rules. */
  exclude?: AuditRuleId[];
  /** Root element to scope the audit to. Default: document.body */
  root?: Element;
  /** Whether to list passed rules in the report. Default: false */
  includePassed?: boolean;
  /** WCAG contrast level to enforce. Default: 'aa' */
  contrastLevel?: 'aa' | 'aaa';
  /** Min touch target size in px.
   * Default: 24 (WCAG 2.2 SC 2.5.8 Level AA).
   * Set to 44 for stricter best-practice compliance (SC 2.5.5). */
  minTouchTargetSize?: number;
  /** Hard limit on elements checked per rule — protects perf on huge pages. Default: 500 */
  maxElements?: number;
}

// ---------------------------------------------------------------------------
// CI integration
// ---------------------------------------------------------------------------

export interface CIOptions {
  /** Fail (exit code 1) on critical violations. Default: true */
  failOnCritical?: boolean;
  /** Fail (exit code 2) on any warning. Default: false */
  failOnWarning?: boolean;
}

// ---------------------------------------------------------------------------
// Live monitor (rage clicks + layout shift)
// ---------------------------------------------------------------------------

export interface AuditMonitorOptions {
  /** Rage click: clicks within this window count as a rage sequence. Default: 500ms */
  rageClickWindowMs?: number;
  /** Rage click: min clicks in window to be considered a rage click. Default: 3 */
  rageClickThreshold?: number;
  /** Whether to enable layout shift attribution. Default: true */
  trackLayoutShift?: boolean;
  /** Whether to enable rage click detection. Default: true */
  trackRageClicks?: boolean;
  /** Called when a rage click is detected */
  onRageClick?: (violation: AuditViolation) => void;
  /** Called when a layout shift exceeding the threshold is detected */
  onLayoutShift?: (violation: AuditViolation) => void;
  /** CLS shift score threshold above which to report. Default: 0.1 */
  layoutShiftThreshold?: number;
}

export interface AuditMonitorHandle {
  /** Collected live violations so far */
  readonly violations: AuditViolation[];
  /** Stop observing and return final violations */
  stop(): AuditViolation[];
}
