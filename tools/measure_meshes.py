"""Liste chaque mesh du FBX avec sa taille et son centre, pour identifier la
pelouse et calculer l'echelle. Filtre les outliers (skybox géante).

Usage : blender --background --python tools/measure_meshes.py -- --src <fbx>
"""
from __future__ import annotations

import sys
import bpy
from mathutils import Vector


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :]
    src = argv[argv.index("--src") + 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)

    rows = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        for c in obj.bound_box:
            w = obj.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        size = hi - lo
        center = (lo + hi) / 2
        rows.append((obj.name, size, center))

    rows.sort(key=lambda r: r[1].x * r[1].y, reverse=True)
    for name, size, center in rows:
        print(
            f"[m] {name[:28]:28s} size=({size.x:7.1f},{size.y:7.1f},{size.z:6.1f}) "
            f"c=({center.x:7.1f},{center.y:7.1f},{center.z:6.1f})"
        )


if __name__ == "__main__":
    main()
