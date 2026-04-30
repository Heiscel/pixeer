import { z } from 'zod';
import type { RpcCaller, PixeerFunctionContext, PixeerToolsOptions } from './types.js';

/**
 * Build a Pixeer fncCtx — a function-context object compatible with
 * `@livekit/agents` `VoicePipelineAgent` and `AgentSession`.
 *
 * Pass the returned object directly as `fncCtx` when creating your pipeline:
 *
 * @example
 * const fncCtx = createPixeerTools(call);
 * new VoicePipelineAgent(vad, stt, llm, tts, { fncCtx });
 *
 * Tools mirror `@pixeer/vercel-ai` so the same voice commands work across
 * all Pixeer adapters.
 */
export function createPixeerTools(
  call: RpcCaller,
  options: PixeerToolsOptions = {},
): PixeerFunctionContext {
  const all: PixeerFunctionContext = {
    get_page_context: {
      description:
        'Snapshot the current page — returns semantic markdown of visible content and ' +
        'a list of every interactive element with its accessible name. ' +
        'Call this at the start of a task and after any navigation or significant change.',
      parameters: z.object({}),
      execute: async () => call('dom.getContext', {}),
    },

    click: {
      description:
        'Click an element by its accessible name — the label a screen reader or user would ' +
        'use (button text, aria-label, link text, placeholder). ' +
        'Use get_page_context first to find the exact name.',
      parameters: z.object({
        name: z.string().describe('Accessible name of the element to click'),
      }),
      execute: async ({ name }) => call('dom.click', { name }),
    },

    click_by_selector: {
      description:
        'Click an element by CSS selector. Prefer click() with accessible names when possible ' +
        '— use this only when the element lacks a reliable accessible name.',
      parameters: z.object({
        selector: z.string().describe('CSS selector of the element to click'),
      }),
      execute: async ({ selector }) => call('dom.click', { selector }),
    },

    type: {
      description:
        'Type text into an input or textarea by accessible name. ' +
        'Fires React/Vue/Angular-compatible change events so the framework sees the value.',
      parameters: z.object({
        name: z.string().describe('Accessible name of the input or textarea'),
        text: z.string().describe('Text to type'),
      }),
      execute: async ({ name, text }) => call('dom.type', { name, text }),
    },

    type_by_selector: {
      description: 'Type text into an input or textarea by CSS selector.',
      parameters: z.object({
        selector: z.string().describe('CSS selector of the input or textarea'),
        text: z.string().describe('Text to type'),
      }),
      execute: async ({ selector, text }) => call('dom.type', { selector, text }),
    },

    scroll: {
      description: 'Scroll the page or a specific named element in a given direction.',
      parameters: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']),
        name: z.string().optional().describe('Scroll a specific element by accessible name'),
        amount: z.number().optional().describe('Pixels to scroll — default 300'),
      }),
      execute: async (args) => call('dom.scroll', args),
    },

    press_key: {
      description:
        'Press a keyboard key, optionally targeting a specific element. ' +
        'Supports Enter, Escape, Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace.',
      parameters: z.object({
        key: z.string().describe('Key to press, e.g. "Enter", "Escape", "Tab", "ArrowDown"'),
        name: z.string().optional().describe('Target a specific element by accessible name'),
      }),
      execute: async (args) => call('dom.pressKey', args),
    },

    get_component_state: {
      description:
        "Read a React component's current props and state by its display name. " +
        'Returns null if the component is not found on the page.',
      parameters: z.object({
        componentName: z.string().describe('React component display name, e.g. "LoginForm"'),
      }),
      execute: async ({ componentName }) =>
        call('dom.getComponentState', { name: componentName }),
    },

    get_page_delta: {
      description:
        'Get only what changed on the page since the last snapshot — much cheaper than ' +
        'get_page_context for incremental updates after an action. ' +
        'If needsFullSnapshot is true in the result, call get_page_context instead.',
      parameters: z.object({}),
      execute: async () => call('dom.getDelta', {}),
    },
  };

  if (!options.include && !options.exclude) return all;

  return Object.fromEntries(
    Object.entries(all).filter(([key]) => {
      if (options.include) return options.include!.includes(key);
      if (options.exclude) return !options.exclude!.includes(key);
      return true;
    }),
  ) as PixeerFunctionContext;
}
