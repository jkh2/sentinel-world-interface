// One-shot: prove the LIVE agent emits a valid world-action through the
// append-system-prompt protocol and that our parser extracts it.
// Run: RUN_LIVE=1 npx tsx scripts/test-worldaction.ts

import os from 'node:os';
import { createAdapter } from '../src/main/bridge/index';
import type { AgentOutputEvent } from '../src/shared/events';

async function main(): Promise<void> {
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
  await adapter.sendMessage(
    'Your partner is standing by the pond. Walk over to the pond edge and give a wave hello. Keep your spoken reply to one short sentence.',
  );
  await Promise.race([done, new Promise((r) => setTimeout(r, 60_000))]);
  await adapter.stopSession();

  const worldActions = events.filter((e) => e.kind === 'world-action');
  const spoken = events.find((e) => e.kind === 'result') as
    | Extract<AgentOutputEvent, { kind: 'result' }>
    | undefined;

  console.log('world-actions emitted:', JSON.stringify(worldActions, null, 2));
  console.log('spoken (cleaned):', spoken?.text);
  console.log(worldActions.length > 0 ? '\nPASS — live agent moved its avatar' : '\nNO ACTION — model did not emit an envelope');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
