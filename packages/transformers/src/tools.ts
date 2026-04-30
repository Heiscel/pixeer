// JSON Schema tool definitions compatible with Qwen2.5, SmolLM2, and similar chat models.
// These mirror the same capabilities as the other adapter packages but use raw JSON Schema
// so they work with any model that supports function/tool calling via text format.

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

export const PIXEER_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'pixeer_get_page_context',
      description:
        'Snapshot the current page — returns semantic markdown of the visible content and a list of ' +
        'every interactive element (buttons, inputs, links) with their accessible names. ' +
        'Call this at the start of a task and again after any navigation or significant page change.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixeer_click',
      description:
        'Click an element by its accessible name — the same label a screen reader or user would use ' +
        '(button text, aria-label, placeholder). Use pixeer_get_page_context first to find the exact name.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Accessible name of the element to click' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixeer_click_by_selector',
      description:
        'Click an element by CSS selector. Prefer pixeer_click with accessible names when possible — ' +
        'use this only when the element lacks a reliable accessible name.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the element to click' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixeer_type',
      description:
        'Type text into an input or textarea by accessible name. ' +
        'Fires React/Vue/Angular-compatible events so the framework sees the change.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Accessible name of the input or textarea' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['name', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixeer_type_by_selector',
      description: 'Type text into an input or textarea by CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the input or textarea' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixeer_scroll',
      description: 'Scroll the page or a specific element in a given direction.',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right'],
            description: 'Scroll direction',
          },
          amount: {
            type: 'number',
            description: 'Pixels to scroll. Default: 300',
          },
          name: { type: 'string', description: 'Scroll a specific element by accessible name' },
          selector: { type: 'string', description: 'Scroll a specific element by CSS selector' },
        },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixeer_press_key',
      description:
        'Press a keyboard key, optionally targeting a specific element. ' +
        'Supports Enter, Escape, Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, and any character.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Key to press — e.g. "Enter", "Escape", "Tab", "ArrowDown"',
          },
          name: { type: 'string', description: 'Target a specific element by accessible name' },
          selector: { type: 'string', description: 'Target a specific element by CSS selector' },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixeer_get_component_state',
      description:
        "Read a React component's current props and state by its display name. " +
        'Returns null if the component is not found on the page.',
      parameters: {
        type: 'object',
        properties: {
          componentName: {
            type: 'string',
            description: 'React component display name, e.g. "LoginForm"',
          },
        },
        required: ['componentName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixeer_get_delta',
      description:
        'Get only what changed on the page since the last snapshot — much cheaper than pixeer_get_page_context ' +
        'for incremental updates after an action. If needsFullSnapshot is true, call pixeer_get_page_context instead. ' +
        'Requires enableMutationTracker: true on the bridge.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

export interface PixeerToolsFilterOptions {
  include?: string[];
  exclude?: string[];
}

export function filterTools(
  tools: ToolDefinition[],
  options: PixeerToolsFilterOptions,
): ToolDefinition[] {
  if (!options.include && !options.exclude) return tools;
  return tools.filter((t) => {
    if (options.include) return options.include!.includes(t.function.name);
    if (options.exclude) return !options.exclude!.includes(t.function.name);
    return true;
  });
}
