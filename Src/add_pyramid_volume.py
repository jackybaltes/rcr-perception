# add_pyramid_volume.py
#
# Adds a pyramid volume to a face of a mesh object as a separate object
# named "Volume", parented to the base object.
#
# Usage (in Blender's Python console or a Text editor):
#     import add_pyramid_volume
#     add_pyramid_volume.add_pyramid_volume(bpy.context.object, face_index=0)
#
# For every call, three random points are sampled uniformly over the
# face's surface, one apex point is placed at distance `d` from the
# face's plane along its outward normal (directly above the base
# triangle's centroid), and the three side triangles connecting the
# base edge pairs to the apex are created.

import random

import bpy
import bmesh
from mathutils import Vector, Matrix


def _sample_triangle(a, b, c, rng):
    if (b - a).cross(c - a).length <= 1e-12:
        raise ValueError("degenerate triangle: vertices have no positive area")

    u, v = rng.random(), rng.random()
    if u + v > 1.0:
        u, v = 1.0 - u, 1.0 - v
    return a + (b - a) * u + (c - a) * v


def random_point_in_triangle(base_pts, rng=None):
    """Return a uniformly random point inside a triangle.

    Args:
        base_pts: Three vertex coordinates, as mathutils.Vector values.
        seed:     Optional seed for reproducible point placement.

    Returns:
        A mathutils.Vector in the same coordinate space as `base_pts`.
    """
    if rng is None:
        rng = random.Random()

    points = tuple(Vector(point) for point in base_pts)
    if len(points) != 3:
        raise ValueError("base_pts must contain exactly three vertices")
    return _sample_triangle(*points, rng)


def faces_facing_direction(obj, direction, threshold=0.0):
    """Return mesh face indices whose normal dot direction exceeds threshold.

    `direction` is interpreted in world coordinates and normalized before
    comparison, so `threshold` is a cosine-like value.
    """
    if obj.type != 'MESH':
        raise TypeError("obj must be a mesh object")

    direction = Vector(direction)
    if direction.length == 0.0:
        raise ValueError("direction must be non-zero")
    direction.normalize()

    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    return [
        polygon.index
        for polygon in obj.data.polygons
        if (normal_matrix @ polygon.normal).normalized().dot(direction) > threshold
    ]


def _random_point_in_face(co_list, rng):
    """Uniformly sample a point inside a polygon (fan triangulation,
    triangle picked with probability proportional to its area)."""
    tris = []
    a0 = co_list[0]
    for i in range(1, len(co_list) - 1):
        a, b, c = a0, co_list[i], co_list[i + 1]
        area = (b - a).cross(c - a).length * 0.5
        if area > 1e-12:
            tris.append((a, b, c, area))
    if not tris:
        raise ValueError("degenerate face: no positive-area triangles")

    total = sum(t[3] for t in tris)
    r, acc, chosen = rng.uniform(0.0, total), 0.0, tris[-1]
    for t in tris:
        acc += t[3]
        if r <= acc:
            chosen = t
            break

    a, b, c, _ = chosen
    return _sample_triangle(a, b, c, rng)


def _get_volume_material():
    """Return the existing 'VolumeMaterial', or create a dummy copy of
    'WallMaterial' (empty material as last resort) named 'VolumeMaterial'."""
    mat = bpy.data.materials.get("VolumeMaterial")
    if mat:
        return mat
    src = bpy.data.materials.get("WallMaterial")
    if src:
        mat = src.copy()
        mat.name = "VolumeMaterial"
    else:
        mat = bpy.data.materials.new("VolumeMaterial")
    return mat


def add_pyramid_volume(obj, face_index=-1, d=0.2, name="Volume", volume_material="VolumeMaterial", rng=None):
    """Add a pyramid volume on a face of `obj` as a separate object.

    Args:
        obj:        Blender mesh object the pyramid is built on.
        face_index: Index of the polygon face to build the pyramid on.
        d:          Distance of the apex from the face plane, measured
                    along the face's outward normal (default 0.2 m).
        name:       Name of the new object (default "Volume"; Blender appends .001 etc. on name collisions).
        volume_material: Name of the material to use for the pyramid (default "VolumeMaterial").
        rng:        Random number generator (default None, which creates a new one).

    Returns:
        The newly created pyramid object. Raises on invalid input.

    The pyramid is a separate mesh object parented to `obj`. Its
    vertices are stored in the parent's local space with an identity
    parent inverse, so the pyramid stays glued to the face when the
    parent is moved, rotated or scaled.
    """
    if rng is None:
        rng = random.Random()
    
    if face_index < 0:
        face_indices = faces_facing_direction(obj, (0, -1, 0), threshold=0.5)
        if face_indices:
            face_index = face_indices[0]
        else:
            raise ValueError("no face_index provided and no forward-facing faces found")
    # Read the source face from a temporary bmesh (obj is not modified).
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    try:
        bm.faces.ensure_lookup_table()
        if not 0 <= face_index < len(bm.faces):
            raise IndexError(
                f"face_index {face_index} out of range ({len(bm.faces)} faces)"
            )
        face = bm.faces[face_index]

        # Three random points on the face's plane (inside the polygon).
        co = [v.co.copy() for v in face.verts]
        base_pts = [_random_point_in_face(co, rng) for _ in range(3)]

        # Apex: distance d along the face normal, directly above the
        # centroid of the three base points (always inside the triangle).
        normal = face.normal  # outward polygon normal in object space
        #apex = sum(base_pts, Vector()) / 3.0 + normal * d
        apex = random_point_in_triangle(base_pts, rng) + normal * d
    finally:
        bm.free()

    # Build the pyramid as its own mesh, in the parent's local space.
    pyr = bmesh.new()
    v_apex = pyr.verts.new(apex)
    base_verts = [pyr.verts.new(p) for p in base_pts]
    for i in range(3):
        f = pyr.faces.new((base_verts[i],
                           base_verts[(i + 1) % 3],
                           v_apex))
        if f.normal.dot(normal) < 0.0:
            f.normal_flip()  # keep side triangles facing outward

    pyr_mesh = bpy.data.meshes.new(name)
    pyr.to_mesh(pyr_mesh)
    pyr.free()

    pyr_obj = bpy.data.objects.new(name, pyr_mesh)
    bpy.context.scene.collection.objects.link(pyr_obj)

    # Parent to the base object. Identity parent inverse + basis means
    # the child's world matrix equals the parent's, so the local-space
    # coordinates resolve to the same world positions as the face.
    pyr_obj.parent = obj
    pyr_obj.matrix_parent_inverse = Matrix.Identity(4)
    pyr_obj.matrix_basis = Matrix.Identity(4)

    # Assign 'VolumeMaterial', creating it as a copy of 'WallMaterial'
    # (or a fresh empty material if that is missing) on first use.
    if isinstance(volume_material, str):
        volume_material = bpy.data.materials.get(volume_material) or _get_volume_material()
    pyr_obj.data.materials.append(volume_material)

    return pyr_obj