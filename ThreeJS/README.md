# Three.js climbing-wall scene

This is a browser-based recreation of the Blender/Python scene generator. It
rebuilds the climbing wall, origin marker, triangular volumes, and seeded hold
layout in Three.js. The original Blender `.blend` file is not loaded in the
browser; the wall and volumes are generated from the dimensions and procedures
in `Src/`.

The mesh in `Assets/microban_hold.stl` is loaded directly. The app also provides
simple Three.js cube-hold geometry corresponding to the procedural Blender
holds. The Blender wall generator uses half of each configured wall dimension,
so the recreated wall is 5 m wide by 2.5 m high.

## Run locally

Serve the repository root over HTTP so the browser can load the STL asset and
JavaScript modules. For example, from the repository root:

```powershell
python -m http.server 8000
```

Open <http://localhost:8000/ThreeJS/>. Internet access is required for the
Three.js modules loaded from jsDelivr. Use the seed and hold count controls to
recreate a deterministic layout.
