import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomService } from '../dom-service';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('getInteractiveElements', () => {
  it('finds buttons, links, and inputs with correct names/types', async () => {
    document.body.innerHTML = `
      <button>Submit</button>
      <a href="/about">About</a>
      <input type="text" placeholder="Search" />
    `;

    const elements = await DomService.getInteractiveElements();
    const names = elements.map((e) => e.name);

    expect(names).toContain('Submit');
    expect(names).toContain('About');

    const btn = elements.find((e) => e.name === 'Submit');
    expect(btn?.type).toBe('button');

    const link = elements.find((e) => e.name === 'About');
    expect(link?.type).toBe('link');

    const input = elements.find((e) => e.type.startsWith('input'));
    expect(input).toBeDefined();
  });

  it('finds icon-only button with aria-label="Close"', async () => {
    document.body.innerHTML = `
      <button aria-label="Close"><svg><path d="M0 0"/></svg></button>
    `;

    const elements = await DomService.getInteractiveElements();
    const close = elements.find((e) => e.name === 'Close');
    expect(close).toBeDefined();
    expect(close?.type).toBe('button');
  });

  it('finds button inside role="dialog"', async () => {
    document.body.innerHTML = `
      <div role="dialog">
        <button>Confirm</button>
      </div>
    `;

    const elements = await DomService.getInteractiveElements();
    const confirm = elements.find((e) => e.name === 'Confirm');
    expect(confirm).toBeDefined();
  });

  it('finds icon-only close button with title attr inside dialog', async () => {
    document.body.innerHTML = `
      <div role="dialog">
        <button title="Close"><svg><path d="M0 0"/></svg></button>
      </div>
    `;

    const elements = await DomService.getInteractiveElements();
    const close = elements.find((e) => e.name === 'Close');
    expect(close).toBeDefined();
  });
});

describe('click', () => {
  it('dispatches mousedown/mouseup/click events', () => {
    document.body.innerHTML = '<button id="btn" style="width:100px;height:40px;">Click me</button>';
    const btn = document.getElementById('btn')!;

    // happy-dom returns 0x0 from getBoundingClientRect — stub it
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 100, height: 40, x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, toJSON: () => {},
    });

    const events: string[] = [];
    btn.addEventListener('mousedown', () => events.push('mousedown'));
    btn.addEventListener('mouseup', () => events.push('mouseup'));
    btn.addEventListener('click', () => events.push('click'));

    const result = DomService.click('#btn');
    expect(result).toBe(true);
    expect(events).toEqual(['mousedown', 'mouseup', 'click']);
  });
});

describe('clickByName', () => {
  it('finds and clicks an element by accessible name', async () => {
    document.body.innerHTML = '<button>Save</button>';
    const btn = document.querySelector('button')!;

    // Stub bounding rect for happy-dom
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });

    let clicked = false;
    btn.addEventListener('click', () => {
      clicked = true;
    });

    const result = await DomService.clickByName('Save');
    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });
});

describe('type', () => {
  it('sets value and fires input/change/keyboard events', () => {
    document.body.innerHTML = '<input id="inp" type="text" />';
    const inp = document.getElementById('inp') as HTMLInputElement;

    const events: string[] = [];
    inp.addEventListener('input', () => events.push('input'));
    inp.addEventListener('change', () => events.push('change'));
    inp.addEventListener('keydown', () => events.push('keydown'));
    inp.addEventListener('keyup', () => events.push('keyup'));

    const result = DomService.type('#inp', 'hi');
    expect(result).toBe(true);
    expect(inp.value).toBe('hi');
    expect(events).toContain('input');
    expect(events).toContain('change');
    expect(events).toContain('keydown');
    expect(events).toContain('keyup');
  });
});

