import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPostMessageCaller } from '../transports/postmessage-caller';
import { createBroadcastCaller } from '../transports/broadcastchannel-caller';
import { createWebSocketCaller } from '../transports/websocket-caller';

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

// ─── postMessage caller ────────────────────────────────────────────────────

describe('createPostMessageCaller', () => {
  let target: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    target = { postMessage: vi.fn() };
  });

  afterEach(() => vi.restoreAllMocks());

  it('sends a request to the target window', async () => {
    const caller = createPostMessageCaller({ target: target as unknown as Window });
    const promise = caller.call('dom.click', { name: 'Submit' }).catch(() => {});
    expect(target.postMessage).toHaveBeenCalledOnce();
    const [msg] = target.postMessage.mock.calls[0];
    expect(msg.pixeer).toBe(true);
    expect(msg.type).toBe('request');
    expect(msg.method).toBe('dom.click');
    caller.dispose();
    await promise;
  });

  it('resolves when a matching response arrives', async () => {
    const caller = createPostMessageCaller({ target: target as unknown as Window });
    const promise = caller.call('dom.click', {});

    const [msg] = target.postMessage.mock.calls[0];
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { pixeer: true, type: 'response', id: msg.id, result: '{"success":true}' },
        origin: '',
      }),
    );

    const result = await promise;
    expect(result).toBe('{"success":true}');
    caller.dispose();
  });

  it('ignores responses with non-matching id', async () => {
    const caller = createPostMessageCaller({ target: target as unknown as Window, timeout: 100 });
    const promise = caller.call('dom.click', {});

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { pixeer: true, type: 'response', id: 'wrong-id', result: '{}' },
        origin: '',
      }),
    );

    await expect(promise).rejects.toThrow('timed out');
    caller.dispose();
  });

  it('ignores request-type messages', async () => {
    const caller = createPostMessageCaller({ target: target as unknown as Window, timeout: 100 });
    const promise = caller.call('dom.click', {});
    const [msg] = target.postMessage.mock.calls[0];

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { pixeer: true, type: 'request', id: msg.id, method: 'dom.click', payload: '{}' },
        origin: '',
      }),
    );

    await expect(promise).rejects.toThrow('timed out');
    caller.dispose();
  });

  it('rejects in-flight calls on dispose()', async () => {
    const caller = createPostMessageCaller({ target: target as unknown as Window });
    const promise = caller.call('dom.click', {});
    caller.dispose();
    await expect(promise).rejects.toThrow('disposed');
  });

  it('rejects after timeout', async () => {
    const caller = createPostMessageCaller({ target: target as unknown as Window, timeout: 50 });
    await expect(caller.call('dom.click', {})).rejects.toThrow('timed out');
    caller.dispose();
  });

  it('rejects messages from wrong origin when allowedOrigin is set', async () => {
    const caller = createPostMessageCaller({
      target: target as unknown as Window,
      allowedOrigin: 'https://trusted.example.com',
      timeout: 100,
    });
    const promise = caller.call('dom.click', {});
    const [msg] = target.postMessage.mock.calls[0];

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { pixeer: true, type: 'response', id: msg.id, result: '{}' },
        origin: 'https://evil.example.com',
      }),
    );

    await expect(promise).rejects.toThrow('timed out');
    caller.dispose();
  });
});

// ─── BroadcastChannel caller ───────────────────────────────────────────────

