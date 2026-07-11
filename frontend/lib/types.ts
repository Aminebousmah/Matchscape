// Sous-ensemble du format MatchScript (CLAUDE.md §6) nécessaire au renderer.

export interface Waypoint {
  /** Secondes de temps match simulé */
  t: number;
  x: number;
  y: number;
  /** Hauteur (ballon uniquement) — 0 si absent */
  z?: number;
}

export type PlayerAnimState = 'IDLE' | 'RUN' | 'SPRINT';

export type ActionType = 'PASS' | 'SHOOT' | 'TACKLE' | 'CELEBRATE' | 'GK_DIVE';

export interface TimedAction {
  t: number;
  type: ActionType;
}

/**
 * État mutable partagé entre le contrôleur de mouvement (MatchPlayback) et
 * le composant d'animation (AnimatedPlayer) — écrit/lu dans useFrame, jamais
 * via des props React (pas de re-render à 60 Hz).
 */
export interface PlayerMotion {
  /** Vitesse sol instantanée (m/s) */
  speed: number;
  /** Action ponctuelle à déclencher (consommée par AnimatedPlayer) */
  oneShot: ActionType | null;
}

/** Vitesse (m/s) au-delà de laquelle on passe de IDLE à RUN, puis de RUN à SPRINT */
export const RUN_SPEED_THRESHOLD = 0.3;
export const SPRINT_SPEED_THRESHOLD = 6.0;

export function animStateForSpeed(speed: number): PlayerAnimState {
  if (speed < RUN_SPEED_THRESHOLD) return 'IDLE';
  if (speed < SPRINT_SPEED_THRESHOLD) return 'RUN';
  return 'SPRINT';
}
