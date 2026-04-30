import type { AuditViolation, AuditMonitorOptions, AuditMonitorHandle } from './types.js';
import { selectorOf, describeElement } from './selector.js';

// LayoutShift is not yet in TypeScript's lib.dom.d.ts
interface LayoutShiftAttribution {
  readonly node: Element | null;
  readonly previousRect: DOMRectReadOnly;
  readonly currentRect: DOMRectReadOnly;
}

interface LayoutShiftEntry extends PerformanceEntry {
  readonly hadRecentInput: boolean;
  readonly value: number;
  readonly sources: readonly LayoutShiftAttribution[];
}

// ---------------------------------------------------------------------------
// Rage Click Detector
// ---------------------------------------------------------------------------

interface ClickRecord {
  target: Element;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Live Monitor
// ---------------------------------------------------------------------------

/**
 * Starts observing the page for:
 * - Rage clicks (3+ clicks on the same element within 500ms)
 * - CLS layout shifts with element attribution
 *
 * Returns a handle to stop observation and retrieve accumulated violations.
 */
export function startMonitor(options: AuditMonitorOptions = {}): AuditMonitorHandle {
  const {
    rageClickWindowMs = 500,
    rageClickThreshold = 3,
    trackRageClicks = true,
    trackLayoutShift = true,
    layoutShiftThreshold = 0.1,
    onRageClick,
    onLayoutShift,
  } = options;

  const violations: AuditViolation[] = [];
  const cleanups: (() => void)[] = [];

  // ----- Rage clicks -----
  if (trackRageClicks) {
    const recentClicks: ClickRecord[] = [];

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const now = Date.now();
      recentClicks.push({ target, timestamp: now });

      // Keep only clicks within the window
      const cutoff = now - rageClickWindowMs;
      while (recentClicks.length > 0 && recentClicks[0].timestamp < cutoff) {
        recentClicks.shift();
      }

      // Count clicks on the same element
      const clicksOnTarget = recentClicks.filter((r) => r.target === target);
      if (clicksOnTarget.length >= rageClickThreshold) {
        // Dedupe: only fire once per rage sequence (when we first hit the threshold)
        if (clicksOnTarget.length === rageClickThreshold) {
          const violation: AuditViolation = {
            ruleId: 'rage-click',
            severity: 'warning',
            message: `Rage click detected: ${rageClickThreshold} clicks within ${rageClickWindowMs}ms — element may be unresponsive or confusing`,
            selector: selectorOf(target),
            element: describeElement(target),
            actual: `${rageClickThreshold} clicks / ${rageClickWindowMs}ms`,
            expected: 'responsive interaction',
            context: {
              clickCount: rageClickThreshold,
              windowMs: rageClickWindowMs,
              timestamp: new Date().toISOString(),
            },
          };
          violations.push(violation);
          onRageClick?.(violation);
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    cleanups.push(() => document.removeEventListener('click', handleClick, true));
  }

  // ----- Layout shift attribution -----
  if (trackLayoutShift && typeof PerformanceObserver !== 'undefined') {
    let cumulativeScore = 0;

    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as LayoutShiftEntry;

          // Ignore shifts caused by user input (not counted in CLS)
          if (shift.hadRecentInput) continue;

          const score = shift.value;
          cumulativeScore += score;

          if (cumulativeScore >= layoutShiftThreshold) {
            // sources[0] has the highest-impact shifted element
            const sources = shift.sources ?? [];
            const culprits = sources
              .map((s) => s.node)
              .filter((n): n is Element => !!n && n.nodeType === Node.ELEMENT_NODE);

            const culpritSelectors = culprits.map((el) => selectorOf(el)).join(', ') || 'unknown';

            const violation: AuditViolation = {
              ruleId: 'layout-shift-attribution',
              severity: 'warning',
              message: `Cumulative Layout Shift score ${cumulativeScore.toFixed(3)} exceeds threshold of ${layoutShiftThreshold} — caused by: ${culpritSelectors}`,
              actual: cumulativeScore.toFixed(3),
              expected: `< ${layoutShiftThreshold}`,
              context: {
                cumulativeScore,
                shiftScore: score,
                culprits: culpritSelectors,
                timestamp: new Date().toISOString(),
              },
            };
            violations.push(violation);
            onLayoutShift?.(violation);
            cumulativeScore = 0; // reset after reporting
          }
        }
      });

      po.observe({ type: 'layout-shift', buffered: true });
      cleanups.push(() => po.disconnect());
    } catch {
      // PerformanceObserver may not support layout-shift in all environments
    }
  }

  return {
    get violations() {
      return violations;
    },
    stop(): AuditViolation[] {
      cleanups.forEach((fn) => fn());
      return violations;
    },
  };
}
