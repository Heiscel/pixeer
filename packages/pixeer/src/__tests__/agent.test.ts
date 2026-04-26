import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PixeerAgent } from '../agent';
import type { PixeerCallerTransport } from '../types';

function makeMockCaller(responses: Record<string, unknown> = {}): PixeerCallerTransport {
  return {
    call: vi.fn(async (method: string) => {
      if (method in responses) return JSON.stringify(responses[method]);
      throw new Error(`Unexpected method: ${method}`);
    }),
    dispose: vi.fn(),
  };
}

describe('PixeerAgent', () => {
  let caller: PixeerCallerTransport;
  let agent: PixeerAgent;

  beforeEach(() => {
    caller = makeMockCaller({
      'dom.getContext': { context: '# Page', elements: [{ name: 'Submit', type: 'button', selector: 'button', enabled: true }] },
      'dom.click': { success: true },
      'dom.type': { success: true },
      'dom.scroll': { success: true },
      'dom.pressKey': { success: true },
      'dom.getComponentState': { state: { props: { count: 1 }, state: null } },
      'screen.capture': { image: 'base64string' },
    });
    agent = new PixeerAgent(caller);
  });

  it('getContext() calls dom.getContext and returns context + elements', async () => {
    const result = await agent.getContext();
    expect(caller.call).toHaveBeenCalledWith('dom.getContext', {});
    expect(result.context).toBe('# Page');
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].name).toBe('Submit');
  });

  it('click() calls dom.click with name and returns boolean', async () => {
    const result = await agent.click('Submit');
    expect(caller.call).toHaveBeenCalledWith('dom.click', { name: 'Submit' });
    expect(result).toBe(true);
  });

  it('clickBySelector() calls dom.click with selector', async () => {
    await agent.clickBySelector('#btn');
    expect(caller.call).toHaveBeenCalledWith('dom.click', { selector: '#btn' });
  });

  it('type() calls dom.type with name and text', async () => {
    await agent.type('Email', 'user@example.com');
    expect(caller.call).toHaveBeenCalledWith('dom.type', { name: 'Email', text: 'user@example.com' });
  });

  it('typeBySelector() calls dom.type with selector and text', async () => {
    await agent.typeBySelector('#email', 'hi@x.com');
    expect(caller.call).toHaveBeenCalledWith('dom.type', { selector: '#email', text: 'hi@x.com' });
  });

  it('scroll() calls dom.scroll with options', async () => {
    await agent.scroll({ direction: 'down', amount: 400 });
    expect(caller.call).toHaveBeenCalledWith('dom.scroll', { direction: 'down', amount: 400 });
  });

  it('scroll() passes name option for element-level scroll', async () => {
    await agent.scroll({ direction: 'up', name: 'Results' });
    expect(caller.call).toHaveBeenCalledWith('dom.scroll', { direction: 'up', name: 'Results' });
  });

  it('pressKey() calls dom.pressKey with key', async () => {
    await agent.pressKey('Enter');
    expect(caller.call).toHaveBeenCalledWith('dom.pressKey', { key: 'Enter' });
  });

  it('pressKey() passes name option', async () => {
    await agent.pressKey('Escape', { name: 'Search' });
    expect(caller.call).toHaveBeenCalledWith('dom.pressKey', { key: 'Escape', name: 'Search' });
  });

  it('pressKey() passes selector option', async () => {
    await agent.pressKey('Tab', { selector: '#inp' });
    expect(caller.call).toHaveBeenCalledWith('dom.pressKey', { key: 'Tab', selector: '#inp' });
  });

  it('getComponentState() calls dom.getComponentState', async () => {
    const state = await agent.getComponentState('Counter');
    expect(caller.call).toHaveBeenCalledWith('dom.getComponentState', { componentName: 'Counter' });
    expect(state?.props.count).toBe(1);
  });

  it('getComponentState() returns null when state is null', async () => {
    const nullCaller = makeMockCaller({ 'dom.getComponentState': { state: null } });
    const a = new PixeerAgent(nullCaller);
    const result = await a.getComponentState('Missing');
    expect(result).toBeNull();
  });

  it('capture() calls screen.capture and returns base64 image', async () => {
    const img = await agent.capture();
    expect(caller.call).toHaveBeenCalledWith('screen.capture', {});
    expect(img).toBe('base64string');
  });

  it('click() returns false when bridge returns success:false', async () => {
    const failCaller = makeMockCaller({ 'dom.click': { success: false } });
    const a = new PixeerAgent(failCaller);
    const result = await a.click('Missing');
    expect(result).toBe(false);
  });

  it('dispose() calls transport.dispose()', () => {
    agent.dispose();
    expect(caller.dispose).toHaveBeenCalledOnce();
  });

  it('propagates transport errors', async () => {
    const errorCaller: PixeerCallerTransport = {
      call: vi.fn().mockRejectedValue(new Error('timeout')),
      dispose: vi.fn(),
    };
    const a = new PixeerAgent(errorCaller);
    await expect(a.click('Submit')).rejects.toThrow('timeout');
  });
});
