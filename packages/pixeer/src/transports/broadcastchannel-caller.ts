import type { PixeerCallerTransport } from '../types';
import {
  generateRequestId,
  makePendingMap,
  settle,
  rejectAll,
  enqueue,
} from './caller-core';

export interface BroadcastCallerOptions {
  /** Must match the channel name used in createBroadcastTransport. Default: 'pixeer'. */
  channel?: string;
  /** Per-call timeout in ms. Default: 10 000. */
  timeout?: number;
}

export function createBroadcastCaller(
  options: BroadcastCallerOptions = {},
): PixeerCallerTransport {
  const { channel = 'pixeer', timeout = 10_000 } = options;
  const bc = new BroadcastChannel(channel);
  const pending = makePendingMap();

  bc.onmessage = (event: MessageEvent) => {
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.pixeer !== true || data.type !== 'response') return;
    if (typeof data.id !== 'string' || typeof data.result !== 'string') return;
    settle(pending, data.id, data.result);
  };

  return {
    call(method, payload) {
      const id = generateRequestId();
      const promise = enqueue(pending, id, timeout, method);
      bc.postMessage({ pixeer: true, type: 'request', id, method, payload: JSON.stringify(payload) });
      return promise;
    },

    dispose() {
      bc.close();
      rejectAll(pending, '[Pixeer] Caller transport disposed');
    },
  };
}
