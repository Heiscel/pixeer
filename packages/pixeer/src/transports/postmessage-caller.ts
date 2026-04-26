import type { PixeerCallerTransport } from '../types';
import {
  generateRequestId,
  makePendingMap,
  settle,
  rejectAll,
  enqueue,
} from './caller-core';

export interface PostMessageCallerOptions {
  /** The window hosting the Pixeer bridge (e.g. an iframe's contentWindow, or window.opener). */
  target: Window;
  /** Only accept responses from this origin. Defaults to '*'. */
  allowedOrigin?: string;
  /** Per-call timeout in ms. Default: 10 000. */
  timeout?: number;
}

export function createPostMessageCaller(
  options: PostMessageCallerOptions,
): PixeerCallerTransport {
  const { target, allowedOrigin = '*', timeout = 10_000 } = options;
  const pending = makePendingMap();

  const listener = (event: MessageEvent) => {
    if (allowedOrigin !== '*' && event.origin !== allowedOrigin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.pixeer !== true || data.type !== 'response') return;
    if (typeof data.id !== 'string' || typeof data.result !== 'string') return;
    settle(pending, data.id, data.result);
  };

  window.addEventListener('message', listener);

  return {
    call(method, payload) {
      const id = generateRequestId();
      const promise = enqueue(pending, id, timeout, method);
      target.postMessage(
        { pixeer: true, type: 'request', id, method, payload: JSON.stringify(payload) },
        allowedOrigin === '*' ? '*' : allowedOrigin,
      );
      return promise;
    },

    dispose() {
      window.removeEventListener('message', listener);
      rejectAll(pending, '[Pixeer] Caller transport disposed');
    },
  };
}
