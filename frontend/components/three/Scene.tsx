'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import * as THREE from 'three';
import { Pitch } from './Pitch';
import { Stadium } from './Stadium';
import { MatchPlayback } from './MatchPlayback';
import { TVCamera } from './TVCamera';
import { buildDemoChunk } from '@/lib/demoChunk';
import { useMatchStore } from '@/lib/matchStore';
import type { MatchScriptChunk } from '@/lib/matchScript';
import type { MatchReplayFile } from '@/lib/matchScript';

interface LoadedMatch {
  chunks: MatchScriptChunk[];
  homeTeamId: number;
}

export default function Scene() {
  const ballRef = useRef<THREE.Group>(null);
  const [match, setMatch] = useState<LoadedMatch | null>(null);
  const showStadium = useMatchStore((s) => s.showStadium);

  useEffect(() => {
    let cancelled = false;
    fetch('/demo/match.json')
      .then((r) => (r.ok ? (r.json() as Promise<MatchReplayFile>) : null))
      .then((replay) => {
        if (cancelled) return;
        if (replay) {
          const home = replay.teams.find((t) => t.isHome) ?? replay.teams[0];
          const away = replay.teams.find((t) => !t.isHome) ?? replay.teams[1];
          useMatchStore.setState({ teams: { home: home.name, away: away.name } });
          setMatch({ chunks: replay.chunks, homeTeamId: home.id });
        } else {
          // pas de match généré : boucle de démo locale
          useMatchStore.setState({ teams: { home: 'Bleus', away: 'Rouges' } });
          setMatch({ chunks: [buildDemoChunk()], homeTeamId: 1 });
        }
      })
      .catch(() => {
        if (!cancelled) {
          useMatchStore.setState({ teams: { home: 'Bleus', away: 'Rouges' } });
          setMatch({ chunks: [buildDemoChunk()], homeTeamId: 1 });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      {showStadium && (
        <Suspense fallback={null}>
          <Stadium />
        </Suspense>
      )}
      <Pitch />
      {match && (
        <MatchPlayback
          chunks={match.chunks}
          homeTeamId={match.homeTeamId}
          ballRef={ballRef}
        />
      )}
      <TVCamera targetRef={ballRef} />
      <Stats />
    </Canvas>
  );
}
