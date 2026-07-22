// Adapter factory — the one place that knows about all concrete backends.

import type { AgentSessionAdapter } from './AgentSessionAdapter';
import { ClaudeCodeAdapter } from './ClaudeCodeAdapter';
import { CodexCliAdapter } from './CodexCliAdapter';
import { MockAgentAdapter } from './MockAgentAdapter';
import type { CliKind } from '../../shared/types';

export function createAdapter(kind: CliKind): AgentSessionAdapter {
  switch (kind) {
    case 'claude-code':
      return new ClaudeCodeAdapter();
    case 'codex':
      return new CodexCliAdapter();
    case 'mock':
      return new MockAgentAdapter();
    default:
      throw new Error(`unknown CLI kind: ${kind}`);
  }
}

export type { AgentSessionAdapter } from './AgentSessionAdapter';
export { detectAll } from './capability';
