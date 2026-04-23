import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebSocketTransport } from '../transports/websocket';

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

function makeMockSocket() {
  const listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  const socket = {
    send: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      const list = listeners.get(event) ?? [];
      listeners.set(event, list.filter((h) => h !== handler));
    }),
    trigger(data: unknown) {
      const raw = typeof data === 'string' ? data : JSON.stringify(data);
      (listeners.get('message') ?? []).forEach((h) =>
        h(new MessageEvent('message', { data: raw })),
      );
    },
  };
  return socket;
}

describe('createWebSocketTransport', () => {
  let socket: ReturnType<typeof makeMockSocket>;

  beforeEach(() => {
    socket = makeMockSocket();
  });

  it('registers a message listener on the socket', () => {
    createWebSocketTransport({ socket: socket as unknown as WebSocket });
    expect(socket.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('calls handler and sends JSON response', async () => {
    const transport = createWebSocketTransport({ socket: socket as unknown as WebSocket });
    transport.onMethod('dom.click', async () => '{"success":true}');

    socket.trigger({ pixeer: true, type: 'request', id: 'r1', method: 'dom.click', payload: '{}' });
    await flush();

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ pixeer: true, type: 'response', id: 'r1', result: '{"success":true}' }),
    );
    transport.dispose();
  });

  it('ignores non-JSON messages', async () => {
    const transport = createWebSocketTransport({ socket: socket as unknown as WebSocket });
    transport.onMethod('dom.click', async () => '{"success":true}');

    socket.trigger('this is not json }{');
    await flush();

    expect(socket.send).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('ignores messages with wrong pixeer flag', async () => {
    const transport = createWebSocketTransport({ socket: socket as unknown as WebSocket });
    transport.onMethod('dom.click', async () => '{"success":true}');

    socket.trigger({ type: 'request', id: 'r1', method: 'dom.click', payload: '{}' });
    await flush();

    expect(socket.send).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('ignores response-type messages', async () => {
    const transport = createWebSocketTransport({ socket: socket as unknown as WebSocket });
    transport.onMethod('dom.click', async () => '{"success":true}');

    socket.trigger({ pixeer: true, type: 'response', id: 'r1', result: '{}' });
    await flush();

    expect(socket.send).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('ignores messages for unregistered methods', async () => {
    const transport = createWebSocketTransport({ socket: socket as unknown as WebSocket });

    socket.trigger({ pixeer: true, type: 'request', id: 'r1', method: 'dom.click', payload: '{}' });
    await flush();

    expect(socket.send).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('defaults payload to {} when missing', async () => {
    const transport = createWebSocketTransport({ socket: socket as unknown as WebSocket });
    const handler = vi.fn(async () => '{"ok":true}');
    transport.onMethod('dom.click', handler);

    socket.trigger({ pixeer: true, type: 'request', id: 'r1', method: 'dom.click' });
    await flush();

    expect(handler).toHaveBeenCalledWith('{}');
    transport.dispose();
  });

  it('dispose() removes the message listener', () => {
    const transport = createWebSocketTransport({ socket: socket as unknown as WebSocket });
    transport.dispose();
    expect(socket.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('routes multiple methods correctly', async () => {
    const transport = createWebSocketTransport({ socket: socket as unknown as WebSocket });
    transport.onMethod('dom.click', async () => '{"action":"click"}');
    transport.onMethod('dom.type', async () => '{"action":"type"}');

    socket.trigger({ pixeer: true, type: 'request', id: 'r1', method: 'dom.click', payload: '{}' });
    socket.trigger({ pixeer: true, type: 'request', id: 'r2', method: 'dom.type', payload: '{}' });
    await flush();

    const sent = socket.send.mock.calls.map((c) => JSON.parse(c[0] as string).result);
    expect(sent).toContain('{"action":"click"}');
    expect(sent).toContain('{"action":"type"}');
    transport.dispose();
  });
});
