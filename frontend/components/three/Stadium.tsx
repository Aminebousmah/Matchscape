'use client';

import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Stade décor (modèle statique importé). GLB nettoyé (plan/skybox géant
 * retiré) : pelouse du modèle centrée à l'origine, empreinte ~19×23 u,
 * axe long sur Z. On l'amène dans notre repère terrain (105×68 m, axe long
 * sur X) : rotation 90° + échelle ~7,8 (105/13 ≈ 8,0 ; 68/9 ≈ 7,6). Les
 * tribunes viennent alors entourer notre terrain.
 *
 * Réglage fin visuel : SCALE (taille du bol), OFFSET (hauteur : le stade
 * passe juste sous notre pelouse pour que nos lignes restent visibles).
 */
// Échelle non-uniforme : amène la pelouse du modèle exactement à 105×68 m
// (modèle : 9 u de large × 13 u de long → après rotation 90°, largeur=9·sx,
// longueur=13·sz). Les cages du modèle tombent alors sur nos lignes de but.
const STADIUM = {
  url: '/models/stadium.glb',
  scale: [68 / 9, 7.8, 105 / 13] as [number, number, number], // [7.56, 7.8, 8.08]
  rotationY: Math.PI / 2,
  offset: [0, 0, 0] as [number, number, number], // pelouse du modèle au sol
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
