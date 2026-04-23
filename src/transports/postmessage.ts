import type { PixeerTransport } from '../types';

export interface PostMessageTransportOptions {
  /**
   * The window to send responses back to.
   * If omitted, each response goes to event.source (the sender).
   * Pass window.parent when Pixeer runs inside an iframe.
   */
  target?: Window;
  /**
   * Only accept requests from this origin.
   * Defaults to '*' — restrict this in production to your agent's origin.
   */
  allowedOrigin?: string;
}

interface PixeerPostMessageRequest {
  pixeer: true;
  type: 'request';
  id: string;
  method: string;
  payload: string;
}

interface PixeerPostMessageResponse {
  pixeer: true;
  type: 'response';
  id: string;
  result: string;
}

function isRequest(data: unknown): data is PixeerPostMessageRequest {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.pixeer === true &&
    d.type === 'request' &&
    typeof d.id === 'string' &&
    typeof d.method === 'string'
  );
}

export function createPostMessageTransport(
  options: PostMessageTransportOptions = {},
): PixeerTransport {
  const { target, allowedOrigin = '*' } = options;
  const handlers = new Map<string, (payload: string) => Promise<string>>();

  const listener = async (event: MessageEvent) => {
    if (allowedOrigin !== '*' && event.origin !== allowedOrigin) return;
    if (!isRequest(event.data)) return;

    const { id, method, payload } = event.data;
    const handler = handlers.get(method);
    if (!handler) return;

    const result = await handler(payload ?? '{}');

    const response: PixeerPostMessageResponse = { pixeer: true, type: 'response', id, result };
    const dest = target ?? (event.source as Window | null);
    if (!dest) return;

    const targetOrigin = allowedOrigin !== '*' ? allowedOrigin : event.origin || '*';
    dest.postMessage(response, targetOrigin);
  };

  window.addEventListener('message', listener);

  return {
    onMethod(method, handler) {
      handlers.set(method, handler);
    },
    dispose() {
      window.removeEventListener('message', listener);
      handlers.clear();
    },
  };
}
