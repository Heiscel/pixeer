import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { PixeerAgent } from 'pixeer';

export interface PixeerMastraToolsOptions {
  /**
   * Explicitly include only these tool IDs. Includes all tools when omitted.
   */
  include?: string[];
  /**
   * Exclude specific tool IDs — e.g. exclude 'pixeer_capture_screen' for
   * non-vision models, or 'pixeer_get_component_state' in non-React apps.
   */
  exclude?: string[];
}

export function createPixeerTools(agent: PixeerAgent, options: PixeerMastraToolsOptions = {}) {
  const all = {
    pixeer_get_page_context: createTool({
      id: 'pixeer_get_page_context',
      description:
        'Snapshot the current page — returns semantic markdown of the visible content and a list of ' +
        'every interactive element (buttons, inputs, links) with their accessible names. ' +
        'Call this at the start of a task and again after any navigation or significant page change.',
      inputSchema: z.object({}),
      execute: async () => {
        const { context, elements } = await agent.getContext();
        return { context, elements };
      },
    }),

    pixeer_click: createTool({
      id: 'pixeer_click',
      description:
        'Click an element by its accessible name — the same label a screen reader or user would use ' +
        '(button text, aria-label, placeholder). Use pixeer_get_page_context first to find the exact name.',
      inputSchema: z.object({
        name: z.string().describe('Accessible name of the element to click'),
      }),
      execute: async ({ context }) => ({ success: await agent.click(context.name) }),
    }),

    pixeer_click_by_selector: createTool({
      id: 'pixeer_click_by_selector',
      description:
        'Click an element by CSS selector. Prefer pixeer_click with accessible names when possible — ' +
        'use this only when the element lacks a reliable accessible name.',
      inputSchema: z.object({
        selector: z.string().describe('CSS selector of the element to click'),
      }),
      execute: async ({ context }) => ({ success: await agent.clickBySelector(context.selector) }),
    }),

    pixeer_type: createTool({
      id: 'pixeer_type',
      description:
        'Type text into an input or textarea by accessible name. ' +
        'Fires React/Vue/Angular-compatible events so the framework sees the change.',
      inputSchema: z.object({
        name: z.string().describe('Accessible name of the input or textarea'),
        text: z.string().describe('Text to type'),
      }),
      execute: async ({ context }) => ({ success: await agent.type(context.name, context.text) }),
    }),

    pixeer_type_by_selector: createTool({
      id: 'pixeer_type_by_selector',
      description: 'Type text into an input or textarea by CSS selector.',
      inputSchema: z.object({
        selector: z.string().describe('CSS selector of the input or textarea'),
        text: z.string().describe('Text to type'),
      }),
      execute: async ({ context }) => ({ success: await agent.typeBySelector(context.selector, context.text) }),
    }),

    pixeer_scroll: createTool({
      id: 'pixeer_scroll',
      description: 'Scroll the page or a specific element in a given direction.',
      inputSchema: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']),
        amount: z.number().optional().describe('Pixels to scroll. Default: 300'),
        name: z.string().optional().describe('Scroll a specific element by accessible name'),
        selector: z.string().optional().describe('Scroll a specific element by CSS selector'),
      }),
      execute: async ({ context }) => ({
        success: await agent.scroll({
          direction: context.direction,
          amount: context.amount,
          name: context.name,
          selector: context.selector,
        }),
      }),
    }),

    pixeer_press_key: createTool({
      id: 'pixeer_press_key',
      description:
        'Press a keyboard key, optionally targeting a specific element. ' +
        'Supports Enter, Escape, Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, and any character.',
      inputSchema: z.object({
        key: z.string().describe('Key to press — e.g. "Enter", "Escape", "Tab", "ArrowDown"'),
        name: z.string().optional().describe('Target a specific element by accessible name'),
        selector: z.string().optional().describe('Target a specific element by CSS selector'),
      }),
      execute: async ({ context }) => ({
        success: await agent.pressKey(context.key, { name: context.name, selector: context.selector }),
      }),
    }),

    pixeer_get_component_state: createTool({
      id: 'pixeer_get_component_state',
      description:
        "Read a React component's current props and state by its display name. " +
        'Returns null if the component is not found on the page.',
      inputSchema: z.object({
        componentName: z.string().describe('React component display name, e.g. "LoginForm"'),
      }),
      execute: async ({ context }) => ({
        state: await agent.getComponentState(context.componentName),
      }),
    }),

    pixeer_capture_screen: createTool({
      id: 'pixeer_capture_screen',
      description:
        'Capture the current page as a base64 JPEG image. ' +
        'Use with vision-capable models when the semantic snapshot alone is insufficient.',
      inputSchema: z.object({}),
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

export type PixeerMastraTools = ReturnType<typeof createPixeerTools>;
