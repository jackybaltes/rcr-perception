import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const WALL_WIDTH = 5;
const WALL_HEIGHT = 2.5;
const WALL_DEPTH = 0.025;
const canvas = document.querySelector("#scene");
const stereoCanvas = document.querySelector("#stereo-scene");
const stereoHeightInput = document.querySelector("#stereo-height");
const stereoDistanceInput = document.querySelector("#stereo-distance");
const stereoReadout = document.querySelector("#stereo-readout");
const stereoStatus = document.querySelector("#stereo-status");
const saveStereoButton = document.querySelector("#save-stereo");
const status = document.querySelector("#status");
const form = document.querySelector("#scene-controls");
const seedInput = document.querySelector("#seed");
const holdCountInput = document.querySelector("#hold-count");
const holdJson = document.querySelector("#hold-json");
const loadHoldsButton = document.querySelector("#load-holds");
const holdJsonFileInput = document.querySelector("#hold-json-file");
const loadHoldsFileButton = document.querySelector("#load-holds-file");
const saveHoldsFileButton = document.querySelector("#save-holds-file");
const holdStatus = document.querySelector("#hold-status");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10161b);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.position.set(4.9, 3.6, 7.2);
camera.layers.enable(1);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const stereoRenderer = new THREE.WebGLRenderer({
  canvas: stereoCanvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
stereoRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stereoRenderer.shadowMap.enabled = true;
stereoRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
stereoRenderer.outputColorSpace = THREE.SRGBColorSpace;
stereoRenderer.toneMapping = THREE.ACESFilmicToneMapping;
stereoRenderer.toneMappingExposure = 1.1;

const wallFront = WALL_DEPTH / 2;
const stereoEyeSeparation = 0.064;
const stereoTarget = new THREE.Vector3();
const stereoLeftCamera = new THREE.PerspectiveCamera(74, 1, 0.01, 100);
const stereoRightCamera = new THREE.PerspectiveCamera(74, 1, 0.01, 100);

function updateStereoCamera() {
  const height = stereoHeightInput.valueAsNumber;
  const distance = stereoDistanceInput.valueAsNumber;
  if (!Number.isFinite(height) || height < 0) {
    stereoStatus.textContent = "Camera height must be a non-negative number.";
    return;
  }
  if (!Number.isFinite(distance) || distance <= 0) {
    stereoStatus.textContent = "Distance to wall must be greater than zero.";
    return;
  }

  stereoTarget.set(0, height, wallFront);
  stereoLeftCamera.position.set(
    -stereoEyeSeparation / 2,
    height,
    wallFront + distance,
  );
  stereoRightCamera.position.set(
    stereoEyeSeparation / 2,
    height,
    wallFront + distance,
  );
  stereoLeftCamera.lookAt(stereoTarget);
  stereoRightCamera.lookAt(stereoTarget);
  stereoReadout.textContent = `Height ${height} m · distance ${distance} m`;
  stereoStatus.textContent = "";
}

stereoHeightInput.addEventListener("input", updateStereoCamera);
stereoDistanceInput.addEventListener("input", updateStereoCamera);
updateStereoCamera();

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.15, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xd9e8f3, 0x34302a, 1.4));
const keyLight = new THREE.DirectionalLight(0xfff2dc, 4.5);
keyLight.position.set(-4, 6, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 20;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
keyLight.shadow.bias = -0.0001;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.radius = 3;
keyLight.shadow.camera.updateProjectionMatrix();
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x91b7ff, 0.8);
fillLight.position.set(4, 3, 6);
scene.add(fillLight);

const frontFillLight = new THREE.DirectionalLight(0xffffff, 0.8);
frontFillLight.position.set(0, WALL_HEIGHT / 2, 4);
frontFillLight.target.position.set(0, WALL_HEIGHT / 2, wallFront);
scene.add(frontFillLight, frontFillLight.target);

