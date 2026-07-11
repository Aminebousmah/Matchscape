'use client';

import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import * as THREE from 'three';
import { Pitch } from './Pitch';
import { WaypointRunner } from './WaypointRunner';
import { TVCamera } from './TVCamera';
import type { Waypoint } from '@/lib/types';

// Chemin de démo : arrêt (IDLE) → course (RUN) → accélération (SPRINT) →
// décélération → arrêt, puis retour au point de départ pour boucler sans à-coup.
const DEMO_WAYPOINTS: Waypoint[] = [
  { t: 0, x: -40, y: -20 },
  { t: 2, x: -40, y: -20 },
  { t: 6, x: -20, y: -12 },
  { t: 10, x: 8, y: 6 },
  { t: 14, x: 30, y: 18 },
  { t: 17, x: 38, y: 20 },
  { t: 19, x: 38, y: 20 },
  { t: 25, x: 0, y: 0 },
  { t: 32, x: -40, y: -20 },
  { t: 34, x: -40, y: -20 },
];

export default function Scene() {
  const playerRef = useRef<THREE.Group>(null);

  return (
    <Canvas
      shadows
      camera={{ position: [0, 26, 46], fov: 40 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#7fb2d9']} />
      <fog attach="fog" args={['#7fb2d9', 120, 260]} />

      <hemisphereLight args={['#bfd8ff', '#3a6b2e', 0.9]} />
      <directionalLight
        position={[45, 70, 30]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
      />

      <Pitch />
      <WaypointRunner ref={playerRef} waypoints={DEMO_WAYPOINTS} />
      <TVCamera targetRef={playerRef} />
      <Stats />
    </Canvas>
  );
}