describe('pressKey', () => {
  it('dispatches correct KeyboardEvent for Enter', () => {
    document.body.innerHTML = '<input id="inp" type="text" />';
    const inp = document.getElementById('inp') as HTMLInputElement;
    inp.focus();

    const events: KeyboardEvent[] = [];
    inp.addEventListener('keydown', (e) => events.push(e));
    inp.addEventListener('keyup', (e) => events.push(e));

    const result = DomService.pressKey('#inp', 'Enter');
    expect(result).toBe(true);

    const keydown = events.find((e) => e.type === 'keydown');
    expect(keydown?.key).toBe('Enter');
    expect(keydown?.keyCode).toBe(13);
  });

  it('dispatches Escape key', () => {
    document.body.innerHTML = '<div id="target" tabindex="0"></div>';
    const target = document.getElementById('target')!;

    let receivedKey = '';
    target.addEventListener('keydown', (e) => {
      receivedKey = (e as KeyboardEvent).key;
    });

    DomService.pressKey('#target', 'Escape');
    expect(receivedKey).toBe('Escape');
  });

  it('submits form on Enter inside a form', () => {
    document.body.innerHTML = `
      <form id="form">
        <input id="inp" type="text" />
      </form>
    `;

    const form = document.getElementById('form') as HTMLFormElement;
    let submitted = false;

    // requestSubmit triggers submit event; mock it
    form.requestSubmit = vi.fn(() => {
      submitted = true;
    });

    DomService.pressKey('#inp', 'Enter');
    expect(submitted).toBe(true);
  });
});

describe('scroll', () => {
  it('calls scrollBy with correct args for down direction', () => {
    const spy = vi.spyOn(document.documentElement, 'scrollBy').mockImplementation(() => {});

    const result = DomService.scroll(null, 'down', 500);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith({ left: 0, top: 500, behavior: 'smooth' });

    spy.mockRestore();
  });

  it('scrolls a specific element by selector', () => {
    document.body.innerHTML = '<div id="box" style="overflow:auto;height:100px;"></div>';
    const box = document.getElementById('box')!;
    const spy = vi.spyOn(box, 'scrollBy').mockImplementation(() => {});

    const result = DomService.scroll('#box', 'up', 200);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith({ left: 0, top: -200, behavior: 'smooth' });

    spy.mockRestore();
  });
});

describe('findByName', () => {
  it('matches exact accessible name', async () => {
    document.body.innerHTML = '<button>Next</button>';
    const el = await DomService.findByName('Next');
    expect(el).toBeTruthy();
    expect(el?.tagName.toLowerCase()).toBe('button');
  });

  it('matches partial name', async () => {
    document.body.innerHTML = '<button>Go to Next Page</button>';
    const el = await DomService.findByName('Next');
    expect(el).toBeTruthy();
  });

  it('matches title attribute', async () => {
    document.body.innerHTML = '<button title="Settings"><svg></svg></button>';
    const el = await DomService.findByName('Settings');
    expect(el).toBeTruthy();
  });
});

describe('generateSelector', () => {
  it('produces id-based selector', async () => {
    document.body.innerHTML = '<button id="my-btn">Click</button>';
    const elements = await DomService.getInteractiveElements();
    const btn = elements.find((e) => e.name === 'Click');
    expect(btn?.selector).toBe('#my-btn');
  });

  it('produces data-testid selector', async () => {
    document.body.innerHTML = '<button data-testid="submit-btn">Submit</button>';
    const elements = await DomService.getInteractiveElements();
    const btn = elements.find((e) => e.name === 'Submit');
    expect(btn?.selector).toBe('[data-testid="submit-btn"]');
  });

  it('produces fallback selector when no id or testid', async () => {
    document.body.innerHTML = '<button>Lonely</button>';
    const elements = await DomService.getInteractiveElements();
    const btn = elements.find((e) => e.name === 'Lonely');
    expect(btn?.selector).toBeTruthy();
    // Should be able to re-query it
    const found = document.querySelector(btn!.selector);
    expect(found).toBeTruthy();
  });
});