const root = new THREE.Group();
scene.add(root);
let microbanGeometry = null;
let generation = 0;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rockTexture(seed, hue = 0.12, saturation = 0.11, value = 0.38) {
  const random = seededRandom(seed);
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const color = new THREE.Color().setHSL(hue, saturation, value).convertLinearToSRGB();
  for (let i = 0; i < size * size; i += 1) {
    const grain = (random() - 0.5) * 14;
    data[i * 4] = THREE.MathUtils.clamp(color.r * 255 + grain, 0, 255);
    data[i * 4 + 1] = THREE.MathUtils.clamp(color.g * 255 + grain, 0, 255);
    data[i * 4 + 2] = THREE.MathUtils.clamp(color.b * 255 + grain, 0, 255);
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 3);
  texture.needsUpdate = true;
  return texture;
}

function createRockMaterial(rng, colorHsvLimits, noiseParameters) {
  const noiseScale = noiseParameters[0][0]
    + rng() * (noiseParameters[0][1] - noiseParameters[0][0]);
  const noiseDetail = noiseParameters[1][0]
    + rng() * (noiseParameters[1][1] - noiseParameters[1][0]);
  const noiseRoughness = noiseParameters[2][0]
    + rng() * (noiseParameters[2][1] - noiseParameters[2][0]);
  const hsv = colorHsvLimits[0].map((min, axis) => (
    min < colorHsvLimits[1][axis]
      ? min + rng() * (colorHsvLimits[1][axis] - min)
      : min
  ));
  const textureSeed = Math.floor(rng() * 0x100000000);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rockTexture(textureSeed, ...hsv),
    roughness: THREE.MathUtils.clamp(noiseRoughness + noiseDetail / 100, 0, 1),
  });
  material.map.repeat.set(noiseScale / 4, noiseScale / 6);
  return material;
}

function addWall(group, material) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_WIDTH, WALL_HEIGHT, WALL_DEPTH),
    material,
  );
  wall.name = "TestWall";
  wall.position.y = WALL_HEIGHT / 2;
  wall.receiveShadow = true;
  group.add(wall);

  const square = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xff3030,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  square.name = "TestWall_OriginSquare";
  square.position.set(0.5, 0.5, WALL_DEPTH / 2 + 0.001);
  group.add(square);
}

function makeTriangleSurface(a, b, c, material, name, group, surfaces, volumeCenter) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
  const faceCenter = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
  if (normal.dot(faceCenter.clone().sub(volumeCenter)) < 0) {
    [b, c] = [c, b];
    normal.negate();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z],
      3,
    ),
  );
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const area = new THREE.Vector3().subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
  if (normal.z > 0.25) {
    surfaces.push({
      points: [a.clone(), b.clone(), c.clone()],
      normal: normal.clone(),
      area,
    });
  }
}

function addPyramidVolume(group, surfaces, index, centerX, centerY, material) {
  const width = 0.75;
  const height = 0.65;
  const frontZ = WALL_DEPTH / 2;
  const base = [
    new THREE.Vector3(centerX - width / 2, centerY - height / 2, frontZ),
    new THREE.Vector3(centerX + width / 2, centerY - height / 2, frontZ),
    new THREE.Vector3(centerX, centerY + height / 2, frontZ),
  ];
  const apex = new THREE.Vector3(centerX, centerY, frontZ + 0.24);
  const volumeCenter = base[0].clone()
    .add(base[1])
    .add(base[2])
    .add(apex)
    .divideScalar(4);
  material.shadowSide = THREE.DoubleSide;
  const triangles = [
    [base[0], base[1], apex],
    [base[1], base[2], apex],
    [base[2], base[0], apex],
  ];

  triangles.forEach((triangle, faceIndex) => {
    makeTriangleSurface(
      ...triangle,
      material,
      `Volume_${index}_face_${faceIndex}`,
      group,
      surfaces,
      volumeCenter,
    );
  });
}

