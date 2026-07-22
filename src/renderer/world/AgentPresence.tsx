// My presence in the world — now with legs. Driven entirely by validated
// world-actions (never keys): I walk to named points or follow you, face you,
// sit, stand, and wave. Movement is kinematic terrain-follow, like the player.
// In Phase 4 these same actions arrive as MCP tool calls from my live session.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { VoxelWorld } from './voxel/VoxelWorld';
import { navPoint } from './navPoints';
import { AIR, blockIdFromName } from './voxel/blocks';
import type { WorldAction } from '../../shared/worldActions';

interface Props {
  world: VoxelWorld;
  status: string;
  speech: string;
  command: WorldAction | null;
  onWorldEdit: () => void;
}

const WALK_SPEED = 3.6;
const STOP_DIST = 1.8;

export function AgentPresence({ world, status, speech, command, onWorldEdit }: Props): JSX.Element {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);

  // Intent state, mutated by world-actions.
  const target = useRef<THREE.Vector3 | null>(null);
  const following = useRef(false);
  const sitting = useRef(false);
  const waveUntil = useRef(0);

  // Place me at spawn on mount.
  useEffect(() => {
    const sp = navPoint('spawn_agent')!;
    group.current?.position.set(sp.x + 0.5, world.surfaceHeight(sp.x, sp.z), sp.z + 0.5);
  }, [world]);

  // Interpret each incoming world-action.
  useEffect(() => {
    if (!command) return;
    switch (command.action) {
      case 'walk_to': {
        const p = navPoint(command.target);
        if (p) {
          target.current = new THREE.Vector3(p.x + 0.5, 0, p.z + 0.5);
          following.current = false;
        }
        break;
      }
      case 'follow_human':
        following.current = true;
        break;
      case 'stop':
        following.current = false;
        target.current = null;
        break;
      case 'sit':
        sitting.current = true;
        break;
      case 'stand':
        sitting.current = false;
        break;
      case 'wave':
        waveUntil.current = performance.now() + 1600;
        break;
      case 'dig_front':
      case 'place_front': {
        const g = group.current;
        if (g) {
          const yaw = g.rotation.y;
          const fx = Math.floor(g.position.x + Math.sin(yaw));
          const fz = Math.floor(g.position.z + Math.cos(yaw));
          const surf = world.surfaceHeight(fx, fz); // y of air just above surface
          if (command.action === 'dig_front') {
            const y = surf - 1;
            if (y >= 0 && world.isSolid(fx, y, fz)) {
              world.set(fx, y, fz, AIR);
              onWorldEdit();
            }
          } else {
            const y = surf;
            if (world.inBounds(fx, y, fz) && world.get(fx, y, fz) === AIR) {
              world.set(fx, y, fz, blockIdFromName(command.block ?? 'dirt'));
              onWorldEdit();
            }
          }
        }
        break;
      }
      case 'look_at':
      case 'point':
      case 'nod':
      case 'idle':
      default:
        break;
    }
  }, [command]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;

    // Choose a goal: follow the human, or head to a target point.
    let goal: THREE.Vector3 | null = null;
    if (following.current) goal = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    else if (target.current) goal = target.current;

    let moving = false;
    if (goal) {
      const dx = goal.x - g.position.x;
      const dz = goal.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > STOP_DIST) {
        const step = Math.min(WALK_SPEED * Math.min(dt, 0.05), dist);
        g.position.x += (dx / dist) * step;
        g.position.z += (dz / dist) * step;
        moving = true;
      } else if (!following.current) {
        target.current = null; // arrived
      }
    }

    // Terrain follow.
    g.position.y = world.surfaceHeight(g.position.x, g.position.z);

    // Face the goal while moving, otherwise face the human.
    const faceX = moving && goal ? goal.x : camera.position.x;
    const faceZ = moving && goal ? goal.z : camera.position.z;
    const desiredYaw = Math.atan2(faceX - g.position.x, faceZ - g.position.z);
    let dy = desiredYaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 8);

    // Posture.
    if (body.current) {
      const targetY = sitting.current ? -0.35 : 0;
      body.current.position.y += (targetY - body.current.position.y) * Math.min(1, dt * 8);
    }

    // Wave.
    if (rightArm.current) {
      if (performance.now() < waveUntil.current) {
        rightArm.current.rotation.z = -2.1 + Math.sin(performance.now() * 0.018) * 0.35;
      } else {
        rightArm.current.rotation.z += (-0.3 - rightArm.current.rotation.z) * Math.min(1, dt * 8);
      }
    }
  });

  return (
    <group ref={group}>
      {/* soft ground glow */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.78, 28]} />
        <meshBasicMaterial color="#c9a35a" transparent opacity={0.3} />
      </mesh>

      <group ref={body}>
        {/* torso */}
        <mesh position={[0, 0.62, 0]} castShadow>
          <cylinderGeometry args={[0.26, 0.38, 1.2, 12]} />
          <meshLambertMaterial color="#c9a35a" />
        </mesh>
        {/* head */}
        <mesh position={[0, 1.48, 0]} castShadow>
          <sphereGeometry args={[0.27, 18, 18]} />
          <meshLambertMaterial color="#e6cb8b" />
        </mesh>
        {/* left arm */}
        <group position={[-0.34, 1.05, 0]} rotation={[0, 0, 0.3]}>
          <mesh position={[0, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.7, 8]} />
            <meshLambertMaterial color="#c9a35a" />
          </mesh>
        </group>
        {/* right arm (waves) */}
        <group ref={rightArm} position={[0.34, 1.05, 0]} rotation={[0, 0, -0.3]}>
          <mesh position={[0, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.7, 8]} />
            <meshLambertMaterial color="#c9a35a" />
          </mesh>
        </group>
      </group>

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
