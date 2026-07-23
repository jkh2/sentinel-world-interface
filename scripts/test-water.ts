// Headless test for the water simulation (VoxelWorld's level/sources/dirty-set
// machinery). Pure logic, no Electron, no renderer — builds small controlled
// scenarios by writing cells directly, overriding whatever the natural
// terrain generator put there, so results don't depend on rolling-hill shape.
//
// Run:   npx tsx scripts/test-water.ts

import { VoxelWorld } from '../src/renderer/world/voxel/VoxelWorld';
import { AIR, STONE, WATER } from '../src/renderer/world/voxel/blocks';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
}

/** Ticks until quiescent (or a safety cap), returning how many ticks it took. */
function settle(world: VoxelWorld, maxTicks = 300): number {
  for (let i = 0; i < maxTicks; i++) {
    if (!world.waterTick()) return i;
  }
  return maxTicks;
}

/** A small world with a flat, controlled STONE floor at y=FLOOR and open AIR
 *  above it, regardless of what the natural generator produced underneath. */
function flatWorld(sx = 20, sy = 10, sz = 20): { world: VoxelWorld; FLOOR: number } {
  const world = new VoxelWorld(sx, sy, sz);
  const FLOOR = 4;
  for (let x = 0; x < sx; x++) {
    for (let z = 0; z < sz; z++) {
      for (let y = 0; y <= FLOOR; y++) world.set(x, y, z, STONE);
      for (let y = FLOOR + 1; y < sy; y++) world.set(x, y, z, AIR);
    }
  }
  return { world, FLOOR };
}

console.log('\n[Water] source placement');
{
  const { world, FLOOR } = flatWorld();
  const ok = world.placeSource(5, FLOOR + 1, 5);
  check('placeSource succeeds into open air', ok);
  check('source cell reports level 7', world.getWaterLevel(5, FLOOR + 1, 5) === 7);
  check('source cell is a real source', world.isSource(5, FLOOR + 1, 5));
  check('data reflects WATER at the source', world.get(5, FLOOR + 1, 5) === WATER);
  check('placeSource refuses a non-air cell', !world.placeSource(5, FLOOR, 5)); // FLOOR is stone
}

console.log('\n[Water] downward-infinite fall — never decremented');
{
  const { world, FLOOR } = flatWorld();
  // A vertical air shaft well above the floor.
  const top = FLOOR + 5;
  world.placeSource(5, top, 5);
  settle(world);
  check('directly below the source is full strength (7), not decremented', world.getWaterLevel(5, top - 1, 5) === 7);
  check('two cells below is also full strength', world.getWaterLevel(5, top - 2, 5) === 7);
  check('water reached the floor', world.getWaterLevel(5, FLOOR + 1, 5) === 7);
}

console.log('\n[Water] horizontal spread — decreasing, capped at 7 blocks');
{
  const { world, FLOOR } = flatWorld();
  const y = FLOOR + 1;
  world.placeSource(2, y, 5);
  settle(world);
  // 7 distinct levels (1-7) step down from the source: 7,6,5,4,3,2,1 across
  // dx=0..6 (7 cells total, including the source) — dry from dx=7 onward.
  const levels: number[] = [];
  for (let dx = 0; dx <= 8; dx++) levels.push(world.getWaterLevel(2 + dx, y, 5));
  check('source itself is 7', levels[0] === 7);
  check('reaches its weakest strength at 6 blocks out', levels[6] === 1);
  check('level strictly decreases across the spread', levels.slice(0, 7).every((v, i) => i === 0 || v === levels[i - 1] - 1));
  check('dry starting 7 blocks from the source', levels[7] === 0 && levels[8] === 0);
}

console.log('\n[Water] 2x2 infinite-source rule');
{
  const { world, FLOOR } = flatWorld();
  const y = FLOOR + 1;
  world.placeSource(3, y, 5);
  world.placeSource(5, y, 5); // two apart, one open cell between them
  settle(world);
  check('the gap cell becomes a real, permanent source', world.isSource(4, y, 5));
  check('the gap cell is full strength', world.getWaterLevel(4, y, 5) === 7);
}

console.log('\n[Water] dig() is water-aware');
{
  const { world, FLOOR } = flatWorld();
  const y = FLOOR + 1;
  world.placeSource(2, y, 5);
  settle(world);
  const flowingLevel = world.getWaterLevel(4, y, 5); // flowing, not a source
  check('setup: a flowing (non-source) cell exists nearby', flowingLevel > 0 && !world.isSource(4, y, 5));
  check('dig() refuses flowing water', !world.dig(4, y, 5));
  check('flowing water is unchanged after a refused dig', world.getWaterLevel(4, y, 5) === flowingLevel);
  check('dig() allows unplugging a real source', world.dig(2, y, 5));
  check('source is gone after unplugging', !world.isSource(2, y, 5) && world.getWaterLevel(2, y, 5) === 0);
}

console.log('\n[Water] drain cascade after unplugging a source');
{
  const { world, FLOOR } = flatWorld();
  const y = FLOOR + 1;
  world.placeSource(2, y, 5);
  settle(world);
  check('setup: water reached several blocks out before unplugging', world.getWaterLevel(6, y, 5) > 0);
  world.dig(2, y, 5); // unplug
  settle(world);
  let stillWet = 0;
  for (let dx = 0; dx <= 8; dx++) if (world.getWaterLevel(2 + dx, y, 5) > 0) stillWet++;
  check('the whole channel drains back to nothing once unplugged', stillWet === 0);
}

console.log('\n[Water] quiescence — a settled pond stays quiet');
{
  const { world, FLOOR } = flatWorld();
  const y = FLOOR + 1;
  world.placeSource(2, y, 5);
  const ticksToSettle = settle(world);
  check('settles within a reasonable number of ticks', ticksToSettle < 300);
  check('a further tick reports nothing changed', !world.waterTick());
}

console.log('\n[Water] isSolid() excludes water — walkable, not a floor');
{
  const { world, FLOOR } = flatWorld();
  const y = FLOOR + 1;
  world.placeSource(2, y, 5);
  settle(world);
  check('a water cell is not solid', !world.isSolid(2, y, 5));
  check('surfaceHeight skips water down to the real floor below', world.surfaceHeight(2, 5) === FLOOR + 1);
}

if (failures === 0) console.log('\nALL PASS\n');
else {
  console.log(`\n${failures} FAILURE(S)\n`);
  process.exit(1);
}
