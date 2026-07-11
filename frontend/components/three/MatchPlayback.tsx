'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MatchScriptChunk } from '@/lib/matchScript';
import type { PlayerMotion, TimedAction } from '@/lib/types';
import { WaypointPath } from '@/lib/waypointPath';
import { fieldToWorld } from '@/lib/field';
import { useMatchStore } from '@/lib/matchStore';
import { AnimatedPlayer } from './AnimatedPlayer';
import { PlayerRig } from './PlayerRig';

const BALL_RADIUS = 0.18; // légèrement plus gros que nature, lisible de loin
const HOME_COLOR = '#2563eb';
const AWAY_COLOR = '#dc2626';

const tmpQuat = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Entry {
  id: string;
  teamId: number;
  isGoalkeeper: boolean;
  path: WaypointPath;
  actions: TimedAction[];
  cursor: { i: number };
  motion: PlayerMotion;
}

interface MatchPlaybackProps {
  chunks: MatchScriptChunk[];
  homeTeamId: number;
  /** Groupe du ballon, exposé pour la caméra TV */
  ballRef: MutableRefObject<THREE.Group | null>;
}

/**
 * Rejoue une suite de MatchScriptChunk contigus (match complet) : une seule
 * boucle useFrame déplace joueurs + ballon, déclenche les TimedAction et
 * alimente le HUD (minute, score, commentaire). La vitesse de rejeu vient
 * du store (playbackRate).
 */
export function MatchPlayback({ chunks, homeTeamId, ballRef }: MatchPlaybackProps) {
  const [chunkIdx, setChunkIdx] = useState(0);
  const chunk = chunks[chunkIdx];

  const entries = useMemo<Entry[]>(
    () =>
      Object.entries(chunk.players).map(([id, track]) => ({
        id,
        teamId: track.teamId,
        isGoalkeeper: track.isGoalkeeper ?? false,
        path: new WaypointPath(track.waypoints),
        actions: [...track.actions].sort((a, b) => a.t - b.t),
        cursor: { i: 0 },
        motion: { speed: 0, oneShot: null },
      })),
    [chunk],
  );
  const ballPath = useMemo(() => new WaypointPath(chunk.ball), [chunk]);

  const groups = useRef<Record<string, THREE.Group | null>>({});
  const globalTime = useRef(0);
  const lastHudMinute = useRef(-1);
  const duration = chunks[chunks.length - 1].simTimeEnd;

  // HUD : à chaque changement de chunk
  useEffect(() => {
    useMatchStore.setState({
      minute: chunk.minute ?? Math.floor(chunk.simTimeStart / 60) + 1,
      score: chunk.score ?? [0, 0],
      commentary: chunk.commentary ?? null,
    });
  }, [chunk]);

  useFrame((_, rawDt) => {
    const rate = useMatchStore.getState().playbackRate;
    const dt = Math.min(rawDt, 0.1) * rate;
    globalTime.current += dt;

    if (globalTime.current >= duration) {
      globalTime.current = 0;
      setChunkIdx(0);
      return;
    }
    if (globalTime.current >= chunk.simTimeEnd) {
      // avance d'un chunk ; les entries du suivant arrivent au prochain render
      let next = chunkIdx;
      while (next < chunks.length - 1 && chunks[next].simTimeEnd <= globalTime.current) next++;
      setChunkIdx(next);
      return;
    }
    if (globalTime.current < chunk.simTimeStart) {
      globalTime.current = chunk.simTimeStart;
    }
    const t = globalTime.current;

    // minute affichée, mise à jour au plus 1×/s
    const minute = Math.floor(t / 60) + 1;
    if (minute !== lastHudMinute.current) {
      lastHudMinute.current = minute;
      useMatchStore.setState({ minute });
    }

    const animDt = Math.min(rawDt, 0.1);
    for (const entry of entries) {
      const group = groups.current[entry.id];
      if (!group) continue;

      const pos = entry.path.positionAt(t);
      const vel = entry.path.velocityAt(t);
      const speed = Math.hypot(vel.x, vel.y);
      entry.motion.speed = speed;

      const [wx, wy, wz] = fieldToWorld(pos.x, pos.y);
      group.position.set(wx, wy, wz);

      if (speed > 0.15) {
        const heading = Math.atan2(vel.x, -vel.y);
        tmpQuat.setFromAxisAngle(Y_AXIS, heading);
        group.quaternion.slerp(tmpQuat, 1 - Math.exp(-8 * animDt));
      }

      while (entry.cursor.i < entry.actions.length && entry.actions[entry.cursor.i].t <= t) {
        entry.motion.oneShot = entry.actions[entry.cursor.i].type;
        entry.cursor.i++;
      }
    }

    const ball = ballRef.current;
    if (ball) {
      const bp = ballPath.positionAt(t);
      const [bx, by, bz] = fieldToWorld(bp.x, bp.y, BALL_RADIUS + bp.z);
      ball.position.set(bx, by, bz);
    }
  });

  return (
    <group>
      {entries.map((entry) => (
        <group
          key={entry.id}
          ref={(node) => {
            groups.current[entry.id] = node;
          }}
        >
          {/* marqueur d'équipe au sol, en attendant les maillots (pack Ochi) */}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
            <ringGeometry args={[0.55, 0.8, 24]} />
            <meshBasicMaterial
              color={entry.teamId === homeTeamId ? HOME_COLOR : AWAY_COLOR}
              transparent
              opacity={0.85}
            />
          </mesh>
          <Suspense fallback={<PlayerRig motion={entry.motion} />}>
            <AnimatedPlayer motion={entry.motion} isGoalkeeper={entry.isGoalkeeper} />
          </Suspense>
        </group>
      ))}
      <group ref={ballRef}>
        <mesh castShadow>
          <sphereGeometry args={[BALL_RADIUS, 16, 12]} />
          <meshStandardMaterial color="#f2f2f2" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
