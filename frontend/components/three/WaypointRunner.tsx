'use client';

import { forwardRef, Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WaypointPath } from '@/lib/waypointPath';
import { fieldToWorld } from '@/lib/field';
import type { Waypoint } from '@/lib/types';
import { PlayerRig, type PlayerMotion } from './PlayerRig';
import { AnimatedPlayer } from './AnimatedPlayer';

interface WaypointRunnerProps {
  waypoints: Waypoint[];
  loop?: boolean;
}

const targetQuat = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);

/**
 * Fait suivre au joueur un chemin de waypoints horodatés : position par
 * Catmull-Rom, orientation vers la direction de course, état d'animation
 * dérivé de la vitesse. C'est le prototype de la boucle de consommation
 * des MatchScriptChunk.
 */
export const WaypointRunner = forwardRef<THREE.Group, WaypointRunnerProps>(
  function WaypointRunner({ waypoints, loop = true }, ref) {
    const group = useRef<THREE.Group | null>(null);
    const motion = useRef<PlayerMotion>({ speed: 0 });
    const simTime = useRef(0);
    const path = useMemo(() => new WaypointPath(waypoints), [waypoints]);

    useFrame((_, rawDt) => {
      const g = group.current;
      if (!g) return;
      const dt = Math.min(rawDt, 0.1);

      simTime.current += dt;
      if (loop && simTime.current > path.duration) {
        simTime.current %= path.duration;
      }
      const t = path.startTime + simTime.current;

      const pos = path.positionAt(t);
      const vel = path.velocityAt(t);
      const speed = Math.hypot(vel.x, vel.y);
      motion.current.speed = speed;

      const [wx, wy, wz] = fieldToWorld(pos.x, pos.y);
      g.position.set(wx, wy, wz);

      // Orientation : le rig regarde +Z ; on tourne vers la direction de
      // course, avec un amorti pour éviter les rotations sèches aux virages.
      if (speed > 0.15) {
        const heading = Math.atan2(vel.x, -vel.y); // direction en coords monde (XZ)
        targetQuat.setFromAxisAngle(yAxis, heading);
        g.quaternion.slerp(targetQuat, 1 - Math.exp(-8 * dt));
      }
    });

    return (
      <group
        ref={(node) => {
          group.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
      >
        {/* rig procédural affiché pendant le chargement du GLB */}
        <Suspense fallback={<PlayerRig motion={motion} />}>
          <AnimatedPlayer motion={motion} />
        </Suspense>
      </group>
    );
  },
);
