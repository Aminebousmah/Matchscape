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
}

export interface MatchScriptChunk {
  fixtureId: number;
  simTimeStart: number;
  simTimeEnd: number;
  phase: MatchPhase;
  ball: Waypoint[];
  players: Record<PlayerId, PlayerTrack>;
  commentary?: string;
}
