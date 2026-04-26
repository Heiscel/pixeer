import type { IncomingMessage } from 'node:http';

// ---- Domain types ----

export interface TabMeta {
  tabId: string;
  url: string;
  title: string;
  origin: string;
  connectedAt: number;
}

export interface TabFilter {
  tabId?: string;
  url?: string | RegExp;
  title?: string | RegExp;
  origin?: string;
}

export interface AgentMeta {
  agentId: string;
  name?: string;
  connectedAt: number;
}

export interface BroadcastResult {
  tabId: string;
  result?: unknown;
  error?: string;
}

// ---- Transport abstraction ----
//
// Implement these two interfaces to plug any transport into @pixeer/server.
// The built-in WebSocket adapter is createWebSocketServer().
//
// Example — Python FastAPI backend:
//   Connect via ws:// using the same JSON wire protocol.
//   See the protocol spec in core.ts for message shapes.
//
// Example — LiveKit:
//   Implement ServerConnection over a LiveKit DataChannel and pass it to
//   createPixeerServer(myLiveKitTransport).

export interface ServerConnection {
  send(data: string): void;
  /** Adds a message listener. Returns an unsubscribe function. */
  onMessage(handler: (data: string) => void | Promise<void>): () => void;
  onClose(handler: () => void): void;
  close(code?: number, reason?: string): void;
}

export interface ServerTransport {
  onConnection(handler: (conn: ServerConnection) => void): void;
  close(): Promise<void>;
}

// ---- Options ----

export interface PixeerServerCoreOptions {
  /** Per-RPC call timeout in ms. Default: 30000 */
  rpcTimeout?: number;
  onTabConnect?: (tab: TabMeta) => void;
  onTabDisconnect?: (tab: TabMeta) => void;
  onAgentConnect?: (agent: AgentMeta) => void;
  onAgentDisconnect?: (agent: AgentMeta) => void;
}

export interface WebSocketServerOptions extends PixeerServerCoreOptions {
  /** WebSocket server port. Default: 4727 */
  port?: number;
  /** WebSocket path. Default: '/pixeer' */
  path?: string;
  /** Return false to reject the connection before the handshake. */
  authenticate?: (req: IncomingMessage) => boolean | Promise<boolean>;
}

// ---- Server handle ----

export interface PixeerServer {
  /** Defined for WebSocket servers; undefined for custom transports. */
  readonly port: number | undefined;
  listTabs(): TabMeta[];
  findTab(filter: TabFilter): TabMeta | undefined;
  listAgents(): AgentMeta[];
  close(): Promise<void>;
}
