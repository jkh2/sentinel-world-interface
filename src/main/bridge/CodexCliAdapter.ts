// CodexCliAdapter — a real but minimal second backend.
//
// codex-cli 0.145.0 exposes `codex exec` (non-interactive, reads the prompt
// from stdin) and `codex exec resume --last` for session continuity. This MVP
// runs one `codex exec` per human message and streams its stdout back as
// assistant text. Codex's structured-event schema is not yet mapped (the same
// capture-first work done for Claude is a documented follow-up), so this
// adapter reports structuredOutput:false and treats output as plain text.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { BaseAgentAdapter } from './AgentSessionAdapter';
import { detectCodexCapability } from './capability';
import type { CliKind, SessionOptions } from '../../shared/types';

export class CodexCliAdapter extends BaseAgentAdapter {
  readonly kind: CliKind = 'codex';
  private cwd = '';
  private env: Record<string, string> = {};
  private started = false;
  private child: ChildProcessWithoutNullStreams | null = null;

  async startSession(options: SessionOptions): Promise<void> {
    const capability = await detectCodexCapability();
    if (!capability) {
      this.setStatus('error', 'codex CLI not found on PATH');
      this.emit({ kind: 'error', message: 'codex CLI not found on PATH' });
      return;
    }
    this.capability = capability;
    this.cwd = options.cwd;
    this.env = options.env ?? {};
    this.emit({
      kind: 'session-started',
      sessionId: `codex-${Date.now()}`,
      cwd: options.cwd,
      model: options.model,
      capability,
    });
    this.setStatus('ready');
  }

  async sendMessage(message: string): Promise<void> {
    // First turn: `codex exec`; later turns: `codex exec resume --last`.
    const args = this.started
      ? ['exec', 'resume', '--last', '-']
      : ['exec', '-'];
    this.started = true;

    const cmd = process.platform === 'win32' ? 'codex.cmd' : 'codex';
    this.setStatus('thinking');
    this.child = spawn(cmd, args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      windowsHide: true,
      // Node >=20.12 requires shell:true to launch a Windows .cmd shim.
      shell: process.platform === 'win32',
    }) as ChildProcessWithoutNullStreams;

    // Prompt is delivered on stdin (the `-` argument).
    this.child.stdin.write(message);
    this.child.stdin.end();

    this.setStatus('streaming');
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.emit({ kind: 'raw', data: chunk });
      this.emit({ kind: 'assistant-delta', text: chunk });
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) =>
      this.emit({ kind: 'raw', data: chunk }),
    );
    this.child.on('error', (err) =>
      this.emit({ kind: 'error', message: err.message }),
    );
    await new Promise<void>((resolve) => {
      this.child!.on('exit', (code) => {
        this.emit({
          kind: 'result',
          text: '',
          isError: (code ?? 0) !== 0,
        });
        this.setStatus('ready');
        this.child = null;
        resolve();
      });
    });
  }

  async interrupt(): Promise<void> {
    if (this.child) {
      this.setStatus('interrupted');
      this.child.kill('SIGINT');
    }
  }

  async stopSession(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.setStatus('stopped');
  }
}
