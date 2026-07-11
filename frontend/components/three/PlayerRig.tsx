'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  animStateForSpeed,
  SPRINT_SPEED_THRESHOLD,
  type PlayerMotion,
} from '@/lib/types';

interface PlayerRigProps {
  motion: PlayerMotion;
  shirtColor?: string;
  shortsColor?: string;
  skinColor?: string;
}

/**
 * Joueur low-poly procédural (placeholder avant les assets Mixamo/GLTF).
 * Le rig fait face à +Z. Cycle de course procédural : les membres oscillent
 * en opposition de phase, amplitude et cadence pilotées par la vitesse —
 * même contrat qu'un futur AnimationMixer (IDLE / RUN / SPRINT).
 */
export function PlayerRig({
  motion,
  shirtColor = '#d43a3a',
  shortsColor = '#ffffff',
  skinColor = '#d8a37a',
}: PlayerRigProps) {
  const root = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const phase = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const speed = motion.speed;
    const state = animStateForSpeed(speed);

    // Cadence de foulée proportionnelle à la vitesse (~2,6 pas/s à 6 m/s)
    const strideFreq = state === 'IDLE' ? 1.2 : 1.4 + speed * 0.28;
    phase.current += dt * strideFreq * Math.PI * 2;

    const amp =
      state === 'IDLE'
        ? 0.04
        : THREE.MathUtils.clamp(speed / SPRINT_SPEED_THRESHOLD, 0.35, 1.3) * 0.85;
    const swing = Math.sin(phase.current) * amp;

    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.8;
    if (rightArm.current) rightArm.current.rotation.x = swing * 0.8;

    if (torso.current) {
      torso.current.rotation.x = state === 'IDLE' ? 0 : 0.06 + speed * 0.022;
    }
    if (root.current) {
      // rebond vertical du cycle de course (2 appuis par foulée)
      root.current.position.y =
        state === 'IDLE' ? 0 : Math.abs(Math.sin(phase.current)) * 0.05;
    }
  });

  return (
    <group ref={root}>
      <group ref={torso} position={[0, 0.85, 0]}>
        {/* buste */}
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[0.46, 0.58, 0.26]} />
          <meshStandardMaterial color={shirtColor} flatShading />
        </mesh>
        {/* tête */}
        <mesh position={[0, 0.76, 0]} castShadow>
          <boxGeometry args={[0.24, 0.26, 0.24]} />
          <meshStandardMaterial color={skinColor} flatShading />
        </mesh>
        {/* cheveux */}
        <mesh position={[0, 0.88, -0.02]} castShadow>
          <boxGeometry args={[0.26, 0.08, 0.26]} />
          <meshStandardMaterial color="#2b2019" flatShading />
        </mesh>
        {/* bras (pivot à l'épaule) */}
        <group ref={leftArm} position={[0.3, 0.52, 0]}>
          <mesh position={[0, -0.26, 0]} castShadow>
            <boxGeometry args={[0.13, 0.52, 0.13]} />
            <meshStandardMaterial color={skinColor} flatShading />
          </mesh>
        </group>
        <group ref={rightArm} position={[-0.3, 0.52, 0]}>
          <mesh position={[0, -0.26, 0]} castShadow>
            <boxGeometry args={[0.13, 0.52, 0.13]} />
            <meshStandardMaterial color={skinColor} flatShading />
          </mesh>
        </group>
      </group>

      {/* jambes (pivot à la hanche, à 0,85 m du sol) */}
      <group ref={leftLeg} position={[0.12, 0.85, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.16, 0.4, 0.16]} />
          <meshStandardMaterial color={shortsColor} flatShading />
        </mesh>
        <mesh position={[0, -0.62, 0]} castShadow>
          <boxGeometry args={[0.14, 0.45, 0.14]} />
          <meshStandardMaterial color={skinColor} flatShading />
        </mesh>
      </group>
      <group ref={rightLeg} position={[-0.12, 0.85, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.16, 0.4, 0.16]} />
          <meshStandardMaterial color={shortsColor} flatShading />
        </mesh>
        <mesh position={[0, -0.62, 0]} castShadow>
          <boxGeometry args={[0.14, 0.45, 0.14]} />
          <meshStandardMaterial color={skinColor} flatShading />
        </mesh>
      </group>
    </group>
  );
}
