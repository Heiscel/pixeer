import type { TooltipContent, TooltipAction, TourSettings } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OVERLAY_ID = 'pixeer-tour-overlay';
const TOOLTIP_ID = 'pixeer-tour-tooltip';
const MASK_ID = 'pixeer-tour-mask';

const DEFAULTS: Required<Pick<
  TourSettings,
  'overlayColor' | 'spotlightPadding' | 'spotlightBorderRadius' | 'tooltipMaxWidth' | 'zIndex'
>> = {
  overlayColor: 'rgba(0,0,0,0.5)',
  spotlightPadding: 8,
  spotlightBorderRadius: 4,
  tooltipMaxWidth: 320,
  zIndex: 9000,
};

export interface HighlightOptions {
  padding?: number;
  borderRadius?: number;
  overlayColor?: string;
  tooltip?: TooltipContent;
  /** Text shown as step counter e.g. "Step 2 / 5" */
  counter?: string;
  /** Overrides tooltip.actions */
  defaultActions?: TooltipAction[];
  maxWidth?: number;
  zIndex?: number;
  onNext?: () => void;
  onPrev?: () => void;
  onSkip?: () => void;
}

export class Highlighter {
  private svg: SVGSVGElement | null = null;
  private maskRect: SVGRectElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastElement: Element | null = null;
  private lastOptions: HighlightOptions = {};

  highlight(element: Element, options: HighlightOptions = {}): void {
    this.lastElement = element;
    this.lastOptions = options;
    this._ensureOverlay(options);
    this._updateSpotlight(element, options);
    if (options.tooltip) {
      this._updateTooltip(element, options);
    } else {
      this._removeTooltip();
    }
    this._startTracking(element, options);
  }

  /** Show or update the tooltip without changing the spotlight position */
  updateTooltip(options: HighlightOptions): void {
    if (!this.lastElement) return;
    this.lastOptions = { ...this.lastOptions, ...options };
    if (options.tooltip) {
      this._updateTooltip(this.lastElement, this.lastOptions);
    }
  }

  clear(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.svg?.remove();
    this.tooltip?.remove();
    this.svg = null;
    this.maskRect = null;
    this.tooltip = null;
    this.lastElement = null;
  }

  private _ensureOverlay(options: HighlightOptions): void {
    const zIndex = options.zIndex ?? DEFAULTS.zIndex;
    const overlayColor = options.overlayColor ?? DEFAULTS.overlayColor;

    if (!this.svg) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.id = OVERLAY_ID;
      svg.setAttribute('aria-hidden', 'true');
      Object.assign(svg.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        zIndex: String(zIndex),
        pointerEvents: 'none',
        overflow: 'visible',
      });

      const defs = document.createElementNS(SVG_NS, 'defs');
      const mask = document.createElementNS(SVG_NS, 'mask');
      mask.id = MASK_ID;

      // White background = show overlay everywhere
      const bg = document.createElementNS(SVG_NS, 'rect');
      bg.setAttribute('width', '100%');
      bg.setAttribute('height', '100%');
      bg.setAttribute('fill', 'white');
      mask.appendChild(bg);

      // Black cutout = hide overlay (shows element through)
      const cutout = document.createElementNS(SVG_NS, 'rect');
      cutout.setAttribute('fill', 'black');
      mask.appendChild(cutout);
      this.maskRect = cutout;

      defs.appendChild(mask);
      svg.appendChild(defs);

      const overlay = document.createElementNS(SVG_NS, 'rect');
      overlay.setAttribute('width', '100%');
      overlay.setAttribute('height', '100%');
      overlay.setAttribute('fill', overlayColor);
      overlay.setAttribute('mask', `url(#${MASK_ID})`);
      svg.appendChild(overlay);

