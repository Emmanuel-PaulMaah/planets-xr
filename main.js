import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/webxr/ARButton.js';
import { USDZExporter } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/exporters/USDZExporter.js';

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

// --- Device detection ---
// iOS Safari (and iPadOS, which reports as MacIntel with touch) does not support WebXR immersive-ar.
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Update launch button label so iOS users know what to expect (ARKit / AR Quick Look)
if (isIOS) launchBtn.textContent = 'View in AR (Quick Look)';

// --- AR launch ---
const backBtn = document.getElementById('back-btn');
let cleanup = null;

launchBtn.addEventListener('click', () => {
  const chosen = planetsData.filter((p) => selected.has(p.name));
  if (isIOS) {
    // iOS uses ARKit via AR Quick Look â€” no WebXR, no canvas swap.
    // The function manages its own overlay UI.
    startIOSAR(chosen);
    return;
  }
  document.getElementById('menu').style.display = 'none';
  backBtn.style.display = 'flex';
  cleanup = startAR(chosen);
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
  renderer.domElement.style.touchAction = 'none';
  document.body.appendChild(renderer.domElement);
  const arButton = ARButton.createButton(renderer);
  document.body.appendChild(arButton);

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  const loader = new THREE.TextureLoader();
  const meshes = [];

  // Scale planets up when viewing fewer â€” keeps them prominent
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

  // Drag-to-move planets on preview screen (pointer events)
  let dragTarget = null;
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const intersection = new THREE.Vector3();
  const canvas = renderer.domElement;

  function toNDC(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  function onPointerDown(e) {
    if (renderer.xr.isPresenting) return;
    toNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(allMeshes);
    if (hits.length > 0) {
      dragTarget = hits[0].object;
      canvas.setPointerCapture(e.pointerId);
      dragPlane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()).negate(),
        dragTarget.position
      );
    }
  }

  function onPointerMove(e) {
    if (!dragTarget || renderer.xr.isPresenting) return;
    toNDC(e);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
      dragTarget.position.copy(intersection);
    }
  }

  function onPointerUp(e) {
    if (dragTarget) {
      canvas.releasePointerCapture(e.pointerId);
      dragTarget = null;
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

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


// --- iOS AR Quick Look (ARKit) ---
// iOS Safari has no WebXR. The platform AR runtime is ARKit, exposed to the web
// through "AR Quick Look": Safari intercepts a click on an <a rel="ar"> whose
// href points to a .usdz (or .reality) file and opens the system AR viewer.
//
// We build the selected planets in three.js and convert the scene to USDZ on the
// fly with three.js's USDZExporter, then trigger AR Quick Look. The user then
// places, scales, and walks around the model with real ARKit world tracking.
async function startIOSAR(planets) {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:1rem;padding:1rem;text-align:center;' +
    'background:#0b0d17;color:#fff;font-family:inherit;font-size:1.05rem;z-index:2000;';
  overlay.innerHTML = '<div>Preparing AR scene…</div>';
  document.body.appendChild(overlay);

  const restore = (url) => {
    if (url) URL.revokeObjectURL(url);
    overlay.remove();
  };

  try {
    const scene = new THREE.Scene();
    const loader = new THREE.TextureLoader();
    const loadTex = (path) =>
      new Promise((resolve, reject) => {
        loader.load(
          path,
          (t) => {
            if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
            else t.encoding = THREE.sRGBEncoding;
            resolve(t);
          },
          undefined,
          reject
        );
      });

    const isFullSystem = planets.length === planetsData.length;
    const minDisplay = 0.12;
    const scaleFactor = isFullSystem ? 1 : Math.min(4, 10 / planets.length);
    const spacing = isFullSystem ? 0.4 : 0.5 * scaleFactor;
    const totalWidth = (planets.length - 1) * spacing;
    const startX = -totalWidth / 2;

    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const r = isFullSystem ? p.radius : Math.max(p.radius * scaleFactor, minDisplay);
      const tex = await loadTex(`./assets/${p.texture}`);
      // USDZExporter only supports MeshStandardMaterial / MeshPhysicalMaterial.
      const matOpts = { map: tex, roughness: 1, metalness: 0 };
      if (p.emissive) {
        matOpts.emissive = new THREE.Color(0xffffff);
        matOpts.emissiveMap = tex;
        matOpts.emissiveIntensity = 1;
      }
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 64, 64),
        new THREE.MeshStandardMaterial(matOpts)
      );
      mesh.position.set(startX + i * spacing, 0, 0);
      scene.add(mesh);

      if (p.ring) {
        const ringTex = await loadTex(`./assets/${p.ring}`);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.3, r * 2.2, 64),
          new THREE.MeshStandardMaterial({
            map: ringTex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            roughness: 1,
            metalness: 0,
          })
        );
        ring.rotation.x = -Math.PI / 2.5;
        mesh.add(ring);
      }
    }

    const exporter = new USDZExporter();
    const buffer = await exporter.parse(scene);
    const blob = new Blob([buffer], { type: 'model/vnd.usdz+zip' });
    const url = URL.createObjectURL(blob);

    // AR Quick Look anchor: Safari intercepts clicks on <a rel="ar"> with an <img> child.
    const link = document.createElement('a');
    link.rel = 'ar';
    link.href = `${url}#allowsContentScaling=0`;
    link.style.cssText =
      'background:#1a6eff;color:#fff;padding:0.9rem 2rem;border-radius:8px;' +
      'font-size:1.05rem;text-decoration:none;display:inline-flex;align-items:center;gap:0.5rem;';
    const placeholder = document.createElement('img');
    placeholder.alt = '';
    placeholder.style.cssText = 'width:0;height:0;display:none;';
    link.appendChild(placeholder);
    link.appendChild(document.createTextNode('Open in AR'));

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.cssText =
      'background:none;border:1px solid #555;color:#aaa;padding:0.4rem 1rem;' +
      'border-radius:6px;cursor:pointer;font-size:0.85rem;';
    cancel.addEventListener('click', () => restore(url));

    overlay.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = 'Tap to open in AR Quick Look';
    overlay.appendChild(title);
    overlay.appendChild(link);
    overlay.appendChild(cancel);

    // Dismissing AR Quick Look returns the user here — clean up the overlay.
    link.addEventListener('click', () => {
      setTimeout(() => restore(url), 500);
    });
  } catch (err) {
    overlay.innerHTML = `<div>Failed to prepare AR: ${(err && err.message) || err}</div>`;
    setTimeout(() => restore(), 2500);
  }
}