// The interactive valley surface. Renders the voxel mesh and turns crosshair
// clicks into dig (left) / place (right) edits. Digging yields material;
// placing spends it. World control only — this never touches files or shells.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { buildGeometry } from './voxel/mesher';
import { AIR, WATER, type BlockId } from './voxel/blocks';
import type { VoxelWorld } from './voxel/VoxelWorld';

interface Props {
  world: VoxelWorld;
  version: number; // bump to force a remesh after an edit
  selectedBlock: BlockId;
  canPlace: boolean;
  onDig: (id: BlockId) => void;
  onPlace: (id: BlockId) => void;
  /** A dig/place that touched water — nudge the water system to tick right
   *  away instead of waiting out its own interval, for instant feedback. */
  onWaterTouched: () => void;
}

export function VoxelTerrain({
  world,
  version,
  selectedBlock,
  canPlace,
  onDig,
  onPlace,
  onWaterTouched,
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
      // dig() refuses AIR/BEDROCK and flowing (non-source) water; a source
      // can be unplugged but yields nothing to harvest.
      if (world.dig(x, y, z)) {
        if (id !== WATER) onDig(id);
        onWaterTouched();
      }
    } else if (e.nativeEvent.button === 2) {
      // Place into the air cell just outside the hit face. Water is never
      // harvested into inventory (a source yields nothing on dig), so it's
      // exempt from the inventory-count gate — placing it is a free action,
      // not spending a harvested resource.
      if (!canPlace && selectedBlock !== WATER) return;
      const x = Math.floor(p.x + n.x * 0.5);
      const y = Math.floor(p.y + n.y * 0.5);
      const z = Math.floor(p.z + n.z * 0.5);
      if (selectedBlock === WATER) {
        if (world.placeSource(x, y, z)) {
          onPlace(selectedBlock);
          onWaterTouched();
        }
      } else if (world.get(x, y, z) === AIR && world.inBounds(x, y, z)) {
        world.set(x, y, z, selectedBlock);
        onPlace(selectedBlock);
        onWaterTouched();
      }
    }
  };

  return (
    <mesh geometry={geo} onPointerDown={handlePointerDown} receiveShadow castShadow>
      <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}
