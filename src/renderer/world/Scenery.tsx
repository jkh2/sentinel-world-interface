// Low-poly life for the valley: harvestable trees, a pond, benches, and a
// pavilion. Trees can be chopped (click one) to yield wood + fruit and then
// vanish — the resource source for crafting and healing. Pure geometry.

import { useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { VoxelWorld } from './voxel/VoxelWorld';
import { navPoint } from './navPoints';

interface TreeData {
  id: number;
  x: number;
  y: number;
  z: number;
  s: number;
}

function Tree({ x, y, z, s, onChop }: TreeData & { onChop: () => void }): JSX.Element {
  return (
    <group
      position={[x, y, z]}
      scale={s}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onChop();
      }}
    >
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 1.4, 6]} />
        <meshLambertMaterial color="#6b4f33" />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <coneGeometry args={[0.95, 1.9, 7]} />
        <meshLambertMaterial color="#4f6b3a" />
      </mesh>
      <mesh position={[0, 2.7, 0]} castShadow>
        <coneGeometry args={[0.7, 1.4, 7]} />
        <meshLambertMaterial color="#57713f" />
      </mesh>
      {/* a bit of fruit */}
      <mesh position={[0.35, 2.0, 0.25]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshLambertMaterial color="#c94f4f" />
      </mesh>
    </group>
  );
}

function Bench({ x, y, z }: { x: number; y: number; z: number }): JSX.Element {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.12, 0.5]} />
        <meshLambertMaterial color="#7a5a3a" />
      </mesh>
      <mesh position={[0, 0.75, -0.22]} castShadow>
        <boxGeometry args={[1.6, 0.5, 0.1]} />
        <meshLambertMaterial color="#7a5a3a" />
      </mesh>
      <mesh position={[-0.7, 0.22, 0]}><boxGeometry args={[0.12, 0.45, 0.5]} /><meshLambertMaterial color="#5f4630" /></mesh>
      <mesh position={[0.7, 0.22, 0]}><boxGeometry args={[0.12, 0.45, 0.5]} /><meshLambertMaterial color="#5f4630" /></mesh>
    </group>
  );
}

function Pavilion({ x, y, z }: { x: number; y: number; z: number }): JSX.Element {
  const posts = [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]];
  return (
    <group position={[x, y, z]}>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.1, pz]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 2.2, 6]} />
          <meshLambertMaterial color="#6b543a" />
        </mesh>
      ))}
      <mesh position={[0, 2.35, 0]} castShadow>
        <coneGeometry args={[2.9, 1.0, 4]} />
        <meshLambertMaterial color="#8a5a44" />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[3.6, 0.12, 3.6]} />
        <meshLambertMaterial color="#7a5a3a" />
      </mesh>
    </group>
  );
}

function makeTrees(world: VoxelWorld): TreeData[] {
  const out: TreeData[] = [];
  const avoid = ['spawn_human', 'spawn_agent', 'pond_edge']
    .map((n) => navPoint(n)!)
    .filter(Boolean);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let id = 0;
  for (let i = 0; i < 40; i++) {
    const x = 3 + rand() * (world.sx - 6);
    const z = 3 + rand() * (world.sz - 6);
    if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < 5)) continue;
    out.push({ id: id++, x, y: world.surfaceHeight(x, z), z, s: 0.8 + rand() * 0.6 });
  }
  return out;
}

export function Scenery({
  world,
  onHarvest,
}: {
  world: VoxelWorld;
  onHarvest: () => void;
}): JSX.Element {
  const [trees, setTrees] = useState<TreeData[]>(() => makeTrees(world));

  const chop = (id: number): void => {
    setTrees((ts) => ts.filter((t) => t.id !== id));
    onHarvest();
  };

  const pond = navPoint('pond_edge')!;
  const bN = navPoint('bench_north')!;
  const bS = navPoint('bench_south')!;
  const pav = navPoint('pavilion_center')!;

  return (
    <group>
      {trees.map((t) => (
        <Tree key={t.id} {...t} onChop={() => chop(t.id)} />
      ))}

      <mesh
        position={[pond.x + 0.5, world.surfaceHeight(pond.x, pond.z) + 0.05, pond.z + 0.5]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[5, 40]} />
        <meshStandardMaterial color="#3b6c86" transparent opacity={0.72} roughness={0.2} metalness={0.1} />
      </mesh>

      <Bench x={bN.x + 0.5} y={world.surfaceHeight(bN.x, bN.z)} z={bN.z + 0.5} />
      <Bench x={bS.x + 0.5} y={world.surfaceHeight(bS.x, bS.z)} z={bS.z + 0.5} />
      <Pavilion x={pav.x + 0.5} y={world.surfaceHeight(pav.x, pav.z)} z={pav.z + 0.5} />
    </group>
  );
}
