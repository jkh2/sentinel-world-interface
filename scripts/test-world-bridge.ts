// Headless test for the local loopback WorldBridge — the seam between the
// world-action MCP server subprocess and the live game. No Electron window,
// no MCP client, just plain HTTP against a real (ephemeral-port) server.
//
// Run:   npx tsx scripts/test-world-bridge.ts

import { WorldBridge } from '../src/main/WorldBridge';
import type { WorldObservation } from '../src/main/bridge/worldCognitionContract';
import type { WorldAction } from '../src/shared/worldActions';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
}

async function main(): Promise<void> {
  const observation: WorldObservation = {
    schemaVersion: 1,
    observedAt: '2026-07-23T06:00:00.000Z',
    context: { mode: 'outdoor', phase: 'night', light: 'dark' },
    self: { name: 'test-driver', area: 'open valley' },
  };
  const actions: WorldAction[] = [];
  const bridge = new WorldBridge({
    getObservation: () => observation,
    onAction: (action) => actions.push(action),
  });
  const port = await bridge.start();
  const base = `http://127.0.0.1:${port}`;

  console.log('\n[WorldBridge] observation endpoint');
  {
    const res = await fetch(`${base}/observation`);
    const body = await res.json();
    check('GET /observation returns 200', res.status === 200);
    check('GET /observation returns the cached snapshot', body.self?.name === 'test-driver');
  }

  console.log('\n[WorldBridge] valid action forwards and returns ok');
  {
    const res = await fetch(`${base}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'wave' }),
    });
    const body = await res.json();
    check('POST /action returns 200', res.status === 200);
    check('POST /action returns ok:true', body.ok === true);
    check('action was forwarded to onAction', actions.length === 1 && actions[0].action === 'wave');
  }

  console.log('\n[WorldBridge] invalid action is rejected, not forwarded');
  {
    const before = actions.length;
    const res = await fetch(`${base}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'teleport_to_moon' }),
    });
    const body = await res.json();
    check('POST /action with a bogus action returns 400', res.status === 400);
    check('POST /action with a bogus action returns ok:false', body.ok === false);
    check('bogus action never reached onAction', actions.length === before);
  }

  console.log('\n[WorldBridge] malformed JSON is rejected cleanly');
  {
    const res = await fetch(`${base}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    check('malformed body returns 400', res.status === 400);
  }

  console.log('\n[WorldBridge] unknown route returns 404');
  {
    const res = await fetch(`${base}/nonsense`);
    check('unknown route returns 404', res.status === 404);
  }

  await bridge.stop();

  console.log('\n[WorldBridge] stop() actually releases the port');
  {
    let refused = false;
    try {
      await fetch(`${base}/observation`, { signal: AbortSignal.timeout(500) });
    } catch {
      refused = true;
    }
    check('port no longer accepts connections after stop()', refused);
  }

  if (failures === 0) console.log('\nALL PASS\n');
  else {
    console.log(`\n${failures} FAILURE(S)\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('test-world-bridge: fatal error:', err);
  process.exit(1);
});
