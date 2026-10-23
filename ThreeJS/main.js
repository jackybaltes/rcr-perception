import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const WALL_WIDTH = 5;
const WALL_HEIGHT = 2.5;
const WALL_DEPTH = 0.025;
const WALL_FRONT_Z = 0;
const DEFAULT_SCENE = {
  wall: {
    width: WALL_WIDTH,
    height: WALL_HEIGHT,
    depth: WALL_DEPTH,
    originMarker: { width: 1, height: 1, x: 0.5, y: 0.5 },
  },
  volumes: [
    { name: "Volume_0", center: { x: -1.35, y: 0.72 }, baseWidth: 0.75, baseHeight: 0.65, depth: 0.24 },
    { name: "Volume_1", center: { x: 0.05, y: 1.72 }, baseWidth: 0.75, baseHeight: 0.65, depth: 0.24 },
    { name: "Volume_2", center: { x: 1.35, y: 0.78 }, baseWidth: 0.75, baseHeight: 0.65, depth: 0.24 },
  ],
};
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
const updateSeedInput = document.querySelector("#update-seed");
const holdCountInput = document.querySelector("#hold-count");
const addMenu = document.querySelector("#add-menu");
const helpPanel = document.querySelector("#help-panel");
const helpToggle = document.querySelector("#help-toggle");
const helpClose = document.querySelector("#help-close");
const holdJson = document.querySelector("#hold-json");
const loadHoldsButton = document.querySelector("#load-holds");
const holdJsonFileInput = document.querySelector("#hold-json-file");
const loadHoldsFileButton = document.querySelector("#load-holds-file");
const saveHoldsFileButton = document.querySelector("#save-holds-file");
const holdStatus = document.querySelector("#hold-status");
const holdMoveControl = document.querySelector("#hold-move-control");
const holdMoveInputs = ["x", "y", "z"].map((axis) => (
  document.querySelector(`#hold-move-${axis}`)
));
const holdRotationControl = document.querySelector("#hold-rotation-control");
const holdRotationInput = document.querySelector("#hold-rotation");

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

let wallFront = WALL_FRONT_Z;
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

function resetInteractiveCamera() {
  const enableDamping = controls.enableDamping;
  controls.enableDamping = false;
  const cameraHeight = 1;
  camera.position.set(0, cameraHeight, wallFront + 2);
  controls.target.set(0, cameraHeight, wallFront);
  controls.update();
  controls.enableDamping = enableDamping;
}

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
const holdGeometries = {
  Microban: null,
  CubeHold: null,
};
let generation = 0;
let selectedHold = null;
let currentSceneSpec = structuredClone(DEFAULT_SCENE);
let currentSeed = 42;
let currentMaterialSeed = 0;
let holdMove = null;
let holdRotation = null;
let lastPointerX = 0;
const raycaster = new THREE.Raycaster();
const pointerPosition = new THREE.Vector2();
let pointerDownPosition = null;

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

function addWall(group, material, wallSpec) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(wallSpec.width, wallSpec.height, wallSpec.depth),
    material,
  );
  wall.name = "TestWall";
  wall.userData.snapSurface = true;
  wall.position.set(0, wallSpec.height / 2, WALL_FRONT_Z - wallSpec.depth / 2);
  wall.receiveShadow = true;
  group.add(wall);

  const square = new THREE.Mesh(
    new THREE.PlaneGeometry(wallSpec.originMarker.width, wallSpec.originMarker.height),
    new THREE.MeshBasicMaterial({
      color: 0xff3030,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  square.name = "TestWall_OriginSquare";
  square.position.set(
    wallSpec.originMarker.x,
    wallSpec.originMarker.y,
    WALL_FRONT_Z + 0.001,
  );
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
  if (normal.z > 0.25) mesh.userData.snapSurface = true;
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

function addPyramidVolume(group, surfaces, volumeSpec, wallSpec, material) {
  const { center, baseWidth, baseHeight, depth } = volumeSpec;
  const frontZ = WALL_FRONT_Z;
  const base = [
    new THREE.Vector3(center.x - baseWidth / 2, center.y - baseHeight / 2, frontZ),
    new THREE.Vector3(center.x + baseWidth / 2, center.y - baseHeight / 2, frontZ),
    new THREE.Vector3(center.x, center.y + baseHeight / 2, frontZ),
  ];
  const apex = new THREE.Vector3(center.x, center.y, frontZ + depth);
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
      `${volumeSpec.name}_face_${faceIndex}`,
      group,
      surfaces,
      volumeCenter,
    );
  });
}

