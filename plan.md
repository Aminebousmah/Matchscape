# plan.md — PitchReplay

> Plan d'exécution opérationnel. La vision et l'architecture sont dans [CLAUDE.md](CLAUDE.md) — ce fichier suit **ce qui est fait, en cours, et à faire**, dans l'ordre.

**Dernière mise à jour : 2026-07-11 (après-midi)**

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
- [x] Pipeline GLTF animé en place : `components/three/AnimatedPlayer.tsx` charge `public/models/player.glb`, crossfade IDLE/RUN/SPRINT, timeScale calé sur la vitesse réelle (anti foot-sliding). Remplacer l'asset = déposer un .glb + ajuster le bloc `MODEL` (noms de clips, orientation, échelle)
- [x] Modèle de dev provisoire : Soldier.glb (exemples three.js, clips Idle/Walk/Run) — à remplacer par l'asset final
- [x] **Décision (2026-07-11)** : Mixamo de bout en bout d'abord (personnage du catalogue + animations foot, 0 €) ; le pack [Studio Ochi Animated & Rigged](https://studioochi.com/product/3d-low-poly-football-players-pack-animated-rigged/) (30 €) viendra après pour l'esthétique (maillots/équipes + foule) — retarget des clips Mixamo sur ses meshes à ce moment-là
- [x] FBX Mixamo déposés dans `assets/mixamo/` (character + 8 animations)
- [x] Conversion FBX → GLB multi-clips via Blender headless (`tools/mixamo_to_glb.py`, Blender 4.5 portable dans `tools/`, gitignoré) : 8 clips (Idle, Run, Sprint, Pass, Shoot, Tackle, Celebrate, GkDive), optimisé 56 Mo → 1,6 Mo (draco + webp 1024px)
- [x] `AnimatedPlayer` branché sur le nouveau GLB (clips Run/Sprint séparés, vitesses naturelles propres)
- [ ] Validation visuelle Amine (orientation du modèle + qualité après optimisation draco/simplify)
- [ ] Plus tard : achat pack Ochi + retarget des animations validées sur ses meshes ; clips Pass/Shoot/Tackle/Celebrate/GkDive seront déclenchés par les TimedAction du MatchScript (phase 1)

---

## Phase 1 — MVP replay différé (3-4 semaines)

### 1.A — Backend : ingestion & event store
- [x] Scaffold `backend/` : paquet Python `scenarist/` (pydantic v2 strict, pytest, venv) — FastAPI/Postgres/Redis attendront le live (phase 2)
- [x] Normalisation payloads API-Football v3 → `NormalizedEvent` + lineups + stats (`scenarist/normalize.py`), gestion VAR "Goal cancelled" — testée sur le match test `fixture_1234567` (format API réel, contenu synthétique documenté, à remplacer par de vrais enregistrements dès la clé API)
- [ ] Event store Postgres + enregistrement de vrais matchs (**bloqué : clé API-Football**)

### 1.B — Scénariste couche 1 (60% de l'effort — cœur du projet)
- [x] **v0 livrée (2026-07-11)** — `scenarist/engine.py` : match test complet (90 min) → 317 chunks continus. Machine à états (kickoff/possession/but/penalty/carton/célébration/restart), possession pondérée par les stats (62/38), raccord événement réel → séquence (tir du buteur à la minute exacte), rouge = joueur retiré, remplacements, tirs synthétiques dérivés des stats, commentaires FR. Déterministe (seed), 15 tests pytest d'invariants (continuité joueurs/ballon entre chunks, bornes, vitesses < 11 m/s, progression score). Sortie : `python -m scenarist.generate` → `frontend/public/demo/match.json` (2,1 Mo)
- Limites v0 assumées : pas de changement de côté à la mi-temps, remplaçant téléporté, corners fondus dans les tirs, temps additionnel compressé, positions par formation génériques (pas encore de gabarits JSON par rôle)
- [ ] Gabarits tactiques JSON affinés par formation + oscillation Perlin hors-ballon
- [ ] Variation des patterns d'attaque (aile gauche/droite/axe, contre-attaque vs possession)
- ✅ Critère : un match complet du week-end (payloads réels) → suite de chunks cohérente de bout en bout — **v0 validée sur le match test, reste à valider sur un vrai match (clé API)**

