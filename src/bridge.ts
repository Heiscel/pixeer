/**
 * The bridge is the glue between your transport and the DOM engine.
 *
 * Call createPixeerBridge() with your transport and it registers all the
 * RPC methods your agent needs to understand and interact with the page:
 *
 *   dom.getContext        → page markdown + interactive elements
 *   dom.click             → click by selector or accessible name
 *   dom.type              → type into an input by selector or name
 *   dom.getComponentState → read React component props/state
 *   screen.capture        → screenshot as base64 JPEG (opt-in)
 *
 * When you're done, call bridge.dispose() to clean everything up.
 */

import { DomService } from './dom-service';
import { ScreenCapture } from './screen-capture';
import type { PixeerTransport, PixeerBridgeOptions, PixeerBridge } from './types';

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parsePayload<T>(payload: string): ParseResult<T> {
  try {
    const data = JSON.parse(payload) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Invalid JSON payload' };
  }
}

/**
 * Wire up your transport so your agent can see and interact with the page.
 * Pass any PixeerTransport and you're good to go.
 */
export function createPixeerBridge(
  transport: PixeerTransport,
  options?: PixeerBridgeOptions,
): PixeerBridge {
  const screenCapture = options?.enableScreenCapture
    ? new ScreenCapture({ quality: options?.captureQuality })
    : null;

  // Your agent calls this to get a snapshot of what's on the page
  transport.onMethod('dom.getContext', async () => {
    try {
      const context = await DomService.getPageContext();
      const elements = await DomService.getInteractiveElements();
      return JSON.stringify({ context, elements });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get DOM context';
      return JSON.stringify({ error: message });
    }
  });

  // Your agent calls this to click something — pass { selector } or { name }
  transport.onMethod('dom.click', async (payload: string) => {
    try {
      const parsed = parsePayload<{ selector?: unknown; name?: unknown }>(payload);
      if (!parsed.ok) {
        return JSON.stringify({ success: false, error: parsed.error });
      }
      const { selector, name } = parsed.data;

      const selectorValue = typeof selector === 'string' ? selector.trim() : '';
      const nameValue = typeof name === 'string' ? name.trim() : '';

      let success: boolean;

      if (selectorValue) {
        success = DomService.click(selectorValue);
      } else if (nameValue) {
        success = await DomService.clickByName(nameValue);
      } else {
        return JSON.stringify({ success: false, error: 'No selector or name provided' });
      }

      return JSON.stringify({ success });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Click failed';
      return JSON.stringify({ success: false, error: message });
    }
  });

  // Your agent calls this to type into an input — pass { selector | name, text }
  transport.onMethod('dom.type', async (payload: string) => {
    try {
      const parsed = parsePayload<{ selector?: unknown; name?: unknown; text?: unknown }>(payload);
      if (!parsed.ok) {
        return JSON.stringify({ success: false, error: parsed.error });
      }
      const { selector, name, text } = parsed.data;

      const selectorValue = typeof selector === 'string' ? selector.trim() : '';
      const nameValue = typeof name === 'string' ? name.trim() : '';
      const textValue = typeof text === 'string' ? text : null;
      if (textValue === null) {
        return JSON.stringify({ success: false, error: 'Text must be a string' });
      }

      let success: boolean;

      if (selectorValue) {
        success = DomService.type(selectorValue, textValue);
      } else if (nameValue) {
        success = await DomService.typeByName(nameValue, textValue);
      } else {
        return JSON.stringify({ success: false, error: 'No selector or name provided' });
      }

      return JSON.stringify({ success });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Type failed';
      return JSON.stringify({ success: false, error: message });
    }
  });

  // Your agent calls this to peek at a React component's props and state
  transport.onMethod('dom.getComponentState', async (payload: string) => {
    try {
      const parsed = parsePayload<{ componentName?: unknown }>(payload);
      if (!parsed.ok) {
        return JSON.stringify({ error: parsed.error });
      }
      const componentName = typeof parsed.data.componentName === 'string'
        ? parsed.data.componentName.trim()
        : '';
      if (!componentName) {
        return JSON.stringify({ error: 'componentName is required' });
      }

      const state = await DomService.getComponentState(componentName);
      return JSON.stringify({ state });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get component state';
      return JSON.stringify({ error: message });
    }
  });

  // Your agent calls this to scroll an element or the page
  transport.onMethod('dom.scroll', async (payload: string) => {
    try {
      const parsed = parsePayload<{
        selector?: unknown;
        name?: unknown;
        direction?: unknown;
        amount?: unknown;
      }>(payload);
      if (!parsed.ok) {
        return JSON.stringify({ success: false, error: parsed.error });
      }
      const { selector, name, direction, amount } = parsed.data;

      const dir = typeof direction === 'string' ? direction.trim() : '';
      if (!['up', 'down', 'left', 'right'].includes(dir)) {
        return JSON.stringify({ success: false, error: 'Invalid direction' });
      }

      const selectorValue = typeof selector === 'string' ? selector.trim() : '';
      const nameValue = typeof name === 'string' ? name.trim() : '';
      const amountValue = typeof amount === 'number' ? amount : 300;

      let success: boolean;
      if (nameValue) {
        success = await DomService.scrollByName(
          nameValue,
          dir as 'up' | 'down' | 'left' | 'right',
          amountValue,
        );
      } else {
        success = DomService.scroll(
          selectorValue || null,
          dir as 'up' | 'down' | 'left' | 'right',
          amountValue,
        );
      }

      return JSON.stringify({ success });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scroll failed';
      return JSON.stringify({ success: false, error: message });
    }
  });

  // Your agent calls this to press a key on an element
  transport.onMethod('dom.pressKey', async (payload: string) => {
    try {
      const parsed = parsePayload<{
        selector?: unknown;
        name?: unknown;
        key?: unknown;
      }>(payload);
      if (!parsed.ok) {
        return JSON.stringify({ success: false, error: parsed.error });
      }
      const { selector, name, key } = parsed.data;

      const keyValue = typeof key === 'string' ? key.trim() : '';
      if (!keyValue) {
        return JSON.stringify({ success: false, error: 'key is required' });
      }

      const selectorValue = typeof selector === 'string' ? selector.trim() : '';
      const nameValue = typeof name === 'string' ? name.trim() : '';

      let success: boolean;
      if (nameValue) {
        success = await DomService.pressKeyByName(nameValue, keyValue);
      } else {
        success = DomService.pressKey(selectorValue || null, keyValue);
      }

      return JSON.stringify({ success });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'pressKey failed';
      return JSON.stringify({ success: false, error: message });
    }
  });

  // If you opted in, your agent can capture the screen for vision
  if (screenCapture) {
    transport.onMethod('screen.capture', async () => {
      try {
        const image = await screenCapture.capture();
        return JSON.stringify({ image });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Screen capture failed';
        return JSON.stringify({ error: message });
      }
    });
  }

  return {
    dispose() {
      screenCapture?.dispose();
      transport.dispose();
    },
  };
}
