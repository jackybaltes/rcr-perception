
# pyright: reportMissingImports=false
import random  # noqa: I001

import bpy



def create_wall(width, height, depth, name="Wall", material_name=None, volume_material="VolumeMaterial", rng=None):
    print(f"Creating wall with width={width}, height={height}, depth={depth}, rng={rng}")  
    if rng is None:
        rng = random.Random()

    bpy.ops.mesh.primitive_cube_add(size=1)
    wall = bpy.context.object
    wall.name = name
    wall.dimensions.set(width/2, depth/2, height/2)
    for vertex in wall.data.vertices:
        vertex.co.y += 0.5
        vertex.co.z += 0.5
    wall.location = (0, -wall.dimensions.y / 2, -wall.dimensions.z / 2)

    if material_name is None:
        material_name = "WallMaterial"
    material = bpy.data.materials.get(material_name)
    if material is None:
        material = bpy.data.materials.new(name=material_name)
    wall.data.materials.clear()
    wall.data.materials.append(material)

    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    texcoord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = rng.uniform(4.0, 10.0)
    noise.inputs["Detail"].default_value = rng.uniform(4.0, 8.0)
    noise.inputs["Roughness"].default_value = rng.uniform(0.65, 0.85)
    links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (
        rng.uniform(0.035, 0.09), rng.uniform(0.012, 0.035),
        rng.uniform(0.004, 0.015), 1.0,
    )
    ramp.color_ramp.elements[1].color = (
        rng.uniform(0.30, 0.50), rng.uniform(0.12, 0.23),
        rng.uniform(0.035, 0.08), 1.0,
    )
    middle = ramp.color_ramp.elements.new(0.48)
    middle.color = (
        rng.uniform(0.14, 0.28), rng.uniform(0.045, 0.11),
        rng.uniform(0.012, 0.04), 1.0,
    )
    ramp.color_ramp.elements[1].position = 0.72
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.75
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])

    wall.data.materials.clear()
    wall.data.materials.append(material)
    wall.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return wall
