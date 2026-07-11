'use client';

import { useMemo } from 'react';
import { useMatchStore } from '@/lib/matchStore';
import type { TimelineEntry } from '@/lib/matchScript';

const ICONS: Record<TimelineEntry['type'], string> = {
  GOAL: '⚽',
  CARD: '🟨',
  SUBST: '🔁',
  VAR: '📺',
};

function icon(e: TimelineEntry): string {
  if (e.type === 'CARD') return e.detail === 'Red Card' ? '🟥' : '🟨';
  if (e.cancelled) return '❌';
  return ICONS[e.type];
}

/** Texte issu directement des données API-Football (detail/comments bruts) */
function label(e: TimelineEntry): string {
  const min = e.extraMinute ? `${e.minute}+${e.extraMinute}'` : `${e.minute}'`;
  const parts = [min, e.player ?? ''];
  if (e.type === 'GOAL') parts.push(e.cancelled ? 'But refusé' : 'But');
  if (e.assist) parts.push(`(${e.assist})`);
  if (e.detail) parts.push(`· ${e.detail}`);
  if (e.comments) parts.push(`· ${e.comments}`);
  return parts.filter(Boolean).join(' ');
}

export function HighlightsMenu() {
  const timeline = useMatchStore((s) => s.timeline);
  const seekTo = useMatchStore((s) => s.seekTo);
  const homeTeamId = useMatchStore((s) => s.homeTeamId);

  const highlights = useMemo(() => timeline.filter((e) => e.isHighlight), [timeline]);
  if (highlights.length === 0) return null;

  return (
    <div className="absolute left-4 top-24 max-h-[70vh] w-72 overflow-y-auto rounded-lg bg-black/70 p-2 font-mono text-xs text-white backdrop-blur">
      <div className="mb-2 px-1 font-bold tracking-wide text-white/80">
        HIGHLIGHTS · données API-Football
      </div>
      <ul className="space-y-1">
        {highlights.map((e, i) => (
          <li key={i}>
            <button
              onClick={() => seekTo(Math.max(0, e.simTime - 12))}
              className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/15 ${
                e.cancelled ? 'opacity-60' : ''
              } ${e.teamId === homeTeamId ? 'border-l-2 border-blue-400' : 'border-l-2 border-red-400'}`}
              title="Sauter à ce moment"
            >
              <span className="mt-px">{icon(e)}</span>
              <span className="flex-1 leading-tight">
                <span className="text-white/50">{e.teamName}</span>
                <br />
                {label(e)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
