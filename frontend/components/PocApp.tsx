'use client';

import dynamic from 'next/dynamic';

// Le Canvas R3F touche à WebGL/window : rendu client uniquement.
const Scene = dynamic(() => import('./three/Scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-white/70">
      Chargement de la scène…
    </div>
  ),
});

export function PocApp() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#7fb2d9]">
      <Scene />
      <div className="pointer-events-none absolute left-4 top-4 rounded bg-black/60 px-3 py-2 font-mono text-sm text-white">
        <div className="font-bold tracking-wide">PITCHREPLAY — POC 0.A</div>
        <div className="text-xs text-white/60">Reconstitution simulée · waypoints Catmull-Rom</div>
      </div>
    </div>
  );
}
