// First-person player: pointer-lock look + WASD movement, with the camera
// snapped to the terrain surface so you walk over hills (and down into holes
// you dig). No physics engine — kinematic terrain-follow, which is plenty for
// a build-focused sandbox and keeps movement rock-solid.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import type { VoxelWorld } from './voxel/VoxelWorld';
import { navPoint } from './navPoints';

const EYE_HEIGHT = 1.7;
const SPEED = 7;

export function Player({ world }: { world: VoxelWorld }): JSX.Element {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useEffect(() => {
    const sp = navPoint('spawn_human')!;
    camera.position.set(
      sp.x + 0.5,
      world.surfaceHeight(sp.x, sp.z) + EYE_HEIGHT,
      sp.z + 0.5,
    );
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [camera, world]);

  useFrame((_, dt) => {
    // Only move while pointer-locked (in-world). When unlocked (using the chat
    // or menus), WASD belongs to text fields, not the avatar.
    if (!document.pointerLockElement) return;
    const k = keys.current;
    const move = new THREE.Vector3();
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0;
    fwd.current.normalize();
    right.current.crossVectors(fwd.current, camera.up).normalize();

    if (k['KeyW']) move.add(fwd.current);
    if (k['KeyS']) move.sub(fwd.current);
    if (k['KeyD']) move.add(right.current);
    if (k['KeyA']) move.sub(right.current);

    if (move.lengthSq() > 0) {
      const boost = k['ShiftLeft'] || k['ShiftRight'] ? 1.9 : 1;
      move.normalize().multiplyScalar(SPEED * boost * Math.min(dt, 0.05));
      camera.position.x += move.x;
      camera.position.z += move.z;
    }

    // Keep inside the world.
    camera.position.x = Math.max(0.5, Math.min(world.sx - 0.5, camera.position.x));
    camera.position.z = Math.max(0.5, Math.min(world.sz - 0.5, camera.position.z));

    // Smoothly follow the surface (recomputed live, so digging changes it).
    const targetY = world.surfaceHeight(camera.position.x, camera.position.z) + EYE_HEIGHT;
    camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 12);
  });

  return <PointerLockControls />;
}
