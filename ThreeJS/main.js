import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const WALL_WIDTH = 0.8;
const WALL_HEIGHT = 1.4;
const WALL_DEPTH = 0.025;
const WALL_FRONT_Z = 0;
// Quantization bounds hull complexity; this tolerance covers its maximum rounding error.
const HOLD_HULL_GRID = 0.001;
const HOLD_HULL_TOLERANCE = Math.sqrt(3) * HOLD_HULL_GRID / 2;
const POSITION_MATCH_TOLERANCE = 0.1;
const POSITION_MATCH_EPSILON = 1e-9;
const HOLD_SCORE_POSITION_WEIGHT = 1;
const HOLD_SCORE_ORIENTATION_WEIGHT = 0.5;
const HOLD_SCORE_TYPE_MISMATCH_PENALTY = 2;
function originMarkerDimensions(wallWidth, wallHeight) {
  const markerSize = wallWidth < 2 ? 0.1 : 1;
  const width = Math.min(markerSize, wallWidth);
  const height = Math.min(markerSize, wallHeight);
  return {
    width,
    height,
    x: width / 2,
    y: height / 2,
  };
}

const DEFAULT_SCENE = {
  wall: {
    width: WALL_WIDTH,
    height: WALL_HEIGHT,
    depth: WALL_DEPTH,
    originMarker: originMarkerDimensions(WALL_WIDTH, WALL_HEIGHT),
  },
  volumes: [
    { name: "Volume_0", center: { x: -WALL_WIDTH * 0.28, y: WALL_HEIGHT * 0.25 }, baseWidth: WALL_WIDTH * 0.25, baseHeight: WALL_WIDTH * 0.1, depth: WALL_WIDTH * 0.125 },
    { name: "Volume_1", center: { x: 0, y: WALL_HEIGHT * 0.7 }, baseWidth: WALL_WIDTH * 0.25, baseHeight: WALL_WIDTH * 0.1, depth: WALL_WIDTH * 0.125 },
    { name: "Volume_2", center: { x: WALL_WIDTH * 0.28, y: WALL_HEIGHT * 0.4 }, baseWidth: WALL_WIDTH * 0.25, baseHeight: WALL_WIDTH * 0.1, depth: WALL_WIDTH * 0.125 },
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
const wallWidthInput = document.querySelector("#wall-width");
const wallHeightInput = document.querySelector("#wall-height");
const volumeCountInput = document.querySelector("#volume-count");
const seedInput = document.querySelector("#seed");
const updateSeedInput = document.querySelector("#update-seed");
const holdCountInput = document.querySelector("#hold-count");
const addMenu = document.querySelector("#add-menu");
const gridControls = document.querySelector("#grid-controls");
const gridSpacingInputs = ["x", "y"].map((axis) => (
  document.querySelector(`#grid-spacing-${axis}`)
));
const gridStatus = document.querySelector("#grid-status");
const helpPanel = document.querySelector("#help-panel");
const helpToggle = document.querySelector("#help-toggle");
const helpClose = document.querySelector("#help-close");
const holdJson = document.querySelector("#hold-json");
const loadHoldsButton = document.querySelector("#load-holds");
const holdJsonFileInput = document.querySelector("#hold-json-file");
const loadHoldsFileButton = document.querySelector("#load-holds-file");
const saveHoldsFileButton = document.querySelector("#save-holds-file");
const holdStatus = document.querySelector("#hold-status");
const comparisonJsonFileInput = document.querySelector("#comparison-json-file");
const loadComparisonFileButton = document.querySelector("#load-comparison-file");
const copyActiveJsonToComparisonButton = document.querySelector("#copy-active-json-to-comparison");
const compareScenesButton = document.querySelector("#compare-scenes");
const showComparisonOverlayInput = document.querySelector("#show-comparison-overlay");
const comparisonStatus = document.querySelector("#comparison-status");
const comparisonResults = document.querySelector("#comparison-results");
const comparisonScore = document.querySelector("#comparison-score");
const comparisonRows = document.querySelector("#comparison-rows");
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
const comparisonOverlay = new THREE.Group();
comparisonOverlay.visible = false;
scene.add(comparisonOverlay);
const gridGroup = new THREE.Group();
gridGroup.visible = false;
scene.add(gridGroup);
const gridMaterial = new THREE.LineBasicMaterial({
  color: 0x21343b,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  toneMapped: false,
});
const holdRecordTypes = {
  Microban: "microban_hold",
  CubeHold: "cube_hold",
  Sidepull: "sidepull_hold",
  Fingerpocket: "fingerpocket_hold",
};
const holdGeometries = {
  Microban: null,
  CubeHold: null,
  Sidepull: null,
  Fingerpocket: null,
};
const holdHulls = {};
let generation = 0;
let selectedHold = null;
let currentSceneSpec = structuredClone(DEFAULT_SCENE);
let currentSeed = 42;
let currentMaterialSeed = 0;
let currentVolumeHulls = [];
let testSceneData = null;
let holdMove = null;
let holdRotation = null;
let lastPointerX = 0;
const raycaster = new THREE.Raycaster();
const pointerPosition = new THREE.Vector2();
let pointerDownPosition = null;
let wallGridVisible = false;

function rebuildWallGrid() {
  const spacingX = gridSpacingInputs[0].valueAsNumber;
  const spacingY = gridSpacingInputs[1].valueAsNumber;
  if (
    !Number.isFinite(spacingX) || spacingX <= 0
    || !Number.isFinite(spacingY) || spacingY <= 0
  ) {
    gridStatus.textContent = "Grid spacing must be greater than zero.";
    return false;
  }

  const { width, height, originMarker } = currentSceneSpec.wall;
  const originX = originMarker.x - originMarker.width / 2;
  const originY = originMarker.y - originMarker.height / 2;
  const firstXIndex = Math.ceil((-width / 2 - originX) / spacingX);
  const lastXIndex = Math.floor((width / 2 - originX) / spacingX);
  const firstYIndex = Math.ceil((0 - originY) / spacingY);
  const lastYIndex = Math.floor((height - originY) / spacingY);
  const xLineCount = Math.max(0, lastXIndex - firstXIndex + 1);
  const yLineCount = Math.max(0, lastYIndex - firstYIndex + 1);
  if (xLineCount > 1000 || yLineCount > 1000) {
    gridStatus.textContent = "Grid spacing is too small for this wall.";
    return false;
  }

  const points = [];
  for (let index = firstXIndex; index <= lastXIndex; index += 1) {
    const x = originX + index * spacingX;
    points.push(x, 0, WALL_FRONT_Z + 0.001, x, height, WALL_FRONT_Z + 0.001);
  }
  if (xLineCount === 0 || Math.abs(originX + firstXIndex * spacingX + width / 2) > 1e-6) {
    points.push(-width / 2, 0, WALL_FRONT_Z + 0.001, -width / 2, height, WALL_FRONT_Z + 0.001);
  }
  if (xLineCount === 0 || Math.abs(originX + lastXIndex * spacingX - width / 2) > 1e-6) {
    points.push(width / 2, 0, WALL_FRONT_Z + 0.001, width / 2, height, WALL_FRONT_Z + 0.001);
  }
  for (let index = firstYIndex; index <= lastYIndex; index += 1) {
    const y = originY + index * spacingY;
    points.push(-width / 2, y, WALL_FRONT_Z + 0.001, width / 2, y, WALL_FRONT_Z + 0.001);
  }
  if (yLineCount === 0 || Math.abs(originY + firstYIndex * spacingY) > 1e-6) {
    points.push(-width / 2, 0, WALL_FRONT_Z + 0.001, width / 2, 0, WALL_FRONT_Z + 0.001);
  }
  if (yLineCount === 0 || Math.abs(originY + lastYIndex * spacingY - height) > 1e-6) {
    points.push(-width / 2, height, WALL_FRONT_Z + 0.001, width / 2, height, WALL_FRONT_Z + 0.001);
  }

  const previousGeometry = gridGroup.children[0]?.geometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  gridGroup.clear();
  gridGroup.add(new THREE.LineSegments(geometry, gridMaterial));
  previousGeometry?.dispose();
  gridGroup.visible = wallGridVisible;
  gridStatus.textContent = "";
  return true;
}

function setWallGridVisible(visible) {
  if (visible && !rebuildWallGrid()) return;
  wallGridVisible = visible;
  gridGroup.visible = visible;
  gridControls.hidden = !visible;
}

gridSpacingInputs.forEach((input) => {
  input.addEventListener("input", () => {
    if (wallGridVisible) rebuildWallGrid();
  });
});

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

function constrainVolumeSize(volume, wallWidth, wallHeight, scale = 1) {
  const maximumDimension = wallWidth * 0.25;
  volume.baseWidth = Math.min(volume.baseWidth * scale, maximumDimension);
  volume.baseHeight = Math.min(volume.baseHeight * scale, maximumDimension, wallHeight);
  volume.depth = Math.min(volume.depth * scale, maximumDimension);
  constrainVolumeDepth(volume);
}

function constrainVolumeDepth(volume) {
  const shortestBaseSide = Math.min(
    volume.baseWidth,
    Math.hypot(volume.baseWidth / 2, volume.baseHeight),
  );
  volume.depth = Math.min(volume.depth, shortestBaseSide * 0.499999);
}

function volumeBaseTriangle(volume) {
  const { center, baseWidth, baseHeight } = volume;
  return [
    { x: center.x - baseWidth / 2, y: center.y - baseHeight / 2 },
    { x: center.x + baseWidth / 2, y: center.y - baseHeight / 2 },
    { x: center.x, y: center.y + baseHeight / 2 },
  ];
}

function volumeBasesOverlap(first, second) {
  const firstTriangle = volumeBaseTriangle(first);
  const secondTriangle = volumeBaseTriangle(second);
  for (const triangle of [firstTriangle, secondTriangle]) {
    for (let index = 0; index < triangle.length; index += 1) {
      const start = triangle[index];
      const end = triangle[(index + 1) % triangle.length];
      const axis = { x: start.y - end.y, y: end.x - start.x };
      const project = (point) => point.x * axis.x + point.y * axis.y;
      const firstProjection = firstTriangle.map(project);
      const secondProjection = secondTriangle.map(project);
      if (
        Math.max(...firstProjection) <= Math.min(...secondProjection)
        || Math.max(...secondProjection) <= Math.min(...firstProjection)
      ) {
        return false;
      }
    }
  }
  return true;
}

function createRandomSceneSpec(seed, volumeCount, wallWidth = WALL_WIDTH, wallHeight = WALL_HEIGHT) {
  const random = seededRandom(seed ^ 0xa511e9b3);
  const wall = structuredClone(DEFAULT_SCENE.wall);
  wall.width = wallWidth;
  wall.height = wallHeight;
  Object.assign(wall.originMarker, originMarkerDimensions(wallWidth, wallHeight));
  const volumes = [];

  for (let index = 0; index < volumeCount; index += 1) {
    const volume = {
      name: `Volume_${index}`,
      baseWidth: wall.width * (0.1 + random() * 0.15),
      baseHeight: wall.width * 0.1,
      depth: wall.width * (0.05 + random() * 0.2),
    };
    constrainVolumeSize(volume, wall.width, wall.height);
    let placed = false;
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const candidate = {
        ...volume,
        center: {
          x: -wall.width / 2 + volume.baseWidth / 2
            + random() * (wall.width - volume.baseWidth),
          y: volume.baseHeight / 2 + random() * (wall.height - volume.baseHeight),
        },
      };
      if (volumes.every((other) => !volumeBasesOverlap(candidate, other))) {
        volumes.push(candidate);
        placed = true;
        break;
      }
    }
    if (!placed) {
      throw new Error(`Could not place volume ${index} without overlap after 1000 attempts.`);
    }
  }

  return { wall, volumes };
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
  const volumeFaceMarker = name.lastIndexOf("_face_");
  if (volumeFaceMarker >= 0) {
    mesh.userData.volumeName = name.slice(0, volumeFaceMarker);
  }
  if (normal.z > 0.25) mesh.userData.snapSurface = true;
  group.add(mesh);

  const area = new THREE.Vector3().subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
  if (normal.z > 0.25) {
    surfaces.push({
      points: [a.clone(), b.clone(), c.clone()],
      normal: normal.clone(),
      area,
      volumeName: mesh.userData.volumeName,
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

function getHoldTypeFromRecordType(recordType) {
  return Object.keys(holdRecordTypes).find((type) => holdRecordTypes[type] === recordType);
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

function createHoldHull(geometry) {
  const sourcePositions = geometry.getAttribute("position");
  const sourcePoints = new Map();
  for (let index = 0; index < sourcePositions.count; index += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(sourcePositions, index);
    const gridX = Math.round(point.x / HOLD_HULL_GRID);
    const gridY = Math.round(point.y / HOLD_HULL_GRID);
    const gridZ = Math.round(point.z / HOLD_HULL_GRID);
    const key = `${gridX},${gridY},${gridZ}`;
    if (!sourcePoints.has(key)) {
      sourcePoints.set(
        key,
        new THREE.Vector3(
          gridX * HOLD_HULL_GRID,
          gridY * HOLD_HULL_GRID,
          gridZ * HOLD_HULL_GRID,
        ),
      );
    }
  }
  const hullGeometry = new ConvexGeometry(
    [...sourcePoints.values()],
  );
  const hullPositions = hullGeometry.getAttribute("position");
  const vertices = [];
  const vertexIndices = new Map();
  const faces = [];
  const faceKeys = new Set();
  const edges = new Map();
  const vertexIndexAt = (index) => {
    const vertex = new THREE.Vector3().fromBufferAttribute(hullPositions, index);
    const key = `${vertex.x.toFixed(7)},${vertex.y.toFixed(7)},${vertex.z.toFixed(7)}`;
    if (!vertexIndices.has(key)) {
      vertexIndices.set(key, vertices.length);
      vertices.push(vertex);
    }
    return vertexIndices.get(key);
  };
  const edgeKey = (first, second) => (
    first < second ? `${first}:${second}` : `${second}:${first}`
  );

  for (let index = 0; index < hullPositions.count; index += 3) {
    const face = [
      vertexIndexAt(index),
      vertexIndexAt(index + 1),
      vertexIndexAt(index + 2),
    ];
    const normal = new THREE.Vector3()
      .subVectors(vertices[face[1]], vertices[face[0]])
      .cross(new THREE.Vector3().subVectors(vertices[face[2]], vertices[face[0]]))
      .normalize();
    const canonicalNormal = normal.clone();
    const firstNonzero = [canonicalNormal.x, canonicalNormal.y, canonicalNormal.z]
      .find((component) => Math.abs(component) > 1e-7);
    if (firstNonzero < 0) canonicalNormal.negate();
    const normalKey = `${canonicalNormal.x.toFixed(6)},${canonicalNormal.y.toFixed(6)},${canonicalNormal.z.toFixed(6)}`;
    if (!faceKeys.has(normalKey)) {
      faceKeys.add(normalKey);
      faces.push(normal);
    }
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const first = face[edgeIndex];
      const second = face[(edgeIndex + 1) % 3];
      const key = edgeKey(first, second);
      if (!edges.has(key)) {
        edges.set(key, {
          direction: new THREE.Vector3().subVectors(vertices[second], vertices[first]).normalize(),
          faces: new Set(),
        });
      }
      edges.get(key).faces.add(normalKey);
    }
  }
  hullGeometry.dispose();
  const center = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .divideScalar(vertices.length);
  const radius = Math.max(...vertices.map((vertex) => vertex.distanceTo(center)));
  return {
    vertices,
    faces,
    edges: [...edges.values()]
      .filter((edge) => edge.faces.size > 1)
      .map((edge) => edge.direction),
    center,
    radius,
    tolerance: HOLD_HULL_TOLERANCE,
  };
}

function transformHoldHull(type, position, quaternion) {
  const hull = holdHulls[type];
  const center = hull.center.clone().applyQuaternion(quaternion).add(position);
  const vertices = hull.vertices.map((vertex) => vertex.clone().applyQuaternion(quaternion).add(position));
  const bounds = {
    min: new THREE.Vector3(Infinity, Infinity, Infinity),
    max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
  };
  vertices.forEach((vertex) => {
    bounds.min.min(vertex);
    bounds.max.max(vertex);
  });
  return {
    vertices,
    faces: hull.faces.map((normal) => normal.clone().applyQuaternion(quaternion)),
    edges: hull.edges.map((edge) => edge.clone().applyQuaternion(quaternion)),
    center,
    radius: hull.radius + hull.tolerance,
    tolerance: hull.tolerance,
    bounds,
  };
}

function holdHullsIntersect(first, second) {
  const tolerance = first.tolerance + second.tolerance + 1e-8;
  for (const axis of ["x", "y", "z"]) {
    if (
      first.bounds.max[axis] <= second.bounds.min[axis] - tolerance
      || second.bounds.max[axis] <= first.bounds.min[axis] - tolerance
    ) {
      return false;
    }
  }
  if (first.center.distanceToSquared(second.center) >= (first.radius + second.radius) ** 2) {
    return false;
  }
  const separatesOnAxis = (axis) => {
    let firstMin = Infinity;
    let firstMax = -Infinity;
    let secondMin = Infinity;
    let secondMax = -Infinity;
    first.vertices.forEach((vertex) => {
      const projection = vertex.dot(axis);
      firstMin = Math.min(firstMin, projection);
      firstMax = Math.max(firstMax, projection);
    });
    second.vertices.forEach((vertex) => {
      const projection = vertex.dot(axis);
      secondMin = Math.min(secondMin, projection);
      secondMax = Math.max(secondMax, projection);
    });
    return firstMax < secondMin - tolerance || secondMax < firstMin - tolerance;
  };
  for (const axis of [...first.faces, ...second.faces]) {
    if (separatesOnAxis(axis)) return false;
  }
  for (const firstEdge of first.edges) {
    for (const secondEdge of second.edges) {
      const axis = new THREE.Vector3().crossVectors(firstEdge, secondEdge);
      if (axis.lengthSq() > 1e-12 && separatesOnAxis(axis.normalize())) {
        return false;
      }
    }
  }
  return true;
}

function createVolumeHull(volume) {
  const { center, baseWidth, baseHeight, depth } = volume;
  const vertices = [
    new THREE.Vector3(center.x - baseWidth / 2, center.y - baseHeight / 2, WALL_FRONT_Z),
    new THREE.Vector3(center.x + baseWidth / 2, center.y - baseHeight / 2, WALL_FRONT_Z),
    new THREE.Vector3(center.x, center.y + baseHeight / 2, WALL_FRONT_Z),
    new THREE.Vector3(center.x, center.y, WALL_FRONT_Z + depth),
  ];
  const faceIndices = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]];
  const faces = faceIndices.map(([first, second, third]) => (
    new THREE.Vector3().subVectors(vertices[second], vertices[first])
      .cross(new THREE.Vector3().subVectors(vertices[third], vertices[first]))
      .normalize()
  ));
  const edgeIndices = new Set();
  const edges = [];
  faceIndices.forEach((face) => {
    for (let index = 0; index < face.length; index += 1) {
      const first = face[index];
      const second = face[(index + 1) % face.length];
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      if (!edgeIndices.has(key)) {
        edgeIndices.add(key);
        edges.push(new THREE.Vector3().subVectors(vertices[second], vertices[first]).normalize());
      }
    }
  });
  const centerPoint = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .divideScalar(vertices.length);
  const bounds = {
    min: new THREE.Vector3(Infinity, Infinity, Infinity),
    max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
  };
  vertices.forEach((vertex) => {
    bounds.min.min(vertex);
    bounds.max.max(vertex);
  });
  return {
    name: volume.name,
    vertices,
    faces,
    edges,
    center: centerPoint,
    radius: Math.max(...vertices.map((vertex) => vertex.distanceTo(centerPoint))),
    tolerance: 0,
    bounds,
  };
}

function findHoldOverlap(hold, excludedHold = hold) {
  const candidate = transformHoldHull(
    hold.userData.holdType,
    hold.getWorldPosition(new THREE.Vector3()),
    hold.getWorldQuaternion(new THREE.Quaternion()),
  );
  const intersectingVolume = currentVolumeHulls.find((volumeHull) => (
    holdHullsIntersect(candidate, volumeHull)
  ));
  if (intersectingVolume) return intersectingVolume.name;

  let intersectingHold = null;
  root.traverse((object) => {
    if (intersectingHold || !isHold(object) || object === excludedHold) return;
    const otherHull = transformHoldHull(
      object.userData.holdType,
      object.getWorldPosition(new THREE.Vector3()),
      object.getWorldQuaternion(new THREE.Quaternion()),
    );
    if (holdHullsIntersect(candidate, otherHull)) {
      intersectingHold = object.userData.jsonKey ?? object.name;
    }
  });
  return intersectingHold;
}

function validateHoldRecords(holdRecords, volumes) {
  const volumeHulls = volumes.map(createVolumeHull);
  const placedHulls = [];
  for (const record of holdRecords) {
    const type = getHoldTypeFromRecordType(record.type);
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        record.orientation.roll,
        record.orientation.pitch,
        record.orientation.yaw,
        "XYZ",
      ),
    );
    const candidate = transformHoldHull(
      type,
      new THREE.Vector3(record.position.x, record.position.y, record.position.z),
      quaternion,
    );
    const intersectingVolume = volumeHulls.find((volumeHull) => (
      holdHullsIntersect(candidate, volumeHull)
    ));
    if (intersectingVolume) {
      throw new Error(`${record.name} overlaps ${intersectingVolume.name}.`);
    }
    const intersectingHold = placedHulls.find(({ hull }) => holdHullsIntersect(candidate, hull));
    if (intersectingHold) {
      throw new Error(`${record.name} overlaps ${intersectingHold.name}.`);
    }
    placedHulls.push({ name: record.name, hull: candidate });
  }
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
  return { point, normal: surface.normal, volumeName: surface.volumeName };
}

function addHolds(group, surfaces, count, seed, volumeHulls) {
  if (count > 0 && !Object.values(holdGeometries).every(Boolean)) {
    throw new Error("All hold meshes must be loaded before generating holds.");
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
      const holdTypes = ["Microban", "Sidepull", "Fingerpocket"];
      const type = holdTypes[Math.floor(random() * holdTypes.length)];
      hold = makeHold(type, color);
      const { point, normal, volumeName } = sampleSurface(surfaces, random);
      if (volumeName) {
        point.addScaledVector(normal, HOLD_HULL_TOLERANCE * 2);
      }
      // The STL's backface is normalized to local z = 0, so this anchors it
      // directly on the sampled face.
      hold.position.copy(point);
      // Blender's local -Y outward axis maps to Three.js local +Z.
      hold.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      const faceRotation = faceRotations[Math.floor(random() * faceRotations.length)];
      hold.rotateZ(faceRotation);

      const hull = transformHoldHull(type, hold.position, hold.quaternion);
      const clear = volumeHulls.every((volumeHull) => !holdHullsIntersect(hull, volumeHull))
        && placed.every((other) => !holdHullsIntersect(hull, other));
      if (clear) {
        hold.name = `${type}Hold_${i}`;
        group.add(hold);
        holds.push(hold);
        placed.push(hull);
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
      type: holdRecordTypes[hold.userData.holdType],
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

function objectPosition(item, kind) {
  return kind === "hold"
    ? item.position
    : { x: item.center.x, y: item.center.y, z: 0 };
}

function distanceBetween(first, second) {
  return Math.hypot(
    first.x - second.x,
    first.y - second.y,
    first.z - second.z,
  );
}

function findPositionMatches(activeItems, testItems) {
  const candidates = testItems.map((testItem) => activeItems
    .map((activeItem, activeIndex) => ({
      activeIndex,
      distance: distanceBetween(testItem.position, activeItem.position),
    }))
    .filter(({ distance }) => (
      distance <= POSITION_MATCH_TOLERANCE + POSITION_MATCH_EPSILON
    ))
    .sort((first, second) => first.distance - second.distance));
  const testForActive = Array(activeItems.length).fill(-1);

  function assign(testIndex, visitedActive) {
    for (const { activeIndex } of candidates[testIndex]) {
      if (visitedActive.has(activeIndex)) continue;
      visitedActive.add(activeIndex);
      if (
        testForActive[activeIndex] === -1
        || assign(testForActive[activeIndex], visitedActive)
      ) {
        testForActive[activeIndex] = testIndex;
        return true;
      }
    }
    return false;
  }

  testItems.forEach((_, testIndex) => assign(testIndex, new Set()));
  return testForActive.flatMap((testIndex, activeIndex) => (
    testIndex === -1
      ? []
      : [{
        active: activeItems[activeIndex],
        test: testItems[testIndex],
        distance: distanceBetween(
          activeItems[activeIndex].position,
          testItems[testIndex].position,
        ),
      }]
  ));
}

function wrappedAngleDifference(first, second) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function orientationDifferenceRadians(active, test) {
  return ["roll", "pitch", "yaw"].map((angle) => (
    wrappedAngleDifference(active.orientation[angle], test.orientation[angle])
  ));
}

function orientationDifference(active, test) {
  return orientationDifferenceRadians(active, test).map((angle) => (
    angle * 180 / Math.PI
  ));
}

function holdMatchScore(active, test) {
  const positionError = distanceBetween(active.position, test.position);
  const orientationError = orientationDifferenceRadians(active, test);
  const orientationSquaredError = orientationError.reduce(
    (sum, angle) => sum + angle ** 2,
    0,
  );
  const typeMismatchPenalty = active.type === test.type
    ? 0
    : HOLD_SCORE_TYPE_MISMATCH_PENALTY;

  return (
    HOLD_SCORE_POSITION_WEIGHT * positionError ** 2
    + HOLD_SCORE_ORIENTATION_WEIGHT * orientationSquaredError
    + typeMismatchPenalty
  );
}

function getComparisonItems(parsedScene) {
  return {
    holds: parsedScene.holds.map((hold) => ({
      ...hold,
      kind: "hold",
      position: hold.position,
    })),
    volumes: parsedScene.scene.volumes.map((volume) => ({
      ...volume,
      kind: "volume",
      position: objectPosition(volume, "volume"),
    })),
  };
}

function clearComparisonOverlay() {
  const disposedMaterials = new Set();
  comparisonOverlay.traverse((object) => {
    if (object.geometry && !Object.values(holdGeometries).includes(object.geometry)) {
      object.geometry.dispose();
    }
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!disposedMaterials.has(material)) {
        material.dispose();
        disposedMaterials.add(material);
      }
    });
  });
  comparisonOverlay.clear();
}

function renderComparisonOverlay(testItems) {
  const missingHold = testItems.holds.find((hold) => (
    !holdGeometries[getHoldTypeFromRecordType(hold.type)]
  ));
  if (missingHold) {
    throw new Error(`${getHoldTypeFromRecordType(missingHold.type)} hold mesh is not loaded yet.`);
  }

  clearComparisonOverlay();
  testItems.volumes.forEach((volume) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffad5c,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      toneMapped: false,
    });
    addPyramidVolume(
      comparisonOverlay,
      [],
      volume,
      testSceneData.scene.wall,
      material,
    );
  });
  testItems.holds.forEach((hold) => {
    const type = getHoldTypeFromRecordType(hold.type);
    if (!holdGeometries[type]) {
      throw new Error(`${type} hold mesh is not loaded yet.`);
    }
    const overlayHold = new THREE.Mesh(
      holdGeometries[type],
      new THREE.MeshBasicMaterial({
        color: 0x56e6ec,
        wireframe: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    overlayHold.position.set(hold.position.x, hold.position.y, hold.position.z);
    overlayHold.quaternion.setFromEuler(
      new THREE.Euler(
        hold.orientation.roll,
        hold.orientation.pitch,
        hold.orientation.yaw,
        "XYZ",
      ),
    );
    comparisonOverlay.add(overlayHold);
  });
  comparisonOverlay.visible = showComparisonOverlayInput.checked;
}

function appendComparisonRow(
  activeName,
  testName,
  kind,
  distance,
  angles,
  activeHoldScore = null,
  testHoldScore = null,
) {
  const row = document.createElement("tr");
  const values = [
    activeName ?? "—",
    `${kind}: ${testName}`,
    activeName === null ? "No active match" : `${(distance * 100).toFixed(1)} cm`,
    angles ? angles.map((angle) => `${angle.toFixed(1)}°`).join(" / ") : "—",
    activeHoldScore === null ? "—" : activeHoldScore.toFixed(6),
    testHoldScore === null ? "—" : testHoldScore.toFixed(6),
  ];
  values.forEach((value) => {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.append(cell);
  });
  comparisonRows.append(row);
}

function getActiveSceneData() {
  const holds = [];
  root.traverse((object) => {
    if (isHold(object)) holds.push(object);
  });
  return parseSceneData(serializeSceneData(holds));
}

function compareLoadedScene() {
  if (!testSceneData) return;
  const activeItems = getComparisonItems(getActiveSceneData());
  const testItems = getComparisonItems(testSceneData);
  const holdMatches = findPositionMatches(activeItems.holds, testItems.holds);
  const volumeMatches = findPositionMatches(activeItems.volumes, testItems.volumes);
  const matches = [...holdMatches, ...volumeMatches];
  const formatRate = (matched, total) => (
    `${total > 0 ? `${(matched / total * 100).toFixed(1)}%` : "N/A"} (${matched}/${total})`
  );
  let activeMatchedHoldScore = 0;
  let testMatchedHoldScore = 0;

  comparisonRows.replaceChildren();
  matches.forEach(({ active, test, distance }) => {
    const score = test.kind === "hold" ? holdMatchScore(active, test) : null;
    if (score !== null) {
      activeMatchedHoldScore += score;
      testMatchedHoldScore += score;
    }
    appendComparisonRow(
      active.name,
      test.name,
      test.kind,
      distance,
      test.kind === "hold" ? orientationDifference(active, test) : null,
      score,
      score,
    );
  });
  [...testItems.holds, ...testItems.volumes].forEach((test) => {
    const matched = matches.some((match) => match.test === test);
    if (!matched) appendComparisonRow(null, test.name, test.kind, null, null);
  });
  comparisonScore.textContent = [
    `Active matched volumes (AMV): ${formatRate(volumeMatches.length, activeItems.volumes.length)}`,
    `Active matched holds (AMH): ${formatRate(holdMatches.length, activeItems.holds.length)}`,
    `Test matched volumes (TMV): ${formatRate(volumeMatches.length, testItems.volumes.length)}`,
    `Test matched holds (TMH): ${formatRate(holdMatches.length, testItems.holds.length)}`,
    `Active matched hold score (sum): ${activeMatchedHoldScore.toFixed(6)}`,
    `Test matched hold score (sum): ${testMatchedHoldScore.toFixed(6)}`,
    "Hold score (lower is better): position × 1 + orientation × 0.5 + 2 for a type mismatch.",
  ].join("\n");
  comparisonResults.hidden = false;
  renderComparisonOverlay(testItems);
  comparisonStatus.textContent = "Compared the active scene with the loaded test file.";
  delete comparisonStatus.dataset.error;
}

function refreshComparisonAfterSceneChange() {
  try {
    compareLoadedScene();
  } catch (error) {
    comparisonStatus.textContent = error instanceof Error
      ? error.message
      : String(error);
    comparisonStatus.dataset.error = "true";
  }
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
      type: holdRecordTypes[object.userData.holdType],
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
  if (surfaceHit.object.userData.volumeName) {
    selectedHold.position.addScaledVector(targetNormal, HOLD_HULL_TOLERANCE * 2);
  }
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
  if (commit && selectedHold) {
    const overlap = findHoldOverlap(selectedHold);
    if (overlap) {
      holdStatus.textContent = `${selectedHold.userData.jsonKey} overlaps ${overlap}; adjust its position before finishing.`;
      holdStatus.dataset.error = "true";
      return;
    }
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
    if (testSceneData) refreshComparisonAfterSceneChange();
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
  const baseWidth = currentSceneSpec.wall.width * 0.25;
  const baseHeight = Math.min(currentSceneSpec.wall.width * 0.1, currentSceneSpec.wall.height);
  let index = 0;
  while (sceneSpec.volumes.some((volume) => volume.name === `Volume_${index}`)) index += 1;
  const addedVolumeCount = Math.max(0, sceneSpec.volumes.length - DEFAULT_SCENE.volumes.length);
  const volume = {
    name: `Volume_${index}`,
    center: {
      x: 0,
      y: Math.min(sceneSpec.wall.height / 2, 0.5 + addedVolumeCount * 0.75),
    },
    baseWidth,
    baseHeight,
    depth: currentSceneSpec.wall.width * 0.125,
  };
  constrainVolumeDepth(volume);
  sceneSpec.volumes.push(volume);
  try {
    validateHoldRecords(getHoldRecords(), sceneSpec.volumes);
  } catch (error) {
    holdStatus.textContent = error instanceof Error ? error.message : String(error);
    holdStatus.dataset.error = "true";
    return;
  }
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
  } else if (Object.hasOwn(holdGeometries, button.dataset.addType)) {
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
    position: selectedHold.position.clone(),
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
  if (commit && selectedHold) {
    const overlap = findHoldOverlap(selectedHold);
    if (overlap) {
      selectedHold.position.copy(holdRotation.position);
      selectedHold.quaternion.copy(holdRotation.quaternion);
      holdRotation = null;
      controls.enabled = true;
      holdRotationControl.hidden = true;
      holdRotationInput.value = initialYaw.toFixed(1);
      canvas.style.cursor = "";
      holdStatus.textContent = `${selectedHold.userData.jsonKey} overlaps ${overlap}; rotation was cancelled.`;
      holdStatus.dataset.error = "true";
      return;
    }
  }
  if (!commit && selectedHold) {
    selectedHold.position.copy(holdRotation.position);
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
    if (testSceneData) refreshComparisonAfterSceneChange();
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
  if (testSceneData) refreshComparisonAfterSceneChange();
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
  } else if (event.shiftKey && event.key.toLowerCase() === "g" && !event.repeat) {
    event.preventDefault();
    if (!addMenu.hidden) closeAddMenu(true);
    setWallGridVisible(!wallGridVisible);
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
    if (!Object.values(holdRecordTypes).includes(hold.type)) {
      throw new Error(
        `${name}.type must be "microban_hold", "cube_hold", "sidepull_hold", or "fingerpocket_hold".`,
      );
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
    getHoldTypeFromRecordType(hold.type)
  ]);
  if (missingHoldType) {
    const typeName = getHoldTypeFromRecordType(missingHoldType.type);
    throw new Error(`${typeName} hold mesh is not loaded yet.`);
  }

  if (!Number.isInteger(seed)) {
    throw new Error("seed must be a whole number.");
  }
  const constrainedVolumes = sceneSpec.volumes.map((volume) => ({
    ...volume,
    center: { ...volume.center },
  }));
  constrainedVolumes.forEach(constrainVolumeDepth);
  validateHoldRecords(holdData, constrainedVolumes);
  const holdColors = [0xf2554e, 0x59c77b, 0x6389ed];
  rebuildScene({ ...sceneSpec, volumes: constrainedVolumes }, holdData, holdColors, seed, materialSeed);
}

function makeHoldsFromRecords(holdData, holdColors) {
  return holdData.map(({ name, type, color, position, orientation }, index) => {
    const holdType = getHoldTypeFromRecordType(type);
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
  Object.assign(
    sceneSpec.wall.originMarker,
    originMarkerDimensions(sceneSpec.wall.width, sceneSpec.wall.height),
  );

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
  volumeSpecs.forEach(constrainVolumeDepth);
  const volumeHulls = volumeSpecs.map(createVolumeHull);
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
    : addHolds(nextRoot, surfaces, holdCount, seed, volumeHulls);
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
  currentVolumeHulls = volumeHulls;
  wallWidthInput.value = String(sceneSpec.wall.width);
  wallHeightInput.value = String(sceneSpec.wall.height);
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
  if (wallGridVisible) rebuildWallGrid();
  if (testSceneData) refreshComparisonAfterSceneChange();
}

function captureStereoPng() {
  return new Promise((resolve, reject) => {
    stereoCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create a PNG from the stereo view."));
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result), { once: true });
      reader.addEventListener("error", () => reject(reader.error), { once: true });
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

async function generateRandomWall({
  seed = 0,
  volumeCount = 3,
  holdCount = 10,
  cameraHeight = 0.7,
  cameraDistance = 1,
  cameraViews = null,
  wallWidth = WALL_WIDTH,
  wallHeight = WALL_HEIGHT,
} = {}) {
  const requireCount = (value, label) => {
    const maximum = label === "volumeCount" ? 10 : 50;
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
      throw new RangeError(`${label} must be a whole number from 0 to ${maximum}.`);
    }
  };
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer (0 selects a random seed).");
  }
  requireCount(volumeCount, "volumeCount");
  requireCount(holdCount, "holdCount");
  if (!Number.isFinite(wallWidth) || wallWidth <= 0) {
    throw new RangeError("wallWidth must be a positive number.");
  }
  if (!Number.isFinite(wallHeight) || wallHeight <= 0) {
    throw new RangeError("wallHeight must be a positive number.");
  }
  const views = cameraViews ?? [{ height: cameraHeight, distance: cameraDistance }];
  if (!Array.isArray(views) || views.length === 0) {
    throw new RangeError("cameraViews must contain at least one camera view.");
  }
  views.forEach((view, index) => {
    if (!view || typeof view !== "object") {
      throw new RangeError(`cameraViews[${index}] must include a height and distance.`);
    }
    const { height, distance } = view;
    if (!Number.isFinite(height) || height < 0) {
      throw new RangeError(`cameraViews[${index}].height must be a non-negative number.`);
    }
    if (!Number.isFinite(distance) || distance <= 0) {
      throw new RangeError(`cameraViews[${index}].distance must be greater than zero.`);
    }
  });

  let resolvedSeed = seed;
  if (resolvedSeed === 0) {
    resolvedSeed = crypto.getRandomValues(new Uint32Array(1))[0];
    if (resolvedSeed === 0) resolvedSeed = 1;
  }

  const sceneSpec = createRandomSceneSpec(resolvedSeed, volumeCount, wallWidth, wallHeight);
  const materialSeed = (resolvedSeed ^ 0x9e3779b9) >>> 0;
  volumeCountInput.value = String(volumeCount);
  holdCountInput.value = String(holdCount);
  rebuildScene(
    sceneSpec,
    null,
    undefined,
    resolvedSeed,
    materialSeed,
  );

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const holds = [];
  root.traverse((object) => {
    if (isHold(object)) holds.push(object);
  });
  const stereoPngDataUrls = [];
  for (const { height, distance } of views) {
    stereoHeightInput.value = String(height);
    stereoDistanceInput.value = String(distance);
    updateStereoCamera();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderStereoView();
    stereoPngDataUrls.push(await captureStereoPng());
  }

  return {
    seed: resolvedSeed,
    sceneJson: serializeSceneData(holds),
    stereoPngDataUrl: stereoPngDataUrls[0],
    stereoPngDataUrls,
  };
}

window.RCRWallAPI = {
  generateRandomWall,
  isReady: () => Object.values(holdGeometries).every(Boolean),
};

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
    const wallWidth = wallWidthInput.valueAsNumber;
    const wallHeight = wallHeightInput.valueAsNumber;
    const volumeCount = volumeCountInput.valueAsNumber;
    if (!Number.isFinite(wallWidth) || wallWidth <= 0) {
      throw new Error("Wall width must be a positive number.");
    }
    if (!Number.isFinite(wallHeight) || wallHeight <= 0) {
      throw new Error("Wall height must be a positive number.");
    }
    if (!Number.isInteger(volumeCount) || volumeCount < 0 || volumeCount > 10) {
      throw new Error("Volume count must be a whole number from 0 to 10.");
    }
    const seed = updateSeedInput.checked
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Number(seedInput.value);
    const sceneSpec = structuredClone(currentSceneSpec);
    sceneSpec.wall.width = wallWidth;
    sceneSpec.wall.height = wallHeight;
    Object.assign(
      sceneSpec.wall.originMarker,
      originMarkerDimensions(wallWidth, wallHeight),
    );
    sceneSpec.volumes = createRandomSceneSpec(seed, volumeCount, wallWidth, wallHeight).volumes;
    rebuildScene(sceneSpec, null, undefined, seed);
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

holdJson.addEventListener("input", () => {
  if (testSceneData) {
    comparisonStatus.textContent = "JSON editor changed. Update the scene from JSON to apply edits before comparing.";
    delete comparisonStatus.dataset.error;
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

loadComparisonFileButton.addEventListener("click", () => {
  comparisonJsonFileInput.click();
});

copyActiveJsonToComparisonButton.addEventListener("click", () => {
  try {
    testSceneData = getActiveSceneData();
    compareScenesButton.disabled = false;
    showComparisonOverlayInput.disabled = false;
    compareLoadedScene();
    comparisonStatus.textContent = "Copied the active scene to the comparison JSON.";
  } catch (error) {
    comparisonStatus.textContent = error instanceof Error
      ? error.message
      : String(error);
    comparisonStatus.dataset.error = "true";
  }
});

compareScenesButton.addEventListener("click", () => {
  try {
    compareLoadedScene();
  } catch (error) {
    comparisonStatus.textContent = error instanceof Error
      ? error.message
      : String(error);
    comparisonStatus.dataset.error = "true";
  }
});

showComparisonOverlayInput.addEventListener("change", () => {
  comparisonOverlay.visible = showComparisonOverlayInput.checked && Boolean(testSceneData);
});

comparisonJsonFileInput.addEventListener("change", async () => {
  const [file] = comparisonJsonFileInput.files;
  if (!file) return;

  try {
    const candidate = parseSceneData(await file.text());
    parseSceneData(holdJson.value);
    testSceneData = candidate;
    compareScenesButton.disabled = false;
    showComparisonOverlayInput.disabled = false;
    compareLoadedScene();
    comparisonStatus.textContent = `Loaded and compared ${file.name}.`;
  } catch (error) {
    comparisonStatus.textContent = error instanceof Error
      ? error.message
      : String(error);
    comparisonStatus.dataset.error = "true";
  } finally {
    comparisonJsonFileInput.value = "";
  }
});

addGround();
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
render();

try {
  status.textContent = "Loading hold meshes…";
  const loader = new STLLoader();
  const [microban, cubeHold, sidepull, fingerpocket] = await Promise.all([
    loader.loadAsync("../Assets/microban_hold.stl"),
    loader.loadAsync("../Assets/cube_hold.stl"),
    loader.loadAsync("../Assets/sidehpull_hold.stl"),
    loader.loadAsync("../Assets/fingerpocket_hold.stl"),
  ]);
  holdGeometries.Microban = normalizeHoldGeometry(microban);
  holdGeometries.CubeHold = normalizeHoldGeometry(cubeHold);
  holdGeometries.Sidepull = normalizeHoldGeometry(sidepull);
  holdGeometries.Fingerpocket = normalizeHoldGeometry(fingerpocket);
  Object.entries(holdGeometries).forEach(([type, geometry]) => {
    holdHulls[type] = createHoldHull(geometry);
  });
  rebuildScene();
} catch (error) {
  status.textContent = `Could not load the hold meshes: ${error instanceof Error ? error.message : String(error)}`;
  status.dataset.error = "true";
}
