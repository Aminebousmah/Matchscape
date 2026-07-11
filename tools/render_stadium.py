"""Rendu d'aperçu du stade avec la composition finale (drop du plan geant,
echelle, rotation) + rectangle rouge de reference 105x68 m a l'origine, pour
valider l'alignement pelouse-modele avec notre terrain.

Usage :
    blender --background --python tools/render_stadium.py -- \
        --src <fbx> --out <dir> --scale 7.8 --rotate 90 --drop-larger 200
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
    p.add_argument("--src", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--scale", type=float, default=1.0)
    p.add_argument("--rotate", type=float, default=0.0, help="degres autour de Z")
    p.add_argument("--drop-larger", type=float, default=1e9)
    return p.parse_args(argv)


def add_reference_pitch() -> None:
    hx, hy = 52.5, 34.0
    mesh = bpy.data.meshes.new("RefPitch")
    verts = [(-hx, -hy, 0.5), (hx, -hy, 0.5), (hx, hy, 0.5), (-hx, hy, 0.5)]
    mesh.from_pydata(verts, [(0, 1), (1, 2), (2, 3), (3, 0)], [(0, 1, 2, 3)])
    mesh.update()
    mat = bpy.data.materials.new("RefMat")
    mat.diffuse_color = (1.0, 0.0, 0.0, 1.0)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new("RefPitch", mesh)
    bpy.context.scene.collection.objects.link(obj)


def render(cam_pos: Vector, look_at: Vector, out_path: Path) -> None:
    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = cam_pos
    cam.rotation_euler = (look_at - cam_pos).to_track_quat("-Z", "Y").to_euler()
    cam_data.clip_end = 100000
    bpy.context.scene.camera = cam
    s = bpy.context.scene
    s.render.engine = "BLENDER_WORKBENCH"
    s.display.shading.color_type = "MATERIAL"
    s.display.shading.light = "STUDIO"
    s.render.resolution_x = 1280
    s.render.resolution_y = 720
    s.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def main() -> None:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.src)

    # drop des meshes trop grands (plan/skybox parasite)
    to_drop = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        d = obj.dimensions
        if max(d.x, d.y) > args.drop_larger:
            to_drop.append(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in to_drop:
        obj.select_set(True)
    if to_drop:
        bpy.ops.object.delete()
        print(f"[drop] {len(to_drop)} mesh(es) geant(s) supprime(s)")

    # applique echelle + rotation a tous les objets racine
    rot = math.radians(args.rotate)
    for obj in bpy.data.objects:
        if obj.parent is None:
            obj.scale = (args.scale, args.scale, args.scale)
            obj.rotation_euler = (0, 0, rot)

    add_reference_pitch()

    # eclairage additionnel pour la vue de dessus (workbench studio = noir a la verticale)
    light_data = bpy.data.lights.new("Sun", type="SUN")
    light_data.energy = 3
    light = bpy.data.objects.new("Sun", light_data)
    light.rotation_euler = (math.radians(35), math.radians(20), 0)
    bpy.context.scene.collection.objects.link(light)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    render(Vector((0, -20, 320)), Vector((0, 0, 0)), out / "top.png")
    render(Vector((160, -190, 150)), Vector((0, 0, 0)), out / "iso.png")
    print(f"[done] {out}")


if __name__ == "__main__":
    main()
