# CLAUDE.md — PitchReplay (nom provisoire)

> Restitution 3D temps réel de matchs de football à partir de données événementielles live (API-Football / TheSportsDB), avec un moteur d'analyse IA qui transforme les événements bruts en scénario de match jouable, rendu dans un style low-poly rétro type PES 5 (ISS/Winning Eleven).

---

## 1. Vision produit

Regarder un match "reconstitué" en 3D quand on n'a pas accès au flux TV : le site affiche un terrain 3D avec 22 joueurs animés qui rejouent le match en quasi temps réel, piloté par les événements de l'API (buts, tirs, cartons, corners, remplacements, possession, stats). L'esthétique visée est volontairement rétro : low-poly, caméra TV latérale, animations simples mais lisibles.

**Cibles de diffusion (par ordre de priorité) :**
1. Web (Next.js + Three.js) — MVP
2. Overlay/stream Twitch (rendu headless → RTMP)
3. Application (wrapper Tauri/Electron plus tard, non prioritaire)

---

## 2. Contrainte fondamentale (à lire avant tout)

**API-Football et TheSportsDB ne fournissent PAS de données de tracking positionnel** (pas de coordonnées x/y des joueurs ni du ballon, contrairement à Opta/StatsBomb/Second Spectrum qui coûtent des dizaines de milliers d'euros).

Ce qu'on a réellement :
- Événements horodatés : but (minute, buteur, passeur), tir cadré/non cadré, carton, corner, remplacement, penalty, VAR
- Compositions + formations (ex: 4-3-3), numéros, postes
- Stats agrégées live : possession, tirs, passes, xG (selon plan), fautes
- Score et minute de jeu

**Conséquence architecturale : le cœur du projet n'est pas le rendu 3D, c'est le moteur de scénarisation** — un système qui *invente une chorégraphie plausible* entre deux événements réels. C'est une reconstitution vraisemblable, pas une retransmission fidèle. Ce point doit être assumé dans le produit (mention "reconstitution simulée" à l'écran).

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  INGESTION (Python/FastAPI)                             │
│  API-Football (live polling 15-30s) + TheSportsDB       │
│  (métadonnées: logos, stades) → normalisation →         │
│  event store (Postgres) + push Redis pub/sub            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  MOTEUR DE SCÉNARISATION (Python)                       │
│  Événements bruts → "match script" :                    │
│  phases de jeu (possession, attaque, transition),       │
│  trajectoires ballon, déplacements joueurs (waypoints)  │
│  - Couche 1 : règles + heuristiques (déterministe)      │
│  - Couche 2 : LLM optionnel (enrichissement narratif,   │
│    variation des attaques, commentaires)                │
└──────────────────────┬──────────────────────────────────┘
                       ▼ WebSocket (match script chunks)
