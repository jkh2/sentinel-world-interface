// Zombies — the reason to build a base. A few slow shamblers drift toward you
// by day; at night the waves come, more and faster. They walk the terrain and
// can step up ONE block, so a wall two or more high actually stops them — base
// building is real defense. (Combat — them breaking blocks, player health — is
// the next layer; this increment is spawn + pursuit + wall-blocking.)
//
// Perf: a fixed pool of meshes moved imperatively in useFrame (no per-frame
// React re-render). Zombie data lives in a ref.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VoxelWorld } from './voxel/VoxelWorld';
import { AIR, GRASS, DIRT, STONE, SAND, type BlockId } from './voxel/blocks';

interface Zombie {
  x: number;
  z: number;
  y: number;
  yaw: number;
  attackKey: string | null; // "x,y,z" of the wall block being chewed
  attackProgress: number; // seconds accumulated against it
}

const MAX = 22;

/** Seconds of chewing to break a block — stone holds far longer than dirt. */
function toughness(id: BlockId): number {
  switch (id) {
    case STONE: return 5;
    case SAND: return 1.4;
    case GRASS:
    case DIRT: return 2.2;
    default: return 2.6;
  }
}

function ZombieFigure(): JSX.Element {
  return (
    <group>
      {/* hunched body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.32, 1.1, 8]} />
        <meshLambertMaterial color="#3f5236" />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.28, 0.03]} castShadow>
        <sphereGeometry args={[0.24, 12, 12]} />
        <meshLambertMaterial color="#4a5c3f" />
      </mesh>
      {/* red eyes */}
      <mesh position={[-0.09, 1.31, 0.22]}>
        <sphereGeometry args={[0.045, 6, 6]} />
        <meshBasicMaterial color="#e03b3b" />
      </mesh>
      <mesh position={[0.09, 1.31, 0.22]}>
        <sphereGeometry args={[0.045, 6, 6]} />
        <meshBasicMaterial color="#e03b3b" />
      </mesh>
      {/* arms reaching forward */}
      <mesh position={[-0.18, 0.95, 0.3]} rotation={[1.25, 0, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.62, 6]} />
        <meshLambertMaterial color="#3f5236" />
      </mesh>
      <mesh position={[0.18, 0.95, 0.3]} rotation={[1.25, 0, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.62, 6]} />
        <meshLambertMaterial color="#3f5236" />
      </mesh>
    </group>
  );
}

function canStand(world: VoxelWorld, x: number, z: number, curSurf: number): boolean {
  if (x < 0.5 || x > world.sx - 0.5 || z < 0.5 || z > world.sz - 0.5) return false;
  const s = world.surfaceHeight(x, z);
  return s - curSurf <= 1; // can step up at most one block; a wall >=2 blocks it
}

function findSpawn(world: VoxelWorld, px: number, pz: number): { x: number; z: number } | null {
  for (let i = 0; i < 14; i++) {
    const x = 2 + Math.random() * (world.sx - 4);
    const z = 2 + Math.random() * (world.sz - 4);
    if (Math.hypot(x - px, z - pz) > 18) return { x, z };
  }
  return null;
}

export function ZombieManager({
  world,
  isNight,
  onCount,
  onWorldEdit,
}: {
  world: VoxelWorld;
  isNight: boolean;
  onCount: (n: number) => void;
  onWorldEdit: () => void;
}): JSX.Element {
  const { camera } = useThree();
  const zombies = useRef<Zombie[]>([]);
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const spawnTimer = useRef(0);
  const countTimer = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const px = camera.position.x;
    const pz = camera.position.z;

    const target = isNight ? 14 : 3;
    const interval = isNight ? 1.4 : 6;
    const speed = isNight ? 2.7 : 1.15;

    // spawn up to the target
    spawnTimer.current += dt;
    if (zombies.current.length < target && spawnTimer.current > interval) {
      spawnTimer.current = 0;
      const spot = findSpawn(world, px, pz);
      if (spot) {
        zombies.current.push({
          x: spot.x,
          z: spot.z,
          y: world.surfaceHeight(spot.x, spot.z),
          yaw: 0,
          attackKey: null,
          attackProgress: 0,
        });
      }
    }
    // when day returns, the horde thins back to a few wanderers
    if (!isNight && zombies.current.length > target) {
      zombies.current.length = target;
    }

    // pursue the player; chew through walls that block the way to us
    for (const z of zombies.current) {
      const dx = px - z.x;
      const dz = pz - z.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.3) {
        const step = speed * dt;
        const mx = (dx / d) * step;
        const mz = (dz / d) * step;
        const cur = world.surfaceHeight(z.x, z.z);
        if (canStand(world, z.x + mx, z.z + mz, cur)) {
          z.x += mx;
          z.z += mz;
          z.attackKey = null;
        } else if (canStand(world, z.x + mx, z.z, cur)) {
          z.x += mx;
          z.attackKey = null;
        } else if (canStand(world, z.x, z.z + mz, cur)) {
          z.z += mz;
          z.attackKey = null;
        } else {
          // blocked by the base — attack the wall block ahead to reach us
          const fx = Math.floor(z.x + dx / d);
          const fz = Math.floor(z.z + dz / d);
          const by = world.surfaceHeight(fx, fz) - 1;
          const bid = world.get(fx, by, fz);
          if (by >= 0 && bid !== AIR) {
            const key = `${fx},${by},${fz}`;
            if (z.attackKey !== key) {
              z.attackKey = key;
              z.attackProgress = 0;
            }
            z.attackProgress += dt;
            if (z.attackProgress >= toughness(bid)) {
              world.set(fx, by, fz, AIR);
              onWorldEdit();
              z.attackKey = null;
              z.attackProgress = 0;
            }
          }
        }
      } else {
        z.attackKey = null;
      }
      z.y = world.surfaceHeight(z.x, z.z);
      z.yaw = Math.atan2(px - z.x, pz - z.z);
    }

    // sync the mesh pool
    for (let i = 0; i < MAX; i++) {
      const g = groupRefs.current[i];
      if (!g) continue;
      const z = zombies.current[i];
      if (z) {
        g.visible = true;
        g.position.set(z.x, z.y, z.z);
        g.rotation.y = z.yaw;
      } else {
        g.visible = false;
      }
    }

    countTimer.current += dt;
    if (countTimer.current > 0.4) {
      countTimer.current = 0;
      onCount(zombies.current.length);
    }
  });

  return (
    <group>
      {Array.from({ length: MAX }).map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          visible={false}
        >
          <ZombieFigure />
        </group>
      ))}
    </group>
  );
}
