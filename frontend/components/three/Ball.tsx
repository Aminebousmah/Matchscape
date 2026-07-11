'use client';

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Ballon 3D texturé (modèle importé). Le modèle brut mesure ~0,22 m de
 * diamètre (taille réelle) avec son pivot au sol ; on l'agrandit un peu pour
 * la lisibilité à distance caméra TV et on recentre son pivot au centre de
 * la sphère pour qu'il tourne correctement.
 */
const BALL = {
  url: '/models/ball.glb',
  modelRadius: 0.11, // rayon du modèle brut
};

interface BallProps {
  /** rayon visuel voulu dans la scène (m) */
  radius: number;
}

export function Ball({ radius }: BallProps) {
  const { scene } = useGLTF(BALL.url);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    return clone;
  }, [scene]);

  const scale = radius / BALL.modelRadius;

  return (
    // recentre le pivot (modèle posé au sol) au centre de la sphère
    <group scale={scale}>
      <primitive object={model} position={[0, -BALL.modelRadius, 0]} />
    </group>
  );
}

useGLTF.preload(BALL.url);
