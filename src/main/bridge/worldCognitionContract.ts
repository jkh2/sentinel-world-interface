import { NAV_POINTS } from '../../renderer/world/navPoints';

/**
 * Offset from the observing avatar in voxel-block units, expressed on the
 * world axes (+X, +Y, +Z), not in camera-local coordinates.
 */
export type RelativeVector = { x: number; y: number; z: number };
/**
 * World-absolute compass bearing in [0, 360): 0 = +Z and values increase
 * clockwise. Relative heading is the signed normalized (bearing - facing).
 */
export type WorldBearingDegrees = number;
/** Euclidean distance in voxel-block units. */
export type VoxelBlockDistance = number;
export type KnowledgeSource = 'perceived' | 'party-shared' | 'remembered';

export interface ParticipantObservation {
  /** Stable when the game can provide one; a display name is sufficient in v1. */
  id?: string;
  name: string;
  kind: 'human' | 'ai';
  area?: string;
  relative?: RelativeVector;
  distance?: VoxelBlockDistance;
  bearingDegrees?: WorldBearingDegrees;
  visible: boolean;
  health?: number;
  status?: 'active' | 'downed' | 'carried' | 'missing';
  intention?: string;
}

export interface RouteObservation {
  id?: string;
  label: string;
  destination?: string;
  relative?: RelativeVector;
  distance?: VoxelBlockDistance;
  bearingDegrees?: WorldBearingDegrees;
  state: 'open' | 'blocked' | 'unknown';
  knowledge: KnowledgeSource;
}

export interface ChokepointObservation {
  id?: string;
  label: string;
  relative?: RelativeVector;
  distance?: VoxelBlockDistance;
  bearingDegrees?: WorldBearingDegrees;
  width?: number;
  passable: boolean;
  heldBy?: string;
  threatCount?: number;
}

export interface ThreatObservation {
  id?: string;
  type: string;
  relative?: RelativeVector;
  distance: VoxelBlockDistance;
  bearingDegrees?: WorldBearingDegrees;
  visible: boolean;
  targeting?: string;
  state?: 'unaware' | 'searching' | 'pursuing' | 'attacking' | 'retreating';
}

export interface InteractableObservation {
  id?: string;
  type: string;
  label?: string;
  relative?: RelativeVector;
  distance?: VoxelBlockDistance;
  bearingDegrees?: WorldBearingDegrees;
  state?: string;
}

export interface WorldEventObservation {
  type: string;
  summary: string;
  ageSeconds?: number;
  actorId?: string;
  targetId?: string;
}

/**
 * A bounded, JSON-safe observation supplied to the companion model. It reports
 * only personally perceived, intentionally party-shared, or explicitly
 * remembered knowledge; it is never an omniscient dump of the world database.
 */
export interface WorldObservation {
  schemaVersion: 1;
  observedAt: string;
  context: {
    mode: 'outdoor' | 'structure' | 'cave';
    biome?: string;
    phase?: 'day' | 'dusk' | 'night' | 'dawn';
    timeOfDay?: string;
    light?: 'bright' | 'dim' | 'dark';
    visibility?: number;
  };
  self: {
    id?: string;
    name?: string;
    /**
     * Coarse place language, not an exact position: "at <name>" only inside a
     * tight arrival radius, "near <name>" inside the broader local radius, and
     * a truthful fallback such as "open valley" otherwise.
     */
    area: string;
    facingDegrees?: WorldBearingDegrees;
    health?: number;
    status?: 'active' | 'downed' | 'carried';
    inventory?: Readonly<Record<string, number>>;
  };
  party?: readonly ParticipantObservation[];
  navigation?: {
    areaId?: string;
    areaName: string;
    /** Short local summary, e.g. "north blocked, stairs down passable". */
    traversability?: string;
    routes?: readonly RouteObservation[];
  };
  /** Present when inside or immediately interacting with an authored location. */
  poi?: {
    id?: string;
    name?: string;
    kind: string;
    currentZone?: string;
    depth?: number;
    entrance?: RouteObservation;
    exploredFraction?: number;
    objectiveSignals?: readonly string[];
    structuralHazards?: readonly string[];
  };
  chokepoints?: readonly ChokepointObservation[];
  threats?: readonly ThreatObservation[];
  interactables?: readonly InteractableObservation[];
  recentEvents?: readonly WorldEventObservation[];
  activeGoal?: string;
}

export type WorldObservationProvider = () => WorldObservation | null;

const actionNames = [
  'walk_to', 'look_at', 'follow_human', 'stop', 'sit', 'stand', 'wave', 'nod',
  'point', 'idle', 'dig_front', 'place_front',
] as const;

/** Provider-neutral JSON Schema for the model's sole available tool. */
export const WORLD_ACTION_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: { type: 'string', enum: actionNames },
    target: {
      type: 'string',
      enum: NAV_POINTS.map((point) => point.name),
      description: 'Required only for walk_to, look_at, and point.',
    },
    block: {
      type: 'string',
      enum: ['grass', 'dirt', 'stone', 'sand'],
      description: 'Optional block type for place_front.',
    },
  },
} as const;

export const WORLD_ACTION_TOOL_NAME = 'world_action';

export const COMPANION_SYSTEM_PROMPT = [
  'You are the human player\'s AI companion inside a shared voxel world.',
  'Talk naturally and act as a cooperative partner. You may use the world_action',
  'tool to move only your own avatar or modify the nearby voxel world.',
  'The tool cannot control the human, access files, run commands, or use a computer.',
  'Choose actions only from the supplied schema. Treat the observation as bounded',
  'and possibly incomplete. Never claim an action succeeded merely because you',
  'requested it; the game engine validates and executes every request. Bearings',
  'are world-absolute: 0 degrees is +Z and values increase clockwise; compute a',
  'relative heading from bearing minus facing. Distances and relative vectors use',
  'voxel-block units, and relative vectors are expressed on world axes.',
].join(' ');

const MAX_PARTY = 8;
const MAX_ROUTES = 12;
const MAX_CHOKEPOINTS = 12;
const MAX_THREATS = 24;
const MAX_INTERACTABLES = 16;
const MAX_EVENTS = 16;
const MAX_POI_SIGNALS = 12;

/** Bound all variable collections before they reach a provider prompt. */
function boundObservation(observation: WorldObservation): WorldObservation {
  return {
    ...observation,
    party: observation.party?.slice(0, MAX_PARTY),
    navigation: observation.navigation
      ? {
          ...observation.navigation,
          routes: observation.navigation.routes?.slice(0, MAX_ROUTES),
        }
      : undefined,
    poi: observation.poi
      ? {
          ...observation.poi,
          objectiveSignals: observation.poi.objectiveSignals?.slice(0, MAX_POI_SIGNALS),
          structuralHazards: observation.poi.structuralHazards?.slice(0, MAX_POI_SIGNALS),
        }
      : undefined,
    chokepoints: observation.chokepoints?.slice(0, MAX_CHOKEPOINTS),
    threats: observation.threats?.slice(0, MAX_THREATS),
    interactables: observation.interactables?.slice(0, MAX_INTERACTABLES),
    recentEvents: observation.recentEvents?.slice(0, MAX_EVENTS),
  };
}

/** Keep model input bounded even if a game system accidentally overproduces. */
export function serializeObservation(observation: WorldObservation | null): string {
  if (!observation) return 'No current world observation is available.';
  const json = JSON.stringify(boundObservation(observation));
  return json.length <= 12_000
    ? json
    : `${json.slice(0, 12_000)}...[observation truncated]`;
}
