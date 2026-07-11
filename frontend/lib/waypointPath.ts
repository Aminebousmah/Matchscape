import type { Waypoint } from './types';

/**
 * Chemin paramétré par le temps : interpolation Catmull-Rom entre des
 * waypoints horodatés (x, y au sol + z hauteur optionnelle pour le ballon).
 * C'est la primitive de rejeu des MatchScriptChunk — chaque segment respecte
 * le timing de ses waypoints, la vitesse instantanée découle des données.
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

  positionAt(t: number): { x: number; y: number; z: number } {
    const wps = this.wps;
    const clamped = Math.min(Math.max(t, wps[0].t), wps[wps.length - 1].t);

    let i = 0;
    while (i < wps.length - 2 && wps[i + 1].t <= clamped) i++;

    const p1 = wps[i];
    const p2 = wps[i + 1];

    // Segment de maintien (waypoints confondus) : position constante, sinon
    // les tangentes Catmull-Rom des voisins font dériver le point pendant
    // que le joueur est censé être à l'arrêt.
    if (p1.x === p2.x && p1.y === p2.y && (p1.z ?? 0) === (p2.z ?? 0)) {
      return { x: p1.x, y: p1.y, z: p1.z ?? 0 };
    }

    const p0 = wps[Math.max(i - 1, 0)];
    const p3 = wps[Math.min(i + 2, wps.length - 1)];

    const span = p2.t - p1.t;
    const u = span > 0 ? (clamped - p1.t) / span : 0;

    return {
      x: hermite(p0.x, p1.x, p2.x, p3.x, p0.t, p1.t, p2.t, p3.t, u),
      y: hermite(p0.y, p1.y, p2.y, p3.y, p0.t, p1.t, p2.t, p3.t, u),
      z: Math.max(
        0,
        hermite(p0.z ?? 0, p1.z ?? 0, p2.z ?? 0, p3.z ?? 0, p0.t, p1.t, p2.t, p3.t, u),
      ),
    };
  }

  /** Vitesse sol instantanée (m/s) par différence finie centrée. */
  velocityAt(t: number, eps = 0.05): { x: number; y: number } {
    const a = this.positionAt(t - eps);
    const b = this.positionAt(t + eps);
    return { x: (b.x - a.x) / (2 * eps), y: (b.y - a.y) / (2 * eps) };
  }
}

/**
 * Hermite cubique à tangentes pondérées par le temps (Catmull-Rom non
 * uniforme) : contrairement à la Catmull-Rom classique, la vitesse reste
 * continue quand des segments courts suivent des segments longs — sinon un
 * waypoint de décélération après un sprint provoque une embardée.
 */
function hermite(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  u: number,
): number {
  const dt = t2 - t1;
  const m1 = t2 - t0 > 1e-9 ? ((p2 - p0) / (t2 - t0)) * dt : 0;
  const m2 = t3 - t1 > 1e-9 ? ((p3 - p1) / (t3 - t1)) * dt : 0;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * p1 +
    (u3 - 2 * u2 + u) * m1 +
    (-2 * u3 + 3 * u2) * p2 +
    (u3 - u2) * m2
  );
}
