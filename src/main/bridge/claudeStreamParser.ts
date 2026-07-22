// Parser for Claude Code's `--output-format stream-json` NDJSON stream.
// Built from the REAL event shapes captured off claude-code 2.1.217, not from
// a guessed schema. Translates native events into normalized AgentOutputEvents.
//
// Captured event families we handle:
//   system/init          -> session-started (with detected capability)
//   system/status        -> status (e.g. "requesting" => thinking)
//   stream_event:
//     content_block_start  thinking|text|tool_use  -> status / tool-activity
//     content_block_delta  thinking_delta           -> thinking-delta
//                          text_delta               -> assistant-delta (spoken)
//                          signature_delta          -> ignored
//     content_block_stop   (tool_use)               -> tool-activity end
//   assistant            -> assistant-message (finalized text block)
//   result               -> result (text, cost, duration, isError)
//   (defensive) anything mentioning permission -> permission-request

import type { AgentOutputEvent } from '../../shared/events';
import type { CapabilityReport, WorkActivity } from '../../shared/types';

/** Map a Claude tool name to the human-facing work-activity label. */
export function toolToActivity(tool: string): WorkActivity {
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
    case 'RemoteTrigger':
      return 'Running command';
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'Editing files';
    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'WebFetch':
    case 'WebSearch':
      return 'Reading files';
    case 'Task':
      return 'Thinking';
    default:
      return 'Running command';
  }
}

let permissionCounter = 0;

export class ClaudeStreamParser {
  /** index -> content-block type, for the message currently streaming. */
  private blockTypes = new Map<number, string>();

  constructor(
    private capability: CapabilityReport,
    private emit: (event: AgentOutputEvent) => void,
  ) {}

  /** Feed one parsed JSON object from the stream. */
  push(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    // Defensive permission detection (exact shape TBD against a tool prompt).
    if (this.looksLikePermission(obj)) {
      this.emit({
        kind: 'permission-request',
        id: `perm-${++permissionCounter}`,
        tool: obj?.tool_name ?? obj?.request?.tool_name,
        command: obj?.command ?? obj?.request?.command,
        raw: obj,
      });
      return;
    }

    switch (obj.type) {
      case 'system':
        return this.handleSystem(obj);
      case 'stream_event':
        return this.handleStreamEvent(obj.event);
      case 'assistant':
        return this.handleAssistantSnapshot(obj.message);
      case 'result':
        return this.emit({
          kind: 'result',
          text: typeof obj.result === 'string' ? obj.result : '',
          costUsd: obj.total_cost_usd,
          durationMs: obj.duration_ms,
          numTurns: obj.num_turns,
          isError: !!obj.is_error,
        });
      default:
        return; // rate_limit_event and others: ignore for MVP
    }
  }

  private handleSystem(obj: any): void {
    if (obj.subtype === 'init') {
      this.emit({
        kind: 'session-started',
        sessionId: obj.session_id,
        cwd: obj.cwd,
        model: obj.model,
        capability: this.capability,
      });
      this.emit({ kind: 'status', status: 'ready' });
    } else if (obj.subtype === 'status') {
      if (obj.status === 'requesting') {
        this.emit({ kind: 'status', status: 'thinking' });
      }
    }
    // system/thinking_tokens: ignored (thinking-delta already conveys it)
  }

  private handleStreamEvent(event: any): void {
    if (!event) return;
    switch (event.type) {
      case 'message_start':
        this.blockTypes.clear();
        return;
      case 'content_block_start': {
        const t = event.content_block?.type;
        this.blockTypes.set(event.index, t);
        if (t === 'thinking') {
          this.emit({ kind: 'status', status: 'thinking' });
        } else if (t === 'text') {
          this.emit({ kind: 'status', status: 'streaming' });
        } else if (t === 'tool_use') {
          const tool = event.content_block?.name ?? 'tool';
          this.emit({
            kind: 'tool-activity',
            tool,
            phase: 'start',
            activity: toolToActivity(tool),
          });
          this.emit({ kind: 'status', status: 'working' });
        }
        return;
      }
      case 'content_block_delta': {
        const d = event.delta;
        if (!d) return;
        if (d.type === 'thinking_delta' && d.thinking) {
          this.emit({ kind: 'thinking-delta', text: d.thinking });
        } else if (d.type === 'text_delta' && d.text) {
          this.emit({ kind: 'assistant-delta', text: d.text });
        }
        // signature_delta / input_json_delta: ignored for MVP
        return;
      }
      case 'content_block_stop': {
        const t = this.blockTypes.get(event.index);
        if (t === 'tool_use') {
          this.emit({
            kind: 'tool-activity',
            tool: 'tool',
            phase: 'end',
            activity: 'Completed',
          });
        }
        return;
      }
      default:
        return;
    }
  }

  private handleAssistantSnapshot(message: any): void {
    if (!message?.content) return;
    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        this.emit({ kind: 'assistant-message', text: block.text });
      }
    }
  }

  private looksLikePermission(obj: any): boolean {
    const t = String(obj?.type ?? '');
    const s = String(obj?.subtype ?? '');
    return (
      t.includes('permission') ||
      s.includes('permission') ||
      obj?.type === 'can_use_tool' ||
      (obj?.type === 'control_request' &&
        String(obj?.request?.subtype ?? '').includes('permission'))
    );
  }
}
