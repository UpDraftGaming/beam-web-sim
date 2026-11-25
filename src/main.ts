import './style.css';
import * as THREE from 'three';
import { SoftBodyVehicle, ObstacleBox } from './physics';

// 1. Scene & Renderer Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a202c);
scene.fog = new THREE.Fog(0x1a202c, 30, 140);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight.position.set(25, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
scene.add(dirLight);

// Ground & Reference Grid
const groundGeo = new THREE.PlaneGeometry(300, 300);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.85 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(300, 100, 0x4a5568, 0x2d3748);
grid.position.y = 0.01;
scene.add(grid);

// 2. Crash Test Arena Obstacles
const obstacles: ObstacleBox[] = [];
const wallMat = new THREE.MeshStandardMaterial({ color: 0xe53e3e, roughness: 0.5 });

function addObstacle(x: number, y: number, z: number, w: number, h: number, d: number, color = 0xe53e3e) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = wallMat.clone();
  mat.color.setHex(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  obstacles.push({
    min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
  });
}

addObstacle(0, 1.5, 28, 3, 3, 3, 0xff6b00);      // Center crash pillar
addObstacle(-8, 1.0, 42, 8, 2, 2, 0xe53e3e);     // Offset concrete wall
addObstacle(10, 1.5, 55, 2.5, 3, 2.5, 0x3182ce); // Side bollard
addObstacle(0, 0.35, -20, 10, 0.7, 3, 0x38a169);   // Suspension test bump

// 3. Soft-Body Vehicle & Deforming 3D Mesh
const vehicle = new SoftBodyVehicle();

const bodyGeo = new THREE.BufferGeometry();
const bodyIndices = [
  // Bottom
  0, 2, 1, 1, 2, 3,
  // Roof
  4, 5, 6, 5, 7, 6,
  // Left Side
  0, 4, 2, 2, 4, 6,
  // Right Side
  1, 3, 5, 3, 7, 5,
  // Rear
  2, 6, 3, 3, 6, 7,
  // Front & Bumper Nose
  4, 0, 5, 5, 0, 1,
  0, 8, 1, 4, 8, 0, 5, 1, 8, 4, 5, 8
];
bodyGeo.setIndex(bodyIndices);

const bodyMat = new THREE.MeshStandardMaterial({
  color: 0x00b4d8,
  roughness: 0.3,
  metalness: 0.4,
  flatShading: true,
});
const carBodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
carBodyMesh.castShadow = true;
scene.add(carBodyMesh);

// 4 Wheel Meshes
const wheelMeshes: THREE.Mesh[] = [];
const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 20);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });

for (let i = 0; i < 4; i++) {
  const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
  wMesh.castShadow = true;
  scene.add(wMesh);
  wheelMeshes.push(wMesh);
}

// Beam Stress Debug Overlay
let showBeams = true;
const beamGeo = new THREE.BufferGeometry();
const beamMat = new THREE.LineBasicMaterial({ vertexColors: true });
const beamLines = new THREE.LineSegments(beamGeo, beamMat);
scene.add(beamLines);

// 4. Input Listeners
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR') vehicle.reset();
  if (e.code === 'KeyB') {
    showBeams = !showBeams;
    beamLines.visible = showBeams;
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 5. Simulation Loop
const telemetryEl = document.getElementById('telemetry')!;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  const throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
  const steer = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const brake = Boolean(keys['Space']);

  vehicle.step(dt, throttle, steer, brake, obstacles);

  // Sync Deforming Chassis Vertices
  const positions = new Float32Array(9 * 3);
  for (let i = 0; i < 9; i++) {
    positions[i * 3] = vehicle.nodes[i].pos.x;
    positions[i * 3 + 1] = vehicle.nodes[i].pos.y;
    positions[i * 3 + 2] = vehicle.nodes[i].pos.z;
  }
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  bodyGeo.computeVertexNormals();

  // Sync Wheel Meshes
  const wheels = [vehicle.wheelNodes.fl, vehicle.wheelNodes.fr, vehicle.wheelNodes.rl, vehicle.wheelNodes.rr];
  const carForward = vehicle.getForwardVector();
  const baseYaw = Math.atan2(carForward.x, carForward.z);

  wheels.forEach((wNode, idx) => {
    wheelMeshes[idx].position.copy(wNode.pos);
    wheelMeshes[idx].rotation.y = baseYaw + wNode.steerAngle;
  });

  // Sync Beam Stress Colors (Green = Healthy, Red = Deforming)
  if (showBeams) {
    const linePos = new Float32Array(vehicle.beams.length * 6);
    const lineColors = new Float32Array(vehicle.beams.length * 6);

    vehicle.beams.forEach((b, i) => {
      linePos[i * 6] = b.n1.pos.x;
      linePos[i * 6 + 1] = b.n1.pos.y;
      linePos[i * 6 + 2] = b.n1.pos.z;
      linePos[i * 6 + 3] = b.n2.pos.x;
      linePos[i * 6 + 4] = b.n2.pos.y;
      linePos[i * 6 + 5] = b.n2.pos.z;

      const r = Math.min(1, b.stress * 2);
      const g = Math.max(0, 1 - b.stress);
      lineColors[i * 6] = r;
      lineColors[i * 6 + 1] = g;
      lineColors[i * 6 + 2] = 0.2;
      lineColors[i * 6 + 3] = r;
      lineColors[i * 6 + 4] = g;
      lineColors[i * 6 + 5] = 0.2;
    });

    beamGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    beamGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  }

  // Smooth Chase Camera
  const center = vehicle.getCenter();
  const camTarget = center.clone().sub(carForward.clone().multiplyScalar(7.5)).add(new THREE.Vector3(0, 3.2, 0));
  camera.position.lerp(camTarget, 0.1);
  camera.lookAt(center.clone().add(new THREE.Vector3(0, 0.8, 0)));

  // Update HUD Telemetry
  const speedKmh = Math.round(vehicle.nodes[0].vel.length() * 3.6);
  const deform = vehicle.getDeformationPercent();
  telemetryEl.textContent = `Speed: ${speedKmh} km/h | Deformation: ${deform}%`;

  renderer.render(scene, camera);
}

animate();
