import { create } from 'zustand';

interface MatchHudState {
  minute: number;
  score: [number, number];
  commentary: string | null;
  teams: { home: string; away: string } | null;
  /** Multiplicateur de vitesse de rejeu (1 = temps réel) */
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
}

export const useMatchStore = create<MatchHudState>((set) => ({
  minute: 0,
  score: [0, 0],
  commentary: null,
  teams: null,
  playbackRate: 8,
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
}));
