// Renders the water simulation's own translucent geometry, separate from the
// opaque terrain mesh so a fast water tick never forces a full ~100k-cell
// terrain rebuild — only the (much smaller) water mesh recomputes.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildWaterGeometry } from './voxel/mesher';
import type { VoxelWorld } from './voxel/VoxelWorld';

interface Props {
  world: VoxelWorld;
  version: number; // bump to force a remesh after a water change
}

export function WaterMesh({ world, version }: Props): JSX.Element {
  const geo = useMemo(() => buildWaterGeometry(world), [world, version]);
  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo}>
      <meshLambertMaterial
        vertexColors
        transparent
        opacity={0.72}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