describe('createBroadcastCaller', () => {
  let mockBC: {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    trigger(data: unknown): void;
  };

  beforeEach(() => {
    mockBC = {
      onmessage: null,
      postMessage: vi.fn(),
      close: vi.fn(),
      trigger(data) {
        this.onmessage?.(new MessageEvent('message', { data }));
      },
    };
    vi.stubGlobal('BroadcastChannel', vi.fn(() => mockBC));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('broadcasts a request', async () => {
    const caller = createBroadcastCaller();
    const promise = caller.call('dom.click', {}).catch(() => {});
    expect(mockBC.postMessage).toHaveBeenCalledOnce();
    const msg = mockBC.postMessage.mock.calls[0][0];
    expect(msg.type).toBe('request');
    expect(msg.method).toBe('dom.click');
    caller.dispose();
    await promise;
  });

  it('resolves when matching response is broadcast', async () => {
    const caller = createBroadcastCaller();
    const promise = caller.call('dom.click', {});
    const msg = mockBC.postMessage.mock.calls[0][0];

    mockBC.trigger({ pixeer: true, type: 'response', id: msg.id, result: '{"success":true}' });
    await flush();

    const result = await promise;
    expect(result).toBe('{"success":true}');
    caller.dispose();
  });

  it('rejects on dispose()', async () => {
    const caller = createBroadcastCaller();
    const promise = caller.call('dom.click', {});
    caller.dispose();
    expect(mockBC.close).toHaveBeenCalled();
    await expect(promise).rejects.toThrow('disposed');
  });

  it('rejects after timeout', async () => {
    const caller = createBroadcastCaller({ timeout: 50 });
    await expect(caller.call('dom.click', {})).rejects.toThrow('timed out');
    caller.dispose();
  });

  it('ignores non-response messages', async () => {
    const caller = createBroadcastCaller({ timeout: 80 });
    const promise = caller.call('dom.click', {});
    const msg = mockBC.postMessage.mock.calls[0][0];

    mockBC.trigger({ pixeer: true, type: 'request', id: msg.id });
    await flush();

    await expect(promise).rejects.toThrow('timed out');
    caller.dispose();
  });
});

// ─── WebSocket caller ──────────────────────────────────────────────────────

describe('createWebSocketCaller', () => {
  let socket: {
    send: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    _listeners: Map<string, ((e: MessageEvent) => void)[]>;
    trigger(data: unknown): void;
  };

  beforeEach(() => {
    const listeners = new Map<string, ((e: MessageEvent) => void)[]>();
    socket = {
      send: vi.fn(),
      _listeners: listeners,
      addEventListener: vi.fn((evt: string, fn: (e: MessageEvent) => void) => {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt)!.push(fn);
      }),
      removeEventListener: vi.fn((evt: string, fn: (e: MessageEvent) => void) => {
        listeners.set(evt, (listeners.get(evt) ?? []).filter((h) => h !== fn));
      }),
      trigger(data) {
        const raw = JSON.stringify(data);
        (listeners.get('message') ?? []).forEach((h) =>
          h(new MessageEvent('message', { data: raw })),
        );
      },
    };
  });

  it('sends a request over the socket', async () => {
    const caller = createWebSocketCaller({ socket: socket as unknown as WebSocket });
    const promise = caller.call('dom.click', {}).catch(() => {});
    expect(socket.send).toHaveBeenCalledOnce();
    const msg = JSON.parse(socket.send.mock.calls[0][0]);
    expect(msg.type).toBe('request');
    expect(msg.method).toBe('dom.click');
    caller.dispose();
    await promise;
  });

  it('resolves when matching response arrives', async () => {
    const caller = createWebSocketCaller({ socket: socket as unknown as WebSocket });
    const promise = caller.call('dom.click', {});
    const msg = JSON.parse(socket.send.mock.calls[0][0]);

    socket.trigger({ pixeer: true, type: 'response', id: msg.id, result: '{"success":true}' });
    await flush();

    expect(await promise).toBe('{"success":true}');
    caller.dispose();
  });

  it('rejects on dispose()', async () => {
    const caller = createWebSocketCaller({ socket: socket as unknown as WebSocket });
    const promise = caller.call('dom.click', {});
    caller.dispose();
    await expect(promise).rejects.toThrow('disposed');
  });

  it('rejects after timeout', async () => {
    const caller = createWebSocketCaller({ socket: socket as unknown as WebSocket, timeout: 50 });
    await expect(caller.call('dom.click', {})).rejects.toThrow('timed out');
    caller.dispose();
  });

  it('ignores non-JSON messages', async () => {
    const caller = createWebSocketCaller({ socket: socket as unknown as WebSocket, timeout: 80 });
    const promise = caller.call('dom.click', {});

    (socket._listeners.get('message') ?? []).forEach((h) =>
      h(new MessageEvent('message', { data: 'not json' })),
    );
    await flush();

    await expect(promise).rejects.toThrow('timed out');
    caller.dispose();
  });

  it('removes listener on dispose()', () => {
    const caller = createWebSocketCaller({ socket: socket as unknown as WebSocket });
    caller.dispose();
    expect(socket.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
