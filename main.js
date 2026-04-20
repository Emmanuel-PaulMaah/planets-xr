import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/webxr/ARButton.js';

// Planet data
const planetsData = [
  { name: 'Sun',     texture: 'sunmap.jpg',       radius: 0.18, speed: 0.001, emissive: true },
  { name: 'Mercury', texture: 'mercurymap.jpg',    radius: 0.03, speed: 0.004 },
  { name: 'Venus',   texture: 'venusmap.jpg',       radius: 0.06, speed: 0.003 },
  { name: 'Earth',   texture: 'earth.jpg',          radius: 0.06, speed: 0.005 },
  { name: 'Mars',    texture: 'mars_1k_color.jpg',  radius: 0.04, speed: 0.005 },
  { name: 'Jupiter', texture: 'jupiter2_1k.jpg',    radius: 0.14, speed: 0.008 },
  { name: 'Saturn',  texture: 'saturnmap.jpg',       radius: 0.12, speed: 0.007, ring: 'saturnringcolor.jpg' },
  { name: 'Uranus',  texture: 'uranusmap.jpg',        radius: 0.08, speed: 0.006, ring: 'uranusringcolour.jpg' },
  { name: 'Neptune', texture: 'neptunemap.jpg',      radius: 0.07, speed: 0.005 },
  { name: 'Pluto',   texture: 'plutomap1k.jpg',      radius: 0.02, speed: 0.004 },
];

// --- Menu logic ---
const selected = new Set();
const grid = document.getElementById('planet-grid');
const launchBtn = document.getElementById('launch-btn');

planetsData.forEach((p) => {
  const btn = document.createElement('div');
  btn.className = 'planet-btn';
  btn.textContent = p.name;
  btn.addEventListener('click', () => {
    if (selected.has(p.name)) {
      selected.delete(p.name);
      btn.classList.remove('selected');
    } else {
      selected.add(p.name);
      btn.classList.add('selected');
    }
    launchBtn.disabled = selected.size === 0;
  });
  grid.appendChild(btn);
});

document.getElementById('select-all').addEventListener('click', () => {
  grid.querySelectorAll('.planet-btn').forEach((btn) => btn.classList.add('selected'));
  planetsData.forEach((p) => selected.add(p.name));
  launchBtn.disabled = false;
});

document.getElementById('select-none').addEventListener('click', () => {
  grid.querySelectorAll('.planet-btn').forEach((btn) => btn.classList.remove('selected'));
  selected.clear();
  launchBtn.disabled = true;
});

// --- AR launch ---
const backBtn = document.getElementById('back-btn');
let cleanup = null;

launchBtn.addEventListener('click', () => {
  document.getElementById('menu').style.display = 'none';
  backBtn.style.display = 'flex';
  cleanup = startAR(planetsData.filter((p) => selected.has(p.name)));
});

backBtn.addEventListener('click', () => {
  if (cleanup) { cleanup(); cleanup = null; }
  backBtn.style.display = 'none';
  document.getElementById('menu').style.display = '';
});

function startAR(planets) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  const arButton = ARButton.createButton(renderer);
  document.body.appendChild(arButton);

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  const loader = new THREE.TextureLoader();
  const meshes = [];

  // Scale planets up when viewing fewer — keeps them prominent
  const isFullSystem = planets.length === planetsData.length;
  const minDisplay = 0.12; // minimum visible radius for non-Sun planets
  const scale = isFullSystem ? 1 : Math.min(4, 10 / planets.length);
  const spacing = isFullSystem ? 0.4 : 0.5 * scale;
  const totalWidth = (planets.length - 1) * spacing;
  const startX = -totalWidth / 2;

  planets.forEach((p, i) => {
    const r = isFullSystem ? p.radius : Math.max(p.radius * scale, minDisplay);
    const geo = new THREE.SphereGeometry(r, 32, 32);
    const tex = loader.load(`./assets/${p.texture}`);
    const mat = p.emissive
      ? new THREE.MeshBasicMaterial({ map: tex })
      : new THREE.MeshStandardMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(startX + i * spacing, 0, -2);
    scene.add(mesh);
    meshes.push({ mesh, speed: p.speed });

    if (p.ring) {
      const innerR = r * 1.3;
      const outerR = r * 2.2;
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 64);
      const ringTex = loader.load(`./assets/${p.ring}`);
      const ringMat = new THREE.MeshBasicMaterial({
        map: ringTex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2.5;
      mesh.add(ringMesh);
    }
  });

  // Touch-to-scale in live AR: use XR controller 'select' event
  const raycaster = new THREE.Raycaster();
  const scaledUp = new Set();
  const scaleTarget = 2.0;
  const allMeshes = meshes.map((m) => m.mesh);

  // XR controller for in-session taps
  const controller = renderer.xr.getController(0);
  scene.add(controller);

  controller.addEventListener('select', () => {
    // Controller ray: origin at controller position, direction forward (-Z in controller space)
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObjects(allMeshes);
    if (hits.length > 0) {
      const hit = hits[0].object;
      if (scaledUp.has(hit)) {
        hit.scale.set(1, 1, 1);
        scaledUp.delete(hit);
      } else {
        scaledUp.add(hit);
        hit.scale.set(scaleTarget, scaleTarget, scaleTarget);
      }
    }
  });

  // Drag-to-move planets on preview screen (touch + mouse)
  let dragTarget = null;
  let dragDepth = 0;
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const intersection = new THREE.Vector3();

  function getPointer(e) {
    const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    pointer.x = (x / window.innerWidth) * 2 - 1;
    pointer.y = -(y / window.innerHeight) * 2 + 1;
  }

  function onPointerDown(e) {
    if (renderer.xr.isPresenting) return;
    getPointer(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(allMeshes);
    if (hits.length > 0) {
      dragTarget = hits[0].object;
      // Create a plane facing the camera at the planet's depth
      dragPlane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()).negate(),
        dragTarget.position
      );
    }
  }

  function onPointerMove(e) {
    if (!dragTarget || renderer.xr.isPresenting) return;
    e.preventDefault();
    getPointer(e);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
      dragTarget.position.copy(intersection);
    }
  }

  function onPointerUp() {
    dragTarget = null;
  }

  renderer.domElement.addEventListener('touchstart', onPointerDown, { passive: true });
  renderer.domElement.addEventListener('touchmove', onPointerMove, { passive: false });
  renderer.domElement.addEventListener('touchend', onPointerUp);
  renderer.domElement.addEventListener('mousedown', onPointerDown);
  renderer.domElement.addEventListener('mousemove', onPointerMove);
  renderer.domElement.addEventListener('mouseup', onPointerUp);

  renderer.setAnimationLoop(() => {
    meshes.forEach(({ mesh, speed }) => { mesh.rotation.y += speed; });
    renderer.render(scene, camera);
  });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // Return cleanup function for back navigation
  return () => {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.domElement.remove();
    arButton.remove();
    window.removeEventListener('resize', onResize);
  };
}
