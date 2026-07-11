import type { Waypoint } from './types';

/**
 * Chemin 2D paramétré par le temps : interpolation Catmull-Rom entre des
 * waypoints horodatés. C'est la primitive que le renderer utilisera pour
 * rejouer les MatchScriptChunk — chaque segment respecte le timing de ses
 * waypoints, la vitesse instantanée découle donc directement des données.
 */
export class WaypointPath {
  private readonly wps: Waypoint[];

  constructor(waypoints: Waypoint[]) {
    if (waypoints.length < 2) {
      throw new Error('WaypointPath requires at least 2 waypoints');
    }
    this.wps = [...waypoints].sort((a, b) => a.t - b.t);
  }

  get startTime(): number {
    return this.wps[0].t;
  }

  get duration(): number {
    return this.wps[this.wps.length - 1].t - this.wps[0].t;
  }

  positionAt(t: number): { x: number; y: number } {
    const wps = this.wps;
    const clamped = Math.min(Math.max(t, wps[0].t), wps[wps.length - 1].t);

    let i = 0;
    while (i < wps.length - 2 && wps[i + 1].t <= clamped) i++;

    const p1 = wps[i];
    const p2 = wps[i + 1];

    // Segment de maintien (waypoints confondus) : position constante, sinon
    // les tangentes Catmull-Rom des voisins font dériver le point pendant
    // que le joueur est censé être à l'arrêt.
    if (p1.x === p2.x && p1.y === p2.y) {
      return { x: p1.x, y: p1.y };
    }

    const p0 = wps[Math.max(i - 1, 0)];
    const p3 = wps[Math.min(i + 2, wps.length - 1)];

    const span = p2.t - p1.t;
    const u = span > 0 ? (clamped - p1.t) / span : 0;

    return {
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, u),
      y: catmullRom(p0.y, p1.y, p2.y, p3.y, u),
    };
  }

  /** Vitesse instantanée (m/s) par différence finie centrée. */
  velocityAt(t: number, eps = 0.05): { x: number; y: number } {
    const a = this.positionAt(t - eps);
    const b = this.positionAt(t + eps);
    return { x: (b.x - a.x) / (2 * eps), y: (b.y - a.y) / (2 * eps) };
  }
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}
