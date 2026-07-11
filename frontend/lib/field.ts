// Repère match (CLAUDE.md §6) : origine au centre du terrain,
// x ∈ [-52.5, 52.5] (longueur), y ∈ [-34, 34] (largeur), z = hauteur.
// Monde Three.js : sol = plan XZ, hauteur = axe Y. worldX = x, worldZ = -y
// (y terrain positif = côté opposé à la caméra TV).

export const FIELD_LENGTH = 105;
export const FIELD_WIDTH = 68;
export const HALF_LENGTH = FIELD_LENGTH / 2;
export const HALF_WIDTH = FIELD_WIDTH / 2;

export const CENTER_CIRCLE_RADIUS = 9.15;
export const PENALTY_AREA_DEPTH = 16.5;
export const PENALTY_AREA_HALF_WIDTH = 20.16;
export const GOAL_AREA_DEPTH = 5.5;
export const GOAL_AREA_HALF_WIDTH = 9.16;
export const PENALTY_SPOT_DIST = 11;
export const GOAL_HALF_WIDTH = 3.66;
export const GOAL_HEIGHT = 2.44;

export function fieldToWorld(x: number, y: number, z = 0): [number, number, number] {
  return [x, z, -y];
}
