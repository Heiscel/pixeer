import type { PixeerTransport, PixeerCallerTransport } from 'pixeer';

export function createInMemoryTransportPair(): {
  hostTransport: PixeerTransport;
  callerTransport: PixeerCallerTransport;
} {
  const handlers = new Map<string, (payload: string) => Promise<string>>();
  let disposed = false;

  const hostTransport: PixeerTransport = {
    onMethod(method, handler) {
      handlers.set(method, handler);
    },
    dispose() {
      handlers.clear();
      disposed = true;
    },
  };

  const callerTransport: PixeerCallerTransport = {
    async call(method, payload) {
      if (disposed) throw new Error('[Pixeer] Transport disposed');
      const handler = handlers.get(method);
      if (!handler) throw new Error(`[Pixeer] No handler for "${method}"`);
      return handler(JSON.stringify(payload));
    },
    dispose() {},
  };

  return { hostTransport, callerTransport };
}