function makeHold(type, color) {
  const geometry = holdGeometries[type];
  if (!geometry) throw new Error(`${type} mesh is not loaded.`);
  const hold = new THREE.Mesh(
    geometry,
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
  hold.name = `${type}Hold`;
  hold.userData.holdType = type;
  return hold;
}

function normalizeHoldGeometry(geometry) {
  // Convert Blender coordinates (X, Y, Z) to Three.js coordinates (X, Z, -Y).
  const conversion = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1,
  );
  geometry.applyMatrix4(conversion);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  geometry.translate(
    -(bounds.min.x + bounds.max.x) / 2,
    -(bounds.min.y + bounds.max.y) / 2,
    // Make the hold's backplate flush with the target surface at local z = 0.
    -bounds.min.z,
  );
  geometry.computeVertexNormals();
  return geometry;
}

function isHold(object) {
  return Object.hasOwn(holdGeometries, object.userData.holdType);
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
  if (count > 0 && !holdGeometries.Microban) {
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
      hold = makeHold("Microban", color);
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

function serializeSceneData(holds) {
  const round = (value) => Number(value.toFixed(6));
  const holdData = {};
  holds.forEach((hold, index) => {
    const key = hold.userData.jsonKey ?? `hold_${index + 1}`;
    const position = hold.getWorldPosition(new THREE.Vector3());
    const orientation = new THREE.Euler().setFromQuaternion(
      hold.getWorldQuaternion(new THREE.Quaternion()),
      "XYZ",
    );
    hold.userData.jsonKey = key;
    holdData[key] = {
      type: hold.userData.holdType === "CubeHold" ? "cube_hold" : "microban_hold",
      color: `#${hold.material.color.getHexString().toUpperCase()}`,
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
  return JSON.stringify({
    formatVersion: 1,
    seed: currentSeed,
    materialSeed: currentMaterialSeed,
    scene: currentSceneSpec,
    holds: holdData,
  }, null, 2);
}

function setSelectedHold(hold) {
  if (holdMove && hold !== selectedHold) finishHoldMove(false);
  if (holdRotation && hold !== selectedHold) finishHoldRotation(false);
  if (selectedHold) {
    selectedHold.material.emissive.copy(selectedHold.userData.baseEmissive);
    selectedHold.material.emissiveIntensity = selectedHold.userData.baseEmissiveIntensity;
  }

  selectedHold = hold;
  if (!selectedHold) return;

  selectedHold.userData.baseEmissive = selectedHold.material.emissive.clone();
  selectedHold.userData.baseEmissiveIntensity = selectedHold.material.emissiveIntensity;
  selectedHold.material.emissive.set(0xffed68);
  selectedHold.material.emissiveIntensity = 2.5;

  const key = selectedHold.userData.jsonKey;
  holdStatus.textContent = `Selected ${key}.`;
  delete holdStatus.dataset.error;
  scrollJsonToHold(key);
}

function getHoldRecords() {
  const holds = [];
  root.traverse((object) => {
    if (!isHold(object)) return;
    const orientation = new THREE.Euler().setFromQuaternion(
      object.getWorldQuaternion(new THREE.Quaternion()),
      "XYZ",
    );
    holds.push({
      name: object.userData.jsonKey,
      type: object.userData.holdType === "CubeHold" ? "cube_hold" : "microban_hold",
      color: object.material.color.getHex(),
      position: object.getWorldPosition(new THREE.Vector3()),
      orientation: {
        roll: orientation.x,
        pitch: orientation.y,
        yaw: orientation.z,
      },
    });
  });
  return holds;
}

function scrollJsonToHold(key) {
  const keyStart = holdJson.value.indexOf(`${JSON.stringify(key)}:`);
  if (keyStart < 0) return;

  const lineNumber = holdJson.value.slice(0, keyStart).split("\n").length - 1;
  const lineHeight = Number.parseFloat(getComputedStyle(holdJson).lineHeight);
  holdJson.scrollTop = lineNumber * lineHeight;
  holdJson.setSelectionRange(keyStart, keyStart + JSON.stringify(key).length);
}

function setPointerFromEvent(event) {
  const bounds = canvas.getBoundingClientRect();
  pointerPosition.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointerPosition, camera);
}

function findHoldAtPointer(event) {
  setPointerFromEvent(event);
  const [intersection] = raycaster.intersectObject(root, true);
  let candidate = intersection?.object ?? null;
  while (candidate && !isHold(candidate)) {
    candidate = candidate.parent;
  }
  return candidate;
}

function findSurfaceAtPointer(event) {
  setPointerFromEvent(event);
  return raycaster.intersectObject(root, true).find(({ object, face }) => {
    if (!object.userData.snapSurface || !face) return false;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
    return face.normal.clone().applyMatrix3(normalMatrix).normalize().z > 0.25;
  }) ?? null;
}

function startHoldMove(newlyCreated = false) {
  if (!selectedHold || holdMove || holdRotation) return;
  holdMove = {
    position: selectedHold.position.clone(),
    quaternion: selectedHold.quaternion.clone(),
    coordinatesEdited: false,
    newlyCreated,
  };
  controls.enabled = false;
  holdMoveControl.hidden = false;
  updateHoldMoveInputs(selectedHold.position);
  holdMoveInputs[0].focus();
  holdMoveInputs[0].select();
  canvas.style.cursor = "move";
  holdStatus.textContent = `Moving ${selectedHold.userData.jsonKey} · edit X/Y/Z or move over a face; left-click or Enter to finish, Esc or right-click to cancel.`;
}

function updateHoldMoveInputs(position) {
  holdMoveInputs.forEach((input, axis) => {
    input.value = position.getComponent(axis).toFixed(3);
  });
}

function applyHoldMoveInputs() {
  if (!holdMove || !selectedHold) return false;
  const coordinates = holdMoveInputs.map((input) => input.valueAsNumber);
  if (coordinates.some((value) => !Number.isFinite(value))) return false;
  selectedHold.position.set(...coordinates);
  holdMove.coordinatesEdited = true;
  return true;
}

function updateHoldMove(event) {
  if (!holdMove || !selectedHold) return;
  if (holdMove.coordinatesEdited) return;
  const surfaceHit = findSurfaceAtPointer(event);
  if (!surfaceHit) {
    holdStatus.textContent = `Moving ${selectedHold.userData.jsonKey} · move over the wall or a volume face, then left-click to finish.`;
    return;
  }

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(surfaceHit.object.matrixWorld);
  const targetNormal = surfaceHit.face.normal.clone()
    .applyMatrix3(normalMatrix)
    .normalize();
  const currentNormal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(selectedHold.quaternion)
    .normalize();
  const alignment = new THREE.Quaternion().setFromUnitVectors(currentNormal, targetNormal);
  selectedHold.quaternion.premultiply(alignment);
  selectedHold.position.copy(surfaceHit.point);
  holdMove.coordinatesEdited = false;
  updateHoldMoveInputs(selectedHold.position);
  holdStatus.textContent = `Moving ${selectedHold.userData.jsonKey} · snapped to ${surfaceHit.object.name}; left-click or Enter to finish, Esc or right-click to cancel.`;
}

function finishHoldMove(commit) {
  if (!holdMove) return;
  if (commit && !applyHoldMoveInputs()) {
    holdStatus.textContent = "Enter valid numeric values for X, Y, and Z before finishing the move.";
    return;
  }
  const removeNewHold = !commit && holdMove.newlyCreated && selectedHold;
  const newlyCreatedHold = holdMove.newlyCreated;
  if (!commit && selectedHold && !removeNewHold) {
    selectedHold.position.copy(holdMove.position);
    selectedHold.quaternion.copy(holdMove.quaternion);
  }

  holdMove = null;
  controls.enabled = true;
  holdMoveControl.hidden = true;
  if (removeNewHold) {
    selectedHold.material.emissive.copy(selectedHold.userData.baseEmissive);
    selectedHold.material.emissiveIntensity = selectedHold.userData.baseEmissiveIntensity;
    selectedHold.removeFromParent();
    selectedHold.material.dispose();
    selectedHold = null;
  }
  if (!commit && selectedHold) updateHoldMoveInputs(selectedHold.position);
  canvas.style.cursor = "";
  if (commit && selectedHold) {
    const holds = [];
    root.traverse((object) => {
      if (isHold(object)) holds.push(object);
    });
    holdJson.value = serializeSceneData(holds);
    scrollJsonToHold(selectedHold.userData.jsonKey);
    holdCountInput.value = String(holds.length);
    if (newlyCreatedHold) {
      status.textContent = `Scene ${generation} · seed ${currentSeed} · ${holds.length} holds · ${currentSceneSpec.volumes.length} volumes`;
      holdStatus.textContent = `Added ${selectedHold.userData.jsonKey}.`;
    } else {
      holdStatus.textContent = `Moved ${selectedHold.userData.jsonKey}.`;
    }
  } else if (selectedHold) {
    holdStatus.textContent = `Move cancelled for ${selectedHold.userData.jsonKey}.`;
  } else if (removeNewHold) {
    holdStatus.textContent = "New hold placement cancelled.";
  }
  return true;
}

function nextHoldKey() {
  const usedKeys = new Set();
  root.traverse((object) => {
    if (isHold(object)) usedKeys.add(object.userData.jsonKey);
  });
  let index = 1;
  while (usedKeys.has(`hold_${index}`)) index += 1;
  return `hold_${index}`;
}

function addHold(type) {
  if (!holdGeometries[type]) {
    holdStatus.textContent = `${type} mesh is not loaded yet.`;
    return;
  }
  const holds = getHoldRecords();
  if (holds.length >= 50) {
    holdStatus.textContent = "A scene can contain at most 50 holds.";
    return;
  }

  const colors = [0xf2554e, 0x59c77b, 0x6389ed];
  const hold = makeHold(type, colors[holds.length % colors.length]);
  const key = nextHoldKey();
  hold.name = `${type}_${key.slice("hold_".length)}`;
  hold.userData.jsonKey = key;
  hold.position.set(0, currentSceneSpec.wall.height / 2, wallFront);
  hold.quaternion.identity();
  root.add(hold);
  setSelectedHold(hold);
  startHoldMove(true);
}

function addVolume() {
  if (currentSceneSpec.volumes.length >= 50) {
    holdStatus.textContent = "A scene can contain at most 50 volumes.";
    return;
  }

  const sceneSpec = structuredClone(currentSceneSpec);
  const baseWidth = 0.75;
  const baseHeight = 0.65;
  const depth = 0.24;
  let index = 0;
  while (sceneSpec.volumes.some((volume) => volume.name === `Volume_${index}`)) index += 1;
  const addedVolumeCount = Math.max(0, sceneSpec.volumes.length - DEFAULT_SCENE.volumes.length);
  sceneSpec.volumes.push({
    name: `Volume_${index}`,
    center: {
      x: 0,
      y: Math.min(sceneSpec.wall.height / 2, 0.5 + addedVolumeCount * 0.75),
    },
    baseWidth,
    baseHeight,
    depth,
  });
  rebuildScene(
    sceneSpec,
    getHoldRecords(),
    [0xf2554e, 0x59c77b, 0x6389ed],
    currentSeed,
    currentMaterialSeed,
  );
  holdStatus.textContent = `Added ${sceneSpec.volumes.at(-1).name} at its default position.`;
}

function setHelpPanelOpen(open) {
  helpPanel.hidden = !open;
  helpToggle.setAttribute("aria-expanded", String(open));
}

helpToggle.addEventListener("click", () => {
  setHelpPanelOpen(helpPanel.hidden);
});
helpClose.addEventListener("click", () => {
  setHelpPanelOpen(false);
  helpToggle.focus({ preventScroll: true });
});

function openAddMenu() {
  if (holdMove) finishHoldMove(false);
  if (holdRotation) finishHoldRotation(false);
  addMenu.hidden = false;
  addMenu.querySelector("button").focus();
}

function closeAddMenu(returnFocus = false) {
  addMenu.hidden = true;
  if (returnFocus) canvas.focus({ preventScroll: true });
}

addMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-type]");
  if (!button) return;
  closeAddMenu(true);
  if (button.dataset.addType === "volume") {
    addVolume();
  } else if (button.dataset.addType === "Microban" || button.dataset.addType === "CubeHold") {
    addHold(button.dataset.addType);
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!addMenu.hidden && !addMenu.contains(event.target)) closeAddMenu();
});

function applyHoldRotation(degrees) {
  if (!holdRotation || !selectedHold || !Number.isFinite(degrees)) return;
  holdRotation.angle = degrees;
  const relativeAngle = degrees - holdRotation.initialYaw;
  const twist = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    THREE.MathUtils.degToRad(relativeAngle),
  );
  const anchorWorld = selectedHold.localToWorld(holdRotation.backplateAnchor.clone());
  selectedHold.quaternion.copy(holdRotation.quaternion).multiply(twist);
  selectedHold.updateMatrixWorld(true);

  const rotatedAnchorWorld = selectedHold.localToWorld(holdRotation.backplateAnchor.clone());
  if (selectedHold.parent) {
    const anchorInParent = selectedHold.parent.worldToLocal(anchorWorld);
    const rotatedAnchorInParent = selectedHold.parent.worldToLocal(rotatedAnchorWorld);
    selectedHold.position.add(anchorInParent.sub(rotatedAnchorInParent));
  } else {
    selectedHold.position.add(anchorWorld.sub(rotatedAnchorWorld));
  }
  selectedHold.updateMatrixWorld(true);
  holdRotationInput.value = degrees.toFixed(1);
  holdStatus.textContent = `Rotating ${selectedHold.userData.jsonKey} · yaw ${degrees.toFixed(1)}° · click or press Enter to finish, Esc to cancel.`;
}

