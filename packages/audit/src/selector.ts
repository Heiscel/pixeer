/** Generate a short CSS selector path for an element (for violation reports). */
export function selectorOf(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body && parts.length < 4) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    // Add first meaningful class
    const cls = Array.from(current.classList).find((c) => !/^(px-|py-|mt-|mb-|ml-|mr-|m-|p-|w-|h-|flex|grid|block|inline|text-|bg-|border-|rounded|cursor-)/.test(c));
    if (cls) part += `.${CSS.escape(cls)}`;

    // Sibling index if needed for disambiguation
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
  }

  return parts.join(' > ') || el.tagName.toLowerCase();
}

/** Short human-readable description: "button 'Save changes'" */
export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const label =
    el.getAttribute('aria-label') ??
    el.getAttribute('aria-labelledby') ??
    el.getAttribute('placeholder') ??
    el.getAttribute('name') ??
    el.getAttribute('id') ??
    (el.textContent?.trim().slice(0, 40));

  return label ? `${tag} "${label}"` : tag;
}
