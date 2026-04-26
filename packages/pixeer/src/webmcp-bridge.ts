import { DomService } from './dom-service.js';

// ---------------------------------------------------------------------------
// WebMCP type stubs
//
// navigator.modelContext is landing in Chrome 146+ (polyfill) and expected to
// ship stable in Chrome 151+. The spec is still evolving; these types reflect
// the current draft at https://github.com/webmcp/webmcp-spec.
// ---------------------------------------------------------------------------

interface WebMCPToolSchema {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

interface WebMCPToolDefinition {
  name: string;
  description: string;
  inputSchema: WebMCPToolSchema;
}

interface WebMCPToolHandle {
  /** Unregister the tool from navigator.modelContext. */
  unregister(): void | Promise<void>;
}

interface WebMCPModelContext {
  registerTool(
    definition: WebMCPToolDefinition,
    handler: (input: Record<string, unknown>) => Promise<unknown>,
  ): Promise<WebMCPToolHandle>;
}

declare global {
  interface Navigator {
    modelContext?: WebMCPModelContext;
  }
}

// ---------------------------------------------------------------------------

export interface WebMCPBridgeOptions {
  /**
   * Only register these tool names. Registers all tools when omitted.
   */
  include?: string[];
  /**
   * Exclude specific tool names — e.g. 'pixeer_capture_screen' for non-vision models.
   */
  exclude?: string[];
  /**
   * Called when the bridge fails to register a tool.
   * Defaults to console.warn.
   */
  onError?: (tool: string, error: unknown) => void;
}

export interface WebMCPBridgeHandle {
  /** Unregister all tools and tear down the bridge. */
  dispose(): Promise<void>;
  /** True if navigator.modelContext was available and tools were registered. */
  readonly supported: boolean;
  /** Names of successfully registered tools. */
  readonly registeredTools: string[];
}

interface ToolSpec {
  name: string;
  description: string;
  inputSchema: WebMCPToolSchema;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

function buildTools(): ToolSpec[] {
  return [
    {
      name: 'pixeer_get_page_context',
      description:
        'Snapshot the current page — returns semantic markdown of the visible content and a list of ' +
        'every interactive element (buttons, inputs, links) with their accessible names.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      handler: async () => {
        const context = await DomService.getPageContext();
        const elements = await DomService.getInteractiveElements();
        return { context, elements };
      },
    },
    {
      name: 'pixeer_click',
      description:
        'Click an element by its accessible name — the same label a screen reader or user would use.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Accessible name of the element to click' },
        },
        required: ['name'],
      },
      handler: async ({ name }) => ({
        success: await DomService.clickByName(name as string),
      }),
    },
    {
      name: 'pixeer_click_by_selector',
      description: 'Click an element by CSS selector.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the element to click' },
        },
        required: ['selector'],
      },
      handler: async ({ selector }) => ({
        success: DomService.click(selector as string),
      }),
    },
    {
      name: 'pixeer_type',
      description:
        'Type text into an input or textarea by accessible name. ' +
        'Fires React/Vue/Angular-compatible events.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Accessible name of the input' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['name', 'text'],
      },
      handler: async ({ name, text }) => ({
        success: await DomService.typeByName(name as string, text as string),
      }),
    },
    {
      name: 'pixeer_type_by_selector',
      description: 'Type text into an input or textarea by CSS selector.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the input' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['selector', 'text'],
      },
      handler: async ({ selector, text }) => ({
        success: DomService.type(selector as string, text as string),
      }),
    },
    {
      name: 'pixeer_scroll',
      description: 'Scroll the page or a specific element.',
      inputSchema: {
        type: 'object',
        properties: {
          direction: { type: 'string', description: 'up | down | left | right' },
          amount: { type: 'number', description: 'Pixels to scroll (default 300)' },
          name: { type: 'string', description: 'Element accessible name' },
          selector: { type: 'string', description: 'Element CSS selector' },
        },
        required: ['direction'],
      },
      handler: async ({ direction, amount, name, selector }) => {
        const dir = direction as 'up' | 'down' | 'left' | 'right';
        const px = (amount as number | undefined) ?? 300;
        if (name) return { success: await DomService.scrollByName(name as string, dir, px) };
        return { success: DomService.scroll((selector as string | undefined) ?? null, dir, px) };
      },
    },
    {
      name: 'pixeer_press_key',
      description:
        'Press a keyboard key. Supports Enter, Escape, Tab, ArrowUp/Down/Left/Right, Backspace.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to press' },
          name: { type: 'string', description: 'Target element by accessible name' },
          selector: { type: 'string', description: 'Target element by CSS selector' },
        },
        required: ['key'],
      },
      handler: async ({ key, name, selector }) => {
        if (name) return { success: await DomService.pressKeyByName(name as string, key as string) };
        return { success: DomService.pressKey((selector as string | undefined) ?? null, key as string) };
      },
    },
    {
      name: 'pixeer_get_component_state',
      description: "Read a React component's current props and state by its display name.",
      inputSchema: {
        type: 'object',
        properties: {
          componentName: { type: 'string', description: 'React component display name' },
        },
        required: ['componentName'],
      },
      handler: async ({ componentName }) => ({
        state: await DomService.getComponentState(componentName as string),
      }),
    },
  ];
}

/**
 * Register Pixeer's DOM tools with the browser's WebMCP model context
 * (`navigator.modelContext`). Falls back gracefully — returns `supported: false`
 * if the API is not available.
 *
 * Designed for Chrome 146+ (polyfill) and Chrome 151+ (stable, estimate).
 *
 * @example
 * const bridge = await createWebMCPBridge();
 * if (bridge.supported) {
 *   console.log('Pixeer registered as WebMCP producer:', bridge.registeredTools);
 * }
 * // Later:
 * await bridge.dispose();
 */
export async function createWebMCPBridge(
  options: WebMCPBridgeOptions = {},
): Promise<WebMCPBridgeHandle> {
  const { include, exclude, onError = (tool, err) => console.warn(`[Pixeer WebMCP] Failed to register ${tool}:`, err) } = options;

  if (typeof navigator === 'undefined' || !navigator.modelContext) {
    return {
      supported: false,
      registeredTools: [],
      async dispose() {},
    };
  }

  const ctx = navigator.modelContext;
  const allTools = buildTools();

  const filtered = allTools.filter((t) => {
    if (include) return include.includes(t.name);
    if (exclude) return !exclude.includes(t.name);
    return true;
  });

  const handles: WebMCPToolHandle[] = [];
  const registeredTools: string[] = [];

  for (const tool of filtered) {
    try {
      const handle = await ctx.registerTool(
        { name: tool.name, description: tool.description, inputSchema: tool.inputSchema },
        tool.handler,
      );
      handles.push(handle);
      registeredTools.push(tool.name);
    } catch (err) {
      onError(tool.name, err);
    }
  }

  return {
    supported: true,
    registeredTools,
    async dispose() {
      for (const handle of handles) {
        try { await handle.unregister(); } catch { /* ignore */ }
      }
      handles.length = 0;
    },
  };
}
