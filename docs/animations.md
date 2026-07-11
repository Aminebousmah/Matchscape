# Inventaire des animations joueur

Checklist des clips nécessaires pour une restitution fluide, par ordre de
priorité. Workflow : télécharger sur Mixamo (réglages : **FBX Binary, With
Skin, 30 fps, Keyframe Reduction none** — la case "In Place" n'a plus
d'importance, le convertisseur supprime le root motion des clips de
locomotion) → déposer dans `assets/mixamo/` avec le nom de fichier indiqué →
`blender --background --python tools/mixamo_to_glb.py -- --src assets/mixamo
--out frontend/public/models/player.glb` → optimisation gltf-transform.

Le convertisseur ignore les fichiers absents : on peut compléter au fil de
l'eau, tier par tier.

## Tier 0 — ✅ En place (la base qui tourne aujourd'hui)

| Fichier | Clip | Usage |
|---|---|---|
| `idle.fbx` | Idle | À l'arrêt |
| `run.fbx` | Run | Course (vitesse 0,3–6 m/s, cadence asservie) |
| `sprint.fbx` | Sprint | Sprint (> 6 m/s) |
| `pass.fbx` | Pass | TimedAction PASS |
| `shoot.fbx` | Shoot | TimedAction SHOOT |
| `tackle.fbx` | Tackle | TimedAction TACKLE (fautes/cartons) |
| `celebrate.fbx` | Celebrate | Buteur après un but |
| `gk_dive.fbx` | GkDive | Plongeon du gardien |

## Tier 1 — Fluidité de la locomotion (le plus gros gain visuel)

Ce qui rend une simulation "vivante", c'est 90 % la locomotion : aujourd'hui
un joueur qui se replace à 1 m/s joue le clip Run au ralenti, et tout le monde
se déplace toujours face à sa course.

| Fichier | Recherche Mixamo | Clip | Pourquoi |
|---|---|---|---|
| `walk.fbx` | "Walking" | Walk | Vitesses 0,3–2 m/s (replacements calmes, retours après but) — élimine le "jogging au ralenti" |
| `jog_back.fbx` | "Jog Backward" | JogBack | Défenseur qui recule face au jeu (ne jamais tourner le dos au ballon) |
| `strafe_left.fbx` | "Jog Strafe Left" | StrafeLeft | Replacement latéral sans se retourner (ligne défensive qui coulisse) |
| `strafe_right.fbx` | "Jog Strafe Right" | StrafeRight | Idem à droite |
| `idle_2.fbx` | "Offensive Idle" ou 2e "Idle" | Idle2 | Variation aléatoire par joueur — casse l'effet "22 clones synchronisés" |
| `turn.fbx` | "Left Turn" / "Right Turn" | Turn | Pivots propres sur les demi-tours (optionnel si le slerp suffit) |

**Changement moteur associé (moi) :** état WALK entre IDLE et RUN ; blend
directionnel (avant/arrière/latéral selon l'angle vitesse-orientation) ;
offset de phase aléatoire par joueur sur Idle/Run.

## Tier 2 — Vocabulaire football (les gestes qui manquent au scénariste)

| Fichier | Recherche Mixamo | Clip | Usage scénariste |
|---|---|---|---|
| `header.fbx` | "Header" / "Soccer Header" | Header | Reprises de la tête sur centres et corners |
| `receive.fbx` | "Soccer Trapping" / "Receive" | Receive | Contrôle du ballon à la réception d'une passe (aujourd'hui le ballon "colle" au joueur sans geste) |
| `long_pass.fbx` | "Soccer Long Pass" / "Kicking" | LongPass | Transversales, dégagements, six-mètres, corners |
| `throw_in.fbx` | "Throw In" | ThrowIn | Touches (l'API donne peu l'info, mais le ballon sort dans nos trajectoires synthétiques) |
| `gk_idle.fbx` | "Goalkeeper Idle" | GkIdle | Posture de gardien (jambes fléchies) au lieu de l'idle de joueur de champ |
| `gk_catch.fbx` | "Goalkeeper Catch" | GkCatch | Arrêt simple sans plongeon (tirs cadrés faibles) |
| `gk_throw.fbx` | "Goalkeeper Overhand Throw" | GkThrow | Relance à la main après un arrêt |

## Tier 3 — Événements & théâtralité (ce qui raconte le match)

| Fichier | Recherche Mixamo | Clip | Usage |
|---|---|---|---|
| `fall.fbx` | "Falling" / "Tripping" | Fall | Joueur taclé/fauché — indispensable pour les séquences carton (le fautif tacle... dans le vide aujourd'hui) |
| `get_up.fbx` | "Getting Up" | GetUp | Se relever après une chute |
| `argue.fbx` | "Arguing" / "Angry Gesture" | Argue | Contestation pendant les séquences carton/VAR |
| `injured.fbx` | "Injured Idle" / "Writhing In Pain" | Injured | Au sol pendant l'intervention (remplacements sur blessure) |
| `celebrate_2.fbx` | "Victory" (variante) | Celebrate2 | 2e célébration — éviter le même geste à chaque but |
| `celebrate_team.fbx` | "Clapping" / "Cheering" | CelebrateTeam | Coéquipiers qui convergent vers le buteur |
| `disappointed.fbx` | "Defeated" / "Sad Idle" | Disappointed | Équipe qui encaisse, occasion manquée, penalty raté |
| `ref_whistle.fbx` | "Standing Yell" (approx.) | RefWhistle | Arbitre (quand on l'ajoutera) — pas de vrai clip sifflet sur Mixamo, approximation |

## Tier 4 — Plus tard (pack Ochi / custom, pas Mixamo)

Dribbles spécifiques, duels épaule-épaule, râteau/roulette, gardien qui
boxe un centre, mur sur coup franc, rentrée des équipes au coup d'envoi,
banc de touche. À traiter au moment du swap esthétique Ochi (retarget des
clips Mixamo validés + leurs animations cuites pour la figuration).

## État au 2026-07-11 (2e session de téléchargement intégrée)

**42 clips dans le GLB.** Intégrés en plus des tiers prévus : diagonales
avant/arrière (JogFwdDiag/JogBackDiag ×2), Dribble + Dribble2 (porteur de
balle), Penalty dédié, Shoot2/Header2/Tackle2/GkCatch2/GkDive2 (variantes
anti-répétition), et un set gardien complet (GkIdle, GkDirect, GkSidestep,
GkCatch, GkBlock, GkMiss, GkThrow, GkKick, GkPass, GkPlace).

**Ajoutés depuis (3e dépôt) :** Walk + WalkStart (état WALK actif, seuils
0,3–2,6 m/s), Turn/TurnLeft/TurnRight (dispo dans le GLB, pas encore
déclenchés — le slerp gère l'orientation pour l'instant). **47 clips.**

**Encore manquants (prochaine session Mixamo) :**
- `argue.fbx` — "Arguing" (contestation carton)
- `celebrate_2.fbx` / `celebrate_team.fbx` — variantes de célébration
- `disappointed.fbx` — "Defeated" (équipe qui encaisse)
- `ref_whistle.fbx` — approximation arbitre

**Doublons écartés (dispo dans `new assets/`, non intégrés) :** le dossier
`pack/` entier (mêmes clips sans skin + personnage Ch38 — réutilisable pour
varier les corps plus tard), Header.fbx/Header Soccerball (1), Goalie Throw
(= Overhand Throw), Kick Up/Stall ×4/Kneeing ×2/Soccer Spin/Scissor Kick/
Transition (freestyle, hors match — Scissor Kick gardé en idée tier 4),
variantes (1)/(3) surnuméraires des clips gardien.
