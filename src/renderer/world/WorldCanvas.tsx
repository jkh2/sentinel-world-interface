// Assembles the 3D valley: warm sky + light, the diggable terrain, the player,
// and my presence. DOM overlays (crosshair, HUD, chat) live outside the Canvas
// in App — the world client holds no CLI logic.

import { Canvas } from '@react-three/fiber';
import { VoxelTerrain } from './VoxelTerrain';
import { Scenery } from './Scenery';
import { Player } from './Player';
import { AgentPresence } from './AgentPresence';
import { DayNight, type DayPhase } from './DayNight';
import { ZombieManager } from './ZombieManager';
import type { VoxelWorld } from './voxel/VoxelWorld';
import type { BlockId } from './voxel/blocks';
import type { WorldAction } from '../../shared/worldActions';

interface Props {
  world: VoxelWorld;
  version: number;
  selectedBlock: BlockId;
  canPlace: boolean;
  onDig: (id: BlockId) => void;
  onPlace: (id: BlockId) => void;
  agentStatus: string;
  agentSpeech: string;
  agentCommand: WorldAction | null;
  onAgentWorldEdit: () => void;
  onDayTick: (timeOfDay: number, isNight: boolean, phase: DayPhase) => void;
  isNight: boolean;
  onZombieCount: (n: number) => void;
}

export function WorldCanvas(props: Props): JSX.Element {
  return (
    <Canvas
      shadows
      camera={{ fov: 74, near: 0.1, far: 500, position: [28, 22, 44] }}
      gl={{ antialias: true }}
    >
      <fog attach="fog" args={['#e2d3b2', 45, 180]} />
      <DayNight onTick={props.onDayTick} />
      <VoxelTerrain
        world={props.world}
        version={props.version}
        selectedBlock={props.selectedBlock}
        canPlace={props.canPlace}
        onDig={props.onDig}
        onPlace={props.onPlace}
      />
      <Scenery world={props.world} />
      <Player world={props.world} />
      <AgentPresence
        world={props.world}
        status={props.agentStatus}
        speech={props.agentSpeech}
        command={props.agentCommand}
        onWorldEdit={props.onAgentWorldEdit}
      />
      <ZombieManager
        world={props.world}
        isNight={props.isNight}
        onCount={props.onZombieCount}
        onWorldEdit={props.onAgentWorldEdit}
      />
    </Canvas>
  );
}
