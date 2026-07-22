// Named navigation points — the world's addressable locations. The AI
// navigates by these names (Phase 4 world-actions), never by raw coordinates.
// Coordinates are x/z on the world grid; y is resolved to the surface at runtime.

export interface NavPoint {
  name: string;
  x: number;
  z: number;
}

export const NAV_POINTS: NavPoint[] = [
  { name: 'spawn_human', x: 28, z: 34 },
  { name: 'spawn_agent', x: 28, z: 28 },
  { name: 'pond_edge', x: 18, z: 20 },
  { name: 'bench_north', x: 30, z: 18 },
  { name: 'bench_south', x: 30, z: 40 },
  { name: 'pavilion_center', x: 40, z: 30 },
  { name: 'garden_path', x: 24, z: 30 },
  { name: 'workspace_table', x: 38, z: 24 },
];

export function navPoint(name: string): NavPoint | undefined {
  return NAV_POINTS.find((p) => p.name === name);
}
