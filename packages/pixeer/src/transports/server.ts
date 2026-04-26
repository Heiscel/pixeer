import type { PixeerTransport } from '../types';

export interface PixeerServerTransportOptions {
  /** WebSocket URL of the @pixeer/server instance. e.g. 'ws://localhost:4727/pixeer' */
  url: string;
  /** Tab ID to register with. Defaults to a random UUID. */
  tabId?: string;
  /** Override the tab title. Defaults to document.title. */
  title?: string;
}

/**
 * Host-side transport that connects this page to a @pixeer/server instance.
 *
 * The tab auto-registers itself (url, title, origin) and keeps its metadata
 * in sync on navigation. The server can then route agent RPC calls to this tab.
 *
 * ```ts
 * const transport = await createPixeerServerTransport({ url: 'ws://localhost:4727/pixeer' });
 * const bridge = createPixeerBridge(transport);
 * ```
 */
export async function createPixeerServerTransport(
  options: PixeerServerTransportOptions,
): Promise<PixeerTransport> {
  const { url, tabId = crypto.randomUUID(), title } = options;

  const ws = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error(`[Pixeer] Failed to connect to server: ${url}`)), { once: true });
  });

  // Register this tab
  ws.send(JSON.stringify({
    type: 'register',
    tabId,
    url:    location.href,
    title:  title ?? document.title,
    origin: location.origin,
  }));

  // Wait for the server to confirm registration
  await new Promise<void>((resolve) => {
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        if (msg.type === 'registered' && msg.tabId === tabId) {
          ws.removeEventListener('message', handler);
          resolve();
        }
      } catch { /* ignore */ }
    };
    ws.addEventListener('message', handler);
  });

  const methodHandlers = new Map<string, (payload: string) => Promise<string>>();

  // Handle inbound RPC calls from the server
  const rpcListener = async (event: MessageEvent) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(event.data as string) as Record<string, unknown>; }
    catch { return; }

    if (msg.type !== 'rpc:call') return;
    const { requestId, method, payload } = msg;
    if (typeof requestId !== 'string' || typeof method !== 'string') return;

    const handler = methodHandlers.get(method);
    if (!handler) {
      ws.send(JSON.stringify({ type: 'rpc:result', requestId, error: `No handler for "${method}"` }));
      return;
    }

    try {
      const raw = await handler(typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}));
      ws.send(JSON.stringify({ type: 'rpc:result', requestId, result: JSON.parse(raw) }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      ws.send(JSON.stringify({ type: 'rpc:result', requestId, error }));
    }
  };

  ws.addEventListener('message', rpcListener);

  // Keep tab metadata in sync on SPA navigation
  const sendUpdate = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'update', url: location.href, title: document.title }));
  };

  window.addEventListener('popstate',   sendUpdate);
  window.addEventListener('hashchange', sendUpdate);

  return {
    onMethod(method, handler) {
      methodHandlers.set(method, handler);
    },
    dispose() {
      ws.removeEventListener('message', rpcListener);
      window.removeEventListener('popstate',   sendUpdate);
      window.removeEventListener('hashchange', sendUpdate);
      methodHandlers.clear();
      ws.close();
    },
  };
}