function startHoldRotation() {
  if (!selectedHold || holdMove || holdRotation) return;
  selectedHold.updateMatrixWorld(true);
  if (!selectedHold.geometry.boundingBox) selectedHold.geometry.computeBoundingBox();
  const bounds = selectedHold.geometry.boundingBox;
  const backplateAnchor = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    bounds.min.z,
  );
  const currentYaw = THREE.MathUtils.radToDeg(
    new THREE.Euler().setFromQuaternion(selectedHold.quaternion, "XYZ").z,
  );
  holdRotation = {
    quaternion: selectedHold.quaternion.clone(),
    backplateAnchor,
    pointerX: lastPointerX,
    initialYaw: currentYaw,
    angle: currentYaw,
  };
  controls.enabled = false;
  holdRotationControl.hidden = false;
  holdRotationInput.value = currentYaw.toFixed(1);
  holdRotationInput.focus();
  holdRotationInput.select();
  canvas.style.cursor = "ew-resize";
  holdStatus.textContent = `Rotating ${selectedHold.userData.jsonKey} · yaw ${currentYaw.toFixed(1)}° · move mouse horizontally, click or press Enter to finish.`;
}

function finishHoldRotation(commit) {
  if (!holdRotation) return;
  const initialYaw = holdRotation.initialYaw;
  if (!commit && selectedHold) {
    selectedHold.quaternion.copy(holdRotation.quaternion);
  }

  holdRotation = null;
  controls.enabled = true;
  holdRotationControl.hidden = true;
  holdRotationInput.value = initialYaw.toFixed(1);
  canvas.style.cursor = "";
  if (commit && selectedHold) {
    const holds = [];
    root.traverse((object) => {
      if (isHold(object)) holds.push(object);
    });
    holdJson.value = serializeSceneData(holds);
    scrollJsonToHold(selectedHold.userData.jsonKey);
    holdStatus.textContent = `Rotated ${selectedHold.userData.jsonKey}.`;
  } else if (selectedHold) {
    holdStatus.textContent = `Rotation cancelled for ${selectedHold.userData.jsonKey}.`;
  }
}

