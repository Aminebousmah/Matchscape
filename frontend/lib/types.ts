// Sous-ensemble du format MatchScript (CLAUDE.md §6) nécessaire au POC.

export interface Waypoint {
  /** Secondes de temps match simulé */
  t: number;
  x: number;
  y: number;
}

export type PlayerAnimState = 'IDLE' | 'RUN' | 'SPRINT';

/** Vitesse (m/s) au-delà de laquelle on passe de IDLE à RUN, puis de RUN à SPRINT */
export const RUN_SPEED_THRESHOLD = 0.3;
export const SPRINT_SPEED_THRESHOLD = 6.0;

export function animStateForSpeed(speed: number): PlayerAnimState {
  if (speed < RUN_SPEED_THRESHOLD) return 'IDLE';
  if (speed < SPRINT_SPEED_THRESHOLD) return 'RUN';
  return 'SPRINT';
}