function makeMicrobanHold(color) {
  const hold = new THREE.Mesh(
    microbanGeometry,
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1,
      roughness: 0.42,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  hold.castShadow = true;
  hold.name = "MicrobanHold";
  return hold;
}

function renderStereoView() {
  const width = stereoCanvas.clientWidth;
  const height = stereoCanvas.clientHeight;
  if (!width || !height) return;

  const eyeWidth = width / 2;
  stereoRenderer.setScissorTest(true);
  stereoRenderer.setViewport(0, 0, eyeWidth, height);
  stereoRenderer.setScissor(0, 0, eyeWidth, height);
  stereoRenderer.render(scene, stereoLeftCamera);
  stereoRenderer.setViewport(eyeWidth, 0, eyeWidth, height);
  stereoRenderer.setScissor(eyeWidth, 0, eyeWidth, height);
  stereoRenderer.render(scene, stereoRightCamera);
  stereoRenderer.setScissorTest(false);
}

function sampleSurface(surfaces, random) {
  const totalArea = surfaces.reduce((sum, surface) => sum + surface.area, 0);
  let selection = random() * totalArea;
  let surface = surfaces[surfaces.length - 1];
  for (const candidate of surfaces) {
    selection -= candidate.area;
    if (selection <= 0) {
      surface = candidate;
      break;
    }
  }

  let u = random();
  let v = random();
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  const [a, b, c] = surface.points;
  const point = a.clone()
    .addScaledVector(new THREE.Vector3().subVectors(b, a), u)
    .addScaledVector(new THREE.Vector3().subVectors(c, a), v);
  return { point, normal: surface.normal };
}

function addHolds(group, surfaces, count, seed) {
  if (count > 0 && !microbanGeometry) {
    throw new Error("Microban hold mesh is not loaded.");
  }

  const random = seededRandom(seed ^ 0x9e3779b9);
  const placed = [];
  const holds = [];
  const colors = [0xf2554e, 0x59c77b, 0x6389ed];
  const faceRotations = [-Math.PI / 4, 0, Math.PI / 4];

  for (let i = 0; i < count; i += 1) {
    let hold;
    let placedSuccessfully = false;
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const color = colors[Math.floor(random() * colors.length)];
      hold = makeMicrobanHold(color);
      const { point, normal } = sampleSurface(surfaces, random);
      // The STL's backface is normalized to local z = 0, so this anchors it
      // directly on the sampled face.
      hold.position.copy(point);
      // Blender's local -Y outward axis maps to Three.js local +Z.
      hold.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      const faceRotation = faceRotations[Math.floor(random() * faceRotations.length)];
      hold.rotateZ(faceRotation);

      const center = hold.position;
      const radius = 0.04;
      const clear = placed.every(
        (other) => center.distanceTo(other.center) >= radius + other.radius + 0.12,
      );
      if (clear) {
        hold.name = `MicrobanHold_${i}`;
        hold.userData.holdType = "Microban";
        group.add(hold);
        holds.push(hold);
        placed.push({ center: center.clone(), radius });
        placedSuccessfully = true;
        break;
      }
      hold.material.dispose();
    }

    if (!placedSuccessfully) {
      throw new Error(`Could not place hold ${i} after 1000 attempts.`);
    }
  }
  return holds;
}

function serializeHoldTransforms(holds) {
  const round = (value) => Number(value.toFixed(6));
  const result = {};
  holds.forEach((hold, index) => {
    const position = hold.getWorldPosition(new THREE.Vector3());
    const orientation = new THREE.Euler().setFromQuaternion(
      hold.getWorldQuaternion(new THREE.Quaternion()),
      "XYZ",
    );
    result[`hold_${index + 1}`] = {
      type: "microban_hold",
      position: {
        x: round(position.x),
        y: round(position.y),
        z: round(position.z),
      },
      orientation: {
        roll: round(orientation.x),
        pitch: round(orientation.y),
        yaw: round(orientation.z),
      },
    };
  });
  return JSON.stringify(result, null, 2);
}

function parseHoldData(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Hold JSON must be an object keyed by hold name.");
  }

  const entries = Object.entries(data);
  if (entries.length > 50) {
    throw new Error("Hold JSON can contain at most 50 holds.");
  }

  return entries.map(([name, hold]) => {
    if (!hold || typeof hold !== "object" || Array.isArray(hold)) {
      throw new Error(`${name} must be a hold object.`);
    }
    if (hold.type !== "microban_hold") {
      throw new Error(`${name}.type must be "microban_hold".`);
    }

    const { position, orientation } = hold;
    if (!position || !orientation || typeof position !== "object" || typeof orientation !== "object") {
      throw new Error(`${name} must include position and orientation objects.`);
    }
    for (const axis of ["x", "y", "z"]) {
      if (!Number.isFinite(position[axis])) {
        throw new Error(`${name}.position.${axis} must be a finite number.`);
      }
    }
    for (const angle of ["roll", "pitch", "yaw"]) {
      if (!Number.isFinite(orientation[angle])) {
        throw new Error(`${name}.orientation.${angle} must be a finite number in radians.`);
      }
    }
    return { name, position, orientation };
  });
}

