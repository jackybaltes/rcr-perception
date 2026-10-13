import bpy
import bmesh


def create_cube_hold(
    name="CubeHold",
    hold_width_mm=80.0,
    hold_height_mm=60.0,
    hold_depth_mm=40.0,
    hole_width_mm=70.0,
    hole_height_mm=50.0,
    hole_depth_mm=30.0,
    back_wall_mm=1.0,
    bevel_radius_mm=4.0,
    bevel_segments=4,
):

    MM = 0.001

    # --------------------------------------------------
    # Validation
    # --------------------------------------------------

    if hole_width_mm >= hold_width_mm:
        raise ValueError(
            "hole_width_mm must be smaller than hold_width_mm"
        )

    if hole_height_mm >= hold_height_mm:
        raise ValueError(
            "hole_height_mm must be smaller than hold_height_mm"
        )

    if hole_depth_mm >= hold_depth_mm:
        raise ValueError(
            "hole_depth_mm must be smaller than hold_depth_mm"
        )

    if hole_height_mm + back_wall_mm >= hold_height_mm:
        raise ValueError(
            "hole_height_mm + back_wall_mm must be smaller than hold_height_mm"
        )

    # --------------------------------------------------
    # mm -> meters
    # --------------------------------------------------

    hold_width = hold_width_mm * MM
    hold_height = hold_height_mm * MM
    hold_depth = hold_depth_mm * MM

    hole_width = hole_width_mm * MM
    hole_height = hole_height_mm * MM
    hole_depth = hole_depth_mm * MM

    back_wall = back_wall_mm * MM
    bevel_radius = bevel_radius_mm * MM

    # --------------------------------------------------
    # Create Hold
    # --------------------------------------------------

    hold_mesh = bpy.data.meshes.new(f"{name}_mesh")
    hold_obj = bpy.data.objects.new(name, hold_mesh)

    bpy.context.collection.objects.link(hold_obj)

    bm = bmesh.new()

    result = bmesh.ops.create_cube(
        bm,
        size=1.0,
    )

    verts = result["verts"]

    bmesh.ops.scale(
        bm,
        verts=verts,
        vec=(
            hold_width / 2.0,
            hold_depth / 2.0,
            hold_height / 2.0,
        ),
    )

    # Origin at center of back face:
    # Back face => Y = 0
    # Front face => Y = -hold_height

    bmesh.ops.translate(
        bm,
        verts=bm.verts,
        vec=(0.0, -hold_depth/4, 0.0),
    )

    # --------------------------------------------------
    # Bevel front face edges
    # --------------------------------------------------

    front_y = min(vertex.co.y for vertex in bm.verts)
    tol = 1e-6

    front_edges = []

    for edge in bm.edges:

        y0 = edge.verts[0].co.y
        y1 = edge.verts[1].co.y

        if (
            abs(y0 - front_y) < tol
            and abs(y1 - front_y) < tol
        ):
            front_edges.append(edge)

    if front_edges:

        bmesh.ops.bevel(
            bm,
            geom=front_edges,
            offset=bevel_radius,
            segments=bevel_segments,
            profile=0.5,
            affect='EDGES',
        )

    bm.to_mesh(hold_mesh)
    hold_mesh.update()
    bm.free()

    # --------------------------------------------------
    # Create Cutter
    # --------------------------------------------------

    cutter_mesh = bpy.data.meshes.new(
        f"{name}_cutter_mesh"
    )

    cutter_obj = bpy.data.objects.new(
        f"{name}_cutter",
        cutter_mesh,
    )

    bpy.context.collection.objects.link(
        cutter_obj
    )

    cutter_bm = bmesh.new()

    result = bmesh.ops.create_cube(
        cutter_bm,
        size=1.0,
    )

    cutter_verts = result["verts"]

    bmesh.ops.scale(
        cutter_bm,
        verts=cutter_verts,
        vec=(
            hole_width / 2.0,
            hole_depth / 2.0,
            hole_height / 2.0,
        ),
    )

    cutter_bm.to_mesh(cutter_mesh)
    cutter_mesh.update()
    cutter_bm.free()

    # --------------------------------------------------
    # Position cutter
    #
    # Back face = Y=0
    # Hole remains back_wall_mm away
    # from the back face.
    #
    # Pocket enters from the top.
    # --------------------------------------------------

    cutter_obj.location = (
        0.0,
        -(back_wall + hole_depth / 4.0),
        hold_depth / 2.0 - hole_depth / 2.0,
    )

    # --------------------------------------------------
    # Boolean Difference
    # --------------------------------------------------

    boolean = hold_obj.modifiers.new(
        name="Pocket",
        type='BOOLEAN',
    )

    boolean.operation = 'DIFFERENCE'
    boolean.solver = 'EXACT'
    boolean.object = cutter_obj

    bpy.ops.object.select_all(
        action='DESELECT'
    )

    hold_obj.select_set(True)
    bpy.context.view_layer.objects.active = hold_obj

    bpy.context.view_layer.update()

    bpy.ops.object.modifier_apply(
        modifier=boolean.name
    )

    # --------------------------------------------------
    # Cleanup cutter
    # --------------------------------------------------

    bpy.data.objects.remove(
        cutter_obj,
        do_unlink=True,
    )

    # --------------------------------------------------
    # Smooth shading
    # --------------------------------------------------

    for poly in hold_obj.data.polygons:
        poly.use_smooth = True

    hold_obj.data.update()

    print("Created:", hold_obj.name)
    print("Vertices:", len(hold_obj.data.vertices))
    print("Faces:", len(hold_obj.data.polygons))
    print("Dimensions:", hold_obj.dimensions)

    return hold_obj
