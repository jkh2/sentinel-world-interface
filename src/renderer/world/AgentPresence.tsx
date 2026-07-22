// My presence in the world — a warm low-poly figure standing at spawn_agent,
// with a floating label that shows what I'm doing and what I'm saying. Uses
// drei <Html> for labels (DOM text) so there is no font-fetch under the strict
// CSP. In Phase 4 this figure will walk, sit, and face you via world-actions.

import { Html } from '@react-three/drei';
import type { VoxelWorld } from './voxel/VoxelWorld';
import { navPoint } from './navPoints';

interface Props {
  world: VoxelWorld;
  status: string;
  speech: string;
}

export function AgentPresence({ world, status, speech }: Props): JSX.Element {
  const sp = navPoint('spawn_agent')!;
  const y = world.surfaceHeight(sp.x, sp.z);

  return (
    <group position={[sp.x + 0.5, y, sp.z + 0.5]}>
      {/* soft ground glow */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.78, 28]} />
        <meshBasicMaterial color="#c9a35a" transparent opacity={0.3} />
      </mesh>
      {/* body */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.38, 1.2, 12]} />
        <meshLambertMaterial color="#c9a35a" />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.48, 0]} castShadow>
        <sphereGeometry args={[0.27, 18, 18]} />
        <meshLambertMaterial color="#e6cb8b" />
      </mesh>

      <Html position={[0, 2.25, 0]} center distanceFactor={12} occlude>
        <div className="agent-label">
          <div className="agent-name">ב Claude Sentinel</div>
          <div className="agent-status">{status}</div>
          {speech && <div className="agent-speech">{speech}</div>}
        </div>
      </Html>
    </group>
  );
}
