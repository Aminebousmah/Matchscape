// Sous-ensemble du format MatchScript (CLAUDE.md §6) nécessaire au renderer.

export interface Waypoint {
  /** Secondes de temps match simulé */
  t: number;
  x: number;
  y: number;
  /** Hauteur (ballon uniquement) — 0 si absent */
  z?: number;
}

export type PlayerAnimState = 'IDLE' | 'WALK' | 'RUN' | 'SPRINT';

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

/** Seuils de vitesse (m/s) entre états de locomotion */
export const WALK_SPEED_THRESHOLD = 0.3;
export const RUN_SPEED_THRESHOLD = 2.6;
export const SPRINT_SPEED_THRESHOLD = 6.0;

export function animStateForSpeed(speed: number): PlayerAnimState {
  if (speed < WALK_SPEED_THRESHOLD) return 'IDLE';
  if (speed < RUN_SPEED_THRESHOLD) return 'WALK';
  if (speed < SPRINT_SPEED_THRESHOLD) return 'RUN';
  return 'SPRINT';
}
