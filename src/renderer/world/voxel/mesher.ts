// Face-culled mesher: turn voxel data into one BufferGeometry, emitting only
// faces that border air. Per-face shading is baked into vertex colors (top
// bright, sides mid, bottom dark) so the form reads warmly even under flat
// light — no textures, no assets.

import * as THREE from 'three';
import { AIR, BLOCKS } from './blocks';
import type { VoxelWorld } from './VoxelWorld';

interface Face {
  dir: [number, number, number];
  shade: number;
  corners: [number, number, number][];
}

// Corners are ordered so (0,1,2)+(0,2,3) form the quad. Material uses
// DoubleSide, so winding never causes an invisible face.
const FACES: Face[] = [
  { dir: [1, 0, 0], shade: 0.86, corners: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]] },
  { dir: [-1, 0, 0], shade: 0.76, corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], shade: 0.92, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], shade: 0.82, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const TRI = [0, 1, 2, 0, 2, 3];

function jitter(x: number, y: number, z: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return 0.94 + 0.06 * (n - Math.floor(n));
}

export function buildGeometry(world: VoxelWorld): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  for (let y = 0; y < world.sy; y++) {
    for (let z = 0; z < world.sz; z++) {
      for (let x = 0; x < world.sx; x++) {
        const id = world.get(x, y, z);
        if (id === AIR) continue;
        const def = BLOCKS[id];
        if (!def) continue;
        const v = jitter(x, y, z);
        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          if (world.isSolid(x + dx, y + dy, z + dz)) continue; // hidden
          const r = def.color[0] * face.shade * v;
          const g = def.color[1] * face.shade * v;
          const b = def.color[2] * face.shade * v;
          for (const ci of TRI) {
            const c = face.corners[ci];
            positions.push(x + c[0], y + c[1], z + c[2]);
            normals.push(dx, dy, dz);
            colors.push(r, g, b);
          }
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}
