// The interactive valley surface. Renders the voxel mesh and turns crosshair
// clicks into dig (left) / place (right) edits. Digging yields material;
// placing spends it. World control only — this never touches files or shells.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { buildGeometry } from './voxel/mesher';
import { AIR, type BlockId } from './voxel/blocks';
import type { VoxelWorld } from './voxel/VoxelWorld';

interface Props {
  world: VoxelWorld;
  version: number; // bump to force a remesh after an edit
  selectedBlock: BlockId;
  canPlace: boolean;
  onDig: (id: BlockId) => void;
  onPlace: (id: BlockId) => void;
}

export function VoxelTerrain({
  world,
  version,
  selectedBlock,
  canPlace,
  onDig,
  onPlace,
}: Props): JSX.Element {
  const geo = useMemo(() => buildGeometry(world), [world, version]);
  useEffect(() => () => geo.dispose(), [geo]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    const p = e.point;
    // Round the face normal to a clean unit axis (guards float error).
    const n = e.face
      ? e.face.normal.clone().round()
      : new THREE.Vector3(0, 1, 0);

    if (e.nativeEvent.button === 0) {
      // Dig the solid cell just inside the hit face.
      const x = Math.floor(p.x - n.x * 0.5);
      const y = Math.floor(p.y - n.y * 0.5);
      const z = Math.floor(p.z - n.z * 0.5);
      const id = world.get(x, y, z);
      // dig() refuses AIR and BEDROCK; only report a real harvest.
      if (world.dig(x, y, z)) {
        onDig(id);
      }
    } else if (e.nativeEvent.button === 2) {
      // Place into the air cell just outside the hit face.
      if (!canPlace) return;
      const x = Math.floor(p.x + n.x * 0.5);
      const y = Math.floor(p.y + n.y * 0.5);
      const z = Math.floor(p.z + n.z * 0.5);
      if (world.get(x, y, z) === AIR && world.inBounds(x, y, z)) {
        world.set(x, y, z, selectedBlock);
        onPlace(selectedBlock);
      }
    }
  };

  return (
    <mesh geometry={geo} onPointerDown={handlePointerDown} receiveShadow castShadow>
      <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}
