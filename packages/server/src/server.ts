import { TabRegistry, AgentRegistry } from './registry.js';
import { WebSocketTransport } from './transports/websocket.js';
import type {
  PixeerServer,
  PixeerServerCoreOptions,
  WebSocketServerOptions,
  ServerTransport,
  ServerConnection,
  TabMeta,
  AgentMeta,
  BroadcastResult,
} from './types.js';

// ---- Wire protocol ----
//
// Tab → Server
//   { type: 'register',    tabId, url, title, origin }
//   { type: 'update',      url?, title? }
//   { type: 'event',       name, payload? }
//   { type: 'rpc:result',  requestId, result?, error? }
//
// Agent → Server
//   { type: 'register:agent',      agentId?, name? }
//   { type: 'list',                requestId }
//   { type: 'query',               requestId, filter? }
//   { type: 'list:agents',         requestId }
//   { type: 'rpc',                 requestId, tabId, method, payload }
//   { type: 'rpc:broadcast',       requestId, tabIds[], method, payload }
//
// Server → Tab
//   { type: 'registered',   tabId }
//   { type: 'rpc:call',     requestId, method, payload }
//
// Server → Agent (responses)
//   { type: 'registered:agent',        agentId }
//   { type: 'list:result',             requestId, tabs[] }
//   { type: 'query:result',            requestId, tab | null }
//   { type: 'list:agents:result',      requestId, agents[] }
//   { type: 'rpc:result',              requestId, result?, error? }
//   { type: 'rpc:broadcast:result',    requestId, results[] }
//
// Server → Agent (pushed)
//   { type: 'tab:connect',    tab }
//   { type: 'tab:disconnect', tabId, url, title }
//   { type: 'tab:update',     tab }
//   { type: 'tab:event',      tabId, name, payload? }

type Msg = Record<string, unknown> & { type: string };

function parse(raw: string): Msg | null {
  try { return JSON.parse(raw) as Msg; } catch { return null; }
}

function sendConn(conn: ServerConnection, payload: unknown): void {
  conn.send(JSON.stringify(payload));
}

function broadcastToAgents(agents: AgentRegistry, payload: unknown): void {
  const msg = JSON.stringify(payload);
  for (const entry of agents.all()) entry.conn.send(msg);
}

// ---- RPC relay ----

function relayRpc(
  targetConn: ServerConnection,
  requestId: string,
  tabId: string,
  method: string,
  payload: unknown,
  timeout: number,
): Promise<BroadcastResult> {
  return new Promise((resolve) => {
    const scopedId = `${requestId}::${tabId}`;

    let unsubscribe: (() => void) | null = null;

    const timer = setTimeout(() => {
      unsubscribe?.();
      resolve({ tabId, error: 'RPC timeout' });
    }, timeout);

    unsubscribe = targetConn.onMessage((data: string) => {
      const res = parse(data);
      if (!res || res.type !== 'rpc:result' || res.requestId !== scopedId) return;
      clearTimeout(timer);
      unsubscribe?.();
      resolve({ tabId, result: res.result, error: res.error as string | undefined });
    });

    sendConn(targetConn, { type: 'rpc:call', requestId: scopedId, method, payload });
  });
}

// ---- Core ----

