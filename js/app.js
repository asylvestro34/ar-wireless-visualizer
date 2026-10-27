import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  FT_TO_M,
  CELL_EDGE_DBM,
  SHELL_THRESHOLDS_DBM,
  distanceForRssi,
  eirpDbm,
  formatDistance,
  legendGradientCss,
  LEGEND_LABELS,
} from './rfEngine.js';
import { ANTENNA_TYPES, getAntennaGeometry, createApBody } from './antennaPatterns.js';
import { createRfMaterial } from './shaderMaterial.js';
import { ARController } from './arController.js';

const $ = (id) => document.getElementById(id);

// With n = 2.8 the -75 dBm contour is >100 m at typical power, so the default view compresses it.
const COMPACT_MAX_RADIUS_M = 12;

/** A virtual AP: mounting node + tiltable group of concentric RF shells. */
class AccessPoint {
  constructor() {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    this.root.add(createApBody());
    this.root.visible = false;

    this.antenna = 'omni';
    this.compact = true;
    this.displayFactor = 1;
    this.txPower = 20;
    this.floorY = 0;
    this.heightM = 3.05;

    this.shells = SHELL_THRESHOLDS_DBM.map((threshold, i) => {
      const outer = i === SHELL_THRESHOLDS_DBM.length - 1;
      const material = createRfMaterial({ opacity: outer ? 0.35 : 0.22 });
      const mesh = new THREE.Mesh(getAntennaGeometry(this.antenna), material);
      mesh.renderOrder = SHELL_THRESHOLDS_DBM.length - i; // outer shells draw first
      mesh.frustumCulled = false;
      this.tilt.add(mesh);
      return { threshold, mesh, material };
    });

    this.refresh();
  }

  get eirp() {
    return eirpDbm(this.txPower, ANTENNA_TYPES[this.antenna].gainDbi);
  }

  // Resize every shell to the distance at which its RSSI threshold is reached.
  // In compact mode all shells shrink by one common factor so the outer shell fits a room;
  // colours still use the true distance (uScale), only the drawn size is compressed.
  refresh() {
    const eirp = this.eirp;
    const outer = distanceForRssi(eirp, SHELL_THRESHOLDS_DBM[SHELL_THRESHOLDS_DBM.length - 1]);
    this.displayFactor = this.compact ? Math.min(1, COMPACT_MAX_RADIUS_M / outer) : 1;
    for (const { threshold, mesh, material } of this.shells) {
      const radius = distanceForRssi(eirp, threshold);
      mesh.scale.setScalar(radius * this.displayFactor);
      material.uniforms.uEirp.value = eirp;
      material.uniforms.uScale.value = radius;
    }
  }

  setCompact(compact) {
    this.compact = compact;
    this.refresh();
  }

  setAntenna(type) {
    this.antenna = type;
    const geometry = getAntennaGeometry(type);
    for (const { mesh } of this.shells) mesh.geometry = geometry;
    this.refresh();
  }

  setTxPower(dbm) {
    this.txPower = dbm;
    this.refresh();
  }

  setDowntiltDeg(deg) {
    this.tilt.rotation.x = -THREE.MathUtils.degToRad(deg);
  }

  setHeightM(m) {
    this.heightM = m;
    this.root.position.y = this.floorY + m;
  }

  // Anchor at a world position; yaw rotates boresight (-Z) towards the given horizontal direction.
  placeAt(position, facing, anchoredToFloor) {
    this.floorY = anchoredToFloor ? position.y : position.y - this.heightM;
    this.root.position.set(position.x, anchoredToFloor ? this.floorY + this.heightM : position.y, position.z);
    this.root.rotation.y = Math.atan2(-facing.x, -facing.z);
    this.root.visible = true;
  }

  update(time) {
    for (const { material } of this.shells) material.uniforms.uTime.value = time;
  }
}

