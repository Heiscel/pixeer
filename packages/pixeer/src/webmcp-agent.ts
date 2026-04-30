import type { PixeerAgent, PageContext, ScrollOptions, PressKeyOptions } from './agent.js';
import type { ComponentStateResult } from './types.js';
import type { DeltaResult } from './mutation-tracker.js';

// ---------------------------------------------------------------------------
// WebMCP type stubs — producer-side only.
//
// navigator.modelContext is a producer-only API: web pages register tools;
// the browser's AI layer discovers and invokes them. There is no JS consumer
// API (no getTools / invokeTool). Types kept in sync with webmcp-bridge.ts.
// Spec: https://webmachinelearning.github.io/webmcp/
// ---------------------------------------------------------------------------

interface WebMCPToolSchema {
  type: 'object';
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
}

interface WebMCPToolHandle {
  unregister(): void | Promise<void>;
}

interface WebMCPModelContext {
  registerTool(
    definition: { name: string; description: string; inputSchema: WebMCPToolSchema },
    handler: WebMCPToolHandler,
  ): Promise<WebMCPToolHandle>;
}

function getModelContext(): WebMCPModelContext | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.modelContext as WebMCPModelContext | undefined;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WebMCPToolDefinition {
  /** Unique tool name exposed to the browser AI layer. */
  name: string;
  /** Human-readable description the AI uses to decide when to call this tool. */
  description: string;
  /** JSON Schema describing the tool's input object. Defaults to `{}` (no params). */
  inputSchema?: WebMCPToolSchema;
}

/** Handler invoked by the browser AI when it calls a registered tool. */
export type WebMCPToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export interface WebMCPAgentOptions {
  /** PixeerAgent used for all DOM operations. */
  fallback: PixeerAgent;
}

/**
 * Agent for WebMCP-capable browsers (Chrome 146+).
 *
 * Lets you register custom tools with `navigator.modelContext` so the
 * browser's built-in AI layer can discover and invoke them, while all
 * standard DOM automation delegates to the provided PixeerAgent.
 *
 * Use `createWebMCPBridge()` when you want Pixeer's built-in DOM tools
 * (click, type, scroll…) registered automatically. Use `WebMCPAgent` when
 * you need to register additional application-specific tools on top, or
 * when you want a single object that combines tool registration with a
 * DOM automation API.
 *
 * @example
 * const pixeer = new PixeerAgent(createPostMessageCaller({ target: iframe.contentWindow }));
 * const agent  = new WebMCPAgent({ fallback: pixeer });
 *
 * if (agent.supported) {
 *   await agent.registerTool(
 *     { name: 'checkout', description: 'Complete the checkout flow', inputSchema: { type: 'object', properties: { cartId: { type: 'string' } }, required: ['cartId'] } },
 *     async ({ cartId }) => { ... },
 *   );
 * }
 *
 * // DOM ops always work regardless of WebMCP support
 * await agent.click('Submit');
 */
export class WebMCPAgent {
  private readonly fallback: PixeerAgent;
  private readonly handles: Array<{ name: string; handle: WebMCPToolHandle }> = [];

  /**
   * True when `navigator.modelContext` is available.
   * False in SSR, pre-Chrome-146, or non-WebMCP environments.
   */
  readonly supported: boolean;

  constructor({ fallback }: WebMCPAgentOptions) {
    this.fallback = fallback;
    this.supported = !!getModelContext();
  }

  /**
   * Register a custom tool with `navigator.modelContext`.
   *
   * The returned handle can be used to unregister the tool individually.
   * Returns `null` when WebMCP is unavailable or registration fails.
   * All handles are automatically unregistered on `dispose()`.
   *
   * @example
   * const handle = await agent.registerTool(
   *   { name: 'search', description: 'Search products', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
   *   async ({ query }) => productSearch(query as string),
   * );
   */
  async registerTool(
    definition: WebMCPToolDefinition,
    handler: WebMCPToolHandler,
  ): Promise<WebMCPToolHandle | null> {
    const ctx = getModelContext();
    if (!ctx) return null;
    try {
      const handle = await ctx.registerTool(
        {
          name: definition.name,
          description: definition.description,
          inputSchema: definition.inputSchema ?? { type: 'object', properties: {} },
        },
        handler,
      );
      this.handles.push({ name: definition.name, handle });
      return handle;
    } catch {
      return null;
    }
  }

  /**
   * Unregister a previously registered tool by name.
   * No-op if the tool was not registered through this agent.
   */
  async unregisterTool(name: string): Promise<void> {
    const idx = this.handles.findIndex((h) => h.name === name);
    if (idx === -1) return;
    const [{ handle }] = this.handles.splice(idx, 1);
    try { await handle.unregister(); } catch { /* ignore */ }
  }

  /** Names of tools currently registered through this agent. */
  get registeredTools(): string[] {
    return this.handles.map((h) => h.name);
  }

  // ---------------------------------------------------------------------------
  // PixeerAgent-compatible API — delegates to fallback
  // ---------------------------------------------------------------------------

  async getContext(): Promise<PageContext> {
    return this.fallback.getContext();
  }

  async click(name: string): Promise<boolean> {
    return this.fallback.click(name);
  }

  async clickBySelector(selector: string): Promise<boolean> {
    return this.fallback.clickBySelector(selector);
  }

  async type(name: string, text: string): Promise<boolean> {
    return this.fallback.type(name, text);
  }

  async typeBySelector(selector: string, text: string): Promise<boolean> {
    return this.fallback.typeBySelector(selector, text);
  }

  async scroll(options: ScrollOptions): Promise<boolean> {
    return this.fallback.scroll(options);
  }

  async pressKey(key: string, options?: PressKeyOptions): Promise<boolean> {
    return this.fallback.pressKey(key, options);
  }

  async getDelta(): Promise<DeltaResult> {
    return this.fallback.getDelta();
  }

  async getComponentState(componentName: string): Promise<ComponentStateResult | null> {
    return this.fallback.getComponentState(componentName);
  }

  async capture(): Promise<string> {
    return this.fallback.capture();
  }

  /**
   * Unregister all tools registered through this agent, then dispose the
   * underlying PixeerAgent.
   */
  dispose(): void {
    for (const { handle } of this.handles) {
      try { void handle.unregister(); } catch { /* ignore */ }
    }
    this.handles.length = 0;
    this.fallback.dispose();
  }
}
