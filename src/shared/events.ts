// Event and message schemas — deliverable #4.
// Two layers live here:
//   1. AgentOutputEvent — the CLI-agnostic event an adapter emits. Every
//      backend (Claude Code, Codex, mock) normalizes its native output into
//      this shape, so nothing downstream needs to know which CLI is running.
//   2. AppEventName — the orchestrator's event-bus names (from the brief),
//      used to coordinate the five systems.

import type {
  AgentSessionStatus,
  CapabilityReport,
  WorkActivity,
} from './types';

/** Labels every message in the conversation transcript carries. */
export type MessageSource =
  | 'Human'
  | 'AI Partner'
  | 'System'
  | 'CLI Activity'
  | 'World Action'
  | 'Permission Request'
  | 'Error';

/**
 * Normalized, CLI-agnostic events emitted by an AgentSessionAdapter.
 * A discriminated union on `kind` so consumers can switch exhaustively.
 */
export type AgentOutputEvent =
  | {
      kind: 'session-started';
      sessionId: string;
      cwd: string;
      model?: string;
      capability: CapabilityReport;
    }
  | { kind: 'status'; status: AgentSessionStatus; detail?: string }
  /** Model reasoning text — shown as a subtle indicator, never spoken aloud. */
  | { kind: 'thinking-delta'; text: string }
  /** Streamed assistant text — the words that go to the transcript and TTS. */
  | { kind: 'assistant-delta'; text: string }
  /** A completed assistant text block (full snapshot). */
  | { kind: 'assistant-message'; text: string }
  /** A tool starting/finishing — drives the work-activity indicator. */
  | {
      kind: 'tool-activity';
      tool: string;
      phase: 'start' | 'end';
      activity: WorkActivity;
      summary?: string;
    }
  /** A sensitive action awaiting the human's approval. */
  | {
      kind: 'permission-request';
      id: string;
      tool?: string;
      command?: string;
      raw: unknown;
    }
  /** End of a turn, with cost/duration accounting. */
  | {
      kind: 'result';
      text: string;
      costUsd?: number;
      durationMs?: number;
      numTurns?: number;
      isError: boolean;
    }
  /** Raw stdout/terminal passthrough — feeds the terminal drawer, kept
   *  separate from the cleaned conversation transcript. */
  | { kind: 'raw'; data: string }
  | { kind: 'error'; message: string }
  | { kind: 'exit'; code: number };

/** Orchestrator event-bus names (from the brief). */
export type AppEventName =
  | 'human.message.created'
  | 'human.message.sent'
  | 'human.avatar.moved'
  | 'agent.session.started'
  | 'agent.output.chunk'
  | 'agent.message.completed'
  | 'agent.activity.changed'
  | 'agent.permission.requested'
  | 'agent.world_action.requested'
  | 'agent.world_action.completed'
  | 'agent.world_action.rejected'
  | 'speech.transcription.started'
  | 'speech.transcription.completed'
  | 'session.saved'
  | 'session.restored';

/** IPC channel names bridged renderer <-> main (see preload). */
export const IpcChannels = {
  // renderer -> main (invoke)
  sessionStart: 'session:start',
  sessionSend: 'session:send',
  sessionInterrupt: 'session:interrupt',
  sessionStop: 'session:stop',
  sessionResize: 'session:resize',
  sessionStatus: 'session:status',
  permissionRespond: 'permission:respond',
  detectClis: 'clis:detect',
  pickDirectory: 'dialog:pick-directory',
  // main -> renderer (event stream)
  agentEvent: 'agent:event',
} as const;
