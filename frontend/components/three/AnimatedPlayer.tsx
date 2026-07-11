'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import {
  animStateForSpeed,
  type ActionType,
  type PlayerAnimState,
  type PlayerMotion,
} from '@/lib/types';

/**
 * Configuration par modèle : pour remplacer l'asset (pack Ochi, autre export
 * Mixamo…), déposer le .glb dans public/models/ et ajuster uniquement ce bloc.
 */
const MODEL = {
  url: '/models/player.glb', // Mixamo multi-clips (tools/mixamo_to_glb.py)
  clips: {
    IDLE: { name: 'Idle', naturalSpeed: 0 },
    WALK: { name: 'Walk', naturalSpeed: 1.4 },
    RUN: { name: 'Run', naturalSpeed: 3.0 },
    SPRINT: { name: 'Sprint', naturalSpeed: 5.5 },
  } satisfies Record<PlayerAnimState, { name: string; naturalSpeed: number }>,
  /** Rotation Y pour amener le modèle face à +Z (convention du rig).
   *  Export Blender de FBX Mixamo → déjà face à +Z, donc 0. */
  forwardOffsetY: 0,
  scale: 1,
};

/** Clips one-shot déclenchés par les TimedAction du MatchScript */
const ACTION_CLIPS: Record<ActionType, string> = {
  PASS: 'Pass',
  SHOOT: 'Shoot',
  TACKLE: 'Tackle',
  CELEBRATE: 'Celebrate',
  GK_DIVE: 'GkDive',
};

const FADE_DURATION = 0.25;
const ONESHOT_FADE = 0.15;

/** Variantes d'idle joueur de champ — tirées au sort par instance pour
 *  éviter 20 joueurs parfaitement synchronisés */
const IDLE_VARIANTS = ['Idle', 'Idle2', 'Idle3'];

interface AnimatedPlayerProps {
  motion: PlayerMotion;
  isGoalkeeper?: boolean;
}

export function AnimatedPlayer({ motion, isGoalkeeper = false }: AnimatedPlayerProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL.url);

  // Clone par instance : 22 joueurs partagent geometry/textures du cache
  // useGLTF, mais chacun a besoin de son propre squelette animable.
  const cloned = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    c.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.frustumCulled = false; // bbox statique + mesh skinné = culling erratique
      }
    });
    return c;
  }, [scene]);

  const { actions } = useAnimations(animations, group);
  const currentState = useRef<PlayerAnimState | null>(null);
  const oneShot = useRef<{ action: THREE.AnimationAction; remaining: number } | null>(null);

  // Idle propre à l'instance (gardien ou variante aléatoire) + désynchronisation
  const idleClip = useMemo(() => {
    if (isGoalkeeper && animations.some((a) => a.name === 'GkIdle')) return 'GkIdle';
    const pick = IDLE_VARIANTS[Math.floor(Math.random() * IDLE_VARIANTS.length)];
    return animations.some((a) => a.name === pick) ? pick : 'Idle';
  }, [isGoalkeeper, animations]);
  const phaseOffset = useMemo(() => Math.random() * 2, []);

  const clipNameFor = (state: PlayerAnimState): string =>
    state === 'IDLE' ? idleClip : MODEL.clips[state].name;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);

    // Action ponctuelle demandée par le MatchScript : prend la main sur la
    // locomotion le temps du clip, puis fondu retour.
    if (motion.oneShot) {
      const clipName = ACTION_CLIPS[motion.oneShot];
      motion.oneShot = null;
      const action = actions[clipName];
      if (action) {
        const prev = currentState.current
          ? actions[clipNameFor(currentState.current)]
          : null;
        oneShot.current?.action.fadeOut(ONESHOT_FADE);
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.fadeIn(ONESHOT_FADE).play();
        prev?.fadeOut(ONESHOT_FADE);
        oneShot.current = {
          action,
          remaining: action.getClip().duration - ONESHOT_FADE,
        };
        currentState.current = null; // force le crossfade locomotion au retour
      }
    }

    if (oneShot.current) {
      oneShot.current.remaining -= dt;
      if (oneShot.current.remaining <= 0) {
        oneShot.current.action.fadeOut(FADE_DURATION);
        oneShot.current = null;
      } else {
        return; // locomotion suspendue pendant le one-shot
      }
    }

    const speed = motion.speed;
    const state = animStateForSpeed(speed);

    if (state !== currentState.current) {
      const nextAction = actions[clipNameFor(state)];
      const prevAction = currentState.current
        ? actions[clipNameFor(currentState.current)]
        : null;
      if (nextAction && nextAction !== prevAction) {
        nextAction.reset().fadeIn(FADE_DURATION).play();
        nextAction.time = phaseOffset % nextAction.getClip().duration;
        prevAction?.fadeOut(FADE_DURATION);
      }
      currentState.current = state;
    }

    // Cadence du clip calée sur la vitesse sol réelle (anti foot-sliding)
    const clip = MODEL.clips[state];
    if (clip.naturalSpeed > 0) {
      const action = actions[clip.name];
      if (action) {
        action.timeScale = THREE.MathUtils.clamp(speed / clip.naturalSpeed, 0.6, 2.0);
      }
    }
  });

  return (
    <group ref={group} rotation={[0, MODEL.forwardOffsetY, 0]} scale={MODEL.scale}>
      <primitive object={cloned} />
    </group>
  );
}

useGLTF.preload(MODEL.url);
