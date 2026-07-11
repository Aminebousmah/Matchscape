'use client';

import { Suspense, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MatchScriptChunk } from '@/lib/matchScript';
import type { PlayerMotion, TimedAction } from '@/lib/types';
import { WaypointPath } from '@/lib/waypointPath';
import { fieldToWorld } from '@/lib/field';
import { AnimatedPlayer } from './AnimatedPlayer';
import { PlayerRig } from './PlayerRig';

const BALL_RADIUS = 0.18; // légèrement plus gros que nature, lisible de loin
const TEAM_COLORS: Record<number, string> = { 1: '#2563eb', 2: '#dc2626' };

const tmpQuat = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Entry {
  id: string;
  teamId: number;
  path: WaypointPath;
  actions: TimedAction[];
  motion: PlayerMotion;
}

interface MatchPlaybackProps {
  chunk: MatchScriptChunk;
  /** Groupe du ballon, exposé pour la caméra TV */
  ballRef: MutableRefObject<THREE.Group | null>;
}

/**
 * Rejoue un MatchScriptChunk : une seule boucle useFrame déplace les 22
 * joueurs + le ballon (position Catmull-Rom, orientation vers la course,
 * vitesse → état d'animation) et déclenche les TimedAction (passe, tir…).
 */
export function MatchPlayback({ chunk, ballRef }: MatchPlaybackProps) {
  const entries = useMemo<Entry[]>(
    () =>
      Object.entries(chunk.players).map(([id, track]) => ({
        id,
        teamId: track.teamId,
        path: new WaypointPath(track.waypoints),
        actions: [...track.actions].sort((a, b) => a.t - b.t),
        motion: { speed: 0, oneShot: null },
      })),
    [chunk],
  );
  const ballPath = useMemo(() => new WaypointPath(chunk.ball), [chunk]);
  const duration = chunk.simTimeEnd - chunk.simTimeStart;

  const groups = useRef<Record<string, THREE.Group | null>>({});
  const actionCursors = useRef<Record<string, number>>({});
  const simTime = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    simTime.current += dt;
    if (simTime.current >= duration) {
      simTime.current %= duration;
      actionCursors.current = {};
    }
    const t = chunk.simTimeStart + simTime.current;

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
        group.quaternion.slerp(tmpQuat, 1 - Math.exp(-8 * dt));
      }

      let cursor = actionCursors.current[entry.id] ?? 0;
      while (cursor < entry.actions.length && entry.actions[cursor].t <= t) {
        entry.motion.oneShot = entry.actions[cursor].type;
        cursor++;
      }
      actionCursors.current[entry.id] = cursor;
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
              color={TEAM_COLORS[entry.teamId] ?? '#999999'}
              transparent
              opacity={0.85}
            />
          </mesh>
          <Suspense fallback={<PlayerRig motion={entry.motion} />}>
            <AnimatedPlayer motion={entry.motion} />
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
