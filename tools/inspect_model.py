"""Inspection d'un asset 3D (blend/fbx/obj) : objets, polys, dimensions,
matériaux, textures référencées. Usage :
    blender --background --python tools/inspect_model.py -- --file <chemin>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--file", required=True)
    return p.parse_args(argv)


def main() -> None:
    args = parse_args()
    path = Path(args.file)
    ext = path.suffix.lower()

    if ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(path))
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if ext == ".fbx":
            bpy.ops.import_scene.fbx(filepath=str(path))
        elif ext == ".obj":
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            raise SystemExit(f"format non géré: {ext}")

    total_polys = 0
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"=== {path.name} : {len(bpy.data.objects)} objets dont {len(meshes)} meshes ===")
    for obj in sorted(meshes, key=lambda o: -len(o.data.polygons))[:40]:
        n = len(obj.data.polygons)
        total_polys += n
        d = obj.dimensions
        print(f"[mesh] {obj.name}: {n} polys, dims=({d.x:.1f}, {d.y:.1f}, {d.z:.1f}), "
              f"scale=({obj.scale.x:.3f},{obj.scale.y:.3f},{obj.scale.z:.3f}), "
              f"mats={[m.name if m else '?' for m in obj.data.materials]}")
    # somme des polys restants
    rest = sum(len(o.data.polygons) for o in meshes[40:]) if len(meshes) > 40 else 0
    total_polys += rest

    # bbox monde globale
    from mathutils import Vector
    for obj in meshes:
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            xs.append(w.x)
            ys.append(w.y)
            zs.append(w.z)
    if xs:
        print(f"[bbox monde] x: {min(xs):.1f} → {max(xs):.1f} ({max(xs)-min(xs):.1f} m)")
        print(f"[bbox monde] y: {min(ys):.1f} → {max(ys):.1f} ({max(ys)-min(ys):.1f} m)")
        print(f"[bbox monde] z: {min(zs):.1f} → {max(zs):.1f} ({max(zs)-min(zs):.1f} m)")
    print(f"[total] {total_polys + rest} polys, {len(bpy.data.materials)} matériaux")

    for img in bpy.data.images:
        status = "OK" if img.has_data else "MANQUANTE"
        print(f"[texture] {img.name} ({img.filepath}) : {status}, {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
