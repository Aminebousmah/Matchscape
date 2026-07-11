"""Rendu rapproché d'un FBX (cadrage serré sur le modele), pour inspecter
pelouse et cages. Usage : blender --background --python tools/render_focus.py
-- --src <fbx> --out <dir> --drop-larger 200"""
from __future__ import annotations
import argparse, sys
from pathlib import Path
import bpy
from mathutils import Vector


def bbox():
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


def render(pos, look, out):
    cd = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = pos
    cam.rotation_euler = (look - pos).to_track_quat("-Z", "Y").to_euler()
    cd.clip_end = 100000; bpy.context.scene.camera = cam
    s = bpy.context.scene
    s.render.engine = "BLENDER_WORKBENCH"
    s.display.shading.color_type = "TEXTURE"
    s.display.shading.light = "STUDIO"
    s.render.resolution_x = 1280; s.render.resolution_y = 720
    s.render.filepath = str(out); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    src = a[a.index("--src") + 1]; out = Path(a[a.index("--out") + 1])
    dl = float(a[a.index("--drop-larger") + 1]) if "--drop-larger" in a else 1e9
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)
    drop = [o for o in bpy.data.objects if o.type == "MESH" and max(o.dimensions.x, o.dimensions.y) > dl]
    bpy.ops.object.select_all(action="DESELECT")
    for o in drop:
        o.select_set(True)
    if drop:
        bpy.ops.object.delete()
    lo, hi = bbox(); c = (lo + hi) / 2; span = max(hi.x - lo.x, hi.y - lo.y)
    out.mkdir(parents=True, exist_ok=True)
    render(Vector((c.x, c.y, c.z + span * 1.3)), c, out / "top.png")
    render(Vector((c.x + span * 0.7, c.y - span * 0.9, c.z + span * 0.6)), c, out / "iso.png")
    print(f"[done] span={span:.1f}")


if __name__ == "__main__":
    main()
