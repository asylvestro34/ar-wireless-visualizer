import * as THREE from 'three';

// Procedural test scenarios for the desktop / non-AR preview. Units are metres, floor at y = 0.
// Each scenario returns { group, update(heightM), background?, fog? } from build().
// `ap` describes the default AP mount: ceiling / wall / pole, position (x, z), outward facing.

function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function addBox(group, w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function addLights(group, intensity = 1) {
  group.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5 * intensity));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6 * intensity);
  sun.position.set(8, 14, 6);
  group.add(sun);
}

function floorPlane(w, d, material, x = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), material);
  mesh.position.set(x, 0, z);
  return mesh;
}

// Vertical plane with its base on y = 0 whose height follows the ceiling (scaled by update()).
function tallWall(width, material, x, z, rotY) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 1).translate(0, 0.5, 0), material);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = rotY;
  return mesh;
}

// ---------------------------------------------------------------- textures
const tileTexture = (a, b, repeatX, repeatY) =>
  canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = a; c.fillRect(0, 0, w, h);
    c.fillStyle = b; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
  }, repeatX, repeatY);

const ceilingTexture = (repeatX, repeatY) =>
  canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = '#e9edf1'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(120,130,140,0.35)';
    for (let i = 0; i < 400; i++) c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    c.strokeStyle = '#8a95a0'; c.lineWidth = 4; c.strokeRect(0, 0, w, h);
  }, repeatX, repeatY);

const lockerTexture = (repeatX) =>
  canvasTexture(256, 256, (c, w, h) => {
    const colors = ['#2a6fb0', '#2a6fb0', '#b8c2cc', '#b8c2cc'];
    colors.forEach((col, i) => {
      const x = (i * w) / 4;
      c.fillStyle = col; c.fillRect(x, 0, w / 4, h);
      c.strokeStyle = '#1b2733'; c.lineWidth = 3; c.strokeRect(x + 2, 2, w / 4 - 4, h - 4);
      c.fillStyle = '#1b2733';
      for (let v = 0; v < 5; v++) c.fillRect(x + 12, 20 + v * 7, w / 4 - 24, 2);
      c.fillRect(x + w / 4 - 16, h / 2, 5, 22);
    });
  }, repeatX, 1);

const brickTexture = (repeatX, repeatY) =>
  canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#7b4a3a'; c.fillRect(0, 0, w, h);
    const bh = h / 8;
    const bw = w / 4;
    for (let r = 0; r < 8; r++) {
      for (let i = -1; i < 5; i++) {
        const shade = 150 + Math.floor(Math.random() * 50);
        c.fillStyle = `rgb(${shade},${Math.floor(shade * 0.5)},${Math.floor(shade * 0.38)})`;
        c.fillRect(i * bw + (r % 2) * (bw / 2) + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
  }, repeatX, repeatY);

const grassTexture = (repeatX, repeatY, striped) =>
  canvasTexture(256, 256, (c, w, h) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = striped ? (i % 2 ? '#2e8b3e' : '#37a049') : (i % 2 ? '#3a8f3c' : '#3f9a42');
      c.fillRect(0, (i * h) / 8, w, h / 8);
    }
  }, repeatX, repeatY);

// ---------------------------------------------------------------- hallway
function buildHallway() {
  const g = new THREE.Group();
  addLights(g, 0.9);
  const L = 40;
  const W = 3.2;
  const tall = [];
  const lights = [];

  g.add(floorPlane(W, L, lambert(0xffffff, { map: tileTexture('#cfd6dc', '#b6bfc7', W / 0.6 / 2, L / 0.6 / 2) })));

  const wallMat = lambert(0xe6e2d6, { side: THREE.DoubleSide });
  tall.push(tallWall(L, wallMat, -W / 2, 0, Math.PI / 2));
  tall.push(tallWall(L, wallMat, W / 2, 0, -Math.PI / 2));
  tall.push(tallWall(W, wallMat, 0, -L / 2, 0));
  tall.push(tallWall(W, wallMat, 0, L / 2, Math.PI));
  tall.forEach((m) => g.add(m));

  // Lockers on both walls, doors every 8 m
  const lockerMat = lambert(0xffffff, { map: lockerTexture(L / 1.2), side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.9).translate(0, 0.95, 0), lockerMat);
    strip.position.set(side * (W / 2 - 0.02), 0, 0);
    strip.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(strip);
  }
  const doorMat = lambert(0x8a5a2b);
  for (let z = -16; z <= 16; z += 8) {
    for (const side of [-1, 1]) {
      const door = addBox(g, 0.06, 2.1, 1.0, doorMat, side * (W / 2 - 0.05), 1.05, z);
      door.position.x = side * (W / 2 - 0.045);
    }
  }

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L).rotateX(Math.PI / 2),
    lambert(0xffffff, { map: ceilingTexture(W / 0.6, L / 0.6), side: THREE.DoubleSide })
  );
  g.add(ceiling);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
  for (let z = -18; z <= 18; z += 4) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2).rotateX(Math.PI / 2), panelMat);
    panel.position.set(0, 3, z);
    g.add(panel);
    lights.push(panel);
  }

  const windowEnd = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xbfe6ff }));
  windowEnd.position.set(0, 1.6, -L / 2 + 0.02);
  g.add(windowEnd);

  return {
    group: g,
    background: 0x10161f,
    heightDrives: 'room',
    update(h) {
      tall.forEach((m) => { m.scale.y = h; });
      ceiling.position.y = h;
      lights.forEach((p) => { p.position.y = h - 0.01; });
    },
  };
}

