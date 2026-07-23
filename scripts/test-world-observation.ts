// Headless test for the WorldObservation producer (Claude's half of the seam).
// Proves the live-state -> observation mapping conforms to Orion's contract and
// its locked conventions, without any Electron window or model call.
//
// Run:   npx tsx scripts/test-world-observation.ts

import { buildWorldObservation, type WorldSnapshot } from '../src/renderer/world/worldObservation';
import { serializeObservation } from '../src/main/bridge/worldCognitionContract';
import { NAV_POINTS, navPoint } from '../src/renderer/world/navPoints';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
}
const near = (a: number, b: number, eps = 0.6): boolean => Math.abs(a - b) <= eps;

// A baseline snapshot: companion at spawn_agent, human a few blocks away.
function baseSnapshot(over: Partial<WorldSnapshot> = {}): WorldSnapshot {
  const sa = navPoint('spawn_agent')!;
  return {
    now: new Date('2026-07-23T06:00:00.000Z'),
    self: { x: sa.x + 0.5, z: sa.z + 0.5, facingRad: 0 },
    human: { x: sa.x + 0.5, z: sa.z + 6.5, health: 80 },
    phase: 'Night',
    zombies: [],
    ...over,
  };
}

console.log('\n[WorldObservation] conforms to the contract');
{
  const o = buildWorldObservation(baseSnapshot());
  check('schemaVersion is 1', o.schemaVersion === 1);
  check('observedAt is ISO', !Number.isNaN(Date.parse(o.observedAt)));
  check('context.mode outdoor', o.context.mode === 'outdoor');
  check('night maps to phase night / light dark', o.context.phase === 'night' && o.context.light === 'dark');
  check('self.area is a string', typeof o.self.area === 'string' && o.self.area.length > 0);
  check('party carries the human', !!o.party && o.party.length === 1 && o.party[0].kind === 'human');
  check('human health passed through', o.party?.[0].health === 80);
  check('navigation lists every nav point as a route', o.navigation?.routes?.length === NAV_POINTS.length);
}

console.log('\n[WorldObservation] bearing frame — 0 = +Z, clockwise');
{
  const s = baseSnapshot({
    self: { x: 0, z: 0, facingRad: 0 },
    human: { x: 100, z: 100 }, // parked far so it does not become a threat label
    zombies: [
      { x: 0, z: 5, hp: 2 }, // +Z  -> 0
      { x: 5, z: 0, hp: 2 }, // +X  -> 90
      { x: 0, z: -5, hp: 2 }, // -Z -> 180
      { x: -5, z: 0, hp: 2 }, // -X -> 270
    ],
  });
  const t = buildWorldObservation(s).threats!;
  check('+Z bearing ~0', near(t[0].bearingDegrees!, 0) || near(t[0].bearingDegrees!, 360));
  check('+X bearing ~90', near(t[1].bearingDegrees!, 90));
  check('-Z bearing ~180', near(t[2].bearingDegrees!, 180));
  check('-X bearing ~270', near(t[3].bearingDegrees!, 270));
  check('relative is a world-axis observer offset', near(t[1].relative!.x, 5) && near(t[1].relative!.z, 0));
  check('distance in blocks', near(t[0].distance, 5));
}

console.log('\n[WorldObservation] facing composes in the same frame');
{
  // facingRad uses atan2(dx,dz): facing +X is PI/2 -> 90 degrees.
  const o = buildWorldObservation(baseSnapshot({ self: { x: 5, z: 5, facingRad: Math.PI / 2 } }));
  check('facingDegrees ~90 for +X facing', near(o.self.facingDegrees!, 90));
}

console.log('\n[WorldObservation] self.area three-tier truthfulness');
{
  const sa = navPoint('spawn_agent')!;
  const at = buildWorldObservation(baseSnapshot({ self: { x: sa.x + 0.5, z: sa.z + 0.5, facingRad: 0 } }));
  check("'at' inside arrival radius", at.self.area === 'at spawn_agent');
  const nearO = buildWorldObservation(baseSnapshot({ self: { x: sa.x + 5.5, z: sa.z + 0.5, facingRad: 0 } }));
  check("'near' inside ~8 blocks", nearO.self.area === 'near spawn_agent');
  const far = buildWorldObservation(baseSnapshot({ self: { x: 5, z: 5, facingRad: 0 } }));
  check("'open valley' fallback far from all", far.self.area === 'open valley');
}

console.log('\n[WorldObservation] threat state derived from distance to the human');
{
  const s = baseSnapshot({
    self: { x: 0, z: 0, facingRad: 0 },
    human: { x: 20, z: 20 },
    zombies: [
      { x: 20.5, z: 20.5, hp: 2 }, // right on the human -> attacking
      { x: 5, z: 5, hp: 2 }, // far from the human -> pursuing
    ],
  });
  const t = buildWorldObservation(s).threats!;
  check('zombie on the human is attacking', t[0].state === 'attacking');
  check('distant zombie is pursuing', t[1].state === 'pursuing');
  check('threats target the human', t[0].targeting === (s.human.name ?? 'James'));
}

console.log('\n[WorldObservation] serializes bounded through the contract');
{
  const many = Array.from({ length: 30 }, (_, i) => ({ x: i, z: i, hp: 2 }));
  const o = buildWorldObservation(baseSnapshot({ zombies: many }));
  const json = serializeObservation(o);
  check('serialize returns a string', typeof json === 'string');
  const parsed = JSON.parse(json);
  check('threats clipped to the contract bound (<=24)', parsed.threats.length <= 24);
}

if (failures === 0) console.log('\nALL PASS\n');
else {
  console.log(`\n${failures} FAILURE(S)\n`);
  process.exit(1);
}
