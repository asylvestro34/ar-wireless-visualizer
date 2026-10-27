import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  FT_TO_M,
  CELL_EDGE_DBM,
  distanceForRssi,
  formatDistance,
  legendGradientCss,
  LEGEND_LABELS,
} from './rfEngine.js';
import { AP_CATALOG, getApModel } from './apCatalog.js';
import { AccessPoint, COMPACT_LABEL } from './accessPoint.js';
import { ARController } from './arController.js';
import { SCENARIOS, ScenarioManager } from './scenarios.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_CAMERA = { pos: [9, 5, 11], target: [0, 1.8, 0] };

function init() {
  const container = $('canvas-container');
  const overlay = $('overlay');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const previewGrid = new THREE.GridHelper(40, 40, 0x049fd9, 0x1d3550);
  scene.add(previewGrid);

  const scenarios = new ScenarioManager(scene);
  const ap = new AccessPoint();
  scene.add(ap.root);

  // ---- UI helpers ----
  const ui = {
    status: $('status'),
    toast: $('toast'),
    diag: $('diag'),
    downtilt: $('downtilt'),
    height: $('height'),
    txpower: $('txpower'),
    modelSelect: $('ap-model'),
    scenarioSelect: $('scenario'),
  };
  let toastTimer = 0;
  const showToast = (msg, ms = 3500) => {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
  };
  const setStatus = (text, cls = '') => {
    if (ui.status.textContent === text && ui.status.className === `status ${cls}`.trim()) return;
    ui.status.textContent = text;
    ui.status.className = `status ${cls}`.trim();
  };

  const readHeightM = () => parseFloat(ui.height.value) * FT_TO_M;

  const syncLabels = () => {
    const ft = parseFloat(ui.height.value);
    $('downtilt-out').textContent = `${ui.downtilt.value}°`;
    $('height-out').textContent = `${ft % 1 ? ft.toFixed(1) : ft} ft (${(ft * FT_TO_M).toFixed(1)} m)`;
    $('txpower-out').textContent = `${ui.txpower.value} dBm`;
    $('ro-eirp').textContent = `${ap.eirp.toFixed(0)} dBm`;
    $('ro-data').textContent = formatDistance(distanceForRssi(ap.eirp, -67));
    $('ro-edge').textContent = formatDistance(distanceForRssi(ap.eirp, CELL_EDGE_DBM));
  };

  // Legend bar
  $('legend-bar').style.background = legendGradientCss();
  for (const { text, leftPct } of LEGEND_LABELS) {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.left = `${leftPct}%`;
    $('legend-labels').appendChild(span);
  }

  // ---- AP model / antenna controls ----
  const antennaButtons = [...document.querySelectorAll('[data-antenna]')];
  const highlightPattern = (type) => {
    for (const b of antennaButtons) {
      const active = b.dataset.antenna === type;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    }
  };

  for (const group of AP_CATALOG) {
    const og = document.createElement('optgroup');
    og.label = group.group;
    for (const m of group.models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      og.appendChild(opt);
    }
    ui.modelSelect.appendChild(og);
  }

  const applyModel = (model) => {
    ap.setAntenna(model.pattern, model.gainDbi, model.beamwidthDeg, model.name);
    ap.setTxPower(model.txDbm);
    ui.txpower.value = model.txDbm;
    highlightPattern(model.pattern);
    $('model-info').textContent =
      `${model.gainDbi} dBi · ${model.pattern === 'omni' ? 'omnidirectional' : `${model.beamwidthDeg}° beamwidth`} · ${model.txDbm} dBm TX (approx. 5 GHz)`;
    syncLabels();
  };

  ui.modelSelect.addEventListener('change', () => {
    const model = getApModel(ui.modelSelect.value);
    if (model) applyModel(model); // "Generic" keeps the current pattern
  });

  for (const btn of antennaButtons) {
    btn.addEventListener('click', () => {
      ap.setAntenna(btn.dataset.antenna);
      ui.modelSelect.value = '';
      $('model-info').textContent = 'Generic pattern';
      highlightPattern(btn.dataset.antenna);
      syncLabels();
    });
  }

  ui.downtilt.addEventListener('input', () => {
    ap.setDowntiltDeg(parseFloat(ui.downtilt.value));
    syncLabels();
  });
  ui.height.addEventListener('input', () => {
    const m = readHeightM();
    ap.setHeightM(m);
    if (scenarios.heightDrivesRoom && ap.mount === 'ceiling') scenarios.setHeight(m);
    syncLabels();
  });
  ui.txpower.addEventListener('input', () => {
    ap.setTxPower(parseFloat(ui.txpower.value));
    syncLabels();
  });

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

  // ---- Scenarios (desktop / non-AR preview) ----
  for (const s of SCENARIOS) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    ui.scenarioSelect.appendChild(opt);
  }

  const setCamera = ({ pos, target }) => {
    camera.position.set(...pos);
    controls.target.set(...target);
    controls.update();
  };

  const loadScenario = (id) => {
    const spec = scenarios.load(id);
    previewGrid.visible = !spec;
    $('scenario-info').textContent = spec ? spec.blurb : 'Open space with a reference grid.';

    if (!spec) {
      ap.placeAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), 'floor');
      setCamera(DEFAULT_CAMERA);
      return;
    }

    const cfg = spec.ap;
    ui.height.value = cfg.heightFt;
    ui.downtilt.value = cfg.tiltDeg;
    ui.modelSelect.value = cfg.model;
    ap.setHeightM(readHeightM());
    ap.setDowntiltDeg(cfg.tiltDeg);
    const model = getApModel(cfg.model);
    if (model) applyModel(model);

    const heightM = readHeightM();
    if (scenarios.heightDrivesRoom && cfg.mount === 'ceiling') scenarios.setHeight(heightM);
    ap.placeAt(new THREE.Vector3(cfg.x, heightM, cfg.z), new THREE.Vector3(...cfg.facing), cfg.mount, 0);
    setCamera(spec.camera);
    syncLabels();
  };

  ui.scenarioSelect.addEventListener('change', () => loadScenario(ui.scenarioSelect.value));

  // ---- Click / tap to place the AP on any surface in the preview ----
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const MIN_H_FT = parseFloat(ui.height.min);
  const MAX_H_FT = parseFloat(ui.height.max);
  let pointerStart = null;

  const placeFromPointer = (clientX, clientY) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    let point = null;
    const normal = new THREE.Vector3(0, 1, 0);
    const hit = scenarios.group ? raycaster.intersectObjects(scenarios.pickables(), false)[0] : null;
    if (hit) {
      point = hit.point.clone();
      normal.copy(hit.face.normal).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
      if (normal.dot(raycaster.ray.direction) > 0) normal.negate(); // face the viewer
    } else {
      point = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
    }
    if (!point) return;

    const surface = normal.y > 0.7 ? 'floor' : normal.y < -0.7 ? 'ceiling' : 'wall';
    const facing = new THREE.Vector3();
    if (surface === 'wall') facing.set(normal.x, 0, normal.z);
    else facing.copy(ap.facing).setY(0);
    if (facing.lengthSq() < 1e-6) facing.set(0, 0, -1);
    facing.normalize();

    if (surface === 'floor') {
      ap.placeAt(point, facing, 'floor', point.y);
    } else {
      // Wall / ceiling: the AP goes exactly where you clicked, so the height follows the click.
      const h = Math.max(point.y, 0.3);
      ap.heightM = h;
      ui.height.value = THREE.MathUtils.clamp(h / FT_TO_M, MIN_H_FT, MAX_H_FT).toFixed(1);
      ap.placeAt(point, facing, surface, 0);
      if (surface === 'ceiling' && scenarios.heightDrivesRoom) scenarios.setHeight(h);
    }
    syncLabels();
    setStatus(`AP placed on ${surface === 'floor' ? 'pole (floor)' : surface}`, 'ok');
  };

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    pointerStart = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!pointerStart || ar.isPresenting) return;
    const moved = Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y);
    const quick = performance.now() - pointerStart.t < 400;
    pointerStart = null;
    if (moved < 6 && quick) placeFromPointer(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; });

  // ---- AR ----
  const arStatus = { lastText: '', lastDiag: 0 };

  const placeAheadOfUser = () => {
    const cam = renderer.xr.getCamera();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();

    // Assume a local-floor reference space (floor at y = 0) unless the camera height says otherwise.
    const floorY = origin.y > 0.7 && origin.y < 2.3 ? 0 : origin.y - 1.4;
    const position = new THREE.Vector3(origin.x + dir.x * 2.5, floorY, origin.z + dir.z * 2.5);
    ap.placeAt(position, dir.clone().negate(), 'floor');
    setStatus('AP placed 2.5 m ahead (manual)', 'ok');
    showToast('AP placed ahead of you at the mounting height. Tap a real surface any time to re-anchor it.');
  };

  const ar = new ARController({
    renderer,
    scene,
    overlayRoot: overlay,
    onPlace: ({ position, normal, surface }) => {
      const facing = new THREE.Vector3();
      if (surface === 'wall') {
        facing.set(normal.x, 0, normal.z); // horizontal, pointing out of the wall into the room
      } else {
        renderer.xr.getCamera().getWorldDirection(facing);
        facing.y = 0;
      }
      if (facing.lengthSq() < 1e-6) facing.set(0, 0, -1);
      facing.normalize();

      ap.placeAt(position, facing, surface);
      setStatus(`AP placed on ${surface}`, 'ok');
      showToast(
        surface === 'wall'
          ? 'AP mounted on the wall. Use Downtilt to angle it; the pattern is cut at the wall.'
          : surface === 'floor'
            ? 'Floor tapped. The AP floats at the mounting height above that spot.'
            : 'AP anchored to the ceiling. Adjust height, tilt and power below.'
      );
    },
    onSessionStart: () => {
      document.body.classList.add('in-ar');
      scenarios.setActive(false);
      previewGrid.visible = false;
      controls.enabled = false;
      ap.hide();
      setStatus('Scanning… move the phone slowly', 'warn');
      showToast('Point at a wall, ceiling or floor. When the reticle appears, tap to place the AP.', 5000);
    },
    onSessionEnd: () => {
      document.body.classList.remove('in-ar');
      scenarios.setActive(true);
      previewGrid.visible = !scenarios.spec;
      controls.enabled = true;
      ui.diag.textContent = '';
      loadScenario(ui.scenarioSelect.value);
      setStatus('Preview mode', '');
      onResize();
    },
    onMessage: (msg) => showToast(msg, 4000),
  });

  $('place-ahead-btn').addEventListener('click', placeAheadOfUser);

  $('scale-btn').addEventListener('click', () => {
    ap.setCompact(!ap.compact);
    $('scale-btn').textContent = ap.compact ? `Size: ${COMPACT_LABEL}` : 'Size: True scale';
    showToast(ap.compact ? 'Bubble compressed to fit a room. Readouts show true ranges.' : 'Bubble drawn at true model range.');
  });

  $('reset-btn').addEventListener('click', () => {
    if (ar.isPresenting) {
      ap.hide();
      setStatus('Scanning… tap a surface to place the AP', 'warn');
    } else {
      loadScenario(ui.scenarioSelect.value);
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
  const requested = new URLSearchParams(location.search).get('scenario');
  const startId = SCENARIOS.some((s) => s.id === requested) ? requested : SCENARIOS[0].id;
  ui.scenarioSelect.value = startId; // default to a scenario for a more immersive preview
  loadScenario(startId);

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
    const now = clock.getElapsedTime();
    ar.update(frame);
    ap.update(now);

    if (ar.isPresenting) {
      if (!ap.placed) {
        const hint = ar.reticleSurface
          ? `${ar.reticleSurface[0].toUpperCase()}${ar.reticleSurface.slice(1)} detected · tap to place AP`
          : 'Scanning… move the phone slowly';
        setStatus(hint, ar.reticleSurface ? 'ok' : 'warn');
      }
      if (now - arStatus.lastDiag > 0.5) {
        arStatus.lastDiag = now;
        ui.diag.textContent = ar.diagnostics();
      }
    } else {
      controls.update();
    }
    renderer.render(scene, camera);
  });
}

init();
