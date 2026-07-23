// A tiny local loopback HTTP bridge between the world-action MCP server
// subprocess and the live game. The MCP server is two process-hops from
// Electron main (main -> claude CLI -> the MCP server child), so this is the
// simplest reliable way to cross that boundary: bound to 127.0.0.1 only, an
// ephemeral port passed to the MCP server via an env var.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { parseWorldAction, type WorldAction } from '../shared/worldActions';
import type { WorldObservation } from './bridge/worldCognitionContract';

const MAX_BODY_BYTES = 16_000;

export interface WorldBridgeDependencies {
  getObservation: () => WorldObservation | null;
  onAction: (action: WorldAction) => void;
}

/** The MCP `world_action` tool's honest result — never claims success beyond this. */
export interface WorldActionResult {
  ok: boolean;
  error?: string;
}

export class WorldBridge {
  private server: Server | null = null;

  constructor(private readonly deps: WorldBridgeDependencies) {}

  /** Starts listening on an ephemeral loopback port; resolves with the port. */
  start(): Promise<number> {
    if (this.server) throw new Error('WorldBridge already started');
    const server = createServer((req, res) => this.handle(req, res));
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          this.server = server;
          resolve(address.port);
        } else {
          reject(new Error('WorldBridge failed to bind a loopback port'));
        }
      });
    });
  }

  stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return Promise.resolve();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === 'GET' && req.url === '/observation') {
      const observation = this.deps.getObservation();
      this.json(res, 200, observation ?? { available: false });
      return;
    }
    if (req.method === 'POST' && req.url === '/action') {
      this.readBody(req)
        .then((body) => this.handleAction(body, res))
        .catch(() => this.json<WorldActionResult>(res, 400, { ok: false, error: 'failed to read request body' }));
      return;
    }
    this.json(res, 404, { ok: false, error: 'not found' });
  }

  private handleAction(body: string, res: ServerResponse): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      this.json<WorldActionResult>(res, 400, { ok: false, error: 'invalid JSON body' });
      return;
    }
    const action: WorldAction | null = parseWorldAction(parsed);
    if (!action) {
      this.json<WorldActionResult>(res, 400, { ok: false, error: 'invalid world action' });
      return;
    }
    this.deps.onAction(action);
    this.json<WorldActionResult>(res, 200, { ok: true });
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk;
        if (data.length > MAX_BODY_BYTES) {
          reject(new Error('request body too large'));
          req.destroy();
        }
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  private json<T>(res: ServerResponse, status: number, body: T): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}
