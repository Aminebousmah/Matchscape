'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { animStateForSpeed, type PlayerAnimState } from '@/lib/types';
import type { PlayerMotion } from './PlayerRig';

/**
 * Configuration par modèle : pour remplacer l'asset (pack Sketchfab, export
 * Mixamo…), déposer le .glb dans public/models/ et ajuster uniquement ce bloc.
 */
const MODEL = {
  url: '/models/player.glb', // dev: Soldier.glb des exemples three.js
  clips: {
    IDLE: 'Idle',
    RUN: 'Run',
    SPRINT: 'Run', // pas de clip sprint dédié : Run accéléré via timeScale
  } satisfies Record<PlayerAnimState, string>,
  /** Rotation Y pour amener le modèle face à +Z (convention du rig) */
  forwardOffsetY: Math.PI,
  scale: 1,
  /** Vitesse sol (m/s) que couvre le clip Run à timeScale 1 — cale la cadence sur la vitesse réelle pour éviter le foot sliding */
  naturalRunSpeed: 4.0,
};

const FADE_DURATION = 0.25;

interface AnimatedPlayerProps {
  motion: MutableRefObject<PlayerMotion>;
}

export function AnimatedPlayer({ motion }: AnimatedPlayerProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL.url);
  const { actions } = useAnimations(animations, group);
  const currentState = useRef<PlayerAnimState | null>(null);

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.frustumCulled = false; // le mesh skinné bouge avec les bones, sa bbox statique fait clignoter le culling
      }
    });
  }, [scene]);

  useFrame(() => {
    const speed = motion.current.speed;
    const state = animStateForSpeed(speed);

    if (state !== currentState.current) {
      const nextAction = actions[MODEL.clips[state]];
      const prevAction = currentState.current
        ? actions[MODEL.clips[currentState.current]]
        : null;
      if (nextAction && nextAction !== prevAction) {
        nextAction.reset().fadeIn(FADE_DURATION).play();
        prevAction?.fadeOut(FADE_DURATION);
      }
      currentState.current = state;
    }

    if (state !== 'IDLE') {
      const action = actions[MODEL.clips[state]];
      if (action) {
        action.timeScale = THREE.MathUtils.clamp(
          speed / MODEL.naturalRunSpeed,
          0.6,
          2.0,
        );
      }
    }
  });

  return (
    <group ref={group} rotation={[0, MODEL.forwardOffsetY, 0]} scale={MODEL.scale}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODEL.url);
