// First-person player: pointer-lock look + WASD movement. The camera rides the
// terrain surface as a *floor* — gravity pulls it down onto whatever ground is
// beneath (recomputed live, so digging changes it), and Space launches a jump
// when grounded so you can climb out of a pit you dug or hop a small obstacle.
// No physics engine — kinematic terrain-follow + a single vertical velocity,
// which is plenty for a build-focused sandbox and keeps movement rock-solid.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import type { VoxelWorld } from './voxel/VoxelWorld';
import { navPoint } from './navPoints';

const EYE_HEIGHT = 1.7;
const SPEED = 7;
const GRAVITY = 25; // blocks/s^2
const JUMP_SPEED = 9; // blocks/s — peaks at ~1.6 blocks (vy^2 / 2g), clears a 1-block step

export function Player({ world }: { world: VoxelWorld }): JSX.Element {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const vy = useRef(0); // vertical velocity (blocks/s)
  const grounded = useRef(true);

  useEffect(() => {
    const sp = navPoint('spawn_human')!;
    camera.position.set(
      sp.x + 0.5,
      world.surfaceHeight(sp.x, sp.z) + EYE_HEIGHT,
      sp.z + 0.5,
    );
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      // Space would otherwise scroll/activate the page; the avatar owns it in-world.
      if (e.code === 'Space' && document.pointerLockElement) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [camera, world]);

  useFrame((_, dt) => {
    // Only move while pointer-locked (in-world), and never while a text field
    // has focus — a defensive guard, not just a lock check: if a browser ever
    // lets a textarea keep focus through an active pointer lock, WASD must
    // still go to the text, not the avatar.
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    if (!document.pointerLockElement || typing) return;
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

      // Axis-separated horizontal collision: without this, position could
      // slip into an undug column, and surfaceHeight() there reports the
      // *original* terrain height (far above a dug tunnel) — the vertical
      // floor-follow below then snaps straight up to match, which is what
      // was launching a player from a cave back to the surface on bumping
      // an intact wall. Checked at foot and head height so you can't duck
      // under or reach over a solid wall; separated per axis so you slide
      // along a wall instead of sticking to it.
      const footY = camera.position.y - EYE_HEIGHT + 0.1;
      const headY = camera.position.y - 0.1;
      const blockedAt = (x: number, z: number): boolean =>
        world.isSolid(Math.floor(x), Math.floor(footY), Math.floor(z)) ||
        world.isSolid(Math.floor(x), Math.floor(headY), Math.floor(z));

      const nx = camera.position.x + move.x;
      if (!blockedAt(nx, camera.position.z)) camera.position.x = nx;
      const nz = camera.position.z + move.z;
      if (!blockedAt(camera.position.x, nz)) camera.position.z = nz;
    }

    // Keep inside the world.
    camera.position.x = Math.max(0.5, Math.min(world.sx - 0.5, camera.position.x));
    camera.position.z = Math.max(0.5, Math.min(world.sz - 0.5, camera.position.z));

    // Vertical: the surface is a floor, not a hard target. Space launches a jump
    // when grounded; gravity integrates us back down onto the live surface (so a
    // pit you dug lowers the floor, and you fall in — then jump to climb out).
    const step = Math.min(dt, 0.05);
    const floorY = world.surfaceHeight(camera.position.x, camera.position.z) + EYE_HEIGHT;
    if ((k['Space'] ?? false) && grounded.current) {
      vy.current = JUMP_SPEED;
      grounded.current = false;
    }
    vy.current -= GRAVITY * step;
    let y = camera.position.y + vy.current * step;
    if (y <= floorY) {
      // Landed on (or stepping up onto) the ground.
      y = floorY;
      vy.current = 0;
      grounded.current = true;
    } else {
      grounded.current = false;
    }
    camera.position.y = y;
  });

  return <PointerLockControls />;
}
