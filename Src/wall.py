
# pyright: reportMissingImports=false
import random  # noqa: I001

import bpy


def create_wall_mesh(width, height, depth, name="Wall", material=None, rng=None):
    print(f"Creating wall with width={width}, height={height}, depth={depth}, rng={rng}")  
    if rng is None:
        rng = random.Random()

    bpy.ops.mesh.primitive_cube_add(size=1)
    wall = bpy.context.object
    wall.name = name
    wall.dimensions = (width/2, depth/2, height/2)
    for vertex in wall.data.vertices:
        vertex.co.y += 0.5
        vertex.co.z += 0.5
    wall.location = (0, -wall.dimensions[1] / 2, -wall.dimensions[2] / 2)

    if material is not None:
        wall.data.materials.clear()
        wall.data.materials.append(material)

    wall.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return wall
