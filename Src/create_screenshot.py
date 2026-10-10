# create_screenshot.py
#
# Renders the scene from two cameras and stitches both views into a
# single side-by-side image.
#
# Usage (in Blender's Python console or a Text editor):
#     import create_screenshot
#     create_screenshot.create_screenshot()                     # default output
#     create_screenshot.create_screenshot(r"C:\tmp\stereo.png") # custom path

import os
import tempfile

import bpy
import numpy as np


def create_screenshot(output_path=None,
                      left_camera="CameraLeft",
                      right_camera="CameraRight"):
    """Render the scene from two cameras and stitch the views side by side.

    The left camera's render is placed on the left half of the output
    image, the right camera's render on the right half. Both renders use
    the scene's current render settings (engine, resolution, samples).

    Args:
        output_path:  Path of the stitched PNG. Defaults to
                      screenshot_side_by_side.png in the system temp dir.
        left_camera:  Name of the camera rendered into the left half.
        right_camera: Name of the camera rendered into the right half.

    Returns:
        The absolute path of the stitched image.
    """
    if output_path is None:
        output_path = os.path.join(tempfile.gettempdir(),
                                   "screenshot_side_by_side.png")

    scene = bpy.context.scene
    render = scene.render
    original = (scene.camera, render.filepath)

    # --- render both cameras ---------------------------------------------
    paths = {}
    try:
        for side, cam_name in (("left", left_camera), ("right", right_camera)):
            cam = bpy.data.objects.get(cam_name)
            if cam is None or cam.type != 'CAMERA':
                raise KeyError(f"camera '{cam_name}' not found in scene")
            scene.camera = cam
            paths[side] = os.path.join(tempfile.gettempdir(),
                                       f"_screenshot_{side}.png")
            render.filepath = paths[side]
            bpy.ops.render.render(write_still=True)
    finally:
        scene.camera, render.filepath = original

    # --- stitch ------------------------------------------------------------
    imgs = {side: bpy.data.images.load(p) for side, p in paths.items()}
    try:
        w_l, h_l = imgs["left"].size
        w_r, h_r = imgs["right"].size
        if (w_l, h_l) != (w_r, h_r):
            raise ValueError(
                f"render sizes differ: left {w_l}x{h_l}, right {w_r}x{h_r}")

        buf_l = np.empty(w_l * h_l * 4, dtype=np.float32)
        buf_r = np.empty(w_r * h_r * 4, dtype=np.float32)
        imgs["left"].pixels.foreach_get(buf_l)
        imgs["right"].pixels.foreach_get(buf_r)

        out = np.empty((h_l, 2 * w_l, 4), dtype=np.float32)
        out[:, :w_l] = buf_l.reshape(h_l, w_l, 4)   # left view  | left half
        out[:, w_l:] = buf_r.reshape(h_r, w_r, 4)   # right view | right half

        stitched = bpy.data.images.new("ScreenshotSideBySide",
                                       width=2 * w_l, height=h_l, alpha=False)
        stitched.pixels.foreach_set(out.ravel())
        stitched.filepath_raw = output_path
        stitched.file_format = 'PNG'
        stitched.save()
    finally:
        for img in imgs.values():
            bpy.data.images.remove(img)
        for p in paths.values():
            if os.path.exists(p):
                os.remove(p)

    print(f"stitched screenshot saved to: {output_path}")
    return output_path