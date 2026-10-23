# Three.js climbing-wall scene

This is a browser-based recreation of the Blender/Python scene generator. It
rebuilds the climbing wall, origin marker, triangular volumes, and seeded hold
layout in Three.js. The original Blender `.blend` file is not loaded in the
browser; the wall and volumes are generated from the dimensions and procedures
in `Src/`. The wall origin is offset by half its thickness, placing its front
face exactly at z = 0.
Generated holds use only -45, 0, or +45 degree rotations relative to their
face. Their backfaces are anchored flush to the sampled wall or volume surface.
Left-click a hold in the scene to highlight it and scroll the JSON editor to its
record. With a hold selected, press **G** and move the pointer to preview it
snapped to the nearest visible wall or volume face. Left-click to finish moving
the hold; the X/Y/Z boxes also allow direct coordinate entry. Press **Enter**
or left-click to commit, or press **Esc** or right-click to cancel and restore
the original transform. Press **R** with a hold selected to rotate it around
the backplate normal while keeping the backplate attached to its face. Move the
mouse horizontally or enter an absolute yaw angle in the textbox; it starts at
the hold's current yaw. Press **Enter** or left-click to commit, or press
**Esc** or right-click to cancel.
Press **C** to reset the interactive camera to 1 m height and 2 m from the
wall, matching the stereo camera's position convention, and aim it directly at
the wall.

The mesh in `Assets/microban_hold.stl` is loaded directly and used for every
hold. The Blender wall generator uses half of each configured wall dimension,
so the recreated wall is 5 m wide by 2.5 m high.
Enable **Upd. Seed** beside the seed field to generate a fresh random seed on
each **Regenerate scene** action; leave it unchecked to regenerate from the
entered seed.
Each scene regeneration creates new wall and volume materials with randomized
HSV colors and noise ranges corresponding to the Blender
`create_rock_material_with_noise` configuration in `Src/script_in_blender.py`.
Regenerating with the same seed advances the material variation while
preserving deterministic hold placement.
The Scene data (JSON) field contains a versioned scene description with wall
dimensions and origin marker, each volume's center and dimensions, the seed,
material variation seed, and every hold's color, world position, and
orientation. Edit the JSON and select
**Load scene from JSON** to restore the wall, volumes, and holds. Hold records
require a `microban_hold` type, finite `position` x/y/z values in meters, and
finite `orientation` roll/pitch/yaw values in radians. Older hold-only JSON
files are still accepted and retain the current wall and volumes.
Use **Load scene from disk** to restore a saved scene, or **Save scene to disk**
to download the current JSON as `climbing-scene.json`.
Above the JSON field, a side-by-side front stereo preview shows the wall from
two camera positions with a 64 mm eye separation and a default center distance
of 0.75 m from the wall plane. The camera height and wall distance can be
adjusted live using the numeric controls above the preview; the distance is
measured from the wall's z = 0 front face.
Use **Save stereo view as PNG** to download the current side-by-side preview as
`stereo-camera-view.png`.

## Run locally

Serve the repository root over HTTP so the browser can load the STL asset and
JavaScript modules. For example, from the repository root:

```powershell
python -m http.server 8000
```

Open <http://localhost:8000/ThreeJS/>. Internet access is required for the
Three.js modules loaded from jsDelivr. Use the seed and hold count controls to
recreate a deterministic layout.
