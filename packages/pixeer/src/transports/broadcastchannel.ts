import type { PixeerTransport } from '../types';

export interface BroadcastTransportOptions {
  /** BroadcastChannel name. Defaults to 'pixeer'. Must match on both sides. */
  channel?: string;
}

export function createBroadcastTransport(
  options: BroadcastTransportOptions = {},
): PixeerTransport {
  const channelName = options.channel ?? 'pixeer';
  const bc = new BroadcastChannel(channelName);
  const handlers = new Map<string, (payload: string) => Promise<string>>();

  bc.onmessage = async (event: MessageEvent) => {
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.pixeer !== true || data.type !== 'request') return;

    const { id, method, payload } = data;
    if (typeof id !== 'string' || typeof method !== 'string') return;

    const handler = handlers.get(method);
    if (!handler) return;

    const result = await handler(typeof payload === 'string' ? payload : '{}');

    bc.postMessage({ pixeer: true, type: 'response', id, result });
  };

  return {
    onMethod(method, handler) {
      handlers.set(method, handler);
    },
    dispose() {
      bc.close();
      handlers.clear();
    },
  };
}
