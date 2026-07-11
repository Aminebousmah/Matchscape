// Format pivot backend → renderer (CLAUDE.md §6). Le scénariste Python
// émettra ces chunks via WebSocket en phase 2 ; en attendant le renderer
// les consomme depuis des données locales (lib/demoChunk.ts).

import type { TimedAction, Waypoint } from './types';

export type PlayerId = string;

export type MatchPhase =
  | 'OPEN_PLAY'
  | 'SET_PIECE'
  | 'GOAL_SEQUENCE'
  | 'RESTART'
  | 'CELEBRATION';

export interface PlayerTrack {
  /** Ajout au schéma CLAUDE.md : nécessaire au renderer (couleurs, radar) */
  teamId: number;
  waypoints: Waypoint[];
  actions: TimedAction[];
  /** Le gardien utilise son propre jeu de clips (GkIdle, GkSidestep…) */
  isGoalkeeper?: boolean;
}

export interface MatchScriptChunk {
  fixtureId: number;
  simTimeStart: number;
  simTimeEnd: number;
  phase: MatchPhase;
  ball: Waypoint[];
  players: Record<PlayerId, PlayerTrack>;
  commentary?: string;
  /** Extensions HUD émises par le scénariste (backend/scenarist/models.py) */
  minute?: number;
  score?: [number, number];
}

export interface ReplayTeamMeta {
  id: number;
  name: string;
  isHome: boolean;
}

/** Événement réel extrait d'API-Football (données brutes, non générées) */
export interface TimelineEntry {
  simTime: number;
  minute: number;
  extraMinute?: number;
  type: 'GOAL' | 'CARD' | 'SUBST' | 'VAR';
  teamId: number;
  teamName: string;
  player?: string;
  assist?: string;
  detail?: string;
  comments?: string;
  isHighlight: boolean;
  cancelled?: boolean;
}

/** Fichier de rejeu complet émis par `python -m scenarist.generate` */
export interface MatchReplayFile {
  fixtureId: number;
  teams: ReplayTeamMeta[];
  duration: number;
  timeline: TimelineEntry[];
  chunks: MatchScriptChunk[];
}
