import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebMCPAgent } from '../webmcp-agent';
import type { PixeerAgent } from '../agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFallback(overrides: Partial<PixeerAgent> = {}): PixeerAgent {
  return {
    getContext: vi.fn().mockResolvedValue({ context: '# Page', elements: [] }),
    click: vi.fn().mockResolvedValue(true),
    clickBySelector: vi.fn().mockResolvedValue(true),
    type: vi.fn().mockResolvedValue(true),
    typeBySelector: vi.fn().mockResolvedValue(true),
    scroll: vi.fn().mockResolvedValue(true),
    pressKey: vi.fn().mockResolvedValue(true),
    getComponentState: vi.fn().mockResolvedValue(null),
    capture: vi.fn().mockResolvedValue('base64'),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as PixeerAgent;
}

function makeHandle() {
  return { unregister: vi.fn().mockResolvedValue(undefined) };
}

function installModelContext(
  registerTool: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeHandle()),
) {
  Object.defineProperty(navigator, 'modelContext', {
    value: { registerTool },
    configurable: true,
    writable: true,
  });
  return registerTool;
}

function removeModelContext() {
  Object.defineProperty(navigator, 'modelContext', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// No WebMCP support
// ---------------------------------------------------------------------------

describe('WebMCPAgent — no WebMCP support', () => {
  let agent: WebMCPAgent;
  let fallback: PixeerAgent;

  beforeEach(() => {
    removeModelContext();
    fallback = makeFallback();
    agent = new WebMCPAgent({ fallback });
  });

  it('supported is false when navigator.modelContext is absent', () => {
    expect(agent.supported).toBe(false);
  });

  it('registerTool() returns null when unsupported', async () => {
    const result = await agent.registerTool(
      { name: 'foo', description: 'bar' },
      vi.fn(),
    );
    expect(result).toBeNull();
  });

  it('registeredTools is empty when unsupported', () => {
    expect(agent.registeredTools).toEqual([]);
  });

  it('delegates getContext() to fallback', async () => {
    const ctx = await agent.getContext();
    expect(fallback.getContext).toHaveBeenCalledOnce();
    expect(ctx.context).toBe('# Page');
  });

  it('delegates click() to fallback', async () => {
    const ok = await agent.click('Submit');
    expect(fallback.click).toHaveBeenCalledWith('Submit');
    expect(ok).toBe(true);
  });

  it('delegates clickBySelector() to fallback', async () => {
    await agent.clickBySelector('#btn');
    expect(fallback.clickBySelector).toHaveBeenCalledWith('#btn');
  });

  it('delegates type() to fallback', async () => {
    await agent.type('Email', 'a@b.com');
    expect(fallback.type).toHaveBeenCalledWith('Email', 'a@b.com');
  });

  it('delegates typeBySelector() to fallback', async () => {
    await agent.typeBySelector('#email', 'x@y.com');
    expect(fallback.typeBySelector).toHaveBeenCalledWith('#email', 'x@y.com');
  });

  it('delegates scroll() to fallback', async () => {
    await agent.scroll({ direction: 'down', amount: 200 });
    expect(fallback.scroll).toHaveBeenCalledWith({ direction: 'down', amount: 200 });
  });

  it('delegates pressKey() to fallback', async () => {
    await agent.pressKey('Enter', { name: 'Search' });
    expect(fallback.pressKey).toHaveBeenCalledWith('Enter', { name: 'Search' });
  });

  it('delegates getComponentState() to fallback', async () => {
    await agent.getComponentState('Counter');
    expect(fallback.getComponentState).toHaveBeenCalledWith('Counter');
  });

  it('delegates capture() to fallback', async () => {
    const img = await agent.capture();
    expect(fallback.capture).toHaveBeenCalledOnce();
    expect(img).toBe('base64');
  });

  it('dispose() calls fallback.dispose()', () => {
    agent.dispose();
    expect(fallback.dispose).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// With WebMCP support
// ---------------------------------------------------------------------------

describe('WebMCPAgent — with WebMCP support', () => {
  let agent: WebMCPAgent;
  let fallback: PixeerAgent;
  let registerTool: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registerTool = installModelContext();
    fallback = makeFallback();
    agent = new WebMCPAgent({ fallback });
  });

  afterEach(() => {
    removeModelContext();
  });

  it('supported is true when navigator.modelContext is present', () => {
    expect(agent.supported).toBe(true);
  });

  it('registerTool() calls navigator.modelContext.registerTool with definition', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    await agent.registerTool(
      { name: 'search', description: 'Search products', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
      handler,
    );

    expect(registerTool).toHaveBeenCalledOnce();
    const [def, fn] = registerTool.mock.calls[0];
    expect(def.name).toBe('search');
    expect(def.description).toBe('Search products');
    expect(def.inputSchema.properties?.q.type).toBe('string');
    expect(fn).toBe(handler);
  });

  it('registerTool() defaults inputSchema to empty object schema', async () => {
    await agent.registerTool({ name: 'ping', description: 'Ping' }, vi.fn());
    const [def] = registerTool.mock.calls[0];
    expect(def.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('registerTool() returns the handle', async () => {
    const handle = makeHandle();
    registerTool.mockResolvedValueOnce(handle);
    const result = await agent.registerTool({ name: 'x', description: 'y' }, vi.fn());
    expect(result).toBe(handle);
  });

  it('registeredTools lists names of registered tools', async () => {
    await agent.registerTool({ name: 'a', description: 'A' }, vi.fn());
    await agent.registerTool({ name: 'b', description: 'B' }, vi.fn());
    expect(agent.registeredTools).toEqual(['a', 'b']);
  });

  it('registerTool() returns null and does not throw when registerTool throws', async () => {
    registerTool.mockRejectedValueOnce(new Error('duplicate'));
    const result = await agent.registerTool({ name: 'clash', description: 'x' }, vi.fn());
    expect(result).toBeNull();
  });

  it('unregisterTool() calls handle.unregister() and removes from registeredTools', async () => {
    const handle = makeHandle();
    registerTool.mockResolvedValueOnce(handle);
    await agent.registerTool({ name: 'tool1', description: 'T' }, vi.fn());

    await agent.unregisterTool('tool1');

    expect(handle.unregister).toHaveBeenCalledOnce();
    expect(agent.registeredTools).toEqual([]);
  });

  it('unregisterTool() is a no-op for unknown tool names', async () => {
    await expect(agent.unregisterTool('nonexistent')).resolves.toBeUndefined();
  });

  it('dispose() unregisters all tools and calls fallback.dispose()', async () => {
    const h1 = makeHandle();
    const h2 = makeHandle();
    registerTool.mockResolvedValueOnce(h1).mockResolvedValueOnce(h2);

    await agent.registerTool({ name: 'a', description: 'A' }, vi.fn());
    await agent.registerTool({ name: 'b', description: 'B' }, vi.fn());

    agent.dispose();

    expect(h1.unregister).toHaveBeenCalledOnce();
    expect(h2.unregister).toHaveBeenCalledOnce();
    expect(fallback.dispose).toHaveBeenCalledOnce();
    expect(agent.registeredTools).toEqual([]);
  });
});