// ---------------------------------------------------------------- classroom
function buildClassroom() {
  const g = new THREE.Group();
  addLights(g, 0.9);
  const W = 9;
  const D = 8;
  const tall = [];

  g.add(floorPlane(W, D, lambert(0xffffff, { map: tileTexture('#b9a98c', '#a99a7d', W / 0.9 / 2, D / 0.9 / 2) })));

  const wallMat = lambert(0xefeadf, { side: THREE.DoubleSide });
  tall.push(tallWall(D, wallMat, -W / 2, 0, Math.PI / 2));
  tall.push(tallWall(D, wallMat, W / 2, 0, -Math.PI / 2));
  tall.push(tallWall(W, wallMat, 0, -D / 2, 0));
  tall.push(tallWall(W, wallMat, 0, D / 2, Math.PI));
  tall.forEach((m) => g.add(m));

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2),
    lambert(0xffffff, { map: ceilingTexture(W / 0.6, D / 0.6), side: THREE.DoubleSide })
  );
  g.add(ceiling);

  // Whiteboard and teacher desk (front wall, -Z)
  addBox(g, 4, 1.2, 0.04, lambert(0xffffff), 0, 1.6, -D / 2 + 0.03);
  addBox(g, 4.1, 0.05, 0.05, lambert(0x555f69), 0, 0.98, -D / 2 + 0.05);
  addBox(g, 1.6, 0.75, 0.7, lambert(0x8a6a44), -2.5, 0.375, -D / 2 + 1.0);

  // Windows on the +X wall
  const glass = new THREE.MeshBasicMaterial({ color: 0x9fd4f5, transparent: true, opacity: 0.8 });
  for (const z of [-2.4, 0, 2.4]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), glass);
    win.position.set(W / 2 - 0.02, 1.7, z);
    win.rotation.y = -Math.PI / 2;
    g.add(win);
  }
  addBox(g, 0.06, 2.1, 1.0, lambert(0x8a5a2b), -W / 2 + 0.04, 1.05, 2.8); // door

  // Desk grid: 4 columns x 4 rows
  const deskTop = lambert(0xd9b98a);
  const metal = lambert(0x6b7682);
  const chairMat = lambert(0x2a6fb0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      const x = -2.7 + col * 1.8;
      const z = -1.4 + row * 1.5;
      addBox(g, 1.1, 0.04, 0.6, deskTop, x, 0.74, z);
      for (const [dx, dz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) {
        addBox(g, 0.04, 0.72, 0.04, metal, x + dx, 0.36, z + dz);
      }
      addBox(g, 0.42, 0.04, 0.42, chairMat, x, 0.45, z + 0.62);
      addBox(g, 0.42, 0.4, 0.04, chairMat, x, 0.68, z + 0.83);
    }
  }

  return {
    group: g,
    background: 0x10161f,
    heightDrives: 'room',
    update(h) {
      tall.forEach((m) => { m.scale.y = h; });
      ceiling.position.y = h;
    },
  };
}