function deleteSelectedHold() {
  if (!selectedHold) return;
  const deletedKey = selectedHold.userData.jsonKey;
  if (holdMove?.newlyCreated) {
    finishHoldMove(false);
    holdStatus.textContent = `Deleted ${deletedKey}.`;
    return;
  }
  if (holdMove) finishHoldMove(false);
  if (holdRotation) finishHoldRotation(false);
  if (!selectedHold) return;

  const hold = selectedHold;
  setSelectedHold(null);
  hold.removeFromParent();
  hold.material.dispose();

  const holds = [];
  root.traverse((object) => {
    if (isHold(object)) holds.push(object);
  });
  holdJson.value = serializeSceneData(holds);
  holdCountInput.value = String(holds.length);
  status.textContent = `Scene ${generation} · seed ${currentSeed} · ${holds.length} holds · ${currentSceneSpec.volumes.length} volumes`;
  holdStatus.textContent = `Deleted ${deletedKey}.`;
}

window.addEventListener("keydown", (event) => {
  const targetIsEditable = event.target instanceof HTMLElement
    && event.target.matches("input, textarea, select, [contenteditable='true']");
  const deletingFromTransformField = event.key.toLowerCase() === "x"
    && (holdMoveControl.contains(event.target) || holdRotationControl.contains(event.target));
  if (targetIsEditable && !deletingFromTransformField) {
    return;
  }
  if (event.key === "?" && !event.repeat) {
    event.preventDefault();
    setHelpPanelOpen(helpPanel.hidden);
  } else if (event.key === "Escape" && !helpPanel.hidden) {
    event.preventDefault();
    setHelpPanelOpen(false);
  } else if (event.key.toLowerCase() === "x" && !event.repeat && selectedHold) {
    event.preventDefault();
    deleteSelectedHold();
  } else if (event.key === "Escape" && !addMenu.hidden) {
    event.preventDefault();
    closeAddMenu(true);
  } else if (event.shiftKey && event.key.toLowerCase() === "a" && !event.repeat) {
    event.preventDefault();
    if (addMenu.hidden) openAddMenu();
    else closeAddMenu(true);
  } else if (event.key.toLowerCase() === "g" && !event.repeat) {
    event.preventDefault();
    startHoldMove();
  } else if (event.key.toLowerCase() === "r" && !event.repeat) {
    event.preventDefault();
    startHoldRotation();
  } else if (event.key.toLowerCase() === "c" && !event.repeat) {
    event.preventDefault();
    resetInteractiveCamera();
  } else if (event.key === "Escape" && holdMove) {
    event.preventDefault();
    finishHoldMove(false);
  } else if (event.key === "Escape" && holdRotation) {
    event.preventDefault();
    finishHoldRotation(false);
  }
});

