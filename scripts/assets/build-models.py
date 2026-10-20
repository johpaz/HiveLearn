"""
Genera los modelos «héroe» del juego (dron-abeja, marco del portal y núcleo de La Reina) y los exporta a .glb.

    flatpak run --command=blender org.blender.Blender -b --python scripts/assets/build-models.py -- packages/hivelearn-ui/public/models

Convenciones: Blender es Z arriba; al exportar a glTF el frente del dron (+Y en Blender) queda en -Z, como espera el
juego. Todo es geometría ligera con materiales emisivos (el bloom del juego hace el resto).
"""
import math
import os
import sys

import bpy

out_dir = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "."
os.makedirs(out_dir, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24


def material(name, color, emission=None, strength=0.0, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


def sphere(name, loc, scale, mat, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def torus(name, loc, major, minor, mat, rotation=(0, 0, 0), major_segments=40, minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(location=loc, rotation=rotation, major_radius=major, minor_radius=minor,
                                     major_segments=major_segments, minor_segments=minor_segments)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def cylinder(name, loc, radius, depth, mat, vertices=12, radius2=None):
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius2, depth=depth, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def spin(obj, axis, turns_frames=48, amount=2 * math.pi):
    """Giro continuo en bucle (interpolación lineal) sobre un eje 0/1/2 del Euler."""
    obj.rotation_mode = "XYZ"
    obj.rotation_euler[axis] = 0
    obj.keyframe_insert("rotation_euler", index=axis, frame=1)
    obj.rotation_euler[axis] = amount
    obj.keyframe_insert("rotation_euler", index=axis, frame=turns_frames + 1)
    for fc in obj.animation_data.action.fcurves if hasattr(obj.animation_data.action, "fcurves") else []:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def flap(obj, side, frames=8, amount=0.55):
    obj.rotation_mode = "XYZ"
    for frame, value in ((1, -amount), (1 + frames // 2, amount), (1 + frames, -amount)):
        obj.rotation_euler[1] = side * value
        obj.keyframe_insert("rotation_euler", index=1, frame=frame)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 1 + frames


def export(name, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out_dir, f"{name}.glb"), export_format="GLB", use_selection=True, export_apply=True,
        export_animations=True, export_yup=True, export_lights=False, export_cameras=False,
    )


# ── dron-abeja ────────────────────────────────────────────────────────────────────────────────
reset()
shell = material("Shell", (0.05, 0.07, 0.11), (1.0, 0.65, 0.0), 0.06, 0.85, 0.3)
amber = material("Amber", (1.0, 0.6, 0.0), (1.0, 0.55, 0.0), 3.0, 0.1, 0.4)
cyan = material("Cyan", (0.1, 0.8, 0.9), (0.1, 0.85, 1.0), 4.0, 0.0, 0.2)
glass = material("WingGlass", (0.75, 0.95, 1.0), (0.6, 0.95, 1.0), 0.8, 0.0, 0.1)
glass.blend_method = "BLEND" if hasattr(glass, "blend_method") else None
body = sphere("Torso", (0, 0, 0), (0.3, 0.42, 0.24), shell)
parts = [body]
for i, y in enumerate((-0.12, 0.1, 0.27)):
    ring = torus(f"Stripe{i}", (0, y, 0), 0.27 - abs(y) * 0.35, 0.028, amber, rotation=(math.pi / 2, 0, 0))
    ring.scale = (1.0, 1.0, 0.8)
    parts.append(ring)
parts.append(sphere("Eye", (0, 0.4, 0.04), (0.085, 0.085, 0.085), cyan, 16, 10))
sting = cylinder("Sting", (0, -0.46, 0), 0.07, 0.16, amber, 10, radius2=0.01)
sting.rotation_euler = (math.pi / 2, 0, 0)
parts.append(sting)
parts.append(torus("Thruster", (0, 0, -0.26), 0.2, 0.02, cyan))
for side, label in ((-1, "WingL"), (1, "WingR")):
    wing = sphere(label, (side * 0.3, 0.02, 0.22), (0.26, 0.5, 0.025), glass, 14, 8)
    flap(wing, side)
    parts.append(wing)
export("drone", parts)

# ── marco del portal (el anillo animado lo pone el juego con un shader) ────────────────────────
reset()
metal = material("Frame", (0.06, 0.09, 0.14), None, 0.0, 0.9, 0.3)
glow = material("FrameGlow", (0.1, 0.8, 0.9), (0.1, 0.85, 1.0), 3.5, 0.0, 0.3)
frame = []
frame.append(cylinder("Base", (0, 0, 0.04), 1.25, 0.08, metal, 6))
frame.append(torus("BaseRim", (0, 0, 0.09), 1.15, 0.025, glow, major_segments=6, minor_segments=8))
for side in (-1, 1):
    frame.append(cylinder(f"Pylon{side}", (side * 0.98, 0, 0.78), 0.1, 1.5, metal, 8, radius2=0.075))
    frame.append(cylinder(f"Lamp{side}", (side * 0.98, 0, 1.58), 0.075, 0.14, glow, 8))
    frame.append(cylinder(f"Foot{side}", (side * 0.98, 0, 0.12), 0.17, 0.16, metal, 6))
export("portal", frame)

# ── núcleo de La Reina ────────────────────────────────────────────────────────────────────────
reset()
gold = material("Gold", (1.0, 0.75, 0.15), (1.0, 0.6, 0.0), 2.8, 0.7, 0.25)
dark = material("Dark", (0.05, 0.06, 0.1), None, 0.0, 0.9, 0.3)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.5, location=(0, 0, 0))
core = bpy.context.active_object
core.name = "CoreGem"
core.data.materials.append(gold)
smooth(core)
spin(core, 2, 96)
ring_a = torus("RingA", (0, 0, 0), 0.82, 0.03, gold, rotation=(math.pi / 3, 0, 0), major_segments=48)
ring_b = torus("RingB", (0, 0, 0), 0.98, 0.022, dark, rotation=(-math.pi / 3, 0.4, 0), major_segments=48)
spin(ring_a, 2, 120)
spin(ring_b, 2, 160, -2 * math.pi)
for i in range(6):
    a = i * math.pi / 3
    spike = cylinder(f"Spike{i}", (math.cos(a) * 0.62, math.sin(a) * 0.62, 0), 0.07, 0.34, gold, 6, radius2=0.0)
    spike.rotation_euler = (0, math.pi / 2, a)
export("core", [core, ring_a, ring_b] + [o for o in bpy.data.objects if o.name.startswith("Spike")])
print("MODELOS_OK", out_dir)
