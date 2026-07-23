// A tiny shared handle that lets the AI companion perceive and fight the horde
// without either system reaching into the other's internals. ZombieManager owns
// the simulation and implements strikeNearest; AgentPresence reads positions to
// move toward a threat and calls strikeNearest to defend the human.
//
// This is the "tactical controller" seam — a coded skill layer that the live
// model will later *direct* (via world-actions), never a thing the model has to
// re-implement in prose. Coded world state stays authoritative; judgment sits
// above it. (Orion's provider-neutral hierarchy, notebook 2026-07-22.)

export interface ZombieHandle {
  x: number;
  z: number;
  hp: number;
}

export interface CombatLink {
  /** Live horde positions — re-pointed by ZombieManager every frame (its array
   *  is reassigned on respawn, so consumers must read this fresh, not cache it). */
  zombies: readonly ZombieHandle[];
  /** Strike the nearest zombie within `range` of (x,z); true if one was hit. */
  strikeNearest(x: number, z: number, range: number): boolean;
}

export function createCombatLink(): CombatLink {
  return { zombies: [], strikeNearest: () => false };
}
