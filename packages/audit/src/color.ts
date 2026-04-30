/** WCAG 2.1 relative luminance and contrast ratio helpers. */

/** Parse "rgb(r, g, b)" or "rgba(r, g, b, a)" into [r, g, b, a] (0-255 / 0-1). */
export function parseColor(css: string): [number, number, number, number] | null {
  const rgba = css.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (!rgba) return null;
  return [
    parseInt(rgba[1], 10),
    parseInt(rgba[2], 10),
    parseInt(rgba[3], 10),
    rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
  ];
}

/** Linearise a single 0-255 sRGB channel to linear light. */
function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two luminances. Always >= 1. */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Composite two RGBA colors: foreground over background. */
export function compositeOver(
  fg: [number, number, number, number],
  bg: [number, number, number, number],
): [number, number, number, number] {
  const a = fg[3] + bg[3] * (1 - fg[3]);
  if (a === 0) return [0, 0, 0, 0];
  const r = (fg[0] * fg[3] + bg[0] * bg[3] * (1 - fg[3])) / a;
  const g = (fg[1] * fg[3] + bg[1] * bg[3] * (1 - fg[3])) / a;
  const b = (fg[2] * fg[3] + bg[2] * bg[3] * (1 - fg[3])) / a;
  return [r, g, b, a];
}

/** Walk up the DOM tree to resolve the effective background color (skip transparent layers). */
export function resolveBackground(element: Element): [number, number, number, number] {
  let el: Element | null = element;
  let bg: [number, number, number, number] = [255, 255, 255, 1]; // default white

  const stack: [number, number, number, number][] = [];

  while (el && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const color = parseColor(style.backgroundColor);
    if (color && color[3] > 0) {
      stack.push(color);
      if (color[3] === 1) break; // fully opaque — stop here
    }
    el = el.parentElement;
  }

  // Composite from bottom up
  for (let i = stack.length - 1; i >= 0; i--) {
    bg = compositeOver(stack[i], bg);
  }
  return bg;
}

/** WCAG AA required contrast ratios. */
export function requiredRatio(
  fontSize: number,
  fontWeight: string | number,
  level: 'aa' | 'aaa',
): number {
  const isBold = Number(fontWeight) >= 700 || fontWeight === 'bold' || fontWeight === 'bolder';
  const isLarge = fontSize >= 24 || (isBold && fontSize >= 18.67); // 18pt ≈ 24px, 14pt bold ≈ 18.67px

  if (level === 'aaa') return isLarge ? 4.5 : 7;
  return isLarge ? 3 : 4.5;
}