holdMoveInputs.forEach((input) => {
  input.addEventListener("input", applyHoldMoveInputs);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (finishHoldMove(true)) canvas.focus({ preventScroll: true });
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishHoldMove(false);
      canvas.focus({ preventScroll: true });
    }
  });
  input.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
});

holdRotationInput.addEventListener("input", () => {
  const degrees = holdRotationInput.valueAsNumber;
  if (Number.isFinite(degrees)) applyHoldRotation(degrees);
});

holdRotationInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    finishHoldRotation(true);
    canvas.focus({ preventScroll: true });
  } else if (event.key === "Escape") {
    event.preventDefault();
    finishHoldRotation(false);
    canvas.focus({ preventScroll: true });
  }
});

holdMoveControl.addEventListener("pointerup", (event) => {
  event.stopPropagation();
  if (event.button === 2) finishHoldMove(false);
});
holdMoveControl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
holdRotationControl.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
holdRotationControl.addEventListener("pointerup", (event) => {
  event.stopPropagation();
  if (event.button === 2) finishHoldRotation(false);
});
holdRotationControl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

function parseHoldRecords(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("holds must be an object keyed by hold name.");
  }
  const entries = Object.entries(data);
  if (entries.length > 50) {
    throw new Error("Hold JSON can contain at most 50 holds.");
  }

  return entries.map(([name, hold]) => {
    if (!hold || typeof hold !== "object" || Array.isArray(hold)) {
      throw new Error(`${name} must be a hold object.`);
    }
    if (hold.type !== "microban_hold" && hold.type !== "cube_hold") {
      throw new Error(`${name}.type must be "microban_hold" or "cube_hold".`);
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
    let color = hold.color;
    if (typeof color === "string" && /^#[\da-f]{6}$/i.test(color)) {
      color = Number.parseInt(color.slice(1), 16);
    } else if (
      color !== undefined
      && (!Number.isInteger(color) || color < 0 || color > 0xffffff)
    ) {
      throw new Error(`${name}.color must be a 6-digit hexadecimal color string or a 24-bit integer.`);
    }
    return { name, type: hold.type, color, position, orientation };
  });
}

