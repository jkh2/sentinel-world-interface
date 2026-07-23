import { NAV_POINTS } from '../../renderer/world/navPoints';

export type RelativeVector = { x: number; y: number; z: number };
export type KnowledgeSource = 'perceived' | 'party-shared' | 'remembered';

export interface ParticipantObservation {
  /** Stable when the game can provide one; a display name is sufficient in v1. */
  id?: string;
  name: string;
  kind: 'human' | 'ai';
  area?: string;
  relative?: RelativeVector;
  distance?: number;
  bearingDegrees?: number;
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
  distance?: number;
  bearingDegrees?: number;
  state: 'open' | 'blocked' | 'unknown';
  knowledge: KnowledgeSource;
}

export interface ChokepointObservation {
  id?: string;
  label: string;
  relative?: RelativeVector;
  distance?: number;
  bearingDegrees?: number;
  width?: number;
  passable: boolean;
  heldBy?: string;
  threatCount?: number;
}

export interface ThreatObservation {
  id?: string;
  type: string;
  relative?: RelativeVector;
  distance: number;
  bearingDegrees?: number;
  visible: boolean;
  targeting?: string;
  state?: 'unaware' | 'searching' | 'pursuing' | 'attacking' | 'retreating';
}

export interface InteractableObservation {
  id?: string;
  type: string;
  label?: string;
  relative?: RelativeVector;
  distance?: number;
  bearingDegrees?: number;
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
    area: string;
    facingDegrees?: number;
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
  'requested it; the game engine validates and executes every request.',
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
