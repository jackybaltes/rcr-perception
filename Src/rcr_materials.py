# pyright: reportMissingImports=false

import random

import bpy

def hsv_to_rgb(h, s, v):
    """
    Convert HSV to RGB.

    Parameters:
        h: Hue [0, 1]
        s: Saturation [0, 1]
        v: Value [0, 1]

    Returns:
        (r, g, b) in [0, 1]
    """
    h = h % 1.0

    if s == 0.0:
        return v, v, v

    h *= 6.0
    i = int(h)
    f = h - i

    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))

    if i == 0:
        return v, t, p
    elif i == 1:
        return q, v, p
    elif i == 2:
        return p, v, t
    elif i == 3:
        return p, q, v
    elif i == 4:
        return t, p, v
    else:
        return v, p, q

def create_rock_material_with_noise(name="MatRock", color_hsv_limits=None, roughness=0.8, rng=None, ):
    if rng is None:
        rng = random.Random()
    
    if color_hsv_limits is None:
        color_hsv_limits = ((0,0,0), (1,1,1))


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
    noise.inputs["Roughness"].default_value = rng.uniform(max(0,roughness-0.1), min(1,roughness+0.1))
    links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])

    # color = nodes.new("ShaderNodeHueSaturation")
    # color.inputs["Hue"].default_value = rng.uniform(color_limits[0][0], color_limits[1][0])
    # color.inputs["Saturation"].default_value = rng.uniform(color_limits[0][1], color_limits[1][1])
    # color.inputs["Value"].default_value = rng.uniform(color_limits[0][2], color_limits[1][2])

    hsv = (
        rng.uniform(color_hsv_limits[0][0], color_hsv_limits[1][0]),
        rng.uniform(color_hsv_limits[0][1], color_hsv_limits[1][1]),
        rng.uniform(color_hsv_limits[0][2], color_hsv_limits[1][2])
    )

    color = nodes.new("ShaderNodeRGB")
    color.outputs["Color"].default_value = (*hsv_to_rgb(*hsv), 1.0)  # Red    
    links.new(color.outputs["Color"], shader.inputs["Base Color"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.75
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])

    return material

def create_hold_material(name="HoldMaterial", color_hsv_limits=((0.0, 0.07, 0.04), (0.18, 1.0, 0.5)), roughness=0.4, rng=None):
    mat = create_rock_material_with_noise(name, color_hsv_limits=(color_hsv_limits), roughness=roughness, rng=rng)
    return mat


# hold_material = bpy.data.materials.get("HoldMaterial")
#     if hold_material is None:
#         hold_material = bpy.data.materials.new(name="HoldMaterial")
#         hold_material.diffuse_color = (0.8, 0.0, 0.0, 1.0)
#         hold_material.roughness = 0.8
#         hold_material.use_nodes = True
#         principled = hold_material.node_tree.nodes.get("Principled BSDF")
#         if principled is not None:
#             principled.inputs["Base Color"].default_value = (
#                 1.0, 0.0, 0.0, 1.0
#             )
#             principled.inputs["Roughness"].default_value = 0.8
    