function parseSceneData(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Scene JSON must be an object.");
  }

  if (data.formatVersion !== 1) {
    if (Object.hasOwn(data, "formatVersion")) {
      throw new Error(`Unsupported scene JSON format version: ${data.formatVersion}`);
    }
    return {
      scene: structuredClone(currentSceneSpec),
      seed: currentSeed,
      materialSeed: currentMaterialSeed,
      holds: parseHoldRecords(data),
    };
  }

  const { wall, volumes } = data.scene ?? {};
  if (!wall || !Array.isArray(volumes)) {
    throw new Error("Scene JSON must include wall and volumes data.");
  }
  if (!Number.isInteger(data.seed)) {
    throw new Error("seed must be a whole number.");
  }
  if (!Number.isInteger(data.materialSeed) || data.materialSeed < 0 || data.materialSeed > 0xffffffff) {
    throw new Error("materialSeed must be an unsigned 32-bit integer.");
  }
  const requirePositive = (value, label) => {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} must be a positive number.`);
    }
  };
  for (const dimension of ["width", "height", "depth"]) {
    requirePositive(wall[dimension], `scene.wall.${dimension}`);
  }
  const marker = wall.originMarker;
  if (!marker || typeof marker !== "object") {
    throw new Error("scene.wall.originMarker must be an object.");
  }
  requirePositive(marker.width, "scene.wall.originMarker.width");
  requirePositive(marker.height, "scene.wall.originMarker.height");
  for (const axis of ["x", "y"]) {
    if (!Number.isFinite(marker[axis])) {
      throw new Error(`scene.wall.originMarker.${axis} must be a finite number.`);
    }
  }
  if (volumes.length > 50) {
    throw new Error("Scene JSON can contain at most 50 volumes.");
  }
  const volumeNames = new Set();
  volumes.forEach((volume, index) => {
    const label = `scene.volumes[${index}]`;
    if (!volume || typeof volume !== "object" || typeof volume.name !== "string" || !volume.name) {
      throw new Error(`${label}.name must be a non-empty string.`);
    }
    if (volumeNames.has(volume.name)) {
      throw new Error(`${label}.name must be unique.`);
    }
    volumeNames.add(volume.name);
    if (!volume.center || typeof volume.center !== "object") {
      throw new Error(`${label}.center must be an object.`);
    }
    for (const axis of ["x", "y"]) {
      if (!Number.isFinite(volume.center[axis])) {
        throw new Error(`${label}.center.${axis} must be a finite number.`);
      }
    }
    for (const dimension of ["baseWidth", "baseHeight", "depth"]) {
      requirePositive(volume[dimension], `${label}.${dimension}`);
    }
  });

  return {
    scene: {
      wall: {
        width: wall.width,
        height: wall.height,
        depth: wall.depth,
        originMarker: { ...marker },
      },
      volumes: volumes.map((volume) => ({
        name: volume.name,
        center: { ...volume.center },
        baseWidth: volume.baseWidth,
        baseHeight: volume.baseHeight,
        depth: volume.depth,
      })),
    },
    seed: data.seed,
    materialSeed: data.materialSeed,
    holds: parseHoldRecords(data.holds),
  };
}

function loadSceneFromJson() {
  const {
    scene: sceneSpec,
    seed,
    materialSeed,
    holds: holdData,
  } = parseSceneData(holdJson.value);
  const missingHoldType = holdData.find((hold) => !holdGeometries[
    hold.type === "cube_hold" ? "CubeHold" : "Microban"
  ]);
  if (missingHoldType) {
    const typeName = missingHoldType.type === "cube_hold" ? "CubeHold" : "Microban";
    throw new Error(`${typeName} hold mesh is not loaded yet.`);
  }

  if (!Number.isInteger(seed)) {
    throw new Error("seed must be a whole number.");
  }
  const holdColors = [0xf2554e, 0x59c77b, 0x6389ed];
  rebuildScene(sceneSpec, holdData, holdColors, seed, materialSeed);
}

function makeHoldsFromRecords(holdData, holdColors) {
  return holdData.map(({ name, type, color, position, orientation }, index) => {
    const holdType = type === "cube_hold" ? "CubeHold" : "Microban";
    const hold = makeHold(holdType, color ?? holdColors[index % holdColors.length]);
    hold.name = name;
    hold.userData.jsonKey = name;
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

function rebuildScene(
  sceneSpec = structuredClone(currentSceneSpec),
  holdRecords = null,
  holdColors = [0xf2554e, 0x59c77b, 0x6389ed],
  seed = Number(seedInput.value),
  materialSeed = (seed ^ Math.imul(generation + 1, 0x9e3779b9)) >>> 0,
) {
  const holdCount = holdRecords ? holdRecords.length : Number(holdCountInput.value);
  if (!Number.isFinite(seed) || !Number.isInteger(holdCount) || holdCount < 0 || holdCount > 50) {
    status.textContent = "Enter a whole-number seed and a hold count from 0 to 50.";
    status.dataset.error = "true";
    return;
  }

  if (holdRotation) finishHoldRotation(false);
  if (holdMove) finishHoldMove(false);
  const nextRoot = new THREE.Group();
  const materialRng = seededRandom(materialSeed);
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
  const { wall: wallSpec, volumes: volumeSpecs } = sceneSpec;
  const surfaces = [];
  const frontZ = WALL_FRONT_Z;
  surfaces.push({
    points: [
      new THREE.Vector3(-wallSpec.width / 2, 0, frontZ),
      new THREE.Vector3(wallSpec.width / 2, 0, frontZ),
      new THREE.Vector3(wallSpec.width / 2, wallSpec.height, frontZ),
    ],
    normal: new THREE.Vector3(0, 0, 1),
    area: wallSpec.width * wallSpec.height / 2,
  });
  surfaces.push({
    points: [
      new THREE.Vector3(-wallSpec.width / 2, 0, frontZ),
      new THREE.Vector3(wallSpec.width / 2, wallSpec.height, frontZ),
      new THREE.Vector3(-wallSpec.width / 2, wallSpec.height, frontZ),
    ],
    normal: new THREE.Vector3(0, 0, 1),
    area: wallSpec.width * wallSpec.height / 2,
  });

  addWall(nextRoot, wallMaterial, wallSpec);
  volumeSpecs.forEach((volumeSpec) => {
    addPyramidVolume(nextRoot, surfaces, volumeSpec, wallSpec, volumeMaterial);
  });
  const holds = holdRecords
    ? makeHoldsFromRecords(holdRecords, holdColors)
    : addHolds(nextRoot, surfaces, holdCount, seed);
  if (holdRecords) nextRoot.add(...holds);
  nextRoot.updateMatrixWorld(true);

  setSelectedHold(null);
  for (const child of [...root.children]) {
    child.traverse((object) => {
      if (object.geometry && !Object.values(holdGeometries).includes(object.geometry)) {
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
  currentSceneSpec = structuredClone(sceneSpec);
  currentSeed = seed;
  currentMaterialSeed = materialSeed;
  seedInput.value = String(seed);
  holdCountInput.value = String(holds.length);
  wallFront = WALL_FRONT_Z;
  updateStereoCamera();
  holdJson.value = serializeSceneData(holds);
  generation += 1;
  status.textContent = `Scene ${generation} · seed ${seed} · ${holds.length} holds · ${volumeSpecs.length} volumes`;
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

canvas.addEventListener("pointerdown", (event) => {
  lastPointerX = event.clientX;
  if (holdRotation) {
    pointerDownPosition = null;
    return;
  }
  if (holdMove) {
    pointerDownPosition = null;
    return;
  }
  pointerDownPosition = event.button === 0
    ? { x: event.clientX, y: event.clientY }
    : null;
});

canvas.addEventListener("pointerup", (event) => {
  lastPointerX = event.clientX;
  if (holdRotation) {
    finishHoldRotation(event.button === 0);
    return;
  }
  if (holdMove) {
    if (event.button === 0) {
      finishHoldMove(true);
    } else if (event.button === 2) {
      finishHoldMove(false);
    }
    return;
  }
  if (!pointerDownPosition) return;
  const moved = Math.hypot(
    event.clientX - pointerDownPosition.x,
    event.clientY - pointerDownPosition.y,
  );
  pointerDownPosition = null;
  if (moved > 4) return;

  setSelectedHold(findHoldAtPointer(event));
});

canvas.addEventListener("pointermove", (event) => {
  lastPointerX = event.clientX;
  if (holdRotation) {
    applyHoldRotation(
      holdRotation.initialYaw + (event.clientX - holdRotation.pointerX) * 0.5,
    );
    canvas.style.cursor = "ew-resize";
    return;
  }
  if (holdMove) {
    updateHoldMove(event);
    canvas.style.cursor = "move";
    return;
  }
  canvas.style.cursor = findHoldAtPointer(event) ? "pointer" : "";
});

canvas.addEventListener("pointerleave", () => {
  canvas.style.cursor = "";
  pointerDownPosition = null;
});

canvas.addEventListener("contextmenu", (event) => {
  if (holdMove || holdRotation) event.preventDefault();
});

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
    const seed = updateSeedInput.checked
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Number(seedInput.value);
    rebuildScene(undefined, null, undefined, seed);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.dataset.error = "true";
  }
});

loadHoldsButton.addEventListener("click", () => {
  try {
    loadSceneFromJson();
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
    loadSceneFromJson();
    holdStatus.textContent = `Loaded scene from ${file.name}.`;
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
  link.download = "climbing-scene.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  holdStatus.textContent = "JSON download started: climbing-scene.json.";
  delete holdStatus.dataset.error;
});

addGround();
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
render();

try {
  status.textContent = "Loading hold meshes…";
  const loader = new STLLoader();
  const [microban, cubeHold] = await Promise.all([
    loader.loadAsync("../Assets/microban_hold.stl"),
    loader.loadAsync("../Assets/cubehold_blend.stl"),
  ]);
  holdGeometries.Microban = normalizeHoldGeometry(microban);
  holdGeometries.CubeHold = normalizeHoldGeometry(cubeHold);
  rebuildScene();
} catch (error) {
  status.textContent = `Could not load the hold meshes: ${error instanceof Error ? error.message : String(error)}`;
  status.dataset.error = "true";
}
