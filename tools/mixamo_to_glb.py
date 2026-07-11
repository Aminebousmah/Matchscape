"""Fusionne les FBX Mixamo de assets/mixamo/ en un GLB multi-clips.

Usage :
    blender --background --python tools/mixamo_to_glb.py -- \
        --src assets/mixamo --out frontend/public/models/player.glb

Chaque FBX Mixamo ("With Skin") contient le même squelette (mixamorig:*) et
le même mesh. On importe character.fbx comme base, puis on importe chaque
animation, on transfère son action sur l'armature de base (mêmes bones),
et on exporte un seul GLB dont les clips portent les noms attendus par
AnimatedPlayer (Idle, Run, Sprint, Pass, Shoot, Tackle, Celebrate, GkDive).
"""

import argparse
import math
import sys
from pathlib import Path

import bpy

# nom de fichier -> nom de clip dans le GLB
CLIP_NAMES = {
    "idle": "Idle",
    "run": "Run",
    "sprint": "Sprint",
    "pass": "Pass",
    "shoot": "Shoot",
    "tackle": "Tackle",
    "celebrate": "Celebrate",
    "gk_dive": "GkDive",
}

# Clips dont le deplacement est pilote par les waypoints du renderer :
# tout root motion residuel (case "In Place" oubliee sur Mixamo, ou derive
# des hanches) est aplati, sinon le joueur avance puis se teleporte en
# arriere a chaque boucle du clip.
IN_PLACE_CLIPS = {"Idle", "Run", "Sprint"}


def strip_root_motion(action: bpy.types.Action) -> None:
    """Aplati les axes de translation qui derivent (racine + hanches).

    Un axe d'oscillation (rebond vertical, balancement lateral) revient a sa
    valeur initiale a chaque cycle ; un axe de deplacement derive de facon
    monotone. On detecte ces derniers par le ratio derive/amplitude, ce qui
    reste independant des unites et de l'orientation du rig.
    """
    for fc in list(action.fcurves):
        dp = fc.data_path
        is_bone_loc = dp.endswith(".location") and "Hips" in dp
        is_object_loc = dp == "location"
        if not (is_bone_loc or is_object_loc):
            continue
        pts = fc.keyframe_points
        if len(pts) < 2:
            continue
        values = [kp.co[1] for kp in pts]
        drift = abs(values[-1] - values[0])
        spread = max(values) - min(values)
        if spread > 1e-6 and drift > 0.5 * spread:
            base = values[0]
            for kp in pts:
                kp.co[1] = base
                kp.handle_left[1] = base
                kp.handle_right[1] = base
            print(
                f"[in-place] {action.name}: {dp}[{fc.array_index}] "
                f"aplati (derive {drift:.2f})"
            )


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(
        filepath=str(path),
        ignore_leaf_bones=True,
        automatic_bone_orientation=False,
    )
    return [o for o in bpy.data.objects if o not in before]


def find_armature(objects: list[bpy.types.Object]) -> bpy.types.Object:
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    raise RuntimeError("No armature found in imported FBX")


def delete_objects(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.object.delete()


def main() -> None:
    args = parse_args()
    src = Path(args.src).resolve()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    character = src / "character.fbx"
    if not character.exists():
        raise SystemExit(f"Missing {character}")

    reset_scene()

    base_objects = import_fbx(character)
    base_armature = find_armature(base_objects)
    print(f"[base] character.fbx -> armature '{base_armature.name}'")

    if base_armature.animation_data is None:
        base_armature.animation_data_create()

    # NLA : chaque action devient une track "stashed" pour que l'exporteur
    # glTF les emette toutes comme clips independants.
    exported = []
    for stem, clip_name in CLIP_NAMES.items():
        fbx = src / f"{stem}.fbx"
        if not fbx.exists():
            print(f"[skip] {fbx.name} absent")
            continue

        imported = import_fbx(fbx)
        anim_armature = find_armature(imported)
        action = (
            anim_armature.animation_data.action
            if anim_armature.animation_data
            else None
        )
        if action is None:
            print(f"[warn] {fbx.name}: no action found, skipped")
            delete_objects(imported)
            continue

        action = action.copy()
        action.name = clip_name
        action.use_fake_user = True

        if clip_name in IN_PLACE_CLIPS:
            strip_root_motion(action)

        track = base_armature.animation_data.nla_tracks.new()
        track.name = clip_name
        track.strips.new(clip_name, int(action.frame_range[0]), action)
        track.mute = True

        delete_objects(imported)
        # purge des datablocks orphelins de l'import (meshes/textures dupliques)
        bpy.ops.outliner.orphans_purge(do_recursive=True)
        exported.append(clip_name)
        print(f"[clip] {fbx.name} -> '{clip_name}'")

    if not exported:
        raise SystemExit("No animation clip could be extracted")

    base_armature.animation_data.action = None

    # Echelle : Mixamo exporte en cm (scale 0.01 sur l'armature). L'exporteur
    # glTF applique les transforms, mais on normalise pour une hauteur ~1.8 m.
    bpy.ops.object.select_all(action="DESELECT")

    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_optimize_animation_size=True,
        export_skins=True,
        export_yup=True,
        export_apply=False,
        export_image_format="AUTO",
    )
    print(f"[done] {out} clips={exported}")


if __name__ == "__main__":
    main()
