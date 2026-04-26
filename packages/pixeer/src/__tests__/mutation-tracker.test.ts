import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RefMap } from '../ref-map';
import { createMutationTracker } from '../mutation-tracker';

// happy-dom fires MutationObserver callbacks via its own internal timer —
// not the fake timer system. All mutation tests use real async delays.

/** Wait for MutationObserver to fire + debounce to settle. */
const wait = (ms = 80) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// RefMap
// ---------------------------------------------------------------------------

describe('RefMap', () => {
  it('mints a new ref for an unseen element', () => {
    const map = new RefMap();
    const el = document.createElement('div');
    const ref = map.getOrCreate(el);
    expect(ref).toMatch(/^el_\d+$/);
  });

  it('returns the same ref for the same element', () => {
    const map = new RefMap();
    const el = document.createElement('div');
    expect(map.getOrCreate(el)).toBe(map.getOrCreate(el));
  });

  it('assigns different refs to different elements', () => {
    const map = new RefMap();
    const a = document.createElement('div');
    const b = document.createElement('div');
    expect(map.getOrCreate(a)).not.toBe(map.getOrCreate(b));
  });

  it('get() returns the element for a known ref', () => {
    const map = new RefMap();
    const el = document.createElement('button');
    const ref = map.getOrCreate(el);
    expect(map.get(ref)).toBe(el);
  });

  it('get() returns null for an unknown ref', () => {
    const map = new RefMap();
    expect(map.get('el_999')).toBeNull();
  });

  it('has() is true after getOrCreate', () => {
    const map = new RefMap();
    const el = document.createElement('span');
    expect(map.has(el)).toBe(false);
    map.getOrCreate(el);
    expect(map.has(el)).toBe(true);
  });

  it('getRef() returns undefined before first assignment', () => {
    const map = new RefMap();
    const el = document.createElement('p');
    expect(map.getRef(el)).toBeUndefined();
  });

  it('getRef() returns the ref string after assignment', () => {
    const map = new RefMap();
    const el = document.createElement('p');
    const ref = map.getOrCreate(el);
    expect(map.getRef(el)).toBe(ref);
  });

  it('gc() purges stale entries without throwing', () => {
    const map = new RefMap();
    const el = document.createElement('div');
    map.getOrCreate(el);
    map.gc();
    expect(map.size).toBe(1);
  });

  it('refs are monotonically increasing', () => {
    const map = new RefMap();
    const nums: number[] = [];
    for (let i = 0; i < 5; i++) {
      const ref = map.getOrCreate(document.createElement('div'));
      nums.push(parseInt(ref.replace('el_', ''), 10));
    }
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]).toBeGreaterThan(nums[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// MutationTracker
// ---------------------------------------------------------------------------

describe('MutationTracker', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty deltas when nothing has changed', async () => {
    const tracker = createMutationTracker()!;
    await wait();
    const { deltas, needsFullSnapshot } = tracker.getDelta();
    expect(deltas).toHaveLength(0);
    expect(needsFullSnapshot).toBe(false);
    tracker.dispose();
  });

  it('detects an added element', async () => {
    const tracker = createMutationTracker({ debounceMs: 10 })!;

    const div = document.createElement('div');
    div.id = 'test-add';
    document.body.appendChild(div);
    await wait();

    const { deltas } = tracker.getDelta();
    // Identify the right delta via ref map — more robust than checking selector strings.
    const addedRef = deltas
      .filter((d) => d.type === 'added')
      .find((d) => tracker.refs.get(d.ref) === div);

    expect(addedRef).toBeDefined();
    expect(addedRef?.tag).toBe('div');
    tracker.dispose();
  });

  it('detects a removed element', async () => {
    const div = document.createElement('div');
    div.id = 'test-remove';
    document.body.appendChild(div);

    const tracker = createMutationTracker({ debounceMs: 10 })!;
    await wait();
    tracker.getDelta(); // clear the initial add

    document.body.removeChild(div);
    await wait();

    const { deltas } = tracker.getDelta();
    const removed = deltas.find((d) => d.type === 'removed');
    expect(removed).toBeDefined();
    tracker.dispose();
  });

  it('detects an attribute change', async () => {
    const btn = document.createElement('button');
    btn.id = 'my-btn';
    document.body.appendChild(btn);

    const tracker = createMutationTracker({ debounceMs: 10 })!;
    await wait();
    tracker.getDelta(); // clear initial adds

    btn.setAttribute('aria-disabled', 'true');
    await wait();

    const { deltas } = tracker.getDelta();
    const modified = deltas.find((d) => d.type === 'modified' && d.attribute === 'aria-disabled');
    expect(modified).toBeDefined();
    expect(modified?.newValue).toBe('true');
    tracker.dispose();
  });

  it('detects a text content change', async () => {
    const p = document.createElement('p');
    p.textContent = 'before';
    document.body.appendChild(p);

    const tracker = createMutationTracker({ debounceMs: 10 })!;
    await wait();
    tracker.getDelta(); // clear

    p.firstChild!.textContent = 'after';
    await wait();

    const { deltas } = tracker.getDelta();
    const text = deltas.find((d) => d.type === 'text' && d.newValue === 'after');
    expect(text).toBeDefined();
    tracker.dispose();
  });

  it('sets needsFullSnapshot when threshold is exceeded', async () => {
    const tracker = createMutationTracker({ threshold: 2, debounceMs: 10 })!;

    for (let i = 0; i < 5; i++) {
      document.body.appendChild(document.createElement('span'));
    }
    await wait();

    const { needsFullSnapshot } = tracker.getDelta();
    expect(needsFullSnapshot).toBe(true);
    tracker.dispose();
  });

  it('resets needsFullSnapshot after getDelta()', async () => {
    const tracker = createMutationTracker({ threshold: 2, debounceMs: 10 })!;

    for (let i = 0; i < 5; i++) {
      document.body.appendChild(document.createElement('span'));
    }
    await wait();

    tracker.getDelta(); // first pull — resets flag
    const { needsFullSnapshot } = tracker.getDelta(); // second pull
    expect(needsFullSnapshot).toBe(false);
    tracker.dispose();
  });

  it('assigns refs to added elements and resolves them via the ref map', async () => {
    const tracker = createMutationTracker({ debounceMs: 10 })!;

    const div = document.createElement('div');
    div.id = 'ref-test';
    document.body.appendChild(div);
    await wait();

    const { deltas } = tracker.getDelta();
    const added = deltas.find((d) => d.type === 'added' && tracker.refs.get(d.ref) === div);
    expect(added?.ref).toMatch(/^el_\d+$/);
    expect(tracker.refs.get(added!.ref)).toBe(div);
    tracker.dispose();
  });

  it('getDelta() cancels the debounce and returns pending immediately', async () => {
    // Use a very long debounce — getDelta() should cancel it and return deltas anyway.
    const tracker = createMutationTracker({ debounceMs: 5000 })!;

    document.body.appendChild(document.createElement('div'));
    await wait(50); // enough for the MO to fire, but not the 5000ms debounce

    const { deltas } = tracker.getDelta();
    expect(deltas.length).toBeGreaterThan(0);
    tracker.dispose();
  });

  it('subscribe() receives delta batches when the debounce fires', async () => {
    const tracker = createMutationTracker({ debounceMs: 10 })!;
    const received: unknown[] = [];
    tracker.subscribe((d) => received.push(...d));

    document.body.appendChild(document.createElement('section'));
    await wait(); // MO fires + 10ms debounce settles

    expect(received.length).toBeGreaterThan(0);
    tracker.dispose();
  });

  it('unsubscribe stops receiving deltas', async () => {
    const tracker = createMutationTracker({ debounceMs: 10 })!;
    const received: unknown[] = [];
    const unsub = tracker.subscribe((d) => received.push(...d));

    unsub(); // unsubscribe before any mutation

    document.body.appendChild(document.createElement('aside'));
    await wait();

    expect(received).toHaveLength(0);
    tracker.dispose();
  });

  it('dispose() stops the observer — no new deltas after dispose', async () => {
    const tracker = createMutationTracker({ debounceMs: 10 })!;
    tracker.dispose();

    document.body.appendChild(document.createElement('nav'));
    await wait();

    // dispose() cleared pending, and the observer is disconnected, so getDelta returns [].
    const { deltas } = tracker.getDelta();
    expect(deltas).toHaveLength(0);
  });

  it('returns null in a non-browser environment (SSR simulation)', () => {
    const original = globalThis.MutationObserver;
    // @ts-expect-error intentional
    globalThis.MutationObserver = undefined;
    expect(createMutationTracker()).toBeNull();
    globalThis.MutationObserver = original;
  });
});
