'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useMatchStore } from '@/lib/matchStore';
import { HighlightsMenu } from './HighlightsMenu';

// Le Canvas R3F touche à WebGL/window : rendu client uniquement.
const Scene = dynamic(() => import('./three/Scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-white/70">
      Chargement de la scène…
    </div>
  ),
});

const RATES = [1, 4, 8, 16, 32];

function Scoreboard() {
  const minute = useMatchStore((s) => s.minute);
  const score = useMatchStore((s) => s.score);
  const teams = useMatchStore((s) => s.teams);
  if (!teams) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded bg-black/70 px-4 py-2 font-mono text-white">
      <span className="font-bold">{teams.home}</span>
      <span className="mx-3 text-xl font-bold text-yellow-300">
        {score[0]} - {score[1]}
      </span>
      <span className="font-bold">{teams.away}</span>
      <span className="ml-4 text-white/70">{minute}&apos;</span>
    </div>
  );
}

/** Bandeau : dernier événement RÉEL extrait d'API-Football atteint (données
 *  brutes, pas le texte généré) — pour vérifier la correspondance au match. */
function CommentaryBanner() {
  const timeline = useMatchStore((s) => s.timeline);
  const minute = useMatchStore((s) => s.minute);

  const current = useMemo(() => {
    const reached = timeline.filter((e) => e.minute <= minute && !e.cancelled);
    return reached.length ? reached[reached.length - 1] : null;
  }, [timeline, minute]);

  if (!current) return null;
  const icon =
    current.type === 'GOAL'
      ? '⚽'
      : current.type === 'CARD'
        ? current.detail === 'Red Card'
          ? '🟥'
          : '🟨'
        : current.type === 'SUBST'
          ? '🔁'
          : '📺';
  const min = current.extraMinute ? `${current.minute}+${current.extraMinute}'` : `${current.minute}'`;

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 max-w-[80%] -translate-x-1/2 rounded bg-black/75 px-4 py-2 font-mono text-sm text-white">
      <span className="mr-2">{icon}</span>
      <span className="text-yellow-300">{min}</span>{' '}
      <span className="font-bold">{current.player}</span>
      {current.assist && <span className="text-white/70"> ({current.assist})</span>}
      {current.detail && <span className="text-white/70"> · {current.detail}</span>}
      <span className="ml-2 text-white/50">{current.teamName}</span>
      <span className="ml-2 rounded bg-white/10 px-1 text-[10px] text-white/50">API-Football</span>
    </div>
  );
}

function SpeedControls() {
  const rate = useMatchStore((s) => s.playbackRate);
  const setRate = useMatchStore((s) => s.setPlaybackRate);
  const showStadium = useMatchStore((s) => s.showStadium);
  const toggleStadium = useMatchStore((s) => s.toggleStadium);
  return (
    <div className="absolute right-4 top-4 flex items-center gap-1 font-mono text-xs">
      {RATES.map((r) => (
        <button
          key={r}
          onClick={() => setRate(r)}
          className={`rounded px-2 py-1 ${
            rate === r ? 'bg-yellow-400 text-black' : 'bg-black/60 text-white hover:bg-black/80'
          }`}
        >
          ×{r}
        </button>
      ))}
      <button
        onClick={toggleStadium}
        className={`ml-2 rounded px-2 py-1 ${
          showStadium ? 'bg-green-500 text-black' : 'bg-black/60 text-white hover:bg-black/80'
        }`}
      >
        Stade
      </button>
    </div>
  );
}

export function PocApp() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#7fb2d9]">
      <Scene />
      <div className="pointer-events-none absolute left-4 top-4 rounded bg-black/60 px-3 py-2 font-mono text-sm text-white">
        <div className="font-bold tracking-wide">PITCHREPLAY</div>
        <div className="text-xs text-white/60">Reconstitution simulée · scénariste v0</div>
      </div>
      <Scoreboard />
      <HighlightsMenu />
      <CommentaryBanner />
      <SpeedControls />
    </div>
  );
}
