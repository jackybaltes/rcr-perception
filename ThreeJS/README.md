# Three.js climbing-wall scene

This is a browser-based recreation of the Blender/Python scene generator. It
rebuilds the climbing wall, origin marker, triangular volumes, and seeded hold
layout in Three.js. The original Blender `.blend` file is not loaded in the
browser; the wall and volumes are generated from the dimensions and procedures
in `Src/`.
Generated holds use only -45, 0, or +45 degree rotations relative to their
face. Their backfaces are anchored flush to the sampled wall or volume surface.

The mesh in `Assets/microban_hold.stl` is loaded directly and used for every
hold. The Blender wall generator uses half of each configured wall dimension,
so the recreated wall is 5 m wide by 2.5 m high.
Each scene regeneration creates new wall and volume materials with randomized
HSV colors and noise ranges corresponding to the Blender
`create_rock_material_with_noise` configuration in `Src/script_in_blender.py`.
Regenerating with the same seed advances the material variation while
preserving deterministic hold placement.
The Hold data (JSON) field shows each generated hold's type, world
position in meters, and world orientation as XYZ Euler angles (roll, pitch,
yaw) in radians.
Edit the JSON and select **Load holds from JSON** to replace the current holds.
Each record requires a `microban_hold` type, finite `position` x/y/z values in
meters, and finite `orientation` roll/pitch/yaw values in radians.
Use **Load from disk** to choose a JSON file and apply its holds to the scene.
Use **Save to disk** to download the current contents of the JSON editor as
`holds.json`.
Above the JSON field, a side-by-side front stereo preview shows the wall from
two camera positions with a 64 mm eye separation and a center distance of 2 m
from the wall plane. The camera height and wall distance can be adjusted live
using the numeric controls above the preview.
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
