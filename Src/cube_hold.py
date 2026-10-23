import math
import random

# pyright: reportMissingImports=false
try:
    import bmesh
except ImportError:  # pragma: no cover - only exercised when Blender is absent.
    bmesh = None

try:
    import bpy
except ImportError:  # pragma: no cover - only exercised when Blender is absent.
    bpy = None

try:
    from mathutils import Quaternion, Vector
except ImportError:  # pragma: no cover - only exercised when Blender is absent.
    Quaternion = None
    Vector = None

import rcr_materials

HOLD_FACE_ROTATIONS = (-math.pi / 4, 0.0, math.pi / 4)


def _require_blender():
    if bpy is None or bmesh is None:
        raise RuntimeError("Blender is required for mesh generation; run this script inside Blender.")


def create_cube_hold_center(
    name="CubeHoldCenter",
    hold_width_mm=80.0,
    hold_height_mm=80.0,
    hold_depth_mm=40.0,
    hole_width_mm=70.0,
    hole_height_mm=70.0,
    hole_depth_mm=30.0,
    back_wall_mm=1.0,
    bevel_radius_mm=4.0,
    bevel_segments=4,
    rng=None,
):
    if rng is None:
        rng = random.Random()

    h = create_cube_hold(
        name=name,
        hold_width_mm=hold_width_mm,
        hold_height_mm=hold_height_mm,
        hold_depth_mm=hold_depth_mm,
        hole_width_mm=hole_width_mm,
        hole_height_mm=hole_height_mm,
        hole_depth_mm=hole_depth_mm,
        back_wall_mm=back_wall_mm,
        bevel_radius_mm=bevel_radius_mm,
        bevel_segments=bevel_segments,
        rng=rng
    )
    return h


def create_cube_hold_right(
    name="CubeHoldRight",
    hold_width_mm=200.0,
    hold_height_mm=80.0,
    hold_depth_mm=40.0,
    hole_width_mm=190.0,
    hole_height_mm=70.0,
    hole_depth_mm=30.0,
    back_wall_mm=1.0,
    bevel_radius_mm=4.0,
    bevel_segments=4,
    rng=None,
):
    if rng is None:
        rng = random.Random()

    h = create_cube_hold(
        name=name,
        hold_width_mm=hold_width_mm,
        hold_height_mm=hold_height_mm,
        hold_depth_mm=hold_depth_mm,
        hole_width_mm=hole_width_mm,
        hole_height_mm=hole_height_mm,
        hole_depth_mm=hole_depth_mm,
        back_wall_mm=back_wall_mm,
        bevel_radius_mm=bevel_radius_mm,
        bevel_segments=bevel_segments,
        rng=rng
    )
    h.rotation_euler.rotate_axis('Y', math.radians(45.0))
    return h

def create_cube_hold_left(
    name="CubeHoldLeft",
    hold_width_mm=200.0,
    hold_height_mm=80.0,
    hold_depth_mm=40.0,
    hole_width_mm=190.0,
    hole_height_mm=70.0,
    hole_depth_mm=30.0,
    back_wall_mm=1.0,
    bevel_radius_mm=4.0,
    bevel_segments=4,
    rng=None,
):
    if rng is None:
        rng = random.Random()

    h = create_cube_hold(
        name=name,
        hold_width_mm=hold_width_mm,
        hold_height_mm=hold_height_mm,
        hold_depth_mm=hold_depth_mm,
        hole_width_mm=hole_width_mm,
        hole_height_mm=hole_height_mm,
        hole_depth_mm=hole_depth_mm,
        back_wall_mm=back_wall_mm,
        bevel_radius_mm=bevel_radius_mm,
        bevel_segments=bevel_segments,
        rng=rng
    )
    h.rotation_euler.rotate_axis('Y', math.radians(-45.0))
    return h

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
    rng = None
):

    _require_blender()

    if rng is None:
        rng = random.Random()

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
            or abs(y1 - front_y) < tol
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


def select_random_coordinate(face_obj, face_index, rng=None):
    """Return a uniformly random world-space point inside a mesh face."""
    if face_obj.type != 'MESH':
        raise TypeError("face_obj must be a mesh object")

    if not 0 <= face_index < len(face_obj.data.polygons):
        raise IndexError(
            f"face_index {face_index} out of range "
            f"({len(face_obj.data.polygons)} faces)"
        )

    mesh = face_obj.data
    mesh.calc_loop_triangles()
    triangles = []
    total_area = 0.0
    
    for triangle in mesh.loop_triangles:
        if triangle.polygon_index != face_index:
            continue
        
        points = [
            face_obj.matrix_world @ mesh.vertices[index].co
            for index in triangle.vertices
        ]
        area = (points[1] - points[0]).cross(
            points[2] - points[0]
        ).length * 0.5
        if area > 0.0:
            triangles.append((points, area))
            total_area += area

    if not triangles:
        raise ValueError("face has no positive-area triangles")

    if rng is None:
        rng = random.Random()
    selection = rng.uniform(0.0, total_area)
    for points, area in triangles:
        selection -= area
        if selection <= 0.0:
            first, second, third = points
            u, v = rng.random(), rng.random()
            if u + v > 1.0:
                u, v = 1.0 - u, 1.0 - v
            return first + (second - first) * u + (third - first) * v

    points = triangles[-1][0]
    assert len(points) > 0
    return points[0].copy()


def add_hold_to_face(hold_obj, face_obj, face_index, pt=None, angle=None, rng=None):
    """Place a hold facing outward, with a face-relative rotation in radians."""
    if hold_obj.type != 'MESH' or face_obj.type != 'MESH':
        raise TypeError("hold_obj and face_obj must be mesh objects")

    if not 0 <= face_index < len(face_obj.data.polygons):
        raise IndexError(
            f"face_index {face_index} out of range "
            f"({len(face_obj.data.polygons)} faces)"
        )

    if not hold_obj.data.vertices:
        raise ValueError("hold_obj must have mesh vertices")

    if rng is None:
        rng = random.Random()
    if angle is None:
        angle = rng.choice(HOLD_FACE_ROTATIONS)
    elif angle not in HOLD_FACE_ROTATIONS:
        raise ValueError(
            "angle must be one of -pi/4, 0, or pi/4 radians "
            "(-45, 0, or 45 degrees)"
        )

    face = face_obj.data.polygons[face_index]
    normal_matrix = face_obj.matrix_world.to_3x3().inverted().transposed()
    face_normal = (normal_matrix @ face.normal).normalized()
    rotation = Quaternion((0.0, -1, 0), angle) @ hold_obj.rotation_euler.to_quaternion() 
    rotation = Vector((0.0, -1.0, 0.0)).rotation_difference(face_normal) @ rotation

    rear_y = max(vertex.co.y for vertex in hold_obj.data.vertices)
    rear_center = Vector((0.0, rear_y, 0.0))
    scaled_rear_center = Vector((
        rear_center.x * hold_obj.scale.x,
        rear_center.y * hold_obj.scale.y,
        rear_center.z * hold_obj.scale.z,
    ))
    face_point = pt if pt is not None else select_random_coordinate(
        face_obj, face_index, rng
    )

    hold_obj.rotation_mode = 'QUATERNION'
    hold_obj.rotation_quaternion = rotation
    hold_obj.location = face_point - rotation @ scaled_rear_center

    bpy.context.view_layer.update()
    world_matrix = hold_obj.matrix_world.copy()
    hold_obj.parent = face_obj
    hold_obj.matrix_world = world_matrix

    return hold_obj
