import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPixeerServer } from '../server.js';
import type { ServerTransport, ServerConnection, PixeerServer } from '../types.js';

// ---- In-process test transport ----

class TestConn implements ServerConnection {
  readonly sent: unknown[] = [];
  private readonly msgHandlers = new Set<(data: string) => void>();
  private readonly closeHandlers = new Set<() => void>();

  send(data: string): void { this.sent.push(JSON.parse(data)); }
  onClose(handler: () => void): void { this.closeHandlers.add(handler); }
  close(_code?: number, _reason?: string): void { this.disconnect(); }

  onMessage(handler: (data: string) => void | Promise<void>): () => void {
    this.msgHandlers.add(handler);
    return () => { this.msgHandlers.delete(handler); };
  }

  receive(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const h of this.msgHandlers) h(data);
  }

  disconnect(): void { for (const h of this.closeHandlers) h(); }

  last(): unknown                        { return this.sent.at(-1); }
  find(type: string): unknown            { return this.sent.find((m: any) => m.type === type); }
  all(type: string): unknown[]           { return this.sent.filter((m: any) => m.type === type); }
}

function createTestTransport() {
  let onConn: ((conn: ServerConnection) => void) | null = null;
  const transport: ServerTransport = {
    onConnection: (h) => { onConn = h; },
    close:        async () => {},
  };
  return {
    transport,
    connect(): TestConn {
      const conn = new TestConn();
      onConn?.(conn);
      return conn;
    },
  };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ---- Helpers ----

const TAB = { type: 'register', tabId: 't1', url: 'https://example.com/page', title: 'Page', origin: 'https://example.com' };
const AGENT = { type: 'register:agent', agentId: 'a1', name: 'TestAgent' };

// ---- Tests ----

describe('createPixeerServer', () => {
  let harness: ReturnType<typeof createTestTransport>;
  let server: PixeerServer;

  beforeEach(() => {
    harness = createTestTransport();
    server = createPixeerServer(harness.transport, { rpcTimeout: 100 });
  });

  afterEach(async () => { await server.close(); });

  // ---- Tab registration ----

  describe('tab registration', () => {
    it('sends registered back to the tab', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();
      expect(tab.find('registered')).toMatchObject({ type: 'registered', tabId: 't1' });
    });

    it('appears in listTabs()', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();
      expect(server.listTabs()).toHaveLength(1);
      expect(server.listTabs()[0]).toMatchObject({ tabId: 't1', url: 'https://example.com/page' });
    });

    it('broadcasts tab:connect to all connected agents', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      const tab = harness.connect();
      tab.receive(TAB);
      await tick();

      expect(agent.find('tab:connect')).toMatchObject({ type: 'tab:connect', tab: { tabId: 't1' } });
    });

    it('calls onTabConnect callback', async () => {
      const spy = vi.fn();
      const h2 = createTestTransport();
      const s2 = createPixeerServer(h2.transport, { onTabConnect: spy });
      h2.connect().receive(TAB);
      await tick();
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tabId: 't1' }));
      await s2.close();
    });
  });

  // ---- Agent registration ----

  describe('agent registration', () => {
    it('sends registered:agent back with provided agentId', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();
      expect(agent.last()).toMatchObject({ type: 'registered:agent', agentId: 'a1' });
    });

    it('auto-generates agentId when not provided', async () => {
      const agent = harness.connect();
      agent.receive({ type: 'register:agent' });
      await tick();
      const msg = agent.last() as any;
      expect(msg.type).toBe('registered:agent');
      expect(typeof msg.agentId).toBe('string');
      expect(msg.agentId.length).toBeGreaterThan(0);
    });

    it('appears in listAgents()', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();
      expect(server.listAgents()).toHaveLength(1);
      expect(server.listAgents()[0]).toMatchObject({ agentId: 'a1', name: 'TestAgent' });
    });

    it('calls onAgentConnect callback', async () => {
      const spy = vi.fn();
      const h2 = createTestTransport();
      const s2 = createPixeerServer(h2.transport, { onAgentConnect: spy });
      h2.connect().receive(AGENT);
      await tick();
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a1' }));
      await s2.close();
    });
  });

  // ---- list / query ----

  describe('list', () => {
    it('returns all connected tabs', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      tab.receive({ ...TAB, tabId: 't2', url: 'https://example.com/other' });
      await tick();

      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      agent.receive({ type: 'list', requestId: 'r1' });
      await tick();

      const msg = agent.find('list:result') as any;
      expect(msg.requestId).toBe('r1');
      expect(msg.tabs).toHaveLength(1); // t1 was registered; second message from same conn re-uses t1
    });

    it('returns empty array when no tabs', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();
      agent.receive({ type: 'list', requestId: 'r1' });
      await tick();
      expect((agent.find('list:result') as any).tabs).toHaveLength(0);
    });
  });

  describe('query', () => {
    it('finds a tab by URL substring', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();

      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      agent.receive({ type: 'query', requestId: 'r1', filter: { url: 'example.com' } });
      await tick();

      const msg = agent.find('query:result') as any;
      expect(msg.tab).toMatchObject({ tabId: 't1' });
    });

    it('returns null when no tab matches', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();
      agent.receive({ type: 'query', requestId: 'r1', filter: { url: 'notfound.io' } });
      await tick();
      expect((agent.find('query:result') as any).tab).toBeNull();
    });
  });

  describe('list:agents', () => {
    it('returns all connected agents', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      agent.receive({ ...AGENT, agentId: 'a2', name: 'Second' });
      await tick();

      agent.receive({ type: 'list:agents', requestId: 'r1' });
      await tick();

      const msg = agent.find('list:agents:result') as any;
      expect(msg.agents).toHaveLength(1); // same conn, second register overwrites
    });
  });

  // ---- RPC ----

  describe('rpc', () => {
    it('forwards rpc:call to the target tab and relays result back', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();

      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      agent.receive({ type: 'rpc', requestId: 'r1', tabId: 't1', method: 'dom.click', payload: { name: 'Submit' } });
      await tick();

      // Tab receives the rpc:call
      const call = tab.find('rpc:call') as any;
      expect(call.method).toBe('dom.click');
      expect(call.payload).toMatchObject({ name: 'Submit' });

      // Tab replies
      tab.receive({ type: 'rpc:result', requestId: call.requestId, result: { success: true } });
      await tick();

      // Agent receives the result
      const result = agent.find('rpc:result') as any;
      expect(result.requestId).toBe('r1');
      expect(result.result).toMatchObject({ success: true });
    });

    it('returns an error when the target tab is not connected', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      agent.receive({ type: 'rpc', requestId: 'r1', tabId: 'missing', method: 'dom.click', payload: {} });
      await tick();

      const result = agent.find('rpc:result') as any;
      expect(result.error).toMatch(/not connected/);
    });

    it('times out when the tab does not respond', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();

      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      agent.receive({ type: 'rpc', requestId: 'r1', tabId: 't1', method: 'dom.click', payload: {} });

      // Wait longer than rpcTimeout (100ms)
      await new Promise((r) => setTimeout(r, 150));

      const result = agent.find('rpc:result') as any;
      expect(result.error).toMatch(/timeout/i);
    });
  });

  // ---- rpc:broadcast ----

  describe('rpc:broadcast', () => {
    it('fans out to multiple tabs and collects all results', async () => {
      const tab1 = harness.connect();
      tab1.receive(TAB);
      await tick();

      const tab2 = harness.connect();
      tab2.receive({ ...TAB, tabId: 't2', url: 'https://example.com/b' });
      await tick();

      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      agent.receive({ type: 'rpc:broadcast', requestId: 'b1', tabIds: ['t1', 't2'], method: 'dom.scroll', payload: { direction: 'down' } });
      await tick();

      const call1 = tab1.find('rpc:call') as any;
      const call2 = tab2.find('rpc:call') as any;

      tab1.receive({ type: 'rpc:result', requestId: call1.requestId, result: { success: true } });
      tab2.receive({ type: 'rpc:result', requestId: call2.requestId, result: { success: true } });
      await tick();

      const msg = agent.find('rpc:broadcast:result') as any;
      expect(msg.requestId).toBe('b1');
      expect(msg.results).toHaveLength(2);
      expect(msg.results.every((r: any) => r.result?.success === true)).toBe(true);
    });

    it('includes an error result for tabs that are not connected', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      agent.receive({ type: 'rpc:broadcast', requestId: 'b1', tabIds: ['ghost'], method: 'dom.click', payload: {} });
      await tick();

      const msg = agent.find('rpc:broadcast:result') as any;
      expect(msg.results[0]).toMatchObject({ tabId: 'ghost', error: expect.stringMatching(/not connected/) });
    });
  });

  // ---- Tab events ----

  describe('tab:update', () => {
    it('broadcasts tab:update to all agents on navigation', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();

      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      tab.receive({ type: 'update', url: 'https://example.com/new', title: 'New Page' });
      await tick();

      expect(agent.find('tab:update')).toMatchObject({
        type: 'tab:update',
        tab: { tabId: 't1', url: 'https://example.com/new', title: 'New Page' },
      });
    });

    it('updates stored metadata', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();

      tab.receive({ type: 'update', url: 'https://example.com/new', title: 'New Page' });
      await tick();

      expect(server.listTabs()[0]).toMatchObject({ url: 'https://example.com/new', title: 'New Page' });
    });
  });

  describe('tab:event', () => {
    it('forwards custom tab events to all agents', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();

      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      tab.receive({ type: 'event', name: 'checkout:started', payload: { cartId: 'c1' } });
      await tick();

      expect(agent.find('tab:event')).toMatchObject({
        type: 'tab:event',
        tabId: 't1',
        name: 'checkout:started',
        payload: { cartId: 'c1' },
      });
    });
  });

  // ---- Disconnect ----

  describe('disconnect', () => {
    it('removes tab from listTabs() and notifies agents', async () => {
      const tab = harness.connect();
      tab.receive(TAB);
      await tick();

      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      tab.disconnect();
      await tick();

      expect(server.listTabs()).toHaveLength(0);
      expect(agent.find('tab:disconnect')).toMatchObject({ type: 'tab:disconnect', tabId: 't1' });
    });

    it('removes agent from listAgents()', async () => {
      const agent = harness.connect();
      agent.receive(AGENT);
      await tick();

      agent.disconnect();
      await tick();

      expect(server.listAgents()).toHaveLength(0);
    });

    it('calls onTabDisconnect callback', async () => {
      const spy = vi.fn();
      const h2 = createTestTransport();
      const s2 = createPixeerServer(h2.transport, { onTabDisconnect: spy });

      const tab = h2.connect();
      tab.receive(TAB);
      await tick();
      tab.disconnect();
      await tick();

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tabId: 't1' }));
      await s2.close();
    });
  });

  // ---- Unknown connections ----

  describe('unregistered connections', () => {
    it('ignores messages before registration', async () => {
      const conn = harness.connect();
      conn.receive({ type: 'list', requestId: 'r1' });
      await tick();
      expect(conn.sent).toHaveLength(0);
    });
  });
});
