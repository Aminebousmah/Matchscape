import { describe, expect, it } from 'vitest';
import { buildDemoChunk } from './demoChunk';
import { WaypointPath } from './waypointPath';
import { HALF_LENGTH, HALF_WIDTH } from './field';

describe('buildDemoChunk', () => {
  const chunk = buildDemoChunk();

  it('is deterministic', () => {
    expect(buildDemoChunk()).toEqual(chunk);
  });

  it('contains 22 players split into two teams', () => {
    const tracks = Object.values(chunk.players);
    expect(tracks).toHaveLength(22);
    expect(tracks.filter((p) => p.teamId === 1)).toHaveLength(11);
    expect(tracks.filter((p) => p.teamId === 2)).toHaveLength(11);
  });

  it('every track covers the full chunk and loops back to its start', () => {
    for (const [id, track] of Object.entries(chunk.players)) {
      const wps = track.waypoints;
      expect(wps.length, id).toBeGreaterThanOrEqual(2);
      expect(wps[0].t, id).toBe(chunk.simTimeStart);
      expect(wps[wps.length - 1].t, id).toBe(chunk.simTimeEnd);
      // boucle sans téléportation : même position au début et à la fin
      expect(wps[wps.length - 1].x, id).toBeCloseTo(wps[0].x, 5);
      expect(wps[wps.length - 1].y, id).toBeCloseTo(wps[0].y, 5);
    }
  });

  it('waypoint times are strictly increasing except hold segments', () => {
    for (const [id, track] of Object.entries(chunk.players)) {
      for (let i = 1; i < track.waypoints.length; i++) {
        expect(track.waypoints[i].t, id).toBeGreaterThan(track.waypoints[i - 1].t);
      }
    }
  });

  it('players stay within the pitch (small margin for byline runs)', () => {
    for (const [id, track] of Object.entries(chunk.players)) {
      const path = new WaypointPath(track.waypoints);
      for (let t = 0; t <= 60; t += 0.25) {
        const p = path.positionAt(t);
        expect(Math.abs(p.x), `${id} t=${t}`).toBeLessThan(HALF_LENGTH + 1.5);
        expect(Math.abs(p.y), `${id} t=${t}`).toBeLessThan(HALF_WIDTH + 1.5);
      }
    }
  });

  it('player speeds stay humanly plausible (< 10.5 m/s, pointe de sprint pro)', () => {
    for (const [id, track] of Object.entries(chunk.players)) {
      const path = new WaypointPath(track.waypoints);
      for (let t = 0.2; t < 60; t += 0.2) {
        const v = path.velocityAt(t);
        expect(Math.hypot(v.x, v.y), `${id} t=${t}`).toBeLessThan(10.5);
      }
    }
  });

  it('actions all fall within the chunk time range', () => {
    for (const track of Object.values(chunk.players)) {
      for (const action of track.actions) {
        expect(action.t).toBeGreaterThanOrEqual(chunk.simTimeStart);
        expect(action.t).toBeLessThanOrEqual(chunk.simTimeEnd);
      }
    }
  });

  it('ball loops seamlessly and reaches both goals', () => {
    const path = new WaypointPath(chunk.ball);
    expect(path.startTime).toBe(0);
    expect(path.duration).toBe(60);
    const start = path.positionAt(0);
    const end = path.positionAt(60);
    expect(end.x).toBeCloseTo(start.x, 5);
    expect(end.y).toBeCloseTo(start.y, 5);
    // un but de chaque côté
    let maxX = -Infinity;
    let minX = Infinity;
    for (let t = 0; t <= 60; t += 0.1) {
      const p = path.positionAt(t);
      maxX = Math.max(maxX, p.x);
      minX = Math.min(minX, p.x);
    }
    expect(maxX).toBeGreaterThan(HALF_LENGTH);
    expect(minX).toBeLessThan(-HALF_LENGTH);
  });
});
