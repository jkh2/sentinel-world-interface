// The voxel data store for the valley. A single flat typed array plus world
// generation and a couple of queries. Deliberately simple (one chunk) for the
// MVP — chunking/streaming is a later concern.

import { AIR, BEDROCK, DIRT, GRASS, SAND, STONE, WATER, type BlockId } from './blocks';

export class VoxelWorld {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  private data: Uint8Array;

  // Water: a parallel level array (0 = none, 1-7 = flowing/source strength)
  // plus a set of permanent-source cell indices. Invariant, kept by
  // setWater(): data[i] === WATER iff waterLevel[i] > 0.
  private waterLevel: Uint8Array;
  private sources = new Set<number>();
  private dirty = new Set<number>();

  // Taller by default so there is real depth to dig down through to bedrock.
  constructor(sx = 56, sy = 32, sz = 56) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
    this.waterLevel = new Uint8Array(sx * sy * sz);
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

  /** True for anything that actually occupies space for movement/face-culling
   *  purposes — deliberately excludes WATER, so it doesn't block walking, get
   *  treated as a floor to stand on, or hide a neighboring opaque face. */
  isSolid(x: number, y: number, z: number): boolean {
    const id = this.get(x, y, z);
    return id !== AIR && id !== WATER;
  }

  getWaterLevel(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    return this.waterLevel[this.index(x, y, z)];
  }

  isSource(x: number, y: number, z: number): boolean {
    return this.inBounds(x, y, z) && this.sources.has(this.index(x, y, z));
  }

  /** Sets or clears water at a cell, keeping data/waterLevel in sync. Never
   *  touches a cell that isn't currently AIR or WATER — water can't displace
   *  a solid block. */
  private setWater(x: number, y: number, z: number, level: number): void {
    if (!this.inBounds(x, y, z)) return;
    const idx = this.index(x, y, z);
    const current = this.data[idx];
    if (current !== AIR && current !== WATER) return;
    this.waterLevel[idx] = level;
    this.data[idx] = level > 0 ? WATER : AIR;
  }

  private markDirty(x: number, y: number, z: number): void {
    if (this.inBounds(x, y, z)) this.dirty.add(this.index(x, y, z));
  }

  private markNeighborsDirty(x: number, y: number, z: number): void {
    this.markDirty(x + 1, y, z);
    this.markDirty(x - 1, y, z);
    this.markDirty(x, y + 1, z);
    this.markDirty(x, y - 1, z);
    this.markDirty(x, y, z + 1);
    this.markDirty(x, y, z - 1);
  }

  private coordsOf(idx: number): [number, number, number] {
    const y = Math.floor(idx / (this.sx * this.sz));
    const rem = idx - y * this.sx * this.sz;
    const z = Math.floor(rem / this.sx);
    const x = rem - z * this.sx;
    return [x, y, z];
  }

  /** Places a permanent water source. Only into empty air, like any placement. */
  placeSource(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z) || this.data[this.index(x, y, z)] !== AIR) return false;
    this.sources.add(this.index(x, y, z));
    this.setWater(x, y, z, 7);
    this.markNeighborsDirty(x, y, z);
    return true;
  }

  /** One simulation pass over the current dirty set. Returns true only if
   *  something actually changed, so a caller can skip remeshing a settled
   *  pond that ticks to nothing. */
  waterTick(): boolean {
    if (this.dirty.size === 0) return false;
    const batch = Array.from(this.dirty);
    this.dirty.clear();
    let changed = false;
    for (const idx of batch) {
      if (this.evaluateWaterCell(idx)) changed = true;
    }
    return changed;
  }

  private evaluateWaterCell(idx: number): boolean {
    if (this.sources.has(idx)) return false; // sources are fixed points
    if (this.data[idx] !== AIR && this.data[idx] !== WATER) return false; // solids never carry water

    const [x, y, z] = this.coordsOf(idx);
    const above = this.getWaterLevel(x, y + 1, z);
    let desired: number;

    if (above > 0) {
      // Downward-infinite: falling water is always full strength.
      desired = 7;
    } else {
      const maxNeighbor = Math.max(
        0,
        this.getWaterLevel(x + 1, y, z),
        this.getWaterLevel(x - 1, y, z),
        this.getWaterLevel(x, y, z + 1),
        this.getWaterLevel(x, y, z - 1),
      );
      desired = maxNeighbor > 0 ? maxNeighbor - 1 : 0;

      // 2x2 infinite-source rule: resting on solid ground with 2+ source
      // neighbors promotes this flowing cell into a permanent source.
      if (desired > 0 && this.isSolid(x, y - 1, z)) {
        const sourceNeighbors = [
          this.isSource(x + 1, y, z),
          this.isSource(x - 1, y, z),
          this.isSource(x, y, z + 1),
          this.isSource(x, y, z - 1),
        ].filter(Boolean).length;
        if (sourceNeighbors >= 2) {
          this.sources.add(idx);
          this.setWater(x, y, z, 7);
          this.markNeighborsDirty(x, y, z);
          return true;
        }
      }
    }

    if (desired === this.waterLevel[idx]) return false;
    this.setWater(x, y, z, desired);
    this.markNeighborsDirty(x, y, z);
    return true;
  }

  /** Remove a block, returning true only if something breakable was actually
   *  dug. Air and BEDROCK never break — this is the single chokepoint every dig
   *  path (player, agent, zombie) routes through, so bedrock is unbreakable by
   *  construction rather than by each caller remembering to check. Water is
   *  water-aware: flowing water can't be mined, but a source can be unplugged,
   *  cascading a real recession through the dirty set rather than just vanishing. */
  dig(x: number, y: number, z: number): boolean {
    const id = this.get(x, y, z);
    if (id === AIR || id === BEDROCK) return false;
    if (id === WATER) {
      const idx = this.index(x, y, z);
      if (!this.sources.has(idx)) return false;
      this.sources.delete(idx);
      this.setWater(x, y, z, 0);
      this.markNeighborsDirty(x, y, z);
      return true;
    }
    this.set(x, y, z, AIR);
    this.markDirty(x, y, z);
    this.markNeighborsDirty(x, y, z);
    return true;
  }

  /** Gentle rolling valley floor, sitting high above the bedrock so there is a
   *  deep column of stone to mine down through. */
  private heightAt(x: number, z: number): number {
    const base = 18;
    const h =
      base +
      2.6 * Math.sin(x * 0.16) * Math.cos(z * 0.14) +
      1.6 * Math.sin((x + z) * 0.08) +
      0.9 * Math.sin(x * 0.31 + z * 0.19);
    return Math.max(6, Math.min(this.sy - 6, Math.round(h)));
  }

  private generate(): void {
    for (let x = 0; x < this.sx; x++) {
      for (let z = 0; z < this.sz; z++) {
        const h = this.heightAt(x, z);
        for (let y = 0; y < h; y++) {
          let id: BlockId;
          if (y === 0) id = BEDROCK; // undiggable floor of the world
          else if (y === h - 1) id = h <= 6 ? SAND : GRASS;
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
