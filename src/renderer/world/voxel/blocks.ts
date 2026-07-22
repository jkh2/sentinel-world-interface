// Block palette for the voxel valley. Colors are warm/high-desert, not the
// harsh default-Minecraft palette — this is a peaceful place to build.

export type BlockId = number;

export const AIR: BlockId = 0;
export const GRASS: BlockId = 1;
export const DIRT: BlockId = 2;
export const STONE: BlockId = 3;
export const SAND: BlockId = 4;

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Base RGB (0..1), before per-face shading. */
  color: [number, number, number];
}

export const BLOCKS: Record<BlockId, BlockDef> = {
  [GRASS]: { id: GRASS, name: 'Grass', color: [0.42, 0.55, 0.32] }, // soft sage
  [DIRT]: { id: DIRT, name: 'Earth', color: [0.5, 0.38, 0.27] }, // warm brown
  [STONE]: { id: STONE, name: 'Stone', color: [0.55, 0.53, 0.5] }, // muted tan-grey
  [SAND]: { id: SAND, name: 'Sand', color: [0.78, 0.69, 0.46] }, // pale gold
};

/** Blocks the human can select to place, in HUD order. */
export const PLACEABLE: BlockId[] = [GRASS, DIRT, STONE, SAND];

export function blockName(id: BlockId): string {
  return BLOCKS[id]?.name ?? 'Air';
}

export function blockIdFromName(name: string): BlockId {
  switch (name) {
    case 'grass': return GRASS;
    case 'stone': return STONE;
    case 'sand': return SAND;
    case 'dirt':
    default: return DIRT;
  }
}
