// Capability detection — never assume, detect. Runs the installed CLI to read
// its real version, then reports the capabilities we verified empirically off
// claude-code 2.1.217 and codex-cli 0.145.0 (see docs/architecture.md).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CapabilityReport, CliKind } from '../../shared/types';

const execFileAsync = promisify(execFile);

function cliBinary(kind: 'claude-code' | 'codex'): string {
  const win = process.platform === 'win32';
  if (kind === 'claude-code') return win ? 'claude.cmd' : 'claude';
  return win ? 'codex.cmd' : 'codex';
}

async function readVersion(kind: 'claude-code' | 'codex'): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cliBinary(kind), ['--version'], {
      timeout: 10_000,
      // Node >=20.12 requires shell:true to launch a Windows .cmd shim.
      shell: process.platform === 'win32',
    });
    const m = stdout.match(/\d+\.\d+\.\d+/);
    return m ? m[0] : stdout.trim();
  } catch {
    return null; // not installed / not on PATH
  }
}

export async function detectClaudeCapability(): Promise<CapabilityReport | null> {
  const version = await readVersion('claude-code');
  if (!version) return null;
  // Verified against 2.1.217: full stream-json duplex, session resume,
  // MCP support, permission-mode control. Permission *events* are partial
  // (structured but the exact prompt shape is still being mapped).
  return {
    cli: 'claude-code',
    version,
    interactivePty: true,
    structuredOutput: true,
    sessionResume: true,
    mcpAvailable: true,
    permissionEvents: 'partial',
  };
}

export async function detectCodexCapability(): Promise<CapabilityReport | null> {
  const version = await readVersion('codex');
  if (!version) return null;
  // Verified against 0.145.0: `codex exec` non-interactive + `codex exec
  // resume` + `codex mcp-server`. Structured event schema not yet mapped, so
  // structuredOutput/permissionEvents are conservatively reported.
  return {
    cli: 'codex',
    version,
    interactivePty: true,
    structuredOutput: false,
    sessionResume: true,
    mcpAvailable: true,
    permissionEvents: 'none',
  };
}

export function mockCapability(): CapabilityReport {
  return {
    cli: 'mock',
    version: '0.1.0',
    interactivePty: false,
    structuredOutput: true,
    sessionResume: false,
    mcpAvailable: false,
    permissionEvents: 'full',
  };
}

export async function detectAll(): Promise<Record<CliKind, CapabilityReport | null>> {
  const [claude, codex] = await Promise.all([
    detectClaudeCapability(),
    detectCodexCapability(),
  ]);
  return { 'claude-code': claude, codex, mock: mockCapability() };
}
