import { describe, expect, it } from 'vitest';
import { WaypointPath } from './waypointPath';
import { animStateForSpeed } from './types';
import type { Waypoint } from './types';

// Segment IDLE (2 s sur place) → course → arrêt, comme le chemin de démo du POC
const WPS: Waypoint[] = [
  { t: 0, x: -40, y: -20 },
  { t: 2, x: -40, y: -20 },
  { t: 6, x: -20, y: -12 },
  { t: 10, x: 8, y: 6 },
  { t: 12, x: 8, y: 6 },
];

describe('WaypointPath', () => {
  it('rejects fewer than 2 waypoints', () => {
    expect(() => new WaypointPath([{ t: 0, x: 0, y: 0 }])).toThrow();
  });

  it('passes exactly through each waypoint at its timestamp', () => {
    const path = new WaypointPath(WPS);
    for (const wp of WPS) {
      const p = path.positionAt(wp.t);
      expect(p.x).toBeCloseTo(wp.x, 5);
      expect(p.y).toBeCloseTo(wp.y, 5);
    }
  });

  it('clamps outside the time range', () => {
    const path = new WaypointPath(WPS);
    expect(path.positionAt(-5)).toEqual({ x: -40, y: -20, z: 0 });
    const end = path.positionAt(999);
    expect(end.x).toBeCloseTo(8, 5);
    expect(end.y).toBeCloseTo(6, 5);
  });

  it('exposes duration and start time', () => {
    const path = new WaypointPath(WPS);
    expect(path.startTime).toBe(0);
    expect(path.duration).toBe(12);
  });

  it('is stationary (IDLE) during a hold segment', () => {
    const path = new WaypointPath(WPS);
    const v = path.velocityAt(1);
    const speed = Math.hypot(v.x, v.y);
    expect(speed).toBeLessThan(0.3);
    expect(animStateForSpeed(speed)).toBe('IDLE');
  });

  it('moves at a plausible running speed mid-segment', () => {
    const path = new WaypointPath(WPS);
    // segment t∈[6,10] : ~33,4 m en 4 s ≈ 8,4 m/s de moyenne
    const v = path.velocityAt(8);
    const speed = Math.hypot(v.x, v.y);
    expect(speed).toBeGreaterThan(4);
    expect(speed).toBeLessThan(13);
    expect(['RUN', 'SPRINT']).toContain(animStateForSpeed(speed));
  });

  it('produces a continuous trajectory (no jumps between samples)', () => {
    const path = new WaypointPath(WPS);
    let prev = path.positionAt(0);
    for (let t = 0.05; t <= 12; t += 0.05) {
      const cur = path.positionAt(t);
      const step = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      // à 20 échantillons/s, même un sprint à 13 m/s ne dépasse pas ~0,65 m/pas
      expect(step).toBeLessThan(0.8);
      prev = cur;
    }
  });

  it('interpolates ball height (z) as an arc and never goes underground', () => {
    // centre : départ sol, pic à 3,5 m, réception sol
    const path = new WaypointPath([
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 10, y: 0, z: 3.5 },
      { t: 2, x: 20, y: 0 },
    ]);
    expect(path.positionAt(0).z).toBe(0);
    expect(path.positionAt(1).z).toBeCloseTo(3.5, 5);
    expect(path.positionAt(2).z).toBeCloseTo(0, 5);
    for (let t = 0; t <= 2; t += 0.05) {
      expect(path.positionAt(t).z).toBeGreaterThanOrEqual(0);
    }
    expect(path.positionAt(0.5).z).toBeGreaterThan(1);
  });

  it('sorts unordered waypoints by time', () => {
    const path = new WaypointPath([WPS[2], WPS[0], WPS[4], WPS[1], WPS[3]]);
    expect(path.startTime).toBe(0);
    expect(path.duration).toBe(12);
    const p = path.positionAt(6);
    expect(p.x).toBeCloseTo(-20, 5);
    expect(p.y).toBeCloseTo(-12, 5);
  });
});
