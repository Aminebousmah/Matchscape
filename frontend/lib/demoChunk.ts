// Chunk MatchScript de démonstration, construit à la main : il joue le rôle
// du scénariste (phase 1) le temps de valider le renderer multi-joueurs.
// Boucle de 60 s : coup d'envoi → attaque domicile (but + célébration) →
// engagement → attaque extérieure miroir (but) → circulation neutre → boucle.

import type { MatchScriptChunk, PlayerTrack } from './matchScript';
import type { TimedAction, Waypoint } from './types';

const DURATION = 60;
const HOME_TEAM = 1;
const AWAY_TEAM = 2;

// 4-3-3, équipe domicile attaquant vers +x. Index = rôle :
// 0 GK · 1 LB · 2 CBL · 3 CBR · 4 RB · 5 CML · 6 CMC · 7 CMR · 8 LW · 9 ST · 10 RW
const HOME_BASES: ReadonlyArray<readonly [number, number]> = [
  [-49, 0],
  [-36, -24],
  [-39, -9],
  [-39, 9],
  [-36, 24],
  [-25, -13],
  [-29, 0],
  [-25, 13],
  [-12, -27],
  [-1, 0],
  [-12, 27],
];

/** Amplitude d'errance autour du poste, par rôle (m) */
const WANDER_AMP = [1.2, 2.5, 2.5, 2.5, 2.5, 5, 5, 5, 6, 6, 6];

/** Rôles animés par la séquence d'attaque scriptée (pas d'errance) */
const PROTAGONIST_ROLES = new Set([4, 6, 9, 10]);

function wp(t: number, x: number, y: number, z?: number): Waypoint {
  return z === undefined ? { t, x, y } : { t, x, y, z };
}

/** PRNG déterministe (mulberry32) — même chunk à chaque exécution */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Errance douce autour du poste : nodes ~toutes les 7 s, retour au poste en fin de boucle */
function wanderTrack(base: readonly [number, number], amp: number, rng: () => number): Waypoint[] {
  const [bx, by] = base;
  const pts: Waypoint[] = [wp(0, bx, by), wp(2, bx, by)];
  for (let k = 0; k < 7; k++) {
    const t = 8 + k * 7 + (rng() - 0.5) * 4;
    pts.push(wp(t, bx + (rng() * 2 - 1) * amp, by + (rng() * 2 - 1) * amp));
  }
  pts.push(wp(57, bx, by), wp(DURATION, bx, by));
  return pts;
}

interface ScriptedTrack {
  role: number;
  waypoints: Waypoint[];
  actions: TimedAction[];
}

/**
 * Séquence d'attaque par l'aile droite (≈20 s) : ST remise en retrait, CMC
 * écarte sur RB, RB remonte l'aile et sert RW, RW déborde et centre, ST
 * reprend et marque, célébration, retour aux postes.
 * `sign` = +1 pour l'attaque domicile (vers +x), -1 pour le miroir extérieur.
 */
function attackTracks(sign: 1 | -1, t0: number): ScriptedTrack[] {
  const s = (v: number) => v * sign;
  return [
    {
      role: 9, // ST
      waypoints: [
        wp(0, s(-1), s(0)),
        wp(t0, s(-1), s(0)),
        wp(t0 + 8, s(10), s(2)),
        wp(t0 + 14, s(43), s(2)),
        wp(t0 + 14.6, s(44.5), s(1.2)),
        wp(t0 + 20, s(44.5), s(1.2)),
        wp(t0 + 30, s(-1), s(0)),
        wp(DURATION, s(-1), s(0)),
      ],
      actions: [
        { t: t0, type: 'PASS' },
        { t: t0 + 14.1, type: 'SHOOT' },
        { t: t0 + 15, type: 'CELEBRATE' },
      ],
    },
    {
      role: 6, // CMC
      waypoints: [
        wp(0, s(-29), s(0)),
        wp(t0, s(-29), s(0)),
        wp(t0 + 3, s(-30), s(1)),
        wp(t0 + 7, s(-29), s(0)),
        wp(DURATION, s(-29), s(0)),
      ],
      actions: [{ t: t0 + 2.4, type: 'PASS' }],
    },
    {
      role: 4, // RB
      waypoints: [
        wp(0, s(-36), s(24)),
        wp(t0, s(-36), s(24)),
        wp(t0 + 4, s(-33), s(22)),
        wp(t0 + 8, s(-5), s(26)),
        wp(t0 + 9, s(-5), s(26)), // temps d'arrêt après la passe (évite le demi-tour sec)
        wp(t0 + 16, s(-36), s(24)),
        wp(DURATION, s(-36), s(24)),
      ],
      actions: [{ t: t0 + 8, type: 'PASS' }],
    },
    {
      role: 10, // RW
      waypoints: [
        wp(0, s(-12), s(27)),
        wp(t0, s(-12), s(27)),
        wp(t0 + 9.4, s(18), s(28)),
        wp(t0 + 12.4, s(40), s(26)),
        wp(t0 + 13.4, s(40), s(26)), // temps d'arrêt après le centre
        wp(t0 + 22, s(-12), s(27)),
        wp(DURATION, s(-12), s(27)),
      ],
      actions: [{ t: t0 + 12.4, type: 'PASS' }],
    },
  ];
}

/** Trajet du ballon pendant une séquence d'attaque (waypoints absolus) */
function attackBall(sign: 1 | -1, t0: number): Waypoint[] {
  const s = (v: number) => v * sign;
  return [
    wp(t0 + 1.6, s(-29), s(0)), // remise ST → CMC
    wp(t0 + 2.4, s(-29), s(0)),
    wp(t0 + 3.2, s(-31), s(11), 2), // transversale CMC → RB
    wp(t0 + 4, s(-33), s(22)),
    wp(t0 + 8, s(-5), s(26)), // conduite RB
    wp(t0 + 9.4, s(18), s(28)), // passe RB → RW
    wp(t0 + 12.4, s(40), s(26)), // débordement RW
    wp(t0 + 13.2, s(41.5), s(14), 3.5), // centre
    wp(t0 + 14, s(43), s(2)),
    wp(t0 + 14.7, s(52.8), s(0.8), 0.3), // frappe → but
    wp(t0 + 16.5, s(52.8), s(0.8)),
    wp(t0 + 20, 0, 0), // ballon replacé au centre
    wp(t0 + 22, 0, 0),
  ];
}

export function buildDemoChunk(): MatchScriptChunk {
  const players: Record<string, PlayerTrack> = {};

  for (const [teamId, prefix, mirror] of [
    [HOME_TEAM, 'home', 1],
    [AWAY_TEAM, 'away', -1],
  ] as const) {
    for (let role = 0; role < HOME_BASES.length; role++) {
      const base: readonly [number, number] = [
        HOME_BASES[role][0] * mirror,
        HOME_BASES[role][1] * mirror,
      ];
      const rng = mulberry32(42 + role + teamId * 100);
      players[`${prefix}-${role}`] = {
        teamId,
        waypoints: PROTAGONIST_ROLES.has(role)
          ? [] // rempli par les tracks scriptées ci-dessous
          : wanderTrack(base, WANDER_AMP[role], rng),
        actions: [],
      };
    }
  }

  // Attaque domicile à t=2, attaque extérieure miroir à t=24
  for (const [prefix, sign, t0] of [
    ['home', 1, 2],
    ['away', -1, 24],
  ] as const) {
    for (const track of attackTracks(sign, t0)) {
      const p = players[`${prefix}-${track.role}`];
      p.waypoints = track.waypoints;
      p.actions = track.actions;
    }
  }

  // Le gardien adverse plonge (en vain) sur chaque frappe
  players['away-0'].actions.push({ t: 16.3, type: 'GK_DIVE' });
  players['home-0'].actions.push({ t: 38.3, type: 'GK_DIVE' });

  // Engagement neutre à t=46 : ST domicile relance, circulation défensive
  players['home-9'].actions.push({ t: 46, type: 'PASS' });
  players['home-6'].actions.push({ t: 48.5, type: 'PASS' }, { t: 56.5, type: 'PASS' });

  const ball: Waypoint[] = [
    wp(0, 0, 0),
    wp(2, 0, 0),
    ...attackBall(1, 2),
    ...attackBall(-1, 24),
    // circulation neutre en défense domicile
    wp(47.5, -29, 0),
    wp(48.5, -29, 0),
    wp(50, -39, -9),
    wp(51, -39, -9),
    wp(52, -39, 0, 1.5),
    wp(53, -39, 9),
    wp(54, -39, 9),
    wp(55.5, -29, 0),
    wp(56.5, -29, 0),
    wp(58.5, 0, 0),
    wp(DURATION, 0, 0),
  ];

  return {
    fixtureId: 0,
    simTimeStart: 0,
    simTimeEnd: DURATION,
    phase: 'OPEN_PLAY',
    ball,
    players,
  };
}
