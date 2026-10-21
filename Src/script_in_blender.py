try:
    import bpy
except ImportError:  # pragma: no cover - script is designed to run inside Blender.
    bpy = None

import pathlib
import importlib
import random
import math

try:
    import mathutils
except ImportError:  # pragma: no cover - script is designed to run inside Blender.
    mathutils = None

def get_blend_file_path():
    import pathlib
    import bpy
    blend_dir = bpy.path.abspath("//")
    p = pathlib.Path(blend_dir)
    return p

def add_module_dir(p):
    import sys
    added = False
    if p not in sys.path:
        sys.path.append(str(p))     
        added=True
    return added

def reload(module):
    import importlib
    importlib.reload(module)

p = get_blend_file_path()
add_module_dir(p / ".." / "Src")

import climbing_wall
import volume
import screenshot
import cube_hold
import wall
import rcr_materials

seed = 42
rng = random.Random(seed)

WALL_DIMENSIONS=(10.0,5.0, 0.05)

MAT_WALL = rcr_materials.create_rock_material_with_noise("MatRock", color_hsv_limits=((0.35, 0.1, 0.1), (0.65, 0.4, 0.5)), p_noise=((10, 20), (2, 10), (0.5, 0.9), (0.1, 0.9)), rng=rng)
MAT_SQUARE = rcr_materials.create_origin_square_material("MatOriginSquare", color_hsv=(0.0, 1.0, 1.0), rng=rng)
MAT_VOLUME = rcr_materials.create_rock_material_with_noise("MatVolume", color_hsv_limits=((0.5, 0.1, 0.1), (0.85, 0.4, 0.5)), p_noise=((10, 20), (2, 10), (0.5, 0.9), (0.1, 0.9)), rng=rng)
MAT_CENTER = rcr_materials.create_hold_material("MatCubeHold_Center", color_hsv=(0.02, 0.9, 0.6), limit=0.001, rng=rng) 
MAT_RIGHT = rcr_materials.create_hold_material("MatCubeHold_Right", color_hsv=(0.33, 0.8, 0.8), limit=0.025, rng=rng)
MAT_LEFT = rcr_materials.create_hold_material("MatCubeHold_Left", color_hsv=(0.66, 0.8, 0.8), limit=0.025, rng=rng)

WALL_NAME = "TestWall"

def test1(name):
    mat = MAT_WALL
    mat_s = MAT_SQUARE
    w = climbing_wall.create_climbing_wall_mesh(*WALL_DIMENSIONS, name, rng=rng)
    if mat is not None:
        w.data.materials.clear()
        w.data.materials.append(mat)
    if mat_s is not None:
        square = bpy.data.objects.get(f"{name}_OriginSquare")
        if square is not None:
            square.data.materials.clear()
            square.data.materials.append(mat_s)
            rcr_materials.set_alpha(square.data.materials[0], alpha=0.5)
    return w

def test2(name):
    wall = bpy.data.objects[name]
    faces = volume.faces_facing_direction(wall, (0,-1,0), 0.5)
    print(f"Faces facing forward {faces}")
    if faces:
        for i in range(3):
            vol = volume.add_pyramid_volume(wall, name=f"Volume_{i}", rng=rng)
            mat = MAT_VOLUME
            if mat is not None:
                vol.data.materials.clear()
                vol.data.materials.append(mat)
    else:
        print("No faces found")


def test3(name):
    wall = bpy.data.objects[name]
    faces = volume.faces_facing_direction(wall, (0,-1,0), 0.5)
    print(f"Faces facing forward {faces}")
    if faces:
        for i in range(10):
            r = rng.random()
            if r < 0.33:
                hold = cube_hold.create_cube_hold_center(f"HoldCenter_{i}", rng=rng)
                mat = MAT_CENTER
            elif r < 0.66:
                hold = cube_hold.create_cube_hold_right(f"HoldRight_{i}", rng=rng)
                mat = MAT_RIGHT
            else:
                hold = cube_hold.create_cube_hold_left(f"HoldLeft_{i}", rng=rng)
                mat = MAT_LEFT
            if mat is not None:
                hold.data.materials.clear()
                hold.data.materials.append(mat)
            face_index = random.choice(faces)
            pt = cube_hold.select_random_coordinate(wall, face_index)
            cube_hold.add_hold_to_face(hold, wall, face_index, pt=pt)
    else:
        print("No faces found")

def _world_bounding_sphere(obj):
    corners = [
        obj.matrix_world @ mathutils.Vector(corner)
        for corner in obj.bound_box
    ]
    center = sum(corners, mathutils.Vector()) / len(corners)
    radius = max((corner - center).length for corner in corners)
    return center, radius


def test4(name, NN=10):
    root = bpy.data.objects[name]
    hierarchy = [root, *root.children_recursive]
    possible_vols = []
    hold_spheres = []
    for obj in hierarchy:
        if obj.type == 'MESH' and "Hold" in obj.name:
            hold_spheres.append(_world_bounding_sphere(obj))
        if obj.type == 'MESH' and obj.visible_get() and "Hold" not in obj.name:
            faces = volume.faces_facing_direction(obj, (0, -1, 0), threshold=0.25)
            if faces:
                for f in faces:
                    possible_vols.append((obj, f))
    print(f"Found {len(possible_vols)} volumes facing forward in hierarchy of {name}")
    if NN > 0 and not possible_vols:
        raise ValueError(f"No forward-facing volume faces found in hierarchy of {name}")
    for i in range(NN):
        r = rng.random()
        if r < 0.33:
            hold = cube_hold.create_cube_hold_center(f"HoldCenter_{i}", rng=rng)
            mat = MAT_CENTER
        elif r < 0.66:
            hold = cube_hold.create_cube_hold_right(f"HoldRight_{i}", rng=rng)
            mat = MAT_RIGHT
        else:
            hold = cube_hold.create_cube_hold_left(f"HoldLeft_{i}", rng=rng)
            mat = MAT_LEFT
        if mat is not None:
            hold.data.materials.clear()
            hold.data.materials.append(mat)
        for _ in range(1000):
            vol, face = rng.choice(possible_vols)
            pt = cube_hold.select_random_coordinate(vol, face, rng=rng)
            cube_hold.add_hold_to_face(hold, vol, face, pt=pt, rng=rng)
            center, radius = _world_bounding_sphere(hold)
            if all(
                (center - other_center).length >= radius + other_radius + 0.15
                for other_center, other_radius in hold_spheres
            ):
                hold_spheres.append((center, radius))
                break
        else:
            mesh = hold.data
            bpy.data.objects.remove(hold, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
            raise RuntimeError(
                f"Could not place hold {i} with at least 0.5 units of clearance "
                "after 1000 attempts"
            )
    return possible_vols