// ---------------------------------------------------------------- outdoor wall
function buildOutdoorWall() {
  const g = new THREE.Group();
  addLights(g, 1.1);

  const wall = addBox(g, 26, 7, 0.5, lambert(0xffffff, { map: brickTexture(26 / 1.6, 7 / 1.6) }), 0, 3.5, -0.25);
  wall.name = 'wall';
  addBox(g, 26.4, 0.35, 0.8, lambert(0xc9c4b8), 0, 7.1, -0.3); // cornice
  const glass = new THREE.MeshLambertMaterial({ color: 0x3c5a78 });
  for (const x of [-8, -3, 3, 8]) {
    addBox(g, 1.6, 1.8, 0.1, lambert(0xe8e4da), x, 4.6, 0.02);
    addBox(g, 1.4, 1.6, 0.12, glass, x, 4.6, 0.04);
  }
  addBox(g, 1.8, 2.5, 0.12, lambert(0x2d3a4a), 10.5, 1.25, 0.04); // door
  addBox(g, 0.12, 6.4, 0.12, lambert(0x8d949b), -12.2, 3.2, 0.1); // downspout

  g.add(floorPlane(120, 120, lambert(0xffffff, { map: grassTexture(40, 40, false) }), 0, 50));
  const walk = floorPlane(26, 4, lambert(0xb8b6ae), 0, 2);
  walk.position.y = 0.01;
  g.add(walk);
  const lot = floorPlane(60, 18, lambert(0x3b3f45), 0, 15);
  lot.position.y = 0.012;
  g.add(lot);

  const trunk = lambert(0x6b4a2b);
  const leaves = lambert(0x2f7d32);
  for (const [x, z, s] of [[-9, 8, 1.0], [9, 7, 1.2], [-15, 12, 0.9]]) {
    addBox(g, 0.35 * s, 3 * s, 0.35 * s, trunk, x, 1.5 * s, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9 * s, 1), leaves);
    crown.position.set(x, 4.2 * s, z);
    g.add(crown);
  }
  addBox(g, 1.8, 0.08, 0.5, lambert(0x8a6a44), -5, 0.5, 1.8); // bench
  addBox(g, 1.8, 0.45, 0.06, lambert(0x8a6a44), -5, 0.8, 2.05);
  addBox(g, 0.08, 0.5, 0.4, lambert(0x333a40), -5.8, 0.25, 1.8);
  addBox(g, 0.08, 0.5, 0.4, lambert(0x333a40), -4.2, 0.25, 1.8);
  const carBody = lambert(0xb23a3a);
  addBox(g, 1.9, 0.8, 4.4, carBody, 6, 0.6, 13);
  addBox(g, 1.7, 0.6, 2.2, lambert(0x2b3a4a), 6, 1.25, 13);

  return { group: g, background: 0x8ec9f0, fog: [0x8ec9f0, 40, 120], update() {} };
}

// ---------------------------------------------------------------- football bleachers
function buildBleachers() {
  const g = new THREE.Group();
  addLights(g, 1.15);

  g.add(floorPlane(120, 80, lambert(0xffffff, { map: grassTexture(2, 8, true) })));

  // Field lines
  const line = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let x = -20; x <= 20; x += 5) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 48).rotateX(-Math.PI / 2), line);
    l.position.set(x, 0.02, 0);
    g.add(l);
  }
  const sidelineA = new THREE.Mesh(new THREE.PlaneGeometry(48, 0.15).rotateX(-Math.PI / 2), line);
  sidelineA.position.set(0, 0.02, -24);
  const sidelineB = sidelineA.clone();
  sidelineB.position.z = 24;
  g.add(sidelineA, sidelineB);

  // Bleachers on the +X side, rising away from the field
  const seat = lambert(0xc3c8cf);
  const riser = lambert(0x8e969f);
  const rows = 14;
  for (let i = 0; i < rows; i++) {
    const x = 12 + i * 0.9;
    const h = 0.45 * (i + 1);
    addBox(g, 0.9, h, 36, riser, x + 0.45, h / 2, 0);
    addBox(g, 0.42, 0.06, 36, seat, x + 0.55, h + 0.03, 0);
  }
  addBox(g, 0.05, 1.1, 36, lambert(0x2a6fb0), 12.0, 0.55, 0); // front rail
  // Spectators
  const shirts = [0xd32f2f, 0x1976d2, 0xffffff, 0xfbc02d];
  for (let i = 1; i < rows; i += 2) {
    for (let z = -16; z <= 16; z += 2.2) {
      const mat = lambert(shirts[(i + Math.round(z)) & 3]);
      const x = 12.6 + i * 0.9;
      const baseY = 0.45 * (i + 1) + 0.06;
      addBox(g, 0.3, 0.5, 0.4, mat, x, baseY + 0.3, z);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), lambert(0xe0b08a));
      head.position.set(x, baseY + 0.7, z);
      g.add(head);
    }
  }

  // Goal posts
  const post = lambert(0xffd600);
  addBox(g, 0.12, 4, 0.12, post, -30, 2, 0);
  addBox(g, 0.12, 0.12, 5.6, post, -30, 3.4, 0);
  addBox(g, 0.1, 3.2, 0.1, post, -30, 5.0, -2.8);
  addBox(g, 0.1, 3.2, 0.1, post, -30, 5.0, 2.8);

  // Stadium light towers
  for (const z of [-22, 22]) {
    addBox(g, 0.4, 20, 0.4, lambert(0x8d949b), 28, 10, z);
    addBox(g, 1.0, 1.6, 3, new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), 27.5, 20.5, z);
  }

  // Light pole carrying the AP: its height follows the mounting-height slider
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1, 12).translate(0, 0.5, 0), lambert(0x6b7682));
  pole.position.set(7.2, 0, 0);
  pole.scale.y = 6.1;
  g.add(pole);

  return {
    group: g,
    background: 0x87ceeb,
    fog: [0x87ceeb, 60, 160],
    update() {},
  };
}