┌─────────────────────────────────────────────────────────┐
│  MOTEUR 3D (TypeScript — Three.js / React Three Fiber)  │
│  Interpolation waypoints → state machines joueurs →     │
│  animations GLTF (course, tir, tacle, célébration)      │
│  Caméra TV + replays sur événements clés                │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  DIFFUSION                                              │
│  Web: Next.js (SSR + canvas R3F)                        │
│  Twitch: Playwright headless → FFmpeg → RTMP            │
└─────────────────────────────────────────────────────────┘
```

### Décision : Three.js plutôt qu'Unity/Unreal

| Critère | Three.js/R3F | Unity WebGL | Unreal |
|---|---|---|---|
| Poids bundle web | ~1-3 Mo | 30-80 Mo | Non viable web |
| Stack existante (TS, PixiJS) | ✅ réutilisable | ❌ C# | ❌ C++/BP |
| Itération Claude Code | ✅ excellent | Moyen | Faible |
| Style low-poly PES5 | Largement suffisant | Overkill | Overkill |
| Streaming Twitch | Headless browser simple | Complexe | Build dédié |

Unity ne se justifierait que pour un vrai gameplay physique. Ici on **rejoue un script**, pas une simulation physique complète → Three.js gagne sur tous les plans. Décision réversible : le format `MatchScript` (section 6) est agnostique du moteur de rendu.

---

## 4. Stack technique

**Backend**
- Python 3.12, FastAPI, Celery + Redis (déjà maîtrisés — même stack que TwitchClipFactory)
- PostgreSQL (event store + historique matchs), Redis pub/sub (live)
- `httpx` pour le polling API-Football, `pydantic` v2 pour la normalisation
- Anthropic API (optionnel, couche 2 scénarisation + commentaires)

**Frontend**
- Next.js 14 (App Router), TypeScript strict
- React Three Fiber + drei + @react-three/rapier (physique légère ballon uniquement)
- Zustand (état match côté client), socket.io-client
- Assets : Blender (modèles joueurs low-poly ~800-1500 tris), Mixamo pour les clips d'animation de base, retarget dans Blender

**Streaming (phase 3)**
- Playwright headless (capture canvas) → FFmpeg → RTMP Twitch

**Infra**
- Docker Compose (dev), déploiement : VPS (Hetzner/OVH) — le rendu est côté client, le serveur ne fait que du texte/JSON, donc peu coûteux

---

## 5. Modules

### 5.1 `ingestion/`
- Poller API-Football : `GET /fixtures?live=all` ou fixture ciblée toutes les 15-30s
- **Rate limits** : plan Free = 100 req/jour → inutilisable en live. Plan Pro (~25 €/mois) = 7 500 req/jour → OK pour 2-3 matchs simultanés à 20s d'intervalle. À budgéter dès le MVP.
- TheSportsDB : uniquement métadonnées froides (logos, stades, photos) — cache agressif 24h
- Déduplication des événements (l'API renvoie l'historique complet à chaque poll) : clé `(fixture_id, event_type, minute, player_id)`
- Diff engine : ne pousser sur Redis que les événements nouveaux

### 5.2 `scenarist/` — le cœur du projet
Transforme un flux d'événements sparse en `MatchScript` continu.

**Couche 1 — Heuristiques (déterministe, obligatoire) :**
- Machine à états du match : `KICKOFF → OPEN_PLAY → SET_PIECE → GOAL_SEQUENCE → CELEBRATION → RESTART`
- Entre deux événements réels, générer des phases de possession synthétiques pondérées par les stats live (si possession 65/35, l'équipe A a le ballon ~65% du temps simulé)
- Chaque phase = séquence de waypoints ballon + assignation de porteurs successifs cohérents avec la formation (un 4-3-3 attaque par les ailes plus souvent, etc.)
- Événement réel reçu → interruption propre de la phase synthétique et raccord vers la séquence scriptée (ex: but de X à la 34e → construire une attaque qui se termine par un tir de X)
- Positionnement de base : grille tactique par formation + rôle (fichiers JSON de gabarits), oscillation par bruit de Perlin pour éviter l'effet statique

**Couche 2 — LLM (optionnel, activable par flag) :**
- Enrichissement : variation des patterns d'attaque, style d'équipe (contre vs possession) déduit des stats
- Génération de commentaires texte type "commentateur PES"
- Jamais dans la boucle temps réel critique : le LLM pré-génère des variations, la couche 1 reste le fallback

### 5.3 `renderer/` (frontend)
- Terrain, stade low-poly, 22 joueurs + arbitre
- State machine par joueur : `IDLE / RUN / SPRINT / PASS / SHOOT / TACKLE / CELEBRATE / WALK`
- Interpolation des waypoints (Catmull-Rom) + look-at ballon
- Caméra : TV latérale par défaut, cut automatique sur événements (but → caméra derrière le but + ralenti)
- HUD rétro PES : score, minute, radar 2D, bandeau événement
- **Légal maillots/visages : équipements génériques (couleurs du club mais sans sponsor/logo), noms réels OK (donnée factuelle), pas de ressemblance faciale.** Ne jamais importer d'assets extraits de PES/FIFA.

### 5.4 `broadcast/` (phase 3)
- Page `/broadcast/:fixtureId` sans HUD interactif, 1080p
- Playwright → capture → FFmpeg x264 → RTMP

---

## 6. Modèle de données central : `MatchScript`

Format pivot entre backend et renderer. Le backend émet des chunks de 10-30s d'avance (buffer nécessaire car le poll a 15-30s de latence de toute façon — la "quasi temps réel" assume ~60-90s de retard sur le direct, comme un stream classique).

```typescript
interface MatchScriptChunk {
  fixtureId: number;
  simTimeStart: number;        // secondes de temps match simulé
  simTimeEnd: number;
  phase: 'OPEN_PLAY' | 'SET_PIECE' | 'GOAL_SEQUENCE' | 'RESTART' | 'CELEBRATION';
  realEvent?: NormalizedEvent; // présent si le chunk restitue un événement réel
  ball: Waypoint[];            // { t, x, y, z }
  players: Record<PlayerId, {
    waypoints: Waypoint[];     // { t, x, y }
    actions: TimedAction[];    // { t, type: 'PASS'|'SHOOT'|'TACKLE'|... }
  }>;
  commentary?: string;
}

