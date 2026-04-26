import { WebSocketServer } from 'ws';
import type { WebSocket, RawData } from 'ws';
import type { ServerTransport, ServerConnection, WebSocketServerOptions } from '../types.js';

class WebSocketConnection implements ServerConnection {
  constructor(private readonly ws: WebSocket) {}

  send(data: string): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(data);
  }

  onMessage(handler: (data: string) => void | Promise<void>): () => void {
    const listener = (raw: RawData) => handler(raw.toString());
    this.ws.on('message', listener);
    return () => this.ws.off('message', listener);
  }

  onClose(handler: () => void): void {
    this.ws.once('close', handler);
  }

  close(code = 1000, reason = ''): void {
    this.ws.close(code, reason);
  }
}

export class WebSocketTransport implements ServerTransport {
  private readonly wss: WebSocketServer;

  constructor(private readonly options: Pick<WebSocketServerOptions, 'port' | 'path' | 'authenticate'> = {}) {
    this.wss = new WebSocketServer({
      port: options.port ?? 4727,
      path: options.path ?? '/pixeer',
    });
  }

  onConnection(handler: (conn: ServerConnection) => void): void {
    this.wss.on('connection', async (ws: WebSocket, req) => {
      if (this.options.authenticate) {
        const allowed = await this.options.authenticate(req);
        if (!allowed) { ws.close(1008, 'Unauthorized'); return; }
      }
      handler(new WebSocketConnection(ws));
    });
  }

  get port(): number {
    const addr = this.wss.address();
    return typeof addr === 'object' && addr !== null ? (addr as { port: number }).port : (this.options.port ?? 4727);
  }

  waitForListening(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.once('listening', resolve);
      this.wss.once('error', reject);
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
