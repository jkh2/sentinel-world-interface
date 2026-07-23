// Face-culled mesher: turn voxel data into one BufferGeometry, emitting only
// faces that border air. Per-face shading is baked into vertex colors (top
// bright, sides mid, bottom dark) so the form reads warmly even under flat
// light — no textures, no assets.

import * as THREE from 'three';
import { AIR, BLOCKS, WATER } from './blocks';
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
        // Water gets its own translucent pass (buildWaterGeometry) — it was
        // never meant to render as an opaque cube here.
        if (id === AIR || id === WATER) continue;
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

const MAX_WATER_LEVEL = 7;

// Water sides, base-to-scaled-top (y in [0, h]) — a shallow cell shows a
// genuinely thin edge, not a full-height translucent wall.
const WATER_SIDES: Face[] = [
  { dir: [1, 0, 0], shade: 1, corners: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]] },
  { dir: [-1, 0, 0], shade: 1, corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], shade: 1, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], shade: 1, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const WATER_TOP = FACES[2]; // { dir: [0,1,0], corners spanning the full XZ quad }
const WATER_COLOR = BLOCKS[WATER].color;

/** Water's own translucent, level-scaled pass — separate geometry, separate
 *  (transparent) material, rendered by WaterMesh.tsx alongside the opaque
 *  terrain mesh. Bottom faces skipped (v1 simplification: rarely seen in a
 *  shallow desert valley). */
export function buildWaterGeometry(world: VoxelWorld): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  for (let y = 0; y < world.sy; y++) {
    for (let z = 0; z < world.sz; z++) {
      for (let x = 0; x < world.sx; x++) {
        const level = world.getWaterLevel(x, y, z);
        if (level <= 0) continue;
        const h = level / MAX_WATER_LEVEL;
        const [r, g, b] = WATER_COLOR;

        // Top: only where the cell above isn't also water (i.e. this is the
        // real surface, not a submerged cell).
        if (world.getWaterLevel(x, y + 1, z) <= 0) {
          for (const ci of TRI) {
            const c = WATER_TOP.corners[ci];
            positions.push(x + c[0], y + (c[1] ? h : 0), z + c[2]);
            normals.push(0, 1, 0);
            colors.push(r, g, b);
          }
        }
        // Sides: only where open to air — a solid neighbor is already
        // covered by the opaque mesh's own (now water-aware) face, and
        // water-to-water needs no internal wall.
        for (const face of WATER_SIDES) {
          const [dx, , dz] = face.dir;
          if (world.get(x + dx, y, z + dz) !== AIR) continue;
          for (const ci of TRI) {
            const c = face.corners[ci];
            positions.push(x + c[0], y + (c[1] ? h : 0), z + c[2]);
            normals.push(dx, 0, dz);
            colors.push(r * 0.88, g * 0.88, b * 0.88);
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
