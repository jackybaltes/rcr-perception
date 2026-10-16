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

import add_pyramid_volume
import create_screenshot
import create_cube_hold
import create_wall
import rock_materials

seed = 42
rng = random.Random(seed)


def test1(name):
    wall = bpy.data.objects[name]
    faces = add_pyramid_volume.faces_facing_direction(wall, (0,-1,0), 0.5)
    print(f"Faces facing forward {faces}")
    if faces:
        for i in range(10):
            hold = create_cube_hold.create_cube_hold()
            face_index = random.choice(faces)
            pt = create_cube_hold.select_random_coordinate(wall, face_index)
            create_cube_hold.add_hold_to_face(hold, wall, face_index, pt)
    else:
        print("No faces found")
                    

def test2():
    WALL_DIMENSIONS=(10.0,5.0, 0.05)
    mat = rock_materials.create_rock_material_with_noise("MatRock", color_limits=((0.14, 0.045, 0.012), (0.38, 0.31, 0.24)), rng=rng)
    wall = create_wall.create_wall_mesh(*WALL_DIMENSIONS, "TestWall", mat)
    return wall

def test3(name):
    wall = bpy.data.objects["Wall"]
    faces = add_pyramid_volume.faces_facing_direction(wall, (0,-1,0), 0.5)
    print(f"Faces facing forward {faces}")
    if faces:
        for i in range(10):
            hold = create_cube_hold.create_cube_hold()
            face_index = random.choice(faces)
            pt = create_cube_hold.select_random_coordinate(wall, face_index)
            create_cube_hold.add_hold_to_face(hold, wall, face_index, pt)
    else:
        print("No faces found")



