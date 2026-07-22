// Assembles the 3D valley: warm sky + light, the diggable terrain, the player,
// and my presence. DOM overlays (crosshair, HUD, chat) live outside the Canvas
// in App — the world client holds no CLI logic.

import { Canvas } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { VoxelTerrain } from './VoxelTerrain';
import { Player } from './Player';
import { AgentPresence } from './AgentPresence';
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
}

export function WorldCanvas(props: Props): JSX.Element {
  return (
    <Canvas
      shadows
      camera={{ fov: 74, near: 0.1, far: 500, position: [28, 22, 44] }}
      gl={{ antialias: true }}
    >
      {/* High-desert golden hour. */}
      <Sky sunPosition={[80, 14, 40]} turbidity={7} rayleigh={2.2} mieCoefficient={0.006} mieDirectionalG={0.85} />
      <fog attach="fog" args={['#e2d3b2', 45, 180]} />
      <hemisphereLight args={['#e7edf5', '#4f4432', 0.7]} />
      <directionalLight
        castShadow
        position={[60, 55, 20]}
        intensity={1.2}
        color="#ffe9c4"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-far={200}
      />
      <VoxelTerrain
        world={props.world}
        version={props.version}
        selectedBlock={props.selectedBlock}
        canPlace={props.canPlace}
        onDig={props.onDig}
        onPlace={props.onPlace}
      />
      <Player world={props.world} />
      <AgentPresence
        world={props.world}
        status={props.agentStatus}
        speech={props.agentSpeech}
        command={props.agentCommand}
      />
    </Canvas>
  );
}
