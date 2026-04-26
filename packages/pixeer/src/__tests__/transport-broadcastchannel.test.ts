import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBroadcastTransport } from '../transports/broadcastchannel';

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

function makeMockBC() {
  const instance = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    postMessage: vi.fn(),
    close: vi.fn(),
    trigger(data: unknown) {
      this.onmessage?.(new MessageEvent('message', { data }));
    },
  };
  return instance;
}

describe('createBroadcastTransport', () => {
  let mockBC: ReturnType<typeof makeMockBC>;

  beforeEach(() => {
    mockBC = makeMockBC();
    vi.stubGlobal('BroadcastChannel', vi.fn(() => mockBC));
  });

  it('opens a BroadcastChannel with the correct name', () => {
    createBroadcastTransport({ channel: 'my-channel' });
    expect(BroadcastChannel).toHaveBeenCalledWith('my-channel');
  });

  it('defaults channel name to "pixeer"', () => {
    createBroadcastTransport();
    expect(BroadcastChannel).toHaveBeenCalledWith('pixeer');
  });

  it('calls handler and broadcasts response', async () => {
    const transport = createBroadcastTransport();
    transport.onMethod('dom.click', async () => '{"success":true}');

    mockBC.trigger({ pixeer: true, type: 'request', id: 'r1', method: 'dom.click', payload: '{}' });
    await flush();

    expect(mockBC.postMessage).toHaveBeenCalledWith({
      pixeer: true,
      type: 'response',
      id: 'r1',
      result: '{"success":true}',
    });
    transport.dispose();
  });

  it('ignores response-type messages', async () => {
    const transport = createBroadcastTransport();
    transport.onMethod('dom.click', async () => '{"success":true}');

    mockBC.trigger({ pixeer: true, type: 'response', id: 'r1', result: '{}' });
    await flush();

    expect(mockBC.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('ignores messages without pixeer flag', async () => {
    const transport = createBroadcastTransport();
    transport.onMethod('dom.click', async () => '{"success":true}');

    mockBC.trigger({ type: 'request', id: 'r1', method: 'dom.click', payload: '{}' });
    await flush();

    expect(mockBC.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('ignores messages for unregistered methods', async () => {
    const transport = createBroadcastTransport();

    mockBC.trigger({ pixeer: true, type: 'request', id: 'r1', method: 'dom.click', payload: '{}' });
    await flush();

    expect(mockBC.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('defaults payload to {} when missing', async () => {
    const transport = createBroadcastTransport();
    const handler = vi.fn(async () => '{"ok":true}');
    transport.onMethod('dom.click', handler);

    mockBC.trigger({ pixeer: true, type: 'request', id: 'r1', method: 'dom.click' });
    await flush();

    expect(handler).toHaveBeenCalledWith('{}');
    transport.dispose();
  });

  it('dispose() closes the channel', () => {
    const transport = createBroadcastTransport();
    transport.dispose();
    expect(mockBC.close).toHaveBeenCalled();
  });

  it('ignores null messages', async () => {
    const transport = createBroadcastTransport();
    transport.onMethod('dom.click', async () => '{"success":true}');

    mockBC.trigger(null);
    await flush();

    expect(mockBC.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });
});