function loadHoldsFromJson() {
  const holdData = parseHoldData(holdJson.value);
  if (holdData.length && !microbanGeometry) {
    throw new Error("Microban hold mesh is not loaded yet.");
  }

  const holdColors = [0xf2554e, 0x59c77b, 0x6389ed];
  const newHolds = holdData.map(({ name, position, orientation }, index) => {
    const hold = makeMicrobanHold(holdColors[index % holdColors.length]);
    hold.name = name;
    hold.userData.holdType = "Microban";
    hold.position.set(position.x, position.y, position.z);
    hold.quaternion.setFromEuler(
      new THREE.Euler(
        orientation.roll,
        orientation.pitch,
        orientation.yaw,
        "XYZ",
      ),
    );
    return hold;
  });

  for (const child of [...root.children]) {
    if (child.userData.holdType !== "Microban") continue;
    root.remove(child);
    child.material.dispose();
  }
  if (newHolds.length > 0) {
    root.add(...newHolds);
  }
  root.updateMatrixWorld(true);
  holdCountInput.value = String(newHolds.length);
  holdJson.value = serializeHoldTransforms(newHolds);
  generation += 1;
  status.textContent = `Scene ${generation} · loaded ${newHolds.length} holds · 3 volumes`;
  delete status.dataset.error;
  holdStatus.textContent = `Loaded ${newHolds.length} holds from JSON.`;
  delete holdStatus.dataset.error;
  renderer.render(scene, camera);
  renderStereoView();
}

function addGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x1b252b, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  ground.layers.set(1);
  scene.add(ground);
}

function rebuildScene() {
  const seed = Number(seedInput.value);
  const holdCount = Number(holdCountInput.value);
  if (!Number.isFinite(seed) || !Number.isInteger(holdCount) || holdCount < 0 || holdCount > 50) {
    status.textContent = "Enter a whole-number seed and a hold count from 0 to 50.";
    status.dataset.error = "true";
    return;
  }

  const nextRoot = new THREE.Group();
  const materialRng = seededRandom(
    (seed ^ Math.imul(generation + 1, 0x9e3779b9)) >>> 0,
  );
  const noiseParameters = [[10, 20], [2, 10], [0.5, 0.9], [0.1, 0.9]];
  const wallMaterial = createRockMaterial(
    materialRng,
    [[0.35, 0.1, 0.1], [0.65, 0.4, 0.5]],
    noiseParameters,
  );
  const volumeMaterial = createRockMaterial(
    materialRng,
    [[0.5, 0.1, 0.1], [0.85, 0.4, 0.5]],
    noiseParameters,
  );
  const surfaces = [];
  const frontZ = WALL_DEPTH / 2;
  surfaces.push({
    points: [
      new THREE.Vector3(-WALL_WIDTH / 2, 0, frontZ),
      new THREE.Vector3(WALL_WIDTH / 2, 0, frontZ),
      new THREE.Vector3(WALL_WIDTH / 2, WALL_HEIGHT, frontZ),
    ],
    normal: new THREE.Vector3(0, 0, 1),
    area: WALL_WIDTH * WALL_HEIGHT / 2,
  });
  surfaces.push({
    points: [
      new THREE.Vector3(-WALL_WIDTH / 2, 0, frontZ),
      new THREE.Vector3(WALL_WIDTH / 2, WALL_HEIGHT, frontZ),
      new THREE.Vector3(-WALL_WIDTH / 2, WALL_HEIGHT, frontZ),
    ],
    normal: new THREE.Vector3(0, 0, 1),
    area: WALL_WIDTH * WALL_HEIGHT / 2,
  });

  addWall(nextRoot, wallMaterial);
  const volumePositions = [
    [-1.35, 0.72],
    [0.05, 1.72],
    [1.35, 0.78],
  ];
  volumePositions.forEach(([x, y], index) => {
    addPyramidVolume(nextRoot, surfaces, index, x, y, volumeMaterial);
  });
  const holds = addHolds(nextRoot, surfaces, holdCount, seed);
  nextRoot.updateMatrixWorld(true);
  const holdDataJson = serializeHoldTransforms(holds);

  for (const child of [...root.children]) {
    child.traverse((object) => {
      if (object.geometry && object.geometry !== microbanGeometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          material.map?.dispose();
          material.dispose();
        });
      }
    });
  }
  root.clear();
  root.add(nextRoot);
  holdJson.value = holdDataJson;
  generation += 1;
  status.textContent = `Scene ${generation} · seed ${seed} · ${holdCount} holds · 3 volumes`;
  delete status.dataset.error;
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);

  const stereoWidth = stereoCanvas.clientWidth;
  const stereoHeight = stereoCanvas.clientHeight;
  if (stereoWidth && stereoHeight) {
    const eyeWidth = stereoWidth / 2;
    stereoLeftCamera.aspect = eyeWidth / stereoHeight;
    stereoRightCamera.aspect = eyeWidth / stereoHeight;
    stereoLeftCamera.updateProjectionMatrix();
    stereoRightCamera.updateProjectionMatrix();
    stereoRenderer.setSize(stereoWidth, stereoHeight, false);
  }
}

