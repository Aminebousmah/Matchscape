'use client';

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  CENTER_CIRCLE_RADIUS,
  PENALTY_AREA_DEPTH,
  PENALTY_AREA_HALF_WIDTH,
  GOAL_AREA_DEPTH,
  GOAL_AREA_HALF_WIDTH,
  PENALTY_SPOT_DIST,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  fieldToWorld,
} from '@/lib/field';

const LINE_Y = 0.03; // légèrement au-dessus de la pelouse pour éviter le z-fighting
const LINE_COLOR = '#e8f0e8';
const GRASS_LIGHT = '#4a8f3c';
const GRASS_DARK = '#3f7d33';
const STRIPE_COUNT = 14;

type Pt = [number, number, number];

function loop(points: Array<[number, number]>): Pt[] {
  const pts = points.map(([x, y]) => fieldToWorld(x, y, LINE_Y));
  pts.push(pts[0]);
  return pts;
}

function circle(cx: number, cy: number, radius: number, from = 0, to = Math.PI * 2, segments = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = from + ((to - from) * i) / segments;
    pts.push(fieldToWorld(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, LINE_Y));
  }
  return pts;
}

function Goal({ side }: { side: 1 | -1 }) {
  const x = side * HALF_LENGTH;
  const depth = 1.8;
  const post = 0.1;
  return (
    <group>
      {/* poteaux */}
      <mesh position={fieldToWorld(x, GOAL_HALF_WIDTH, GOAL_HEIGHT / 2)}>
        <boxGeometry args={[post, GOAL_HEIGHT, post]} />
        <meshStandardMaterial color="white" />
      </mesh>
      <mesh position={fieldToWorld(x, -GOAL_HALF_WIDTH, GOAL_HEIGHT / 2)}>
        <boxGeometry args={[post, GOAL_HEIGHT, post]} />
        <meshStandardMaterial color="white" />
      </mesh>
      {/* barre transversale */}
      <mesh position={fieldToWorld(x, 0, GOAL_HEIGHT)}>
        <boxGeometry args={[post, post, GOAL_HALF_WIDTH * 2 + post]} />
        <meshStandardMaterial color="white" />
      </mesh>
      {/* cadre arrière incliné, suffisant pour lire "un but" en low-poly */}
      <mesh position={fieldToWorld(x + side * depth, 0, GOAL_HEIGHT / 4)}>
        <boxGeometry args={[post, GOAL_HEIGHT / 2, GOAL_HALF_WIDTH * 2 + post]} />
        <meshStandardMaterial color="#cccccc" />
      </mesh>
    </group>
  );
}

export function Pitch() {
  const lines = useMemo(() => {
    // Arc de surface de réparation : portion du cercle de 9,15 m autour du
    // point de penalty située hors de la surface.
    const arcHalfAngle = Math.acos((PENALTY_AREA_DEPTH - PENALTY_SPOT_DIST) / CENTER_CIRCLE_RADIUS);
    const spotX = HALF_LENGTH - PENALTY_SPOT_DIST;

    return {
      border: loop([
        [-HALF_LENGTH, -HALF_WIDTH],
        [HALF_LENGTH, -HALF_WIDTH],
        [HALF_LENGTH, HALF_WIDTH],
        [-HALF_LENGTH, HALF_WIDTH],
      ]),
      halfway: [fieldToWorld(0, -HALF_WIDTH, LINE_Y), fieldToWorld(0, HALF_WIDTH, LINE_Y)] as Pt[],
      centerCircle: circle(0, 0, CENTER_CIRCLE_RADIUS),
      boxes: ([1, -1] as const).flatMap((side) => [
        loop([
          [side * HALF_LENGTH, -PENALTY_AREA_HALF_WIDTH],
          [side * (HALF_LENGTH - PENALTY_AREA_DEPTH), -PENALTY_AREA_HALF_WIDTH],
          [side * (HALF_LENGTH - PENALTY_AREA_DEPTH), PENALTY_AREA_HALF_WIDTH],
          [side * HALF_LENGTH, PENALTY_AREA_HALF_WIDTH],
        ]),
        loop([
          [side * HALF_LENGTH, -GOAL_AREA_HALF_WIDTH],
          [side * (HALF_LENGTH - GOAL_AREA_DEPTH), -GOAL_AREA_HALF_WIDTH],
          [side * (HALF_LENGTH - GOAL_AREA_DEPTH), GOAL_AREA_HALF_WIDTH],
          [side * HALF_LENGTH, GOAL_AREA_HALF_WIDTH],
        ]),
      ]),
      arcs: ([1, -1] as const).map((side) =>
        circle(
          side * spotX,
          0,
          CENTER_CIRCLE_RADIUS,
          side === 1 ? Math.PI - arcHalfAngle : -arcHalfAngle,
          side === 1 ? Math.PI + arcHalfAngle : arcHalfAngle,
          24,
        ),
      ),
      spots: [circle(0, 0, 0.25, 0, Math.PI * 2, 12), ...([1, -1] as const).map((side) => circle(side * spotX, 0, 0.25, 0, Math.PI * 2, 12))],
    };
  }, []);

  const stripeWidth = FIELD_LENGTH / STRIPE_COUNT;

  return (
    <group>
      {/* pelouse rayée */}
      {Array.from({ length: STRIPE_COUNT }, (_, i) => (
        <mesh
          key={i}
          rotation-x={-Math.PI / 2}
          position={[-HALF_LENGTH + stripeWidth * (i + 0.5), 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[stripeWidth, FIELD_WIDTH]} />
          <meshStandardMaterial color={i % 2 === 0 ? GRASS_LIGHT : GRASS_DARK} />
        </mesh>
      ))}
      {/* dégagement autour du terrain */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[FIELD_LENGTH + 16, FIELD_WIDTH + 16]} />
        <meshStandardMaterial color="#356b2c" />
      </mesh>

      <Line points={lines.border} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={lines.halfway} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={lines.centerCircle} color={LINE_COLOR} lineWidth={1.5} />
      {lines.boxes.map((pts, i) => (
        <Line key={`box-${i}`} points={pts} color={LINE_COLOR} lineWidth={1.5} />
      ))}
      {lines.arcs.map((pts, i) => (
        <Line key={`arc-${i}`} points={pts} color={LINE_COLOR} lineWidth={1.5} />
      ))}
      {lines.spots.map((pts, i) => (
        <Line key={`spot-${i}`} points={pts} color={LINE_COLOR} lineWidth={2} />
      ))}

      <Goal side={1} />
      <Goal side={-1} />
    </group>
  );
}
