// Non-visual R3F component: turns live game state into a WorldObservation on
// a throttled cadence and hands it to the caller. This is the "eyes" feed
// shared by both cognition doors (a live Claude session via MCP tools, and
// the public-edition GenericLLMAdapter) — provider-neutral on purpose.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { buildWorldObservation, type DayPhaseName } from './worldObservation';
import type { WorldObservation } from '../../main/bridge/worldCognitionContract';
import type { AvatarHandle } from './avatarHandle';
import type { CombatLink } from './combat';

const OBSERVE_INTERVAL_S = 0.5;

interface Props {
  avatar: AvatarHandle;
  combat: CombatLink;
  phase: DayPhaseName;
  selfName: string;
  onObservation: (observation: WorldObservation) => void;
}

export function WorldObserver({ avatar, combat, phase, selfName, onObservation }: Props): null {
  const { camera } = useThree();
  const sinceLast = useRef(0);

  useFrame((_, dt) => {
    sinceLast.current += dt;
    if (sinceLast.current < OBSERVE_INTERVAL_S) return;
    sinceLast.current = 0;

    const observation = buildWorldObservation({
      self: { x: avatar.x, z: avatar.z, facingRad: avatar.facingRad, name: selfName },
      human: { x: camera.position.x, z: camera.position.z },
      phase,
      zombies: combat.zombies,
    });
    onObservation(observation);
  });

  return null;
}
