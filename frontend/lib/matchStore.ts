import { create } from 'zustand';
import type { TimelineEntry } from './matchScript';

interface MatchHudState {
  minute: number;
  score: [number, number];
  commentary: string | null;
  teams: { home: string; away: string } | null;
  homeTeamId: number | null;
  /** Événements réels API-Football (menu highlights + fil de commentaires) */
  timeline: TimelineEntry[];
  /** simTime demandé par un clic sur un highlight ; consommé par MatchPlayback */
  seekTarget: number | null;
  seekTo: (t: number) => void;
  /** Multiplicateur de vitesse de rejeu (1 = temps réel) */
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  showStadium: boolean;
  toggleStadium: () => void;
}

export const useMatchStore = create<MatchHudState>((set) => ({
  minute: 0,
  score: [0, 0],
  commentary: null,
  teams: null,
  homeTeamId: null,
  timeline: [],
  seekTarget: null,
  seekTo: (seekTarget) => set({ seekTarget }),
  playbackRate: 8,
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  showStadium: true,
  toggleStadium: () => set((s) => ({ showStadium: !s.showStadium })),
}));
