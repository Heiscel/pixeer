import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { PixeerAgent } from 'pixeer';

export interface PixeerLangChainToolsOptions {
  /**
   * Explicitly include only these tool names. Includes all tools when omitted.
   */
  include?: string[];
  /**
   * Exclude specific tool names — e.g. exclude 'pixeer_capture_screen' for
   * non-vision models, or 'pixeer_get_component_state' in non-React apps.
   */
  exclude?: string[];
}

// LangChain tools return JSON strings — agents parse them internally.
const ok  = (data: unknown) => JSON.stringify(data);
const err = (msg: string)   => JSON.stringify({ error: msg });

export function createPixeerTools(
  agent: PixeerAgent,
  options: PixeerLangChainToolsOptions = {},
): DynamicStructuredTool[] {
  const all: DynamicStructuredTool[] = [
    new DynamicStructuredTool({
      name: 'pixeer_get_page_context',
      description:
        'Snapshot the current page — returns semantic markdown of the visible content and a list of ' +
        'every interactive element (buttons, inputs, links) with their accessible names. ' +
        'Call this at the start of a task and again after any navigation or significant page change.',
      schema: z.object({}),
      func: async () => {
        try {
          const { context, elements } = await agent.getContext();
          return ok({ context, elements });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_click',
      description:
        'Click an element by its accessible name — the same label a screen reader or user would use ' +
        '(button text, aria-label, placeholder). Use pixeer_get_page_context first to find the exact name.',
      schema: z.object({
        name: z.string().describe('Accessible name of the element to click'),
      }),
      func: async ({ name }) => {
        try { return ok({ success: await agent.click(name) }); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_click_by_selector',
      description:
        'Click an element by CSS selector. Prefer pixeer_click with accessible names when possible — ' +
        'use this only when the element lacks a reliable accessible name.',
      schema: z.object({
        selector: z.string().describe('CSS selector of the element to click'),
      }),
      func: async ({ selector }) => {
        try { return ok({ success: await agent.clickBySelector(selector) }); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_type',
      description:
        'Type text into an input or textarea by accessible name. ' +
        'Fires React/Vue/Angular-compatible events so the framework sees the change.',
      schema: z.object({
        name: z.string().describe('Accessible name of the input or textarea'),
        text: z.string().describe('Text to type'),
      }),
      func: async ({ name, text }) => {
        try { return ok({ success: await agent.type(name, text) }); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_type_by_selector',
      description: 'Type text into an input or textarea by CSS selector.',
      schema: z.object({
        selector: z.string().describe('CSS selector of the input or textarea'),
        text: z.string().describe('Text to type'),
      }),
      func: async ({ selector, text }) => {
        try { return ok({ success: await agent.typeBySelector(selector, text) }); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_scroll',
      description: 'Scroll the page or a specific element in a given direction.',
      schema: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']),
        amount: z.number().optional().describe('Pixels to scroll. Default: 300'),
        name: z.string().optional().describe('Scroll a specific element by accessible name'),
        selector: z.string().optional().describe('Scroll a specific element by CSS selector'),
      }),
      func: async ({ direction, amount, name, selector }) => {
        try { return ok({ success: await agent.scroll({ direction, amount, name, selector }) }); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_press_key',
      description:
        'Press a keyboard key, optionally targeting a specific element. ' +
        'Supports Enter, Escape, Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, and any character.',
      schema: z.object({
        key: z.string().describe('Key to press — e.g. "Enter", "Escape", "Tab", "ArrowDown"'),
        name: z.string().optional().describe('Target a specific element by accessible name'),
        selector: z.string().optional().describe('Target a specific element by CSS selector'),
      }),
      func: async ({ key, name, selector }) => {
        try { return ok({ success: await agent.pressKey(key, { name, selector }) }); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_get_component_state',
      description:
        "Read a React component's current props and state by its display name. " +
        'Returns null if the component is not found on the page.',
      schema: z.object({
        componentName: z.string().describe('React component display name, e.g. "LoginForm"'),
      }),
      func: async ({ componentName }) => {
        try { return ok({ state: await agent.getComponentState(componentName) }); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_get_delta',
      description:
        'Get only what changed on the page since the last snapshot — much cheaper than pixeer_get_page_context ' +
        'for incremental updates after an action. If needsFullSnapshot is true, call pixeer_get_page_context instead. ' +
        'Requires enableMutationTracker: true on the bridge.',
      schema: z.object({}),
      func: async () => {
        try { return ok(await agent.getDelta()); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),

    new DynamicStructuredTool({
      name: 'pixeer_capture_screen',
      description:
        'Capture the current page as a base64 JPEG image. ' +
        'Use with vision-capable models when the semantic snapshot alone is insufficient.',
      schema: z.object({}),
      func: async () => {
        try { return ok({ image: await agent.capture() }); }
        catch (e) { return err(e instanceof Error ? e.message : String(e)); }
      },
    }),
  ];

  if (!options.include && !options.exclude) return all;

  return all.filter((t) => {
    if (options.include) return options.include!.includes(t.name);
    if (options.exclude) return !options.exclude!.includes(t.name);
    return true;
  });
}
