'use client';

import { useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import * as THREE from 'three';
import { Pitch } from './Pitch';
import { MatchPlayback } from './MatchPlayback';
import { TVCamera } from './TVCamera';
import { buildDemoChunk } from '@/lib/demoChunk';

export default function Scene() {
  const ballRef = useRef<THREE.Group>(null);
  const chunk = useMemo(buildDemoChunk, []);

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
      <MatchPlayback chunk={chunk} ballRef={ballRef} />
      <TVCamera targetRef={ballRef} />
      <Stats />
    </Canvas>
  );
}
