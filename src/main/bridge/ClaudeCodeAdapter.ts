// ClaudeCodeAdapter — the primary, real backend.
//
// Transport: a single long-running `claude` process in stream-json DUPLEX mode
// (--input-format stream-json --output-format stream-json). One process holds
// one conversation; each human message is written to stdin as an NDJSON user
// line, and structured events stream back on stdout. This is the "structured
// output, not screen scraping" path the brief asks for, verified against
// claude-code 2.1.217.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { BaseAgentAdapter } from './AgentSessionAdapter';
import { ClaudeStreamParser } from './claudeStreamParser';
import { detectClaudeCapability } from './capability';
import { worldProtocolPrompt } from '../../shared/worldActions';
import { COMPANION_SYSTEM_PROMPT } from './worldCognitionContract';
import type { CliKind, SessionOptions } from '../../shared/types';

const WORLD_MCP_SERVER_NAME = 'sidlf-world';

export class ClaudeCodeAdapter extends BaseAgentAdapter {
  readonly kind: CliKind = 'claude-code';

  private child: ChildProcessWithoutNullStreams | null = null;
  private parser: ClaudeStreamParser | null = null;
  private stdoutBuffer = '';
  private lastSessionId: string | null = null;
  private worldBridgePort: number | null = null;
  private mcpConfigDir: string | null = null;

  /** Called by SessionManager once the local world bridge is listening. Gives
   *  a real live session the same eyes+hands any other tool call gets, via
   *  world-action MCP tools rather than the fragile text-envelope fallback. */
  configureWorldBridge(port: number): void {
    this.worldBridgePort = port;
  }

  async startSession(options: SessionOptions): Promise<void> {
    const capability = await detectClaudeCapability();
    if (!capability) {
      this.setStatus('error', 'claude CLI not found on PATH');
      this.emit({ kind: 'error', message: 'claude CLI not found on PATH' });
      return;
    }
    this.capability = capability;

    // Prefer real MCP tools (eyes + hands, same shape as any other tool
    // call) when the world bridge is up; fall back to the text-envelope
    // protocol only when no bridge port was configured (e.g. not a game
    // session at all).
    const mcpConfigPath = this.worldBridgePort
      ? await this.writeMcpConfig(this.worldBridgePort)
      : null;
    const systemPrompt = mcpConfigPath
      ? `${COMPANION_SYSTEM_PROMPT}\nCall get_world_observation whenever you need fresh eyes on the world before deciding what to do.`
      : worldProtocolPrompt();

    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--append-system-prompt',
      systemPrompt,
    ];
    if (mcpConfigPath) {
      // Strict: this session only gets the world-action tools, never
      // whatever unrelated MCP servers a project-level .mcp.json might add.
      args.push('--mcp-config', mcpConfigPath, '--strict-mcp-config');
    }
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
      void this.cleanupMcpConfig();
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
    await this.cleanupMcpConfig();
    this.setStatus('stopped');
  }

  /** Session id of the most recent session, for resume. */
  getLastSessionId(): string | null {
    return this.lastSessionId;
  }

  /**
   * Writes a temp --mcp-config JSON pointing at the world-action MCP server,
   * with the local bridge port passed through its env. Dev-time invocation
   * only (via tsx, same as the project's existing test scripts) — a
   * deliberate, named scope boundary; packaging is a later concern.
   */
  private async writeMcpConfig(port: number): Promise<string> {
    const projectRoot = app.getAppPath();
    const tsxBin = join(
      projectRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
    );
    const serverScript = join(projectRoot, 'scripts', 'world-mcp-server.ts');

    this.mcpConfigDir = await mkdtemp(join(tmpdir(), 'sidlf-mcp-'));
    const configPath = join(this.mcpConfigDir, 'mcp-config.json');
    const config = {
      mcpServers: {
        [WORLD_MCP_SERVER_NAME]: {
          command: tsxBin,
          args: [serverScript],
          env: { WORLD_BRIDGE_PORT: String(port) },
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return configPath;
  }

  private async cleanupMcpConfig(): Promise<void> {
    const dir = this.mcpConfigDir;
    this.mcpConfigDir = null;
    if (!dir) return;
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}
