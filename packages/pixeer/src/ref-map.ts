/**
 * Assigns stable monotonic IDs (el_1, el_2, …) to DOM elements.
 * Backed by WeakMap so elements can be GC'd without leaking memory.
 * The same ref is returned every time you call getOrCreate for a given element.
 */
export class RefMap {
  private counter = 0;
  private elementToRef = new WeakMap<Element, string>();
  private refToElement = new Map<string, WeakRef<Element>>();

  /** Get the existing ref for an element, or mint a new one. */
  getOrCreate(element: Element): string {
    const existing = this.elementToRef.get(element);
    if (existing) return existing;

    const ref = `el_${++this.counter}`;
    this.elementToRef.set(element, ref);
    this.refToElement.set(ref, new WeakRef(element));
    return ref;
  }

  /** Look up an element by its ref ID. Returns null if it has been GC'd or never assigned. */
  get(ref: string): Element | null {
    return this.refToElement.get(ref)?.deref() ?? null;
  }

  /** Check if an element already has a ref assigned. */
  has(element: Element): boolean {
    return this.elementToRef.has(element);
  }

  /** Return the ref string for an element without creating one. */
  getRef(element: Element): string | undefined {
    return this.elementToRef.get(element);
  }

  /** Purge entries whose elements have been garbage-collected. */
  gc(): void {
    for (const [ref, weakRef] of this.refToElement) {
      if (!weakRef.deref()) {
        this.refToElement.delete(ref);
      }
    }
  }

  get size(): number {
    return this.refToElement.size;
  }
}
