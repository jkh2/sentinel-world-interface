// The voxel data store for the valley. A single flat typed array plus world
// generation and a couple of queries. Deliberately simple (one chunk) for the
// MVP — chunking/streaming is a later concern.

import { AIR, DIRT, GRASS, SAND, STONE, type BlockId } from './blocks';

export class VoxelWorld {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  private data: Uint8Array;

  constructor(sx = 56, sy = 24, sz = 56) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
    this.generate();
  }

  private index(x: number, y: number, z: number): number {
    return x + z * this.sx + y * this.sx * this.sz;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && x < this.sx && y >= 0 && y < this.sy && z >= 0 && z < this.sz
    );
  }

  get(x: number, y: number, z: number): BlockId {
    if (!this.inBounds(x, y, z)) return AIR;
    return this.data[this.index(x, y, z)];
  }

  set(x: number, y: number, z: number, id: BlockId): void {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.index(x, y, z)] = id;
  }

  isSolid(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== AIR;
  }

  /** Gentle rolling valley floor. */
  private heightAt(x: number, z: number): number {
    const base = 7;
    const h =
      base +
      2.6 * Math.sin(x * 0.16) * Math.cos(z * 0.14) +
      1.6 * Math.sin((x + z) * 0.08) +
      0.9 * Math.sin(x * 0.31 + z * 0.19);
    return Math.max(2, Math.min(this.sy - 2, Math.round(h)));
  }

  private generate(): void {
    for (let x = 0; x < this.sx; x++) {
      for (let z = 0; z < this.sz; z++) {
        const h = this.heightAt(x, z);
        for (let y = 0; y < h; y++) {
          let id: BlockId;
          if (y === h - 1) id = h <= 4 ? SAND : GRASS;
          else if (y >= h - 4) id = DIRT;
          else id = STONE;
          this.set(x, y, z, id);
        }
      }
    }
  }

  /** Topmost solid surface height at a column (world-space y of the air just
   *  above the surface). Used for terrain-follow walking. */
  surfaceHeight(x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    for (let y = this.sy - 1; y >= 0; y--) {
      if (this.isSolid(ix, y, iz)) return y + 1;
    }
    return 0;
  }
}
