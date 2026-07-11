"""Rendu d'aperçu headless d'un .blend (vue 3/4 aérienne + vue de dessus).
Usage :
    blender --background --python tools/render_preview.py -- --file <blend> --out <dir>
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--file", required=True)
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def scene_bbox() -> tuple[Vector, Vector]:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def render(cam_pos: Vector, look_at: Vector, out_path: Path) -> None:
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = cam_pos
    direction = look_at - cam_pos
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.clip_end = 10000
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.light = "STUDIO"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def main() -> None:
    args = parse_args()
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.file)))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    lo, hi = scene_bbox()
    center = (lo + hi) / 2
    span = max(hi.x - lo.x, hi.y - lo.y)
    print(f"[bbox] centre={tuple(round(v,1) for v in center)} span={span:.1f}")

    # vue 3/4 cadrée sur le cœur de la scène (1/4 du span, le stade est
    # probablement bien plus petit que l'emprise totale)
    for name, dist_k, height_k in (("three_quarter", 0.35, 0.25), ("close", 0.12, 0.08)):
        d = span * dist_k
        render(center + Vector((d, -d, span * height_k)), center, out / f"{name}.png")
    render(center + Vector((0, 0, span * 0.5)), center, out / "top.png")
    print(f"[done] rendus dans {out}")


if __name__ == "__main__":
    main()
