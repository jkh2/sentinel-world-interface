// MockAgentAdapter — a scripted backend so the entire world (movement, camera,
// avatars, conversation UI, world-actions) can be built and demoed WITHOUT
// invoking a live AI service. Deterministic, offline, free.
//
// It streams a canned reply token-by-token, simulates a tool-activity, and —
// when the human's message contains a trigger word — raises a permission
// request so the permission panel can be exercised end to end.

import { BaseAgentAdapter } from './AgentSessionAdapter';
import { mockCapability } from './capability';
import type { CliKind, SessionOptions } from '../../shared/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockAgentAdapter extends BaseAgentAdapter {
  readonly kind: CliKind = 'mock';
  private turn = 0;
  private cwd = '';

  async startSession(options: SessionOptions): Promise<void> {
    this.cwd = options.cwd;
    this.capability = mockCapability();
    this.setStatus('starting');
    await sleep(50);
    this.emit({
      kind: 'session-started',
      sessionId: `mock-${Date.now()}`,
      cwd: options.cwd,
      model: 'mock-1',
      capability: this.capability,
    });
    this.setStatus('ready');
  }

  async sendMessage(message: string): Promise<void> {
    this.turn += 1;

    this.setStatus('thinking');
    await sleep(120);

    // Keyword-driven world actions, so avatar movement can be tested offline.
    const m = message.toLowerCase();
    if (/\b(come|here|follow)\b/.test(m)) this.emit({ kind: 'world-action', action: { action: 'follow_human' } });
    else if (/\bpond\b/.test(m)) this.emit({ kind: 'world-action', action: { action: 'walk_to', target: 'pond_edge' } });
    else if (/\bbench\b/.test(m)) this.emit({ kind: 'world-action', action: { action: 'walk_to', target: 'bench_north' } });
    else if (/\bpavilion\b/.test(m)) this.emit({ kind: 'world-action', action: { action: 'walk_to', target: 'pavilion_center' } });
    if (/\bsit\b/.test(m)) this.emit({ kind: 'world-action', action: { action: 'sit' } });
    if (/\bstand\b/.test(m)) this.emit({ kind: 'world-action', action: { action: 'stand' } });
    if (/\bstop\b/.test(m)) this.emit({ kind: 'world-action', action: { action: 'stop' } });
    if (/\b(wave|hi|hello|hey)\b/.test(m)) this.emit({ kind: 'world-action', action: { action: 'wave' } });

    // Simulate a permission request when asked to do something sensitive.
    if (/\b(delete|remove|rm|force|push)\b/i.test(message)) {
      this.setStatus('waiting-permission');
      this.emit({
        kind: 'permission-request',
        id: `mock-perm-${this.turn}`,
        tool: 'Bash',
        command: `# simulated sensitive action from: "${message}"`,
        raw: { simulated: true, message },
      });
      // Wait for a response would be wired via respondToPermission(); for the
      // mock we simply continue after a beat.
      await sleep(150);
    }

    // Simulate reading the project.
    this.emit({
      kind: 'tool-activity',
      tool: 'Read',
      phase: 'start',
      activity: 'Reading files',
      summary: `inspecting ${this.cwd}`,
    });
    await sleep(120);
    this.emit({ kind: 'tool-activity', tool: 'Read', phase: 'end', activity: 'Completed' });

    // Stream a reply token by token.
    this.setStatus('streaming');
    const reply = `You said: "${message}". I'm the mock partner — the world is fully wired even though no live model ran. (turn ${this.turn})`;
    for (const token of reply.split(/(\s+)/)) {
      this.emit({ kind: 'assistant-delta', text: token });
      await sleep(15);
    }
    this.emit({ kind: 'assistant-message', text: reply });
    this.emit({
      kind: 'result',
      text: reply,
      costUsd: 0,
      durationMs: 500,
      numTurns: this.turn,
      isError: false,
    });
    this.setStatus('ready');
  }

  async interrupt(): Promise<void> {
    this.setStatus('interrupted');
  }

  async stopSession(): Promise<void> {
    this.setStatus('stopped');
  }
}
