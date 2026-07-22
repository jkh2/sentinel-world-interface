// Day/night cycle — the heartbeat of survival. The sun arcs, light and sky
// shift from golden dawn through bright noon to dusk and dark night, and the
// current phase is reported up so the game can escalate (few slow wanderers by
// day; faster waves at night). Lights/fog are mutated per-frame (cheap); the
// Sky shader's sun follows on a throttle.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';

export type DayPhase = 'Dawn' | 'Day' | 'Dusk' | 'Night';

/** Seconds for one full day→night→day cycle (one hour). */
const DAY_LENGTH = 3600;

export function DayNight({
  onTick,
}: {
  onTick: (timeOfDay: number, isNight: boolean, phase: DayPhase) => void;
}): JSX.Element {
  const { scene } = useThree();
  const time = useRef(0.3); // start mid-morning
  const dirLight = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const [sunPos, setSunPos] = useState<[number, number, number]>([50, 40, 20]);
  const lastSky = useRef(0);
  const lastReport = useRef(0);

  const fogDay = useMemo(() => new THREE.Color('#e2d3b2'), []);
  const fogNight = useMemo(() => new THREE.Color('#0b1826'), []);
  const fogDusk = useMemo(() => new THREE.Color('#b9713f'), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  // Dev/test keys: N jumps to deep night, M jumps to morning (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyN') time.current = 0.0;
      if (e.code === 'KeyM') time.current = 0.3;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useFrame((state, dt) => {
    time.current = (time.current + Math.min(dt, 0.05) / DAY_LENGTH) % 1;
    const t = time.current;

    const elev = Math.sin((t - 0.25) * Math.PI * 2); // -1 midnight .. +1 noon
    const az = t * Math.PI * 2;
    const sunX = Math.cos(az) * 80;
    const sunY = elev * 80;
    const sunZ = Math.sin(az) * 80;
    const day = Math.max(0, elev); // 0 at/below horizon, 1 at noon
    const nearHorizon = Math.max(0, 1 - Math.abs(elev) * 2.2); // dusk/dawn glow

    if (dirLight.current) {
      dirLight.current.position.set(28 + sunX, Math.max(3, sunY), 28 + sunZ);
      dirLight.current.intensity = 0.05 + day * 1.2;
      dirLight.current.color.setRGB(1, 0.96 - nearHorizon * 0.22, 0.82 - nearHorizon * 0.32);
    }
    if (hemi.current) hemi.current.intensity = 0.12 + day * 0.6;

    // Fog + background: night → day, with a dusk/dawn warm tint near the horizon.
    tmp.copy(fogNight).lerp(fogDay, Math.min(1, day * 1.7));
    if (nearHorizon > 0) tmp.lerp(fogDusk, nearHorizon * 0.6);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(tmp);
    scene.background = tmp.clone();

    const isNight = elev < -0.05;

    if (state.clock.elapsedTime - lastSky.current > 0.2) {
      lastSky.current = state.clock.elapsedTime;
      setSunPos([sunX, sunY, sunZ]);
    }
    if (state.clock.elapsedTime - lastReport.current > 0.3) {
      lastReport.current = state.clock.elapsedTime;
      const rising = t < 0.5;
      const phase: DayPhase =
        elev > 0.18 ? 'Day' : elev > -0.05 ? (rising ? 'Dawn' : 'Dusk') : 'Night';
      onTick(t, isNight, phase);
    }
  });

  return (
    <>
      <Sky sunPosition={sunPos} turbidity={7} rayleigh={2.4} mieCoefficient={0.006} mieDirectionalG={0.86} />
      <hemisphereLight ref={hemi} args={['#e7edf5', '#3a3226', 0.6]} />
      <directionalLight
        ref={dirLight}
        castShadow
        position={[88, 55, 48]}
        intensity={1.2}
        color="#ffe9c4"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-far={260}
      />
      <ambientLight intensity={0.14} />
    </>
  );
}
