"""Convertit un modèle statique (stade, prop) FBX/OBJ → GLB optimisable.

Mesure la bounding box (utile pour calculer l'échelle vers notre repère
terrain 105x68 m) et exporte en Y-up. L'échelle/offset finaux sont appliqués
côté renderer (constante ajustable), pas cuits ici.

Usage :
    blender --background --python tools/prop_to_glb.py -- \
        --src "chemin/Stadium.fbx" --out frontend/public/models/stadium.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--drop-larger", type=float, default=1e9,
                   help="supprime les meshes dont l'empreinte depasse N (skybox/sol parasite)")
    return p.parse_args(argv)


def main() -> None:
    args = parse_args()
    src = Path(args.src)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.suffix.lower() == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(src))
    elif src.suffix.lower() == ".obj":
        bpy.ops.wm.obj_import(filepath=str(src))
    else:
        raise SystemExit(f"format non gere : {src.suffix}")

    # drop des meshes geants (plan/skybox parasite gonflant le bbox)
    to_drop = [
        o for o in bpy.data.objects
        if o.type == "MESH" and max(o.dimensions.x, o.dimensions.y) > args.drop_larger
    ]
    if to_drop:
        bpy.ops.object.select_all(action="DESELECT")
        for o in to_drop:
            o.select_set(True)
        bpy.ops.object.delete()
        print(f"[drop] {len(to_drop)} mesh(es) geant(s) supprime(s)")

    # bounding box monde de tous les meshes
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    mesh_count = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        mesh_count += 1
        for corner in obj.bound_box:
            world = obj.matrix_world @ __import__("mathutils").Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])

    dims = [hi[i] - lo[i] for i in range(3)]
    center = [(hi[i] + lo[i]) / 2 for i in range(3)]
    print(f"[bbox] meshes={mesh_count}")
    print(f"[bbox] size X={dims[0]:.2f} Y={dims[1]:.2f} Z={dims[2]:.2f}")
    print(f"[bbox] center X={center[0]:.2f} Y={center[1]:.2f} Z={center[2]:.2f}")
    print(f"[bbox] min={[round(v,2) for v in lo]} max={[round(v,2) for v in hi]}")

    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=False,
    )
    print(f"[done] {out}")


if __name__ == "__main__":
    main()
