'use client';

import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Stade décor (modèle statique importé). Le modèle brut mesure ~770×770
 * unités d'empreinte pour ~9 de haut ; on l'amène dans notre repère terrain
 * (105×68 m) via ces constantes — à ajuster visuellement.
 *
 * Réglage : modifier SCALE (taille), ROTATION_Y (aligner l'axe long du
 * terrain sur x), OFFSET (recentrer la pelouse du modèle sur l'origine).
 * L'objectif est que la pelouse peinte du modèle coïncide avec nos lignes.
 */
const STADIUM = {
  url: '/models/stadium.glb',
  scale: 0.32,
  rotationY: 0, // radians ; passer à Math.PI/2 si le terrain est perpendiculaire
  offset: [0, -0.06, 0] as [number, number, number], // légèrement sous nos lignes
};

export function Stadium() {
  const { scene } = useGLTF(STADIUM.url);

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.receiveShadow = true;
        obj.castShadow = false; // décor : pas d'ombres portées coûteuses
      }
    });
  }, [scene]);

  return (
    <group position={STADIUM.offset} rotation={[0, STADIUM.rotationY, 0]} scale={STADIUM.scale}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(STADIUM.url);
