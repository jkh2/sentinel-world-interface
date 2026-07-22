// ClaudeCodeAdapter — the primary, real backend.
//
// Transport: a single long-running `claude` process in stream-json DUPLEX mode
// (--input-format stream-json --output-format stream-json). One process holds
// one conversation; each human message is written to stdin as an NDJSON user
// line, and structured events stream back on stdout. This is the "structured
// output, not screen scraping" path the brief asks for, verified against
// claude-code 2.1.217.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { BaseAgentAdapter } from './AgentSessionAdapter';
import { ClaudeStreamParser } from './claudeStreamParser';
import { detectClaudeCapability } from './capability';
import type { CliKind, SessionOptions } from '../../shared/types';

export class ClaudeCodeAdapter extends BaseAgentAdapter {
  readonly kind: CliKind = 'claude-code';

  private child: ChildProcessWithoutNullStreams | null = null;
  private parser: ClaudeStreamParser | null = null;
  private stdoutBuffer = '';
  private lastSessionId: string | null = null;

  async startSession(options: SessionOptions): Promise<void> {
    const capability = await detectClaudeCapability();
    if (!capability) {
      this.setStatus('error', 'claude CLI not found on PATH');
      this.emit({ kind: 'error', message: 'claude CLI not found on PATH' });
      return;
    }
    this.capability = capability;

    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
    ];
    if (options.model) args.push('--model', options.model);
    if (options.resume) args.push('--resume', options.resume);
    // Permission posture: pass through only what was asked for; never inject a
    // bypass mode ourselves. Default = Claude's normal prompting.
    if (options.permissionMode && options.permissionMode !== 'default') {
      args.push('--permission-mode', options.permissionMode);
    }

    const cmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    this.setStatus('starting');

    this.child = spawn(cmd, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      windowsHide: true,
      // Node >=20.12 requires shell:true to launch a Windows .cmd shim.
      // Safe here: all args are fixed flags/ids; human text goes over stdin.
      shell: process.platform === 'win32',
    }) as ChildProcessWithoutNullStreams;

    this.parser = new ClaudeStreamParser(capability, (event) => {
      if (event.kind === 'session-started') this.lastSessionId = event.sessionId;
      this.emit(event);
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onStdout(chunk));

    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => {
      // stderr is diagnostic noise; surface to the terminal drawer, not chat.
      this.emit({ kind: 'raw', data: chunk });
    });

    this.child.on('error', (err) => {
      this.setStatus('error', err.message);
      this.emit({ kind: 'error', message: err.message });
    });

    this.child.on('exit', (code) => {
      this.setStatus('stopped');
      this.emit({ kind: 'exit', code: code ?? 0 });
      this.child = null;
    });
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let nl: number;
    while ((nl = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, nl).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        this.parser?.push(obj);
      } catch {
        // Non-JSON line (rare) — pass through raw for auditing.
        this.emit({ kind: 'raw', data: line + '\n' });
      }
    }
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.child || !this.child.stdin.writable) {
      this.emit({ kind: 'error', message: 'no live session to send to' });
      return;
    }
    const line =
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: message }] },
      }) + '\n';
    this.child.stdin.write(line);
  }

  async interrupt(): Promise<void> {
    // MVP interrupt is coarse: signal the process to stop the current turn.
    // The session id is retained so a future startSession({ resume }) can
    // continue where it left off. A finer interrupt using the CLI's
    // interrupt_receipt_v1 control message is a documented follow-up.
    if (this.child) {
      this.setStatus('interrupted');
      this.child.kill('SIGINT');
    }
  }

  async stopSession(): Promise<void> {
    if (this.child) {
      try {
        this.child.stdin.end();
      } catch {
        /* ignore */
      }
      this.child.kill();
      this.child = null;
    }
    this.setStatus('stopped');
  }

  /** Session id of the most recent session, for resume. */
  getLastSessionId(): string | null {
    return this.lastSessionId;
  }
}
