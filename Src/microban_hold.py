import pathlib
import struct

try:
    import bpy
except ImportError:  # pragma: no cover - only exercised when Blender is absent.
    bpy = None


def _require_blender():
    if bpy is None:
        raise RuntimeError("Blender is required to create a hold; run this script inside Blender.")


def create_microban_hold_center(name="MicrobanHold"):
    """Create a hold object from the bundled microban STL mesh."""
    _require_blender()

    stl_path = pathlib.Path(__file__).resolve().parent.parent / "Assets" / "microban_hold.stl"
    stl_data = stl_path.read_bytes()

    if len(stl_data) < 84:
        raise ValueError(f"Invalid binary STL file: {stl_path}")

    triangle_count = struct.unpack_from("<I", stl_data, 80)[0]
    expected_size = 84 + triangle_count * 50
    if len(stl_data) < expected_size:
        raise ValueError(
            f"Invalid binary STL file: expected at least {expected_size} bytes, "
            f"found {len(stl_data)}"
        )
    if triangle_count == 0:
        raise ValueError(f"STL file contains no triangles: {stl_path}")

    vertices = []
    faces = []
    vertex_indices = {}
    for triangle_index in range(triangle_count):
        offset = 84 + triangle_index * 50
        triangle = struct.unpack_from("<12f", stl_data, offset)
        face = []
        for vertex_offset in (3, 6, 9):
            vertex = tuple(triangle[vertex_offset:vertex_offset + 3])
            index = vertex_indices.get(vertex)
            if index is None:
                index = len(vertices)
                vertex_indices[vertex] = index
                vertices.append(vertex)
            face.append(index)
        faces.append(face)

    bounds_min = [min(vertex[axis] for vertex in vertices) for axis in range(3)]
    bounds_max = [max(vertex[axis] for vertex in vertices) for axis in range(3)]
    center_x = (bounds_min[0] + bounds_max[0]) / 2.0
    center_z = (bounds_min[2] + bounds_max[2]) / 2.0
    rear_y = bounds_max[1]
    vertices = [
        (x - center_x, y - rear_y, z - center_z)
        for x, y, z in vertices
    ]

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    hold_obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(hold_obj)
    return hold_obj
