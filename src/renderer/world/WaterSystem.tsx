// Non-visual tick driver for the water simulation. Ticks on a fixed interval
// accumulated from dt (not per-frame — matches the verified Minecraft cadence
// of roughly a block of spread every few ticks), and only notifies the caller
// when the tick actually changed something, so a settled pond stays quiet.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { VoxelWorld } from './voxel/VoxelWorld';

const TICK_INTERVAL_S = 0.15;

interface Props {
  world: VoxelWorld;
  onChanged: () => void;
}

export function WaterSystem({ world, onChanged }: Props): null {
  const sinceLast = useRef(0);

  useFrame((_, dt) => {
    sinceLast.current += dt;
    if (sinceLast.current < TICK_INTERVAL_S) return;
    sinceLast.current = 0;
    if (world.waterTick()) onChanged();
  });

  return null;
}
