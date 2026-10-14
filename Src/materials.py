# pyright: reportMissingImports=false

import random

import bpy


def create_material_with_noise(name="WallMaterial", rng=None):
    if rng is None:
        rng = random.Random()

    material = bpy.data.materials.new(name)
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
        rng.uniform(0.035, 0.19), rng.uniform(0.012, 0.045),
        rng.uniform(0.004, 0.035), 1.0,
    )
    ramp.color_ramp.elements[1].color = (
        rng.uniform(0.30, 0.50), rng.uniform(0.12, 0.43),
        rng.uniform(0.035, 0.018), 1.0,
    )
    middle = ramp.color_ramp.elements.new(0.48)
    middle.color = (
        rng.uniform(0.14, 0.38), rng.uniform(0.045, 0.31),
        rng.uniform(0.012, 0.24), 1.0,
    )
    ramp.color_ramp.elements[1].position = 0.72
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.75
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])

    return material