export const SCENARIOS = [
  {
    id: 'hallway',
    name: 'School hallway',
    blurb: 'Ceiling-mounted AP in a 3 m wide corridor with lockers and classroom doors.',
    build: buildHallway,
    ap: { mount: 'ceiling', x: 0, z: 0, facing: [0, 0, -1], heightFt: 10, model: 'cw9166i', tiltDeg: 0 },
    camera: { pos: [0.9, 1.7, 9], target: [0, 1.6, -4] },
  },
  {
    id: 'classroom',
    name: 'Classroom',
    blurb: 'Ceiling-mounted AP in a 9 × 8 m classroom with desks, whiteboard and windows.',
    build: buildClassroom,
    ap: { mount: 'ceiling', x: 0, z: 0.3, facing: [0, 0, -1], heightFt: 10, model: 'cw9166i', tiltDeg: 0 },
    camera: { pos: [3.9, 2.1, 3.7], target: [-0.5, 1.0, -1] },
  },
  {
    id: 'outdoor-wall',
    name: 'Outside, against a wall',
    blurb: 'Wall-mounted AP on a brick building covering a sidewalk, lawn and parking lot.',
    build: buildOutdoorWall,
    ap: { mount: 'wall', x: 0, z: 0, facing: [0, 0, 1], heightFt: 14, model: 'cw9166d1', tiltDeg: 25 },
    camera: { pos: [9, 4, 16], target: [0, 0.5, 4] },
  },
  {
    id: 'bleachers',
    name: 'Football bleachers',
    blurb: 'Pole-mounted directional AP at the sideline aimed at the home bleachers.',
    build: buildBleachers,
    ap: { mount: 'pole', x: 7.2, z: 0, facing: [1, 0, 0], heightFt: 20, model: 'sector-30', tiltDeg: 12 },
    camera: { pos: [-3, 7, 21], target: [11, 0.5, 0] },
  },
];

export function getScenario(id) {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

export class ScenarioManager {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.built = null;
    this.spec = null;
    this.active = true;
  }

  // Load a scenario by id; null / unknown clears the current one.
  load(id) {
    this._dispose();
    this.spec = getScenario(id);
    if (!this.spec) {
      this.scene.background = null;
      this.scene.fog = null;
      return null;
    }
    this.built = this.spec.build();
    this.group = this.built.group;
    this.group.visible = this.active;
    this.scene.add(this.group);
    this._applyEnvironment();
    return this.spec;
  }

  setHeight(heightM) {
    this.built?.update(heightM);
  }

  // True when the mounting-height slider also resizes the room (hallway / classroom ceiling).
  get heightDrivesRoom() {
    return this.built?.heightDrives === 'room';
  }

  // Meshes a placement click can land on (skips tree crowns, people and other round props).
  pickables() {
    const out = [];
    this.group?.traverse((o) => {
      if (!o.isMesh) return;
      const t = o.geometry.type;
      if (t.startsWith('Sphere') || t.startsWith('Icosahedron') || t.startsWith('Cone') || t.startsWith('Cylinder')) return;
      out.push(o);
    });
    return out;
  }

  // Scenario visuals are for the desktop preview only; hidden in AR so the camera feed shows through.
  setActive(active) {
    this.active = active;
    if (this.group) this.group.visible = active;
    this._applyEnvironment();
  }

  _applyEnvironment() {
    if (this.active && this.built?.background !== undefined) {
      this.scene.background = new THREE.Color(this.built.background);
      this.scene.fog = this.built.fog ? new THREE.Fog(...this.built.fog) : null;
    } else {
      this.scene.background = null;
      this.scene.fog = null;
    }
  }

  _dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
    });
    this.group = null;
    this.built = null;
  }
}
