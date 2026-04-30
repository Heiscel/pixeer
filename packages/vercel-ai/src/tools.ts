import { tool } from 'ai';
import { z } from 'zod';
import type { PixeerAgent } from 'pixeer';

export interface PixeerToolsOptions {
  /**
   * Explicitly include only these tools. Includes all tools when omitted.
   */
  include?: string[];
  /**
   * Exclude specific tools — e.g. exclude capture_screen for non-vision models,
   * or get_component_state in non-React apps.
   */
  exclude?: string[];
}

// No explicit return type — TypeScript infers it, PixeerTools derives from that below.
export function createPixeerTools(agent: PixeerAgent, options: PixeerToolsOptions = {}) {
  const all = {
    get_page_context: tool({
      description:
        'Snapshot the current page — returns semantic markdown of the visible content and a list of ' +
        'every interactive element (buttons, inputs, links) with their accessible names. ' +
        'Call this at the start of a task and again after any navigation or significant page change.',
      parameters: z.object({}),
      execute: async () => {
        const { context, elements } = await agent.getContext();
        return { context, elements };
      },
    }),

    click: tool({
      description:
        'Click an element by its accessible name — the same label a screen reader or user would use ' +
        '(button text, aria-label, placeholder). Use get_page_context first to find the exact name.',
      parameters: z.object({
        name: z.string().describe('Accessible name of the element to click'),
      }),
      execute: async ({ name }) => ({ success: await agent.click(name) }),
    }),

    click_by_selector: tool({
      description:
        'Click an element by CSS selector. Prefer click() with accessible names when possible — ' +
        'use this only when the element lacks a reliable accessible name.',
      parameters: z.object({
        selector: z.string().describe('CSS selector of the element to click'),
      }),
      execute: async ({ selector }) => ({ success: await agent.clickBySelector(selector) }),
    }),

    type: tool({
      description:
        'Type text into an input or textarea by accessible name. ' +
        'Fires React/Vue/Angular-compatible events so the framework sees the change.',
      parameters: z.object({
        name: z.string().describe('Accessible name of the input or textarea'),
        text: z.string().describe('Text to type'),
      }),
      execute: async ({ name, text }) => ({ success: await agent.type(name, text) }),
    }),

    type_by_selector: tool({
      description: 'Type text into an input or textarea by CSS selector.',
      parameters: z.object({
        selector: z.string().describe('CSS selector of the input or textarea'),
        text: z.string().describe('Text to type'),
      }),
      execute: async ({ selector, text }) => ({ success: await agent.typeBySelector(selector, text) }),
    }),

    scroll: tool({
      description: 'Scroll the page or a specific element in a given direction.',
      parameters: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']),
        amount: z.number().optional().describe('Pixels to scroll. Default: 300'),
        name: z.string().optional().describe('Scroll a specific element by accessible name'),
        selector: z.string().optional().describe('Scroll a specific element by CSS selector'),
      }),
      execute: async ({ direction, amount, name, selector }) => ({
        success: await agent.scroll({ direction, amount, name, selector }),
      }),
    }),

    press_key: tool({
      description:
        'Press a keyboard key, optionally targeting a specific element. ' +
        'Supports Enter, Escape, Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, and any character.',
      parameters: z.object({
        key: z.string().describe('Key to press — e.g. "Enter", "Escape", "Tab", "ArrowDown"'),
        name: z.string().optional().describe('Target a specific element by accessible name'),
        selector: z.string().optional().describe('Target a specific element by CSS selector'),
      }),
      execute: async ({ key, name, selector }) => ({
        success: await agent.pressKey(key, { name, selector }),
      }),
    }),

    get_component_state: tool({
      description:
        "Read a React component's current props and state by its display name. " +
        'Returns null if the component is not found on the page.',
      parameters: z.object({
        componentName: z.string().describe('React component display name, e.g. "LoginForm"'),
      }),
      execute: async ({ componentName }) => ({
        state: await agent.getComponentState(componentName),
      }),
    }),

    get_delta: tool({
      description:
        'Get only what changed on the page since the last snapshot — much cheaper than get_page_context ' +
        'for incremental updates after an action. If needsFullSnapshot is true, call get_page_context instead. ' +
        'Requires enableMutationTracker: true on the bridge.',
      parameters: z.object({}),
      execute: async () => agent.getDelta(),
    }),

    capture_screen: tool({
      description:
        'Capture the current page as a base64 JPEG image. ' +
        'Use with vision-capable models when the semantic snapshot alone is insufficient.',
      parameters: z.object({}),
      execute: async () => ({ image: await agent.capture() }),
    }),
  };

  if (!options.include && !options.exclude) return all;

  return Object.fromEntries(
    Object.entries(all).filter(([key]) => {
      if (options.include) return options.include!.includes(key);
      if (options.exclude) return !options.exclude!.includes(key);
      return true;
    }),
  ) as typeof all;
}

export type PixeerTools = ReturnType<typeof createPixeerTools>;
