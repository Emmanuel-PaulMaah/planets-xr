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
launchBtn.addEventListener('click', () => {
  document.getElementById('menu').style.display = 'none';
  startAR(planetsData.filter((p) => selected.has(p.name)));
});

function startAR(planets) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(ARButton.createButton(renderer));

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  const loader = new THREE.TextureLoader();
  const meshes = [];

  // Lay out selected planets with even spacing
  const spacing = 0.4;
  const totalWidth = (planets.length - 1) * spacing;
  const startX = -totalWidth / 2;

  planets.forEach((p, i) => {
    const geo = new THREE.SphereGeometry(p.radius, 32, 32);
    const tex = loader.load(`./assets/${p.texture}`);
    const mat = p.emissive
      ? new THREE.MeshBasicMaterial({ map: tex })
      : new THREE.MeshStandardMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(startX + i * spacing, 0, -2);
    scene.add(mesh);
    meshes.push({ mesh, speed: p.speed });

    if (p.ring) {
      const innerR = p.radius * 1.3;
      const outerR = p.radius * 2.2;
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

  renderer.setAnimationLoop(() => {
    meshes.forEach(({ mesh, speed }) => { mesh.rotation.y += speed; });
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