interface NormalizedEvent {
  fixtureId: number;
  minute: number;
  extraMinute?: number;
  type: 'GOAL' | 'CARD' | 'SUBST' | 'SHOT' | 'CORNER' | 'PENALTY' | 'VAR';
  teamId: number;
  playerId?: number;
  assistPlayerId?: number;
  detail?: string;
}
```

Repère terrain : origine au centre, x ∈ [-52.5, 52.5], y ∈ [-34, 34] (mètres), z = hauteur ballon.

---

## 7. Roadmap

**Phase 0 — Spike (1 semaine)**
- [ ] Compte API-Football, valider le contenu réel des payloads live sur 2-3 matchs (enregistrer les JSON bruts → fixtures de test)
- [ ] POC Three.js : terrain + 1 joueur animé Mixamo qui suit des waypoints
- ✅ Critère de sortie : un joueur court d'un point A à un point B avec une animation propre

**Phase 1 — MVP replay différé (3-4 semaines)**
- [ ] Ingestion + normalisation + event store (rejeu depuis fixtures enregistrées, pas de live)
- [ ] Scénariste couche 1 (heuristiques) : match complet rejouable
- [ ] Renderer : 22 joueurs, caméra TV, HUD score/minute, séquence but
- ✅ Critère : rejouer un match terminé du week-end de bout en bout

**Phase 2 — Live (2 semaines)**
- [ ] Polling live + diff engine + WebSocket + buffer de chunks
- [ ] Gestion des cas limites : mi-temps, prolongations, VAR qui annule un but déjà simulé (rollback de séquence)

**Phase 3 — Diffusion & polish**
- [ ] Pipeline Twitch, commentaires LLM, replays ralentis, sélection de match sur la home
- [ ] Multi-matchs simultanés

---

## 8. Conventions de développement

- Exécution autonome : avancer sans demander confirmation ; une seule question ciblée si bloquant
- TypeScript strict, pydantic v2 strict, pas de `any` / pas de dict non typés dans le pipeline
- Tests : Vitest (front, interpolation/state machines), pytest (scénariste — le module le plus testable : événements en entrée → script en sortie, déterministe avec seed)
- Les fixtures de test sont des payloads API réels enregistrés dans `tests/fixtures/` (jamais de mocks inventés)
- Commits conventionnels : `feat(scenarist): ...`, `fix(renderer): ...`
- Signaler explicitement les transitions de phase du plan

## 9. Risques identifiés

| Risque | Impact | Mitigation |
|---|---|---|
| Rate limit / coût API-Football | Bloquant live | Plan Pro dès phase 2 ; phase 1 entièrement sur fixtures enregistrées |
| Scénarisation peu crédible ("joueurs ivres") | Produit décevant | Investir 60% de l'effort sur `scenarist/`, gabarits tactiques par formation, itérer sur seed déterministe |
| Perf mobile (22 rigs animés) | UX dégradée | Instanced meshes, animations partagées, LOD, cible 60 fps desktop / 30 fps mobile |
| IP (maillots, licences) | Légal | Kits génériques, pas d'assets PES/FIFA, mention "simulation" |
| VAR / événements corrigés a posteriori | Incohérence visuelle | Buffer 60-90s + mécanisme de rollback de chunk |