function render() {
  controls.update();
  renderer.render(scene, camera);
  renderStereoView();
  requestAnimationFrame(render);
}

saveStereoButton.addEventListener("click", () => {
  try {
    renderStereoView();
    stereoCanvas.toBlob((blob) => {
      if (!blob) {
        stereoStatus.textContent = "Could not create a PNG from the stereo view.";
        return;
      }

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "stereo-camera-view.png";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      stereoStatus.textContent = "PNG download started: stereo-camera-view.png.";
    }, "image/png");
  } catch (error) {
    stereoStatus.textContent = `Could not save the stereo view: ${error instanceof Error ? error.message : String(error)}`;
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    rebuildScene();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.dataset.error = "true";
  }
});

loadHoldsButton.addEventListener("click", () => {
  try {
    loadHoldsFromJson();
  } catch (error) {
    holdStatus.textContent = error instanceof Error
      ? error.message
      : String(error);
    holdStatus.dataset.error = "true";
  }
});

loadHoldsFileButton.addEventListener("click", () => {
  holdJsonFileInput.click();
});

holdJsonFileInput.addEventListener("change", async () => {
  const [file] = holdJsonFileInput.files;
  if (!file) return;

  try {
    holdJson.value = await file.text();
    loadHoldsFromJson();
    holdStatus.textContent = `Loaded holds from ${file.name}.`;
    delete holdStatus.dataset.error;
  } catch (error) {
    holdStatus.textContent = error instanceof Error
      ? error.message
      : String(error);
    holdStatus.dataset.error = "true";
  } finally {
    holdJsonFileInput.value = "";
  }
});

saveHoldsFileButton.addEventListener("click", () => {
  const file = new Blob([holdJson.value], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "holds.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  holdStatus.textContent = "JSON download started: holds.json.";
  delete holdStatus.dataset.error;
});

addGround();
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
render();

try {
  status.textContent = "Loading Microban hold mesh…";
  microbanGeometry = await new STLLoader().loadAsync("../Assets/microban_hold.stl");
  // Convert Blender coordinates (X, Y, Z) to Three.js coordinates (X, Z, -Y).
  const conversion = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1,
  );
  microbanGeometry.applyMatrix4(conversion);
  microbanGeometry.computeBoundingBox();
  const bounds = microbanGeometry.boundingBox;
  microbanGeometry.translate(
    -(bounds.min.x + bounds.max.x) / 2,
    -(bounds.min.y + bounds.max.y) / 2,
    // The converted STL backface is the minimum-z plane; make it local z = 0.
    -bounds.min.z,
  );
  microbanGeometry.computeVertexNormals();
  rebuildScene();
} catch (error) {
  status.textContent = `Could not load the Microban STL: ${error instanceof Error ? error.message : String(error)}`;
  status.dataset.error = "true";
}
