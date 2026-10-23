import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const WALL_WIDTH = 5;
const WALL_HEIGHT = 2.5;
const WALL_DEPTH = 0.025;
const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");
const form = document.querySelector("#scene-controls");
const seedInput = document.querySelector("#seed");
const holdCountInput = document.querySelector("#hold-count");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10161b);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.position.set(4.9, 3.6, 7.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.15, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xd9e8f3, 0x34302a, 2.1));
const keyLight = new THREE.DirectionalLight(0xfff2dc, 3.1);
keyLight.position.set(-3, 6, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x91b7ff, 1.1);
fillLight.position.set(4, 2, -4);
scene.add(fillLight);

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
  const color = new THREE.Color().setHSL(hue, saturation, value);
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

function makeRockMaterial(seed, hue, saturation, value) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rockTexture(seed, hue, saturation, value),
    roughness: 0.92,
  });
}

function addWall(group, seed) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_WIDTH, WALL_HEIGHT, WALL_DEPTH),
    makeRockMaterial(seed, 0.12, 0.11, 0.37),
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

function addPyramidVolume(group, surfaces, index, centerX, centerY, seed) {
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
  const material = makeRockMaterial(seed + index + 1, 0.66, 0.13, 0.31);
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

function makeCubeHold(color) {
  const hold = new THREE.Group();
  const depth = 0.042;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.34,
    metalness: 0.02,
  });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.065, depth),
    bodyMaterial,
  );
  body.castShadow = true;
  body.position.z = depth / 2;
  hold.add(body);

  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.048, 0.027, 0.004),
    new THREE.MeshStandardMaterial({ color: 0x26272a, roughness: 0.8 }),
  );
  grip.position.set(0, 0.008, 0.043);
  hold.add(grip);
  return hold;
}

function makeMicrobanHold(color) {
  const hold = new THREE.Mesh(
    microbanGeometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.02 }),
  );
  hold.castShadow = true;
  hold.name = "MicrobanHold";
  return hold;
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
  const random = seededRandom(seed ^ 0x9e3779b9);
  const placed = [];
  const colors = [0xf2554e, 0x59c77b, 0x6389ed];

  for (let i = 0; i < count; i += 1) {
    let hold = null;
    let placedSuccessfully = false;
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const useMicroban = microbanGeometry && random() < 0.35;
      const color = colors[Math.floor(random() * colors.length)];
      hold = useMicroban ? makeMicrobanHold(color) : makeCubeHold(color);
      const { point, normal } = sampleSurface(surfaces, random);
      hold.position.copy(point);
      // Blender's local -Y outward axis maps to Three.js local +Z.
      hold.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      hold.rotateZ(random() * Math.PI * 2);
      if (!useMicroban) {
        hold.rotateZ((random() < 0.5 ? -1 : 1) * Math.PI / 4);
      }

      const center = hold.position;
      const radius = useMicroban ? 0.04 : 0.075;
      const clear = placed.every(
        (other) => center.distanceTo(other.center) >= radius + other.radius + 0.12,
      );
      if (clear) {
        hold.name = `${useMicroban ? "MicrobanHold" : "CubeHold"}_${i}`;
        hold.userData.holdType = useMicroban ? "Microban" : "Cube";
        group.add(hold);
        placed.push({ center: center.clone(), radius });
        placedSuccessfully = true;
        break;
      }
      hold.geometry && hold.geometry !== microbanGeometry && hold.geometry.dispose();
      hold.traverse((child) => {
        if (child.isMesh && child.material !== undefined) {
          child.material.dispose();
        }
      });
    }

    if (!placedSuccessfully) {
      throw new Error(`Could not place hold ${i} after 1000 attempts.`);
    }
  }
}

function addGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x1b252b, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
}

function rebuildScene() {
  const seed = Number(seedInput.value);
  const holdCount = Number(holdCountInput.value);
  if (!Number.isFinite(seed) || !Number.isInteger(holdCount) || holdCount < 0 || holdCount > 30) {
    status.textContent = "Enter a whole-number seed and a hold count from 0 to 30.";
    status.dataset.error = "true";
    return;
  }

  const nextRoot = new THREE.Group();
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

  addWall(nextRoot, seed);
  const volumePositions = [
    [-1.35, 0.72],
    [0.05, 1.72],
    [1.35, 0.78],
  ];
  volumePositions.forEach(([x, y], index) => {
    addPyramidVolume(nextRoot, surfaces, index, x, y, seed);
  });
  addHolds(nextRoot, surfaces, holdCount, seed);

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
}

function render() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    rebuildScene();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.dataset.error = "true";
  }
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
    -bounds.min.z,
  );
  microbanGeometry.computeVertexNormals();
  rebuildScene();
} catch (error) {
  try {
    rebuildScene();
  } catch (sceneError) {
    status.textContent = sceneError instanceof Error ? sceneError.message : String(sceneError);
  }
  status.textContent = `Microban STL unavailable; using cube holds. ${error instanceof Error ? error.message : String(error)}`;
  status.dataset.error = "true";
}
