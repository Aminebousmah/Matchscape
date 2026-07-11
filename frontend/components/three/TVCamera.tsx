'use client';

import { useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface TVCameraProps {
  /** Groupe suivi par la caméra (le joueur pour le POC, le ballon ensuite) */
  targetRef: RefObject<THREE.Group>;
}

const CAMERA_HEIGHT = 26;
const CAMERA_DISTANCE = 46;
/** La caméra ne suit le jeu que sur une fraction de son déplacement latéral, comme une vraie régie TV */
const LATERAL_FOLLOW = 0.8;
const MAX_LATERAL = 38;

export function TVCamera({ targetRef }: TVCameraProps) {
  const { camera } = useThree();
  const lookTarget = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((_, dt) => {
    const target = targetRef.current;
    if (!target) return;

    const k = 1 - Math.exp(-2.5 * Math.min(dt, 0.1));
    lookTarget.current.lerp(target.position, k);

    const desiredX = THREE.MathUtils.clamp(
      lookTarget.current.x * LATERAL_FOLLOW,
      -MAX_LATERAL,
      MAX_LATERAL,
    );
    camera.position.set(
      camera.position.x + (desiredX - camera.position.x) * k,
      CAMERA_HEIGHT,
      CAMERA_DISTANCE,
    );
    camera.lookAt(lookTarget.current.x, 0, lookTarget.current.z * 0.6);
  });

  return null;
}
