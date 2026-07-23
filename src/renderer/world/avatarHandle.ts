// A tiny shared handle exposing the AI companion avatar's own live pose, so a
// sibling component (the observation builder) can read it without either side
// reaching into the other's internals — same pattern as combat.ts's CombatLink.

export interface AvatarHandle {
  x: number;
  z: number;
  /** Yaw in radians, game convention atan2(dx, dz) — same frame as bearings. */
  facingRad: number;
}

export function createAvatarHandle(): AvatarHandle {
  return { x: 0, z: 0, facingRad: 0 };
}
