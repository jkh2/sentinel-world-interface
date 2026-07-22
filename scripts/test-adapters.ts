// Headless test harness for the operational engine (systems 3 + 5).
// Proves the adapter layer works WITHOUT any Electron window, so the reliable
// real-agent path can be verified independently of the 3D UI.
//
// Run:   npx tsx scripts/test-adapters.ts
//   - Always runs the MockAgent suite (offline, deterministic, free).
//   - Runs the live Claude round-trip only with RUN_LIVE=1 (spends API credit).
//
//   RUN_LIVE=1 npx tsx scripts/test-adapters.ts

import os from 'node:os';
import { createAdapter } from '../src/main/bridge/index';
import type { AgentOutputEvent } from '../src/shared/events';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
}

async function testMock(): Promise<void> {
  console.log('\n[MockAgent] offline, deterministic');
  const adapter = createAdapter('mock');
  const events: AgentOutputEvent[] = [];
  adapter.onOutput((e) => events.push(e));

  await adapter.startSession({ cli: 'mock', cwd: os.tmpdir() });
  await adapter.sendMessage('hello partner');
  await adapter.sendMessage('please delete the old logs'); // triggers permission
  await adapter.stopSession();

  const kinds = events.map((e) => e.kind);
  check('emitted session-started', kinds.includes('session-started'));
  check('streamed assistant-delta tokens', kinds.filter((k) => k === 'assistant-delta').length > 3);
  check('emitted a result', kinds.includes('result'));
  check('raised a permission-request on "delete"', kinds.includes('permission-request'));

  const assembled = events
    .filter((e): e is Extract<AgentOutputEvent, { kind: 'assistant-delta' }> => e.kind === 'assistant-delta')
    .map((e) => e.text)
    .join('');
  check('assembled reply echoes the message', assembled.includes('hello partner'));
}

async function testClaudeLive(): Promise<void> {
  console.log('\n[ClaudeCode] LIVE round-trip (RUN_LIVE=1)');
  const adapter = createAdapter('claude-code');
  const events: AgentOutputEvent[] = [];
  adapter.onOutput((e) => events.push(e));

  const done = new Promise<void>((resolve) => {
    adapter.onOutput((e) => {
      if (e.kind === 'result') resolve();
    });
  });

  await adapter.startSession({
    cli: 'claude-code',
    cwd: os.tmpdir(),
    model: 'claude-haiku-4-5-20251001',
  });
  await adapter.sendMessage('Reply with exactly the single word: PARK');
  await Promise.race([done, new Promise((r) => setTimeout(r, 60_000))]);
  await adapter.stopSession();

  const kinds = events.map((e) => e.kind);
  console.log(`    event kinds: ${kinds.join(', ') || '(none)'}`);
  const errEvt = events.find((e) => e.kind === 'error');
  if (errEvt) console.log(`    error: ${(errEvt as any).message}`);
  check('emitted session-started', kinds.includes('session-started'));
  check('streamed assistant-delta from real model', kinds.includes('assistant-delta'));
  const result = events.find((e) => e.kind === 'result') as
    | Extract<AgentOutputEvent, { kind: 'result' }>
    | undefined;
  check('got a result event', !!result);
  check('result contains PARK', !!result && /PARK/i.test(result.text));
  if (result?.costUsd !== undefined) console.log(`    (live cost: $${result.costUsd})`);
}

async function main(): Promise<void> {
  await testMock();
  if (process.env.RUN_LIVE === '1') {
    await testClaudeLive();
  } else {
    console.log('\n[ClaudeCode] live test skipped (set RUN_LIVE=1 to run — spends credit)');
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('harness error:', err);
  process.exit(1);
});
