// The AgentSessionAdapter contract — deliverable #5.
// This is the seam that keeps the world decoupled from any specific CLI.
// Every backend implements exactly this interface; the orchestrator and the
// world never call a CLI directly.

import type { AgentOutputEvent } from '../../shared/events';
import type {
  AgentSessionStatus,
  CapabilityReport,
  CliKind,
  SessionOptions,
} from '../../shared/types';

export interface AgentSessionAdapter {
  /** Which backend this adapter drives. */
  readonly kind: CliKind;

  /** Start an interactive session in the given working directory. */
  startSession(options: SessionOptions): Promise<void>;

  /** Send one human message into the live session. */
  sendMessage(message: string): Promise<void>;

  /** Resize the underlying terminal (pty transport only; no-op otherwise). */
  resizeTerminal(columns: number, rows: number): void;

  /** Interrupt the current turn without necessarily ending the session. */
  interrupt(): Promise<void>;

  /** Tear the session down. */
  stopSession(): Promise<void>;

  /** Subscribe to normalized output events. */
  onOutput(callback: (event: AgentOutputEvent) => void): void;

  /** Current conversational/lifecycle status. */
  getStatus(): AgentSessionStatus;

  /** Detected capabilities, or null before the session has started. */
  getCapability(): CapabilityReport | null;
}

/**
 * Small shared base: manages the listener list, status, and capability so the
 * concrete adapters only implement transport-specific logic.
 */
export abstract class BaseAgentAdapter implements AgentSessionAdapter {
  abstract readonly kind: CliKind;

  private listeners: Array<(event: AgentOutputEvent) => void> = [];
  protected status: AgentSessionStatus = 'idle';
  protected capability: CapabilityReport | null = null;

  abstract startSession(options: SessionOptions): Promise<void>;
  abstract sendMessage(message: string): Promise<void>;
  abstract interrupt(): Promise<void>;
  abstract stopSession(): Promise<void>;

  resizeTerminal(_columns: number, _rows: number): void {
    // Default no-op; the pty transport overrides this.
  }

  onOutput(callback: (event: AgentOutputEvent) => void): void {
    this.listeners.push(callback);
  }

  getStatus(): AgentSessionStatus {
    return this.status;
  }

  getCapability(): CapabilityReport | null {
    return this.capability;
  }

  /** Emit a normalized event to all subscribers. */
  protected emit(event: AgentOutputEvent): void {
    if (event.kind === 'status') this.status = event.status;
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        // A bad listener must never break the stream.
        console.error('[adapter] listener threw:', err);
      }
    }
  }

  protected setStatus(status: AgentSessionStatus, detail?: string): void {
    this.emit({ kind: 'status', status, detail });
  }
}
