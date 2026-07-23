// The WorldObservation producer — my half of the seam with Orion's provider-
// neutral cognitive bridge. It maps authoritative, live game state into the
// bounded `WorldObservation` the companion model perceives. Coded voxel/entity
// state is the sole truth; this is a faithful, non-omniscient *view* of it.
//
// Pure and React-free on purpose: callers gather a snapshot from the live
// components and hand it here, so the mapping is unit-testable headless. It
// implements `WorldObservationProvider` once wired: () => buildWorldObservation(snapshot).
//
// Conventions are Orion's locked contract (worldCognitionContract.ts):
//   bearings world-absolute [0,360), 0 = +Z, clockwise; relative = bearing - facing.
//   relative x/y/z are observer offsets on world axes; all in voxel-block units.
//   self.area is coarse place language: 'at' (tight) / 'near' (~8) / 'open valley'.

import type {
  WorldObservation,
  ThreatObservation,
  ParticipantObservation,
  RouteObservation,
} from '../../main/bridge/worldCognitionContract';
import { NAV_POINTS } from './navPoints';
import type { ZombieHandle } from './combat';

export type DayPhaseName = 'Dawn' | 'Day' | 'Dusk' | 'Night';

export interface AvatarSnapshot {
  x: number;
  z: number;
  /** Yaw in radians, game convention atan2(dx, dz) — same frame as bearings. */
  facingRad: number;
  name?: string;
}
export interface HumanSnapshot {
  x: number;
  z: number;
  name?: string;
  health?: number;
  downed?: boolean;
}
export interface WorldSnapshot {
  now?: Date;
  self: AvatarSnapshot; // the AI companion — the observer
  human: HumanSnapshot;
  phase: DayPhaseName;
  zombies: readonly ZombieHandle[];
}

const ARRIVAL_RADIUS = 2.5; // 'at <name>' inside this
const NEAR_RADIUS = 8; // 'near <name>' inside this (Orion's ~8)
const ZOMBIE_ATTACK_DIST = 1.5; // matches ZombieManager contact range
const DEFAULT_HUMAN = 'James';
// Deliberately not an identity claim — a name here would assert who's driving
// the avatar without evidence. Callers should always pass an explicit,
// honest self.name; this only covers the defensive case where none arrived.
const DEFAULT_SELF = 'AI companion (unlabeled driver)';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** World-absolute bearing [0,360): 0 = +Z, increasing clockwise — the same
 *  atan2(dx, dz) frame the avatars already use for yaw, so facing composes. */
function bearingDeg(fromX: number, fromZ: number, toX: number, toZ: number): number {
  const deg = (Math.atan2(toX - fromX, toZ - fromZ) * 180) / Math.PI;
  return round1((deg + 360) % 360);
}
function radToBearing(rad: number): number {
  return round1((((rad * 180) / Math.PI) + 360) % 360);
}

/** Coarse, honest place language — never an exact coordinate. Nav points are on
 *  the integer grid; avatars sit at the +0.5 cell centre, so compare to centre. */
function placeLabel(x: number, z: number): string {
  let bestName = '';
  let bestD = Infinity;
  for (const p of NAV_POINTS) {
    const d = Math.hypot(p.x + 0.5 - x, p.z + 0.5 - z);
    if (d < bestD) {
      bestD = d;
      bestName = p.name;
    }
  }
  if (!bestName) return 'open valley';
  if (bestD <= ARRIVAL_RADIUS) return `at ${bestName}`;
  if (bestD <= NEAR_RADIUS) return `near ${bestName}`;
  return 'open valley';
}

function phaseFields(phase: DayPhaseName): {
  phase: 'day' | 'dusk' | 'night' | 'dawn';
  light: 'bright' | 'dim' | 'dark';
} {
  switch (phase) {
    case 'Day':
      return { phase: 'day', light: 'bright' };
    case 'Dawn':
      return { phase: 'dawn', light: 'dim' };
    case 'Dusk':
      return { phase: 'dusk', light: 'dim' };
    case 'Night':
      return { phase: 'night', light: 'dark' };
  }
}

/** Map live game state to the companion's bounded observation. */
export function buildWorldObservation(snap: WorldSnapshot): WorldObservation {
  const { self, human, phase, zombies } = snap;
  const now = snap.now ?? new Date();
  const { phase: ph, light } = phaseFields(phase);
  const selfArea = placeLabel(self.x, self.z);
  const humanName = human.name ?? DEFAULT_HUMAN;

  const party: ParticipantObservation[] = [
    {
      name: humanName,
      kind: 'human',
      area: placeLabel(human.x, human.z),
      relative: { x: round1(human.x - self.x), y: 0, z: round1(human.z - self.z) },
      distance: round1(Math.hypot(human.x - self.x, human.z - self.z)),
      bearingDegrees: bearingDeg(self.x, self.z, human.x, human.z),
      visible: true,
      health: human.health,
      status: human.downed ? 'downed' : 'active',
    },
  ];

  const routes: RouteObservation[] = NAV_POINTS.map((p): RouteObservation => {
    const tx = p.x + 0.5;
    const tz = p.z + 0.5;
    return {
      label: p.name,
      destination: p.name,
      relative: { x: round1(tx - self.x), y: 0, z: round1(tz - self.z) },
      distance: round1(Math.hypot(tx - self.x, tz - self.z)),
      bearingDegrees: bearingDeg(self.x, self.z, tx, tz),
      state: 'open',
      knowledge: 'perceived',
    };
  });

  const threats: ThreatObservation[] = zombies.map((z, i): ThreatObservation => {
    const distToHuman = Math.hypot(z.x - human.x, z.z - human.z);
    return {
      id: `zombie-${i}`,
      type: 'zombie',
      relative: { x: round1(z.x - self.x), y: 0, z: round1(z.z - self.z) },
      distance: round1(Math.hypot(z.x - self.x, z.z - self.z)),
      bearingDegrees: bearingDeg(self.x, self.z, z.x, z.z),
      visible: true,
      targeting: humanName,
      state: distToHuman <= ZOMBIE_ATTACK_DIST ? 'attacking' : 'pursuing',
    };
  });

  return {
    schemaVersion: 1,
    observedAt: now.toISOString(),
    context: { mode: 'outdoor', phase: ph, light },
    self: {
      name: self.name ?? DEFAULT_SELF,
      area: selfArea,
      facingDegrees: radToBearing(self.facingRad),
      status: 'active',
    },
    party,
    navigation: { areaName: selfArea, routes },
    threats: threats.length ? threats : undefined,
  };
}
