# Dépôt des exports Mixamo

Déposer ici les FBX téléchargés depuis mixamo.com, renommés comme suit :

| Fichier | Animation Mixamo (recherche) | Note |
|---|---|---|
| `idle.fbx` | "idle" → une idle debout calme | |
| `run.fbx` | "jog" → Jogging | cocher **In Place** |
| `sprint.fbx` | "run" → Fast Run / Sprint | cocher **In Place** |
| `pass.fbx` | "soccer" → Soccer Pass | |
| `shoot.fbx` | "kick" ou "soccer" → frappe/penalty kick | |
| `tackle.fbx` | "soccer" → Soccer Tackle | |
| `celebrate.fbx` | "victory" → célébration au choix | |
| `gk_dive.fbx` | "goalkeeper" → plongeon | optionnel, si dispo |

Réglages de téléchargement pour CHAQUE fichier :
- Format : **FBX Binary (.fbx)**
- Skin : **With Skin**
- Frames per Second : **30**
- Keyframe Reduction : **none**

Si une animation n'existe pas sous ce nom exact, prendre la plus proche.
Ces fichiers sont convertis en un GLB multi-clips par le script de build
(voir plan.md 0.C) — ne pas les référencer directement dans le code.
