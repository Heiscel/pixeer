// Main API
export { runAudit } from './Auditor.js';
export { startMonitor } from './LiveMonitor.js';

// Static checkers (for custom orchestration)
export { checkContrast } from './ContrastChecker.js';
export { checkFocusVisibleContrast } from './FocusChecker.js';
export { checkTouchTargets } from './TouchTargetChecker.js';
export { checkKeyboardNavigability } from './KeyboardChecker.js';
export { checkFormLabels } from './FormLabelChecker.js';

// CI integration
export { exitCodeForReport, formatGitHubAnnotations, formatTextSummary } from './ci.js';

// Color utils (useful if you want to pre-compute contrast outside the audit)
export { parseColor, relativeLuminance, contrastRatio, resolveBackground, requiredRatio, compositeOver } from './color.js';

// Selector utils
export { selectorOf, describeElement } from './selector.js';

// Types
export type {
  AuditSeverity,
  AuditRuleId,
  AuditViolation,
  AuditReport,
  AuditOptions,
  CIOptions,
  AuditMonitorOptions,
  AuditMonitorHandle,
} from './types.js';