function init() {
  const container = $('canvas-container');
  const overlay = $('overlay');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.position.set(9, 5, 11);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const previewGrid = new THREE.GridHelper(40, 40, 0x049fd9, 0x1d3550);
  scene.add(previewGrid);

  const ap = new AccessPoint();
  scene.add(ap.root);

  // ---- UI state ----
  const ui = {
    status: $('status'),
    toast: $('toast'),
    downtilt: $('downtilt'),
    height: $('height'),
    txpower: $('txpower'),
  };
  let toastTimer = 0;
  const showToast = (msg, ms = 3500) => {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
  };
  const setStatus = (text, cls = '') => {
    ui.status.textContent = text;
    ui.status.className = `status ${cls}`.trim();
  };

  const updateReadout = () => {
    $('ro-eirp').textContent = `${ap.eirp.toFixed(0)} dBm`;
    $('ro-data').textContent = formatDistance(distanceForRssi(ap.eirp, -67));
    $('ro-edge').textContent = formatDistance(distanceForRssi(ap.eirp, CELL_EDGE_DBM));
  };

  const readHeightM = () => parseFloat(ui.height.value) * FT_TO_M;

  const syncLabels = () => {
    const ft = parseFloat(ui.height.value);
    $('downtilt-out').textContent = `${ui.downtilt.value}°`;
    $('height-out').textContent = `${ft % 1 ? ft.toFixed(1) : ft} ft (${(ft * FT_TO_M).toFixed(1)} m)`;
    $('txpower-out').textContent = `${ui.txpower.value} dBm`;
    updateReadout();
  };

  // Legend bar
  $('legend-bar').style.background = legendGradientCss();
  const labels = $('legend-labels');
  for (const { text, leftPct } of LEGEND_LABELS) {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.left = `${leftPct}%`;
    labels.appendChild(span);
  }

  // Controls
  ui.downtilt.addEventListener('input', () => {
    ap.setDowntiltDeg(parseFloat(ui.downtilt.value));
    syncLabels();
  });
  ui.height.addEventListener('input', () => {
    ap.setHeightM(readHeightM());
    syncLabels();
  });
  ui.txpower.addEventListener('input', () => {
    ap.setTxPower(parseFloat(ui.txpower.value));
    syncLabels();
  });

  const antennaButtons = [...document.querySelectorAll('[data-antenna]')];
  for (const btn of antennaButtons) {
    btn.addEventListener('click', () => {
      ap.setAntenna(btn.dataset.antenna);
      for (const b of antennaButtons) {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncLabels();
    });
  }

  const panel = $('panel');
  const toggle = $('panel-toggle');
  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Expand controls' : 'Collapse controls');
  });

  // Taps on the HUD must not count as AR placement taps.
  for (const el of overlay.children) {
    el.addEventListener('beforexrselect', (e) => e.preventDefault());
  }

  // ---- Placement ----
  const placePreview = () => {
    ap.placeAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), true);
    controls.target.set(0, ap.heightM * 0.6, 0);
    controls.update();
  };

  const ar = new ARController({
    renderer,
    scene,
    overlayRoot: overlay,
    onPlace: ({ position, normal, surface }) => {
      const facing = new THREE.Vector3();
      if (surface === 'wall') {
        facing.set(normal.x, 0, normal.z);
      } else {
        renderer.xr.getCamera().getWorldDirection(facing);
        facing.y = 0;
      }
      if (facing.lengthSq() < 1e-6) facing.set(0, 0, -1);
      facing.normalize();

      ap.placeAt(position, facing, surface === 'floor');
      setStatus(`AP placed on ${surface}`, 'ok');
      showToast(
        surface === 'floor'
          ? 'Floor set. AP is raised to the mounting height. Tap again to move.'
          : 'AP anchored. Adjust height, tilt and power below.'
      );
    },
    onSessionStart: () => {
      previewGrid.visible = false;
      controls.enabled = false;
      ap.root.visible = false;
      setStatus('Scan, then tap a ceiling, wall or floor', 'warn');
      showToast('Move your phone slowly to detect surfaces, then tap to anchor the AP.', 5000);
    },
    onSessionEnd: () => {
      previewGrid.visible = true;
      controls.enabled = true;
      camera.position.set(9, 5, 11);
      placePreview();
      setStatus('Preview mode', '');
      onResize();
    },
    onMessage: (msg) => showToast(msg, 4000),
  });

  $('scale-btn').addEventListener('click', () => {
    ap.setCompact(!ap.compact);
    $('scale-btn').textContent = ap.compact ? 'Size: Compact (12 m)' : 'Size: True scale';
    showToast(ap.compact ? 'Bubble compressed to fit a room. Readouts show true ranges.' : 'Bubble drawn at true model range.');
  });

  $('reset-btn').addEventListener('click', () => {
    if (ar.isPresenting) {
      ap.root.visible = false;
      setStatus('Tap a surface to place the AP', 'warn');
    } else {
      placePreview();
    }
  });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ---- Boot ----
  ap.setHeightM(readHeightM());
  syncLabels();
  placePreview();

  ARController.isSupported().then((supported) => {
    if (supported) {
      $('ar-button-slot').appendChild(ar.createButton());
      setStatus('Preview mode · tap START AR', '');
    } else {
      setStatus('WebXR AR unavailable · preview mode', 'warn');
      showToast('WebXR AR is not supported here. Use Chrome on an ARCore Android device. Showing 3D preview.', 6000);
    }
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop((_, frame) => {
    ar.update(frame);
    ap.update(clock.getElapsedTime());
    if (!ar.isPresenting) controls.update();
    renderer.render(scene, camera);
  });
}

init();
