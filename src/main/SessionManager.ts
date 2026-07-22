// SessionManager — the orchestrator's single owner of the live agent session.
// Holds at most one adapter, routes IPC calls to it, and forwards every
// normalized event to the renderer through the provided sink.

import { createAdapter, type AgentSessionAdapter } from './bridge/index';
import type { AgentOutputEvent } from '../shared/events';
import type { AgentSessionStatus, SessionOptions } from '../shared/types';

export class SessionManager {
  private adapter: AgentSessionAdapter | null = null;

  constructor(private readonly sink: (event: AgentOutputEvent) => void) {}

  async start(options: SessionOptions): Promise<{ ok: boolean; error?: string }> {
    await this.stop();
    try {
      this.adapter = createAdapter(options.cli);
      this.adapter.onOutput(this.sink);
      await this.adapter.startSession(options);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sink({ kind: 'error', message });
      return { ok: false, error: message };
    }
  }

  async send(message: string): Promise<void> {
    if (!this.adapter) {
      this.sink({ kind: 'error', message: 'no active session' });
      return;
    }
    await this.adapter.sendMessage(message);
  }

  async interrupt(): Promise<void> {
    await this.adapter?.interrupt();
  }

  async stop(): Promise<void> {
    if (this.adapter) {
      await this.adapter.stopSession();
      this.adapter = null;
    }
  }

  status(): AgentSessionStatus {
    return this.adapter?.getStatus() ?? 'idle';
  }
}
