import type { PixeerTransport } from '../types';

export interface WebSocketTransportOptions {
  /** An already-open WebSocket instance. */
  socket: WebSocket;
}

export function createWebSocketTransport(options: WebSocketTransportOptions): PixeerTransport {
  const { socket } = options;
  const handlers = new Map<string, (payload: string) => Promise<string>>();

  const listener = async (event: MessageEvent) => {
    let data: unknown;
    try {
      data = JSON.parse(event.data as string);
    } catch {
      return;
    }

    if (!data || typeof data !== 'object') return;
    const msg = data as Record<string, unknown>;
    if (msg.pixeer !== true || msg.type !== 'request') return;

    const { id, method, payload } = msg;
    if (typeof id !== 'string' || typeof method !== 'string') return;

    const handler = handlers.get(method);
    if (!handler) return;

    const result = await handler(typeof payload === 'string' ? payload : '{}');

    socket.send(JSON.stringify({ pixeer: true, type: 'response', id, result }));
  };

  socket.addEventListener('message', listener);

  return {
    onMethod(method, handler) {
      handlers.set(method, handler);
    },
    dispose() {
      socket.removeEventListener('message', listener);
      handlers.clear();
    },
  };
}
