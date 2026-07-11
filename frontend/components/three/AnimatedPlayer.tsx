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
  url: '/models/player.glb', // Mixamo multi-clips (tools/mixamo_to_glb.py)
  // Le GLB contient aussi Pass/Shoot/Tackle/Celebrate/GkDive, déclenchés
  // plus tard par les TimedAction du MatchScript (phase 1).
  clips: {
    IDLE: { name: 'Idle', naturalSpeed: 0 },
    RUN: { name: 'Run', naturalSpeed: 3.0 },
    SPRINT: { name: 'Sprint', naturalSpeed: 5.5 },
  } satisfies Record<PlayerAnimState, { name: string; naturalSpeed: number }>,
  /** Rotation Y pour amener le modèle face à +Z (convention du rig).
   *  Export Blender de FBX Mixamo → déjà face à +Z, donc 0. */
  forwardOffsetY: 0,
  scale: 1,
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
      const nextAction = actions[MODEL.clips[state].name];
      const prevAction = currentState.current
        ? actions[MODEL.clips[currentState.current].name]
        : null;
      if (nextAction && nextAction !== prevAction) {
        nextAction.reset().fadeIn(FADE_DURATION).play();
        prevAction?.fadeOut(FADE_DURATION);
      }
      currentState.current = state;
    }

    // Cadence du clip calée sur la vitesse sol réelle (anti foot-sliding)
    const clip = MODEL.clips[state];
    if (clip.naturalSpeed > 0) {
      const action = actions[clip.name];
      if (action) {
        action.timeScale = THREE.MathUtils.clamp(
          speed / clip.naturalSpeed,
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
