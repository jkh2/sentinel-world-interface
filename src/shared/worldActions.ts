// World actions — system ④. The ONLY way the AI moves its avatar. Every action
// is a validated member of this closed vocabulary, targeting named locations
// (never raw coordinates), and is completely separate from computer control:
// nothing here can touch a file, a shell, or the human's avatar.

import { NAV_POINTS } from '../renderer/world/navPoints';

export type WorldActionName =
  | 'walk_to'
  | 'look_at'
  | 'follow_human'
  | 'stop'
  | 'sit'
  | 'stand'
  | 'wave'
  | 'nod'
  | 'point'
  | 'idle'
  | 'dig_front'
  | 'place_front';

export type WorldAction =
  | { action: 'walk_to'; target: string }
  | { action: 'look_at'; target: string }
  | { action: 'point'; target: string }
  | { action: 'follow_human' }
  | { action: 'stop' }
  | { action: 'sit' }
  | { action: 'stand' }
  | { action: 'wave' }
  | { action: 'nod' }
  | { action: 'idle' }
  | { action: 'dig_front' }
  | { action: 'place_front'; block?: string };

const TARGETED = new Set<WorldActionName>(['walk_to', 'look_at', 'point']);
const VALID_BLOCKS = new Set(['grass', 'dirt', 'stone', 'sand']);
const ALL_NAMES = new Set<WorldActionName>([
  'walk_to', 'look_at', 'follow_human', 'stop', 'sit', 'stand', 'wave', 'nod',
  'point', 'idle', 'dig_front', 'place_front',
]);

/** Validate an arbitrary object into a WorldAction, or null if invalid. */
export function parseWorldAction(obj: unknown): WorldAction | null {
  if (!obj || typeof obj !== 'object') return null;
  const a = obj as Record<string, unknown>;
  const name = a.action;
  if (typeof name !== 'string' || !ALL_NAMES.has(name as WorldActionName)) return null;

  if (TARGETED.has(name as WorldActionName)) {
    const target = a.target;
    if (typeof target !== 'string') return null;
    if (!NAV_POINTS.some((p) => p.name === target)) return null; // unknown location
    return { action: name, target } as WorldAction;
  }
  if (name === 'place_front') {
    const block = typeof a.block === 'string' && VALID_BLOCKS.has(a.block) ? a.block : 'dirt';
    return { action: 'place_front', block };
  }
  return { action: name } as WorldAction;
}

/**
 * Pull world-action envelopes out of assistant text and return the cleaned
 * text (with the envelopes removed). Supports two forms:
 *   fenced:  ```world\n{ "action": "walk_to", "target": "pond_edge" }\n```
 *   inline:  @world {"action":"sit"}
 */
export function extractWorldActions(text: string): {
  actions: WorldAction[];
  cleaned: string;
} {
  const actions: WorldAction[] = [];
  let cleaned = text;

  const fenced = /```world\s*([\s\S]*?)```/g;
  cleaned = cleaned.replace(fenced, (_m, body: string) => {
    tryParseInto(body, actions);
    return '';
  });

  const inline = /@world\s*(\{[^\n]*\})/g;
  cleaned = cleaned.replace(inline, (_m, body: string) => {
    tryParseInto(body, actions);
    return '';
  });

  return { actions, cleaned: cleaned.trim() };
}

function tryParseInto(body: string, out: WorldAction[]): void {
  // A block may contain one JSON object or several (one per line).
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const parsed = parseWorldAction(JSON.parse(t));
      if (parsed) out.push(parsed);
    } catch {
      /* ignore malformed */
    }
  }
}

/** System-prompt fragment that teaches the live agent how to move its avatar. */
export function worldProtocolPrompt(): string {
  const points = NAV_POINTS.map((p) => p.name).join(', ');
  return [
    'You have an avatar in a shared 3D valley with your human partner. You can',
    'MOVE and GESTURE by emitting a world-action envelope anywhere in your reply:',
    '',
    '```world',
    '{"action":"walk_to","target":"pond_edge"}',
    '```',
    '',
    'Available actions: walk_to<target>, look_at<target>, point<target>,',
    'follow_human, stop, sit, stand, wave, nod, idle, dig_front, place_front<block>.',
    `Valid targets (named locations only): ${points}.`,
    'dig_front removes the ground block just ahead of you; place_front stacks a',
    'block ahead of you (block: grass | dirt | stone | sand, default dirt). Use',
    'these to dig and build alongside your partner — e.g. walk over, then dig or',
    'stack blocks to help build.',
    '',
    'Emit an action when it fits the moment — walk over when your partner calls',
    'you, sit when you settle in to work, wave in greeting, dig or build when you',
    'help. Movement is optional and expressive, never required. World-actions never',
    'touch files or commands; they only move your avatar and shape the ground. Keep',
    'your spoken words natural; the envelope is stripped out before your words show.',
  ].join('\n');
}