export function createPixeerServer(
  transport: ServerTransport,
  options: PixeerServerCoreOptions = {},
  port?: number,
): PixeerServer {
  const {
    rpcTimeout = 30_000,
    onTabConnect,
    onTabDisconnect,
    onAgentConnect,
    onAgentDisconnect,
  } = options;

  const tabs   = new TabRegistry();
  const agents = new AgentRegistry();

  transport.onConnection((conn: ServerConnection) => {
    let kind: 'pending' | 'tab' | 'agent' = 'pending';
    let tabId:   string | null = null;
    let agentId: string | null = null;

    conn.onMessage(async (data: string) => {
      const msg = parse(data);
      if (!msg) return;

      // ---- Handshake ----
      if (kind === 'pending') {
        if (msg.type === 'register') {
          kind = 'tab';
          const meta: TabMeta = {
            tabId:       msg.tabId as string,
            url:         msg.url as string,
            title:       msg.title as string,
            origin:      msg.origin as string,
            connectedAt: Date.now(),
          };
          tabs.register(meta, conn);
          tabId = meta.tabId;
          sendConn(conn, { type: 'registered', tabId: meta.tabId });
          broadcastToAgents(agents, { type: 'tab:connect', tab: meta });
          onTabConnect?.(meta);
          return;
        }

        if (msg.type === 'register:agent') {
          kind = 'agent';
          agentId = (msg.agentId as string | undefined) ?? crypto.randomUUID();
          const meta: AgentMeta = { agentId, name: msg.name as string | undefined, connectedAt: Date.now() };
          agents.register(meta, conn);
          sendConn(conn, { type: 'registered:agent', agentId });
          onAgentConnect?.(meta);
          return;
        }

        return;
      }

      // ---- Tab messages ----
      if (kind === 'tab' && tabId) {
        if (msg.type === 'update') {
          const updated = tabs.update(tabId, {
            url:   msg.url as string | undefined,
            title: msg.title as string | undefined,
          });
          if (updated) broadcastToAgents(agents, { type: 'tab:update', tab: updated });
          return;
        }

        if (msg.type === 'event') {
          broadcastToAgents(agents, { type: 'tab:event', tabId, name: msg.name, payload: msg.payload });
          return;
        }

        // rpc:result is consumed inline by relayRpc listeners
        return;
      }

      // ---- Agent messages ----
      if (kind === 'agent') {
        switch (msg.type) {
          case 'list': {
            sendConn(conn, { type: 'list:result', requestId: msg.requestId, tabs: tabs.list() });
            break;
          }

          case 'query': {
            const filter = (msg.filter ?? {}) as Record<string, string>;
            const tab = tabs.find(filter);
            sendConn(conn, { type: 'query:result', requestId: msg.requestId, tab: tab ?? null });
            break;
          }

          case 'list:agents': {
            sendConn(conn, { type: 'list:agents:result', requestId: msg.requestId, agents: agents.list() });
            break;
          }

          case 'rpc': {
            const tid = msg.tabId as string;
            const target = tabs.get(tid);
            if (!target) {
              sendConn(conn, { type: 'rpc:result', requestId: msg.requestId, error: `Tab "${tid}" not connected` });
              break;
            }
            const { result, error } = await relayRpc(target.conn, msg.requestId as string, tid, msg.method as string, msg.payload, rpcTimeout);
            sendConn(conn, { type: 'rpc:result', requestId: msg.requestId, result, error });
            break;
          }

          case 'rpc:broadcast': {
            const tabIds = msg.tabIds as string[];
            const results = await Promise.all(
              tabIds.map((tid) => {
                const target = tabs.get(tid);
                if (!target) return Promise.resolve<BroadcastResult>({ tabId: tid, error: `Tab "${tid}" not connected` });
                return relayRpc(target.conn, msg.requestId as string, tid, msg.method as string, msg.payload, rpcTimeout);
              }),
            );
            sendConn(conn, { type: 'rpc:broadcast:result', requestId: msg.requestId, results });
            break;
          }
        }
      }
    });

    conn.onClose(() => {
      if (kind === 'tab' && tabId) {
        const meta = tabs.unregister(tabId);
        if (meta) {
          broadcastToAgents(agents, { type: 'tab:disconnect', tabId, url: meta.url, title: meta.title });
          onTabDisconnect?.(meta);
        }
      }
      if (kind === 'agent' && agentId) {
        const meta = agents.unregister(agentId);
        if (meta) onAgentDisconnect?.(meta);
      }
    });
  });

  return {
    port,
    listTabs:   () => tabs.list(),
    findTab:    (filter) => tabs.find(filter),
    listAgents: () => agents.list(),
    close:      () => transport.close(),
  };
}

// ---- WebSocket convenience ----

export async function createWebSocketServer(options: WebSocketServerOptions = {}): Promise<PixeerServer> {
  const { port, path, authenticate, ...coreOptions } = options;
  const transport = new WebSocketTransport({ port, path, authenticate });
  await transport.waitForListening();
  return createPixeerServer(transport, coreOptions, transport.port);
}
