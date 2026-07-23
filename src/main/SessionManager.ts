// SessionManager — the orchestrator's single owner of the live agent session.
// Holds at most one adapter, routes IPC calls to it, and forwards every
// normalized event to the renderer through the provided sink.

import { createAdapter, type AgentSessionAdapter } from './bridge/index';
import { WorldBridge } from './WorldBridge';
import type { WorldObservation } from './bridge/worldCognitionContract';
import type { WorldAction } from '../shared/worldActions';
import type { AgentOutputEvent } from '../shared/events';
import type { AgentSessionStatus, SessionOptions } from '../shared/types';

/** Optional capability: only ClaudeCodeAdapter implements this today. Kept
 *  off the base AgentSessionAdapter interface, same pattern as the generic
 *  bridge's AutonomousCognitiveTurnRunner duck-typing. */
interface WorldBridgeConfigurable {
  configureWorldBridge(port: number): void;
}

function supportsWorldBridge(adapter: AgentSessionAdapter): adapter is AgentSessionAdapter & WorldBridgeConfigurable {
  return typeof (adapter as Partial<WorldBridgeConfigurable>).configureWorldBridge === 'function';
}

export class SessionManager {
  private adapter: AgentSessionAdapter | null = null;
  private latestObservation: WorldObservation | null = null;
  private worldBridge: WorldBridge | null = null;

  constructor(private readonly sink: (event: AgentOutputEvent) => void) {}

  async start(options: SessionOptions): Promise<{ ok: boolean; error?: string }> {
    await this.stop();
    try {
      this.adapter = createAdapter(options.cli);
      this.adapter.onOutput(this.sink);

      if (supportsWorldBridge(this.adapter)) {
        const bridge = new WorldBridge({
          getObservation: () => this.latestObservation,
          onAction: (action: WorldAction) => this.sink({ kind: 'world-action', action }),
        });
        const port = await bridge.start();
        this.worldBridge = bridge;
        this.adapter.configureWorldBridge(port);
      }

      await this.adapter.startSession(options);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sink({ kind: 'error', message });
      return { ok: false, error: message };
    }
  }

  /** Cache the latest live observation; forward to the adapter if it consumes one directly. */
  setObservation(observation: WorldObservation): void {
    this.latestObservation = observation;
    const withObservation = this.adapter as Partial<{ setObservation(o: WorldObservation | null): void }> | null;
    if (typeof withObservation?.setObservation === 'function') {
      withObservation.setObservation(observation);
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
    if (this.worldBridge) {
      await this.worldBridge.stop();
      this.worldBridge = null;
    }
  }

  status(): AgentSessionStatus {
    return this.adapter?.getStatus() ?? 'idle';
  }
}
