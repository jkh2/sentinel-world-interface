// Shared type vocabulary for the whole application.
// These types cross the main <-> preload <-> renderer boundary, so they must
// stay free of any Node or Electron imports.

/** Which agent backend a session is bound to. */
export type CliKind = 'claude-code' | 'codex' | 'mock';

/** Every conversational backend, including public-edition API providers. */
export type AgentBackendKind = CliKind | 'generic-llm';

/** Options for starting an agent session. */
export interface SessionOptions {
  cli: CliKind;
  /** Working directory the agent operates in. The security boundary of the app. */
  cwd: string;
  /** Terminal geometry (used by the pty transport / raw terminal drawer). */
  cols?: number;
  rows?: number;
  /** Optional explicit model id. */
  model?: string;
  /** Extra environment variables merged over the parent process env. */
  env?: Record<string, string>;
  /** Session id to resume, when the CLI supports it. */
  resume?: string;
  /** Permission posture. Never defaults to a bypass mode. */
  permissionMode?: 'default' | 'manual' | 'acceptEdits' | 'bypassPermissions';
}

/**
 * High-level lifecycle/activity status of an agent session.
 * Distinct from WorkActivity (which describes *what* the agent is doing);
 * this describes the session's conversational state.
 */
export type AgentSessionStatus =
  | 'idle' // no live session
  | 'starting'
  | 'ready' // session up, awaiting the human's input
  | 'thinking' // model is reasoning
  | 'streaming' // producing a response
  | 'working' // running a tool
  | 'waiting-permission'
  | 'waiting-input'
  | 'interrupted'
  | 'stopped'
  | 'error';

/**
 * The visible "what is the agent doing" state, surfaced above the AI avatar.
 * Kept as a closed set so the world client can map each to an animation/label.
 */
export type WorkActivity =
  | 'Listening'
  | 'Thinking'
  | 'Reading files'
  | 'Editing files'
  | 'Running command'
  | 'Running tests'
  | 'Waiting for permission'
  | 'Waiting for user'
  | 'Completed'
  | 'Interrupted'
  | 'Error';

/**
 * Runtime capability report for an adapter. Populated by DETECTING what the
 * installed CLI actually supports — never assumed. Mirrors the brief's
 * capability JSON so the UI can adapt (e.g. hide structured-permission UI
 * when permissionEvents is 'none').
 */
export interface CapabilityReport {
  cli: AgentBackendKind;
  version: string;
  /** Can be driven through an interactive pseudoterminal. */
  interactivePty: boolean;
  /** Emits structured (JSON) events rather than only screen output. */
  structuredOutput: boolean;
  /** Supports resuming a prior session by id. */
  sessionResume: boolean;
  /** Exposes MCP servers / tools. */
  mcpAvailable: boolean;
  /** How well permission prompts can be observed as discrete events. */
  permissionEvents: 'full' | 'partial' | 'none';
}
