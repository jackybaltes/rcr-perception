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

import volume
import screenshot
import cube_hold
import wall
import rcr_materials

seed = 42
rng = random.Random(seed)

wall_mat = rcr_materials.create_rock_material_with_noise("MatRock", color_hsv_limits=((0.14, 0.045, 0.012), (0.38, 0.31, 0.24)), rng=rng)
hold_center_mat = rcr_materials.create_hold_material("MatHold_Center", color_hsv_limits=((0.0, 0.75, 0.3), (0.18, 1.0, 0.7)), rng=rng)
hold_right_mat = rcr_materials.create_hold_material("MatHold_Right", color_hsv_limits=((0.3, 0.75, 0.3), (0.48, 1.0, 0.7)), rng=rng)
hold_left_mat = rcr_materials.create_hold_material("MatHold_Left", color_hsv_limits=((0.6, 0.75, 0.3), (0.78, 1.0, 0.7)), rng=rng)

def test1(name):
    wall = bpy.data.objects[name]
    faces = volume.faces_facing_direction(wall, (0,-1,0), 0.5)
    print(f"Faces facing forward {faces}")
    if faces:
        for i in range(10):
            hold = cube_hold.create_cube_hold()
            face_index = random.choice(faces)
            pt = cube_hold.select_random_coordinate(wall, face_index)
            cube_hold.add_hold_to_face(hold, wall, face_index, pt)
    else:
        print("No faces found")

MAT_WALL = rcr_materials.create_rock_material_with_noise("MatRock", color_hsv_limits=((0.35, 0.1, 0.01), (0.65, 0.4, 0.05)), rng=rng)
MAT_CENTER = rcr_materials.create_hold_material("MatCubeHold", color_hsv=(0.5, 0.8, 0.8), limit=0.05, rng=rng) 
MAT_RIGHT = rcr_materials.create_hold_material("MatHold_Right", color_hsv=(0.18, 0.8, 0.8), limit=0.025, rng=rng)
MAT_LEFT = rcr_materials.create_hold_material("MatHold_Left", color_hsv=(0.45, 0.8, 0.8), limit=0.025, rng=rng)

def test2():
    WALL_DIMENSIONS=(10.0,5.0, 0.05)
    mat = MAT_WALL
    w = wall.create_wall_mesh(*WALL_DIMENSIONS, "TestWall", rng=rng)
    if mat is not None:
        w.data.materials.clear()
        w.data.materials.append(mat)
    return w

def test3(name):
    wall = bpy.data.objects[name]
    faces = volume.faces_facing_direction(wall, (0,-1,0), 0.5)
    print(f"Faces facing forward {faces}")
    if faces:
        for i in range(10):
            r = rng.random()
            if r < 0.33:
                hold = cube_hold.create_cube_hold_center("HoldCenter", rng=rng)
                mat = MAT_CENTER
            elif r < 0.66:
                hold = cube_hold.create_cube_hold_right("HoldRight", rng=rng)
                mat = MAT_RIGHT
            else:
                hold = cube_hold.create_cube_hold_left("HoldLeft", rng=rng)
                mat = MAT_LEFT
            if mat is not None:
                hold.data.materials.clear()
                hold.data.materials.append(mat)
            face_index = random.choice(faces)
            pt = cube_hold.select_random_coordinate(wall, face_index)
            cube_hold.add_hold_to_face(hold, wall, face_index, pt=pt)
    else:
        print("No faces found")



