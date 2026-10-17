import bpy
import pathlib
import importlib
import random
import math
import mathutils

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
                    

def test2():
    WALL_DIMENSIONS=(10.0,5.0, 0.05)
    mat = rcr_materials.create_rock_material_with_noise("MatRock", color_limits=((0.14, 0.045, 0.012), (0.38, 0.31, 0.24)), rng=rng)
    wall = wall.create_wall_mesh(*WALL_DIMENSIONS, "TestWall", mat)
    return wall

def test3(name):
    wall = bpy.data.objects[name]
    faces = volume.faces_facing_direction(wall, (0,-1,0), 0.5)
    print(f"Faces facing forward {faces}")
    if faces:
        for i in range(10):
            hold = cube_hold.create_cube_hold()
            face_index = random.choice(faces)
            pt = cube_hold.select_random_coordinate(wall, face_index)
            cube_hold.add_hold_to_face(hold, wall, face_index, pt, random.choice([-45.0/180.0*math.pi, 0.0, 45.0/180.0*math.pi]))
    else:
        print("No faces found")



