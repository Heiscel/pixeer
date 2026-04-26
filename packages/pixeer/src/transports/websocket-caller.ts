import type { PixeerCallerTransport } from '../types';
import {
  generateRequestId,
  makePendingMap,
  settle,
  rejectAll,
  enqueue,
} from './caller-core';

export interface WebSocketCallerOptions {
  /** An already-open WebSocket connected to the server that proxies to Pixeer. */
  socket: WebSocket;
  /** Per-call timeout in ms. Default: 10 000. */
  timeout?: number;
}

export function createWebSocketCaller(options: WebSocketCallerOptions): PixeerCallerTransport {
  const { socket, timeout = 10_000 } = options;
  const pending = makePendingMap();

  const listener = (event: MessageEvent) => {
    let data: unknown;
    try {
      data = JSON.parse(event.data as string);
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;
    const msg = data as Record<string, unknown>;
    if (msg.pixeer !== true || msg.type !== 'response') return;
    if (typeof msg.id !== 'string' || typeof msg.result !== 'string') return;
    settle(pending, msg.id, msg.result);
  };

  socket.addEventListener('message', listener);

  return {
    call(method, payload) {
      const id = generateRequestId();
      const promise = enqueue(pending, id, timeout, method);
      socket.send(
        JSON.stringify({ pixeer: true, type: 'request', id, method, payload: JSON.stringify(payload) }),
      );
      return promise;
    },

    dispose() {
      socket.removeEventListener('message', listener);
      rejectAll(pending, '[Pixeer] Caller transport disposed');
    },
  };
}
