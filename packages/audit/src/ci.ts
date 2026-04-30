import type { AuditReport, CIOptions, AuditViolation } from './types.js';

/**
 * Returns the appropriate process exit code for a report.
 * - 0: no actionable violations
 * - 1: critical violations (or warnings when failOnWarning is true)
 */
export function exitCodeForReport(report: AuditReport, options: CIOptions = {}): number {
  const { failOnCritical = true, failOnWarning = false } = options;

  if (failOnCritical && report.summary.critical > 0) return 1;
  if (failOnWarning && report.summary.warning > 0) return 1;
  return 0;
}

/**
 * Format violations as GitHub Actions workflow commands so they appear as
 * file annotations in the PR diff view.
 *
 * Each line is: ::error title=<ruleId>::<message>
 *
 * @example
 * console.log(formatGitHubAnnotations(report));
 */
export function formatGitHubAnnotations(report: AuditReport): string {
  return report.violations
    .map((v) => {
      const level = v.severity === 'critical' ? 'error' : v.severity === 'warning' ? 'warning' : 'notice';
      // params: title=<ruleId>[,file=<file>,line=<line>]
      const params = [`title=${v.ruleId}`];
      // Selector is a CSS path, not a file path — include it in the message
      const selectorNote = v.selector ? ` — ${v.selector}` : '';
      const message = `${v.message}${selectorNote}`;
      return `::${level} ${params.join(',')}::${message}`;
    })
    .join('\n');
}

/**
 * Produce a compact human-readable text summary for terminal output.
 */
export function formatTextSummary(report: AuditReport): string {
  const lines: string[] = [
    `Pixeer Audit — ${report.url || 'local'}`,
    `Run at: ${report.timestamp}`,
    ``,
    `Summary: ${report.summary.critical} critical, ${report.summary.warning} warning, ${report.summary.info} info (${report.summary.total} total)`,
  ];

  if (report.violations.length === 0) {
    lines.push('', '✓ No violations found.');
    return lines.join('\n');
  }

  lines.push('');

  const bySeverity = (sev: string) => report.violations.filter((v) => v.severity === sev);

  const renderGroup = (label: string, prefix: string, items: AuditViolation[]) => {
    if (items.length === 0) return;
    lines.push(`${label} (${items.length})`);
    for (const v of items) {
      const elem = v.element ? ` — ${v.element}` : '';
      const ratio = v.actual && v.expected ? ` (${v.actual} vs ${v.expected})` : '';
      lines.push(`  ${prefix} [${v.ruleId}]${elem}${ratio}`);
      lines.push(`      ${v.message}`);
      if (v.selector) lines.push(`      Selector: ${v.selector}`);
    }
    lines.push('');
  };

  renderGroup('Critical', '✗', bySeverity('critical'));
  renderGroup('Warnings', '⚠', bySeverity('warning'));
  renderGroup('Info', 'ℹ', bySeverity('info'));

  if (report.passed.length > 0) {
    lines.push(`Passed rules: ${report.passed.join(', ')}`);
  }

  return lines.join('\n');
}