### 1.C bis — Décor stade ← **validation visuelle Amine**
- [x] Modèle stade importé + nettoyé (plan/skybox géant de 770 u retiré → vrai stade 19×23 u, pelouse centrée à l'origine). Diagnostic via rendus Blender headless (`tools/render_stadium.py`, `measure_meshes.py`) : c'est un bol à tribunes, pas une pelouse plate
- [x] Placement : échelle 7,8 + rotation 90° → les tribunes entourent notre terrain (105×68). Corrige le retour Amine (« stade au centre » = il était rétréci à 0,32 au lieu d'agrandi)
- [ ] Réglage fin visuel Amine (constantes `STADIUM` dans `Stadium.tsx`) : hauteur des tribunes, alignement pelouse

### 1.C ter — Menu highlights + commentaires API réels ← **livré (2026-07-11)**
- [x] Backend : `timeline` des événements réels API-Football dans le fichier de rejeu (données brutes : minute, type, joueur, passeur, `detail`, `comments`, but VAR marqué `cancelled`). 2 tests pytest
- [x] Frontend : menu de highlights cliquable (`HighlightsMenu.tsx`) → saut au moment (`seekTo` dans le store, consommé par `MatchPlayback`) ; bandeau de commentaire affichant le **dernier événement réel extrait de l'API** (tag « API-Football »), plus mon texte généré
- [x] Ballon plus réaliste : passes vives (~0,4 s, plus rapides qu'une course), ballon aérien sur les longues passes, conduite vers le but — fin du « avance-stop-avance »

### 1.C — Renderer complet

### 1.C — Renderer complet
- [x] **Démarré en avance (2026-07-11)** : format `MatchScriptChunk` typé (`lib/matchScript.ts`), rejeu complet par `MatchPlayback` (22 joueurs clonés SkeletonUtils + ballon avec hauteur z, une seule boucle useFrame), TimedAction → clips one-shot (PASS/SHOOT/TACKLE/CELEBRATE/GK_DIVE), chunk de démo scripté 60 s (`lib/demoChunk.ts` : 2 attaques + buts + circulation, testé : bornes terrain, vitesses ≤ 10,5 m/s, boucle sans téléportation)
- [x] Fix moteur : interpolation Hermite à tangentes pondérées par le temps (la Catmull-Rom uniforme créait des pics de vitesse aux changements de rythme) + suppression du root motion Mixamo dans `tools/mixamo_to_glb.py` (bug "téléportation" du joueur)
- [ ] Consommation de chunks depuis fichier statique JSON puis WebSocket (phase 2)
- [ ] Séquence but : cut caméra derrière le but + ralenti
- [ ] HUD rétro PES : score, minute, radar 2D, bandeau événement
- [ ] Arbitre + gardiens avec comportements dédiés
- ✅ Critère de phase 1 : rejouer un match terminé de bout en bout dans le navigateur

---

## Phase 2 — Live (2 semaines)
- [ ] **Projet perso sans but lucratif (décision 2026-07-11) : plan gratuit API-Football (100 req/jour)** → poll à 60 s = 1 match live/jour, compatible avec le buffer 60-120 s. Plan Pro seulement si multi-matchs un jour
- [ ] Poller live (60 s en tier gratuit) + déduplication `(fixture_id, event_type, minute, player_id)` + diff engine → Redis pub/sub
- [ ] WebSocket + buffer de chunks (~60-90 s de retard assumé)
- [ ] Cas limites : mi-temps, prolongations, rollback VAR

## Phase 3 — Diffusion & polish
- [ ] Page `/broadcast/:fixtureId` 1080p sans HUD interactif → Playwright headless → FFmpeg → RTMP Twitch
- [ ] Commentaires LLM (couche 2), replays ralentis, home de sélection de match, multi-matchs
- [ ] Pages match type FotMob/Sofascore (référence produit, pas source de données) : timeline d'événements, compositions visuelles, stats — design à traiter plus tard (Claude design)

---

## Décisions prises en cours de route

| Date | Décision | Raison |
|---|---|---|
| 2026-07-11 | Phase 0 commence par le POC 3D (0.A), pas par l'API | La validation API nécessite une clé (action utilisateur) ; le POC est autonome |
| 2026-07-11 | Placeholder procédural avant Mixamo | Mixamo = téléchargement manuel + retarget Blender ; le POC valide le pipeline waypoints/animation, pas l'asset |
| 2026-07-11 | Frontend dans `frontend/`, backend dans `backend/` | Monorepo simple, cohérent avec l'architecture CLAUDE.md |
| 2026-07-11 | Sources données : API-Football (événements/compos/stats live) + TheSportsDB (métadonnées), confirmé face à FotMob/Sofascore/ESPN | Seules API officielles ; FotMob/Sofascore = pas d'API publique (scraping fragile + CGU), ESPN = non documentée. FotMob reste une référence UI |
| 2026-07-11 | Mouvement de bloc tactique dans le chunk de démo (l'équipe coulisse avec le ballon) | Retour Amine : joueurs trop statiques ; préfigure le scénariste 1B |

## Points en attente côté Amine
1. **Clé API-Football** (0.B) — plan gratuit, aucune CB requise ; suffit pour tout le développement et 1 match live/jour
2. Achat pack Ochi (~30 €) quand on attaque l'esthétique — seule dépense prévue du projet
3. Autorisation explicite avant toute PR GitHub (aucun push sans accord)
