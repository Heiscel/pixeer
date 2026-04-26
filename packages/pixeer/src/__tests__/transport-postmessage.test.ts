import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPostMessageTransport } from '../transports/postmessage';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    pixeer: true,
    type: 'request',
    id: 'req-1',
    method: 'dom.click',
    payload: '{"name":"Submit"}',
    ...overrides,
  };
}

function dispatch(data: unknown, origin = 'https://agent.example.com') {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

describe('createPostMessageTransport', () => {
  let target: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    target = { postMessage: vi.fn() };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls handler and posts response to explicit target', async () => {
    const transport = createPostMessageTransport({
      target: target as unknown as Window,
    });
    transport.onMethod('dom.click', async () => '{"success":true}');

    dispatch(makeRequest());
    await flush();

    expect(target.postMessage).toHaveBeenCalledWith(
      { pixeer: true, type: 'response', id: 'req-1', result: '{"success":true}' },
      expect.any(String),
    );
    transport.dispose();
  });

  it('ignores messages with wrong pixeer flag', async () => {
    const transport = createPostMessageTransport({ target: target as unknown as Window });
    transport.onMethod('dom.click', async () => '{"success":true}');

    dispatch({ type: 'request', id: '1', method: 'dom.click', payload: '{}' });
    await flush();

    expect(target.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('ignores messages with type !== request', async () => {
    const transport = createPostMessageTransport({ target: target as unknown as Window });
    transport.onMethod('dom.click', async () => '{"success":true}');

    dispatch(makeRequest({ type: 'response' }));
    await flush();

    expect(target.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('ignores messages for unregistered methods', async () => {
    const transport = createPostMessageTransport({ target: target as unknown as Window });
    // register nothing

    dispatch(makeRequest({ method: 'dom.click' }));
    await flush();

    expect(target.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('rejects messages from wrong origin when allowedOrigin is set', async () => {
    const transport = createPostMessageTransport({
      target: target as unknown as Window,
      allowedOrigin: 'https://trusted.example.com',
    });
    transport.onMethod('dom.click', async () => '{"success":true}');

    dispatch(makeRequest(), 'https://evil.example.com');
    await flush();

    expect(target.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('accepts messages from correct allowedOrigin', async () => {
    const transport = createPostMessageTransport({
      target: target as unknown as Window,
      allowedOrigin: 'https://trusted.example.com',
    });
    transport.onMethod('dom.click', async () => '{"success":true}');

    dispatch(makeRequest(), 'https://trusted.example.com');
    await flush();

    expect(target.postMessage).toHaveBeenCalledOnce();
    transport.dispose();
  });

  it('routes different methods to different handlers', async () => {
    const transport = createPostMessageTransport({ target: target as unknown as Window });
    transport.onMethod('dom.click', async () => '{"action":"click"}');
    transport.onMethod('dom.type', async () => '{"action":"type"}');

    dispatch(makeRequest({ id: 'r1', method: 'dom.click' }));
    dispatch(makeRequest({ id: 'r2', method: 'dom.type' }));
    await flush();

    const results = target.postMessage.mock.calls.map((c) => c[0].result);
    expect(results).toContain('{"action":"click"}');
    expect(results).toContain('{"action":"type"}');
    transport.dispose();
  });

  it('dispose() stops processing new messages', async () => {
    const transport = createPostMessageTransport({ target: target as unknown as Window });
    transport.onMethod('dom.click', async () => '{"success":true}');
    transport.dispose();

    dispatch(makeRequest());
    await flush();

    expect(target.postMessage).not.toHaveBeenCalled();
  });

  it('ignores non-object messages', async () => {
    const transport = createPostMessageTransport({ target: target as unknown as Window });
    transport.onMethod('dom.click', async () => '{"success":true}');

    dispatch('plain string');
    dispatch(null);
    dispatch(42);
    await flush();

    expect(target.postMessage).not.toHaveBeenCalled();
    transport.dispose();
  });
});
