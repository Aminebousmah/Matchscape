# plan.md — PitchReplay

> Plan d'exécution opérationnel. La vision et l'architecture sont dans [CLAUDE.md](CLAUDE.md) — ce fichier suit **ce qui est fait, en cours, et à faire**, dans l'ordre.

**Dernière mise à jour : 2026-07-11**

---

## État courant

- **Phase active : Phase 0 — Spike**
- 0.A codé et testé (build OK, 8 tests Vitest verts). **Reste : validation visuelle par Amine sur http://localhost:3000** (la preview automatisée ne peut pas rendre le WebGL — onglet en arrière-plan, rAF suspendu).

---

## Phase 0 — Spike (objectif : dérisquer les 2 inconnues)

### 0.A — POC Three.js : joueur qui suit des waypoints ← **EN COURS (validation visuelle restante)**
Critère de sortie : un joueur court d'un point A à un point B avec une animation propre, sur un terrain aux bonnes proportions.

- [x] Scaffold frontend : Next.js 14 (App Router) + TypeScript strict + React Three Fiber + drei + Zustand
- [x] Terrain aux dimensions réelles (105×68 m, repère centré : x ∈ [-52.5, 52.5], y ∈ [-34, 34]) : pelouse rayée, lignes réglementaires, buts low-poly — `components/three/Pitch.tsx`
- [x] Joueur placeholder low-poly procédural avec cycle de course piloté par la vitesse — `components/three/PlayerRig.tsx` (interface compatible swap GLTF/Mixamo)
- [x] Suivi de waypoints : Catmull-Rom paramétré temps + orientation slerp + états IDLE/RUN/SPRINT — `lib/waypointPath.ts`, `components/three/WaypointRunner.tsx`
- [x] Caméra TV latérale avec suivi amorti et clamp latéral — `components/three/TVCamera.tsx`
- [x] Tests Vitest sur `WaypointPath` (8 verts) — a détecté et corrigé un bug de dérive Catmull-Rom sur les segments à l'arrêt
- [ ] Vérification visuelle (Amine) : `npm run dev` dans `frontend/` → http://localhost:3000, fluidité 60 fps (compteur Stats en haut à gauche)

**Décision assumée :** le POC utilise un personnage procédural (pas Mixamo) car les assets Mixamo demandent un téléchargement manuel + retarget Blender. Le format d'entrée (clips d'animation nommés sur un `AnimationMixer`) est le même — le swap sera transparent. À valider en 0.B avec un vrai GLTF.

### 0.B — Validation API-Football ⚠️ **BLOQUÉ : nécessite une clé API (action Amine)**
- [ ] Créer un compte API-Football, récupérer la clé (plan Free suffit pour le spike : replay, pas de live)
- [ ] Enregistrer les payloads bruts de 2-3 matchs (fixtures, events, lineups, statistics) → `tests/fixtures/`
- [ ] Valider le contenu réel : granularité des events, présence xG, format des formations
- En attendant la clé : le schéma `NormalizedEvent` sera écrit d'après la doc publique API-Football et ajusté sur payloads réels ensuite.

### 0.C — Asset joueur "propre"
- [ ] Modèle low-poly (800-1500 tris) + clips Mixamo (idle, run, sprint, kick) retargetés dans Blender → GLTF
- [ ] Remplacer le placeholder procédural du POC

---

## Phase 1 — MVP replay différé (3-4 semaines)

### 1.A — Backend : ingestion & event store
- [ ] Scaffold `backend/` : FastAPI + pydantic v2 strict, Docker Compose (Postgres + Redis)
- [ ] Normalisation payloads API-Football → `NormalizedEvent` (+ lineups, stats) ; tests pytest sur fixtures réelles
- [ ] Event store Postgres + mode "rejeu" : rejouer un match terminé depuis les fixtures enregistrées

### 1.B — Scénariste couche 1 (60% de l'effort — cœur du projet)
- [ ] Gabarits tactiques JSON par formation (4-3-3, 4-4-2, 3-5-2…) : position de base par rôle
- [ ] Machine à états match : KICKOFF → OPEN_PLAY → SET_PIECE → GOAL_SEQUENCE → CELEBRATION → RESTART
- [ ] Génération de phases de possession synthétiques pondérées par les stats live
- [ ] Raccord événement réel → séquence scriptée (but de X à la 34e ⇒ attaque qui finit par un tir de X)
- [ ] Oscillation Perlin des positions hors-ballon
- [ ] Émission de `MatchScriptChunk` (10-30 s) — déterministe avec seed, testé pytest
- ✅ Critère : un match complet du week-end → suite de chunks cohérente de bout en bout

### 1.C — Renderer complet
- [ ] 22 joueurs + arbitre instanciés (instanced meshes, animations partagées)
- [ ] Consommation des `MatchScriptChunk` (fichier statique d'abord, WebSocket en phase 2)
- [ ] Séquence but : cut caméra derrière le but + ralenti + célébration
- [ ] HUD rétro PES : score, minute, radar 2D, bandeau événement
- ✅ Critère de phase 1 : rejouer un match terminé de bout en bout dans le navigateur

---

## Phase 2 — Live (2 semaines)
- [ ] Souscription plan Pro API-Football (~25 €/mois) — **décision budget Amine**
- [ ] Poller live (15-30 s) + déduplication `(fixture_id, event_type, minute, player_id)` + diff engine → Redis pub/sub
- [ ] WebSocket + buffer de chunks (~60-90 s de retard assumé)
- [ ] Cas limites : mi-temps, prolongations, rollback VAR

## Phase 3 — Diffusion & polish
- [ ] Page `/broadcast/:fixtureId` 1080p sans HUD interactif → Playwright headless → FFmpeg → RTMP Twitch
- [ ] Commentaires LLM (couche 2), replays ralentis, home de sélection de match, multi-matchs

---

## Décisions prises en cours de route

| Date | Décision | Raison |
|---|---|---|
| 2026-07-11 | Phase 0 commence par le POC 3D (0.A), pas par l'API | La validation API nécessite une clé (action utilisateur) ; le POC est autonome |
| 2026-07-11 | Placeholder procédural avant Mixamo | Mixamo = téléchargement manuel + retarget Blender ; le POC valide le pipeline waypoints/animation, pas l'asset |
| 2026-07-11 | Frontend dans `frontend/`, backend dans `backend/` | Monorepo simple, cohérent avec l'architecture CLAUDE.md |

## Points en attente côté Amine
1. **Clé API-Football** (0.B) — plan Free suffit pour enregistrer les fixtures du spike
2. Budget plan Pro API-Football avant la phase 2
3. Autorisation explicite avant toute PR GitHub (aucun push sans accord)