      document.body.appendChild(svg);
      this.svg = svg;
    } else {
      // Update overlay color if changed
      const overlay = this.svg.querySelector<SVGRectElement>('rect:not([mask])');
      if (overlay) overlay.setAttribute('fill', overlayColor);
    }
  }

  private _updateSpotlight(element: Element, options: HighlightOptions): void {
    const rect = element.getBoundingClientRect();
    const padding = options.padding ?? DEFAULTS.spotlightPadding;
    const br = options.borderRadius ?? DEFAULTS.spotlightBorderRadius;

    const x = rect.left - padding;
    const y = rect.top - padding;
    const w = rect.width + padding * 2;
    const h = rect.height + padding * 2;

    const cutout = this.maskRect!;
    cutout.setAttribute('x', String(x));
    cutout.setAttribute('y', String(y));
    cutout.setAttribute('width', String(w));
    cutout.setAttribute('height', String(h));
    cutout.setAttribute('rx', String(br));
    cutout.setAttribute('ry', String(br));
  }

  private _updateTooltip(element: Element, options: HighlightOptions): void {
    const zIndex = (options.zIndex ?? DEFAULTS.zIndex) + 1;
    const maxWidth = options.maxWidth ?? DEFAULTS.tooltipMaxWidth;

    if (!this.tooltip) {
      const div = document.createElement('div');
      div.id = TOOLTIP_ID;
      div.setAttribute('role', 'dialog');
      div.setAttribute('aria-live', 'polite');
      Object.assign(div.style, {
        position: 'fixed',
        zIndex: String(zIndex),
        maxWidth: `${maxWidth}px`,
        boxSizing: 'border-box',
        background: '#fff',
        color: '#1a1a1a',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        lineHeight: '1.5',
        pointerEvents: 'auto',
      });
      document.body.appendChild(div);
      this.tooltip = div;
    }

    const content = options.tooltip!;
    this.tooltip.innerHTML = this._renderTooltipHTML(content, options);
    this._bindTooltipActions(options);
    this._positionTooltip(element, content.placement ?? 'auto', options.padding ?? DEFAULTS.spotlightPadding);
  }

  private _renderTooltipHTML(content: TooltipContent, options: HighlightOptions): string {
    const parts: string[] = [];

    if (options.counter) {
      parts.push(`<div style="font-size:11px;color:#888;margin-bottom:6px;">${escapeHtml(options.counter)}</div>`);
    }

    if (content.html) {
      parts.push(`<div class="pixeer-tooltip-body">${content.html}</div>`);
    } else {
      parts.push(`<div class="pixeer-tooltip-body">${escapeHtml(content.text)}</div>`);
    }

    const actions = content.actions ?? options.defaultActions ?? [];
    if (actions.length > 0) {
      const buttons = actions.map((a) => {
        const style = [
          'cursor:pointer',
          'padding:6px 14px',
          'border-radius:5px',
          'font-size:13px',
          'border:none',
          a.type === 'next' || a.type === 'custom'
            ? 'background:#2563eb;color:#fff'
            : 'background:#f1f5f9;color:#374151',
        ].join(';');
        return `<button data-pixeer-action="${a.type}" style="${style}">${escapeHtml(a.label)}</button>`;
      });
      parts.push(`<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">${buttons.join('')}</div>`);
    }

    return parts.join('');
  }

  private _bindTooltipActions(options: HighlightOptions): void {
    const tooltip = this.tooltip!;
    const actions = options.tooltip?.actions ?? options.defaultActions ?? [];

    tooltip.querySelectorAll<HTMLButtonElement>('[data-pixeer-action]').forEach((btn) => {
      const type = btn.dataset.pixeerAction as TooltipAction['type'];
      const custom = actions.find((a) => a.type === type);

      btn.addEventListener('click', () => {
        if (custom?.onClick) {
          void custom.onClick();
          return;
        }
        if (type === 'next') options.onNext?.();
        else if (type === 'prev') options.onPrev?.();
        else if (type === 'skip' || type === 'end') options.onSkip?.();
      });
    });
  }

  private _positionTooltip(element: Element, placement: string, padding: number): void {
    const tooltip = this.tooltip!;
    const targetRect = element.getBoundingClientRect();
    const gap = 12 + padding;

    // Temporarily render off-screen to measure
    tooltip.style.visibility = 'hidden';
    tooltip.style.top = '-9999px';
    tooltip.style.left = '-9999px';

    // Force layout
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const positions = {
      top:    { top: targetRect.top - th - gap,            left: targetRect.left + targetRect.width / 2 - tw / 2 },
      bottom: { top: targetRect.bottom + gap,              left: targetRect.left + targetRect.width / 2 - tw / 2 },
      left:   { top: targetRect.top + targetRect.height / 2 - th / 2, left: targetRect.left - tw - gap },
      right:  { top: targetRect.top + targetRect.height / 2 - th / 2, left: targetRect.right + gap },
    };

    const fits = {
      top:    positions.top.top >= 4,
      bottom: positions.bottom.top + th <= vh - 4,
      left:   positions.left.left >= 4,
      right:  positions.right.left + tw <= vw - 4,
    };

    let chosen: { top: number; left: number };
    if (placement !== 'auto' && fits[placement as keyof typeof fits]) {
      chosen = positions[placement as keyof typeof positions];
    } else {
      // Auto: prefer bottom, then top, then right, then left
      chosen = fits.bottom ? positions.bottom
             : fits.top    ? positions.top
             : fits.right  ? positions.right
             : positions.left;
    }

    // Clamp to viewport
    const top  = Math.max(4, Math.min(chosen.top,  vh - th - 4));
    const left = Math.max(4, Math.min(chosen.left, vw - tw - 4));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.visibility = 'visible';
  }

  private _removeTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }

  private _startTracking(element: Element, options: HighlightOptions): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.lastElement) {
        this._updateSpotlight(this.lastElement, this.lastOptions);
        if (this.lastOptions.tooltip && this.tooltip) {
          this._positionTooltip(
            this.lastElement,
            this.lastOptions.tooltip.placement ?? 'auto',
            this.lastOptions.padding ?? DEFAULTS.spotlightPadding,
          );
        }
      }
    });
    this.resizeObserver.observe(element);
    this.resizeObserver.observe(document.body);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
