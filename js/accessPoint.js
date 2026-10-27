import * as THREE from 'three';
import { FT_TO_M, SHELL_THRESHOLDS_DBM, distanceForRssi, eirpDbm } from './rfEngine.js';
import {
  ANTENNA_TYPES,
  getAntennaGeometry,
  createApBody,
  animateApBody,
  createApLabel,
  setApLabel,
} from './antennaPatterns.js';
import { createRfMaterial } from './shaderMaterial.js';

// With n = 2.8 the -75 dBm contour is >100 m at typical power, so compact mode draws everything at a
// fixed 1:15 scale. The scale does not depend on TX power, so the rings grow and shrink with it.
export const COMPACT_SCALE = 1 / 15;
export const COMPACT_LABEL = 'Compact (1:15)';
const WALL_OFFSET_M = 0.02; // half the AP disc thickness, so it sits flush on the wall
const CLIP_EPSILON_M = 0.005;

// Mount types: 'ceiling' | 'wall' | 'pole' (free standing / pole / floor-referenced).
export class AccessPoint {
  constructor() {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    this.body = createApBody();
    this.root.add(this.body);
    this.label = createApLabel();
    this.label.position.set(0, -0.38, 0);
    this.root.add(this.label);
    this.root.visible = false;

    this.mount = 'ceiling';
    this.floorLocked = false;
    this.surfacePoint = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, -1);
    this.antenna = 'omni';
    this.gainDbi = ANTENNA_TYPES.omni.gainDbi;
    this.modelName = 'Generic omni';
    this.compact = true;
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
    this._updateLabel();
  }

  get eirp() {
    return eirpDbm(this.txPower, this.gainDbi);
  }

  get placed() {
    return this.root.visible;
  }

  // Resize every shell to the distance at which its RSSI threshold is reached (times the display scale).
  // Colours always use the true distance (uScale); only the drawn size is compressed.
  refresh() {
    const eirp = this.eirp;
    const factor = this.compact ? COMPACT_SCALE : 1;
    for (const { threshold, mesh, material } of this.shells) {
      const radius = distanceForRssi(eirp, threshold);
      mesh.scale.setScalar(radius * factor);
      material.uniforms.uEirp.value = eirp;
      material.uniforms.uScale.value = radius;
    }
  }

  setCompact(compact) {
    this.compact = compact;
    this.refresh();
  }

  // Pattern type with generic defaults; a specific AP model overrides gain and beamwidth.
  setAntenna(type, gainDbi = ANTENNA_TYPES[type].gainDbi, beamwidthDeg = ANTENNA_TYPES[type].beamwidthDeg, name) {
    this.antenna = type;
    this.gainDbi = gainDbi;
    this.modelName = name ?? ANTENNA_TYPES[type].name;
    const geometry = getAntennaGeometry(type, beamwidthDeg);
    for (const { mesh } of this.shells) mesh.geometry = geometry;
    this.refresh();
    this._updateLabel();
  }

  setTxPower(dbm) {
    this.txPower = dbm;
    this.refresh();
  }

  setDowntiltDeg(deg) {
    this.tilt.rotation.x = -THREE.MathUtils.degToRad(deg);
  }

  // Mounting height above the floor. Ceiling: the floor moves (AP stays on the ceiling).
  // Otherwise: the AP moves up/down relative to the known floor.
  setHeightM(m) {
    this.heightM = m;
    if (this.mount === 'ceiling' && !this.floorLocked) this.floorY = this.root.position.y - m;
    else this.root.position.y = this.floorY + m;
    this._applyClips();
    this._updateLabel();
  }

  /**
   * Anchor the AP.
   * @param {THREE.Vector3} position  world point on the surface (or the AP position for 'pole')
   * @param {THREE.Vector3} facing    horizontal unit vector of the boresight direction (out of the wall)
   * @param {'ceiling'|'wall'|'pole'|'floor'} surface  'floor' = tapped floor, AP raised to mounting height
   * @param {number|null} knownFloorY  world floor height when known (test scenarios); locks the floor
   */
  placeAt(position, facing, surface, knownFloorY = null) {
    this.facing.copy(facing);
    this.surfacePoint.copy(position);
    this.root.rotation.y = Math.atan2(-facing.x, -facing.z);
    this.floorLocked = knownFloorY !== null;

    if (surface === 'floor') {
      this.mount = 'pole';
      this.floorY = position.y;
      this.root.position.set(position.x, this.floorY + this.heightM, position.z);
    } else {
      this.mount = surface;
      this.floorY = knownFloorY ?? position.y - this.heightM;
      this.root.position.copy(position);
      if (surface === 'wall') this.root.position.addScaledVector(facing, WALL_OFFSET_M);
    }

    // The disc is flat against the wall when wall-mounted, otherwise horizontal.
    this.body.rotation.x = this.mount === 'wall' ? Math.PI / 2 : 0;
    this.root.visible = true;
    this._applyClips();
    this._updateLabel();
  }

  hide() {
    this.root.visible = false;
  }

  _applyClips() {
    const plane = new THREE.Vector4(0, 0, 0, 0);
    if (this.mount === 'ceiling') {
      plane.set(0, -1, 0, this.root.position.y - CLIP_EPSILON_M);
    } else if (this.mount === 'wall') {
      const n = this.facing;
      plane.set(n.x, n.y, n.z, -n.dot(this.surfacePoint) - CLIP_EPSILON_M);
    }
    for (const { material } of this.shells) {
      material.uniforms.uClip.value.copy(plane);
      material.uniforms.uFloor.value.set(1, this.floorY);
    }
  }

  _updateLabel() {
    const ft = this.heightM / FT_TO_M;
    const mount = { ceiling: 'Ceiling', wall: 'Wall', pole: 'Pole' }[this.mount] ?? this.mount;
    setApLabel(this.label, this.modelName, `${mount} · ${ft.toFixed(0)} ft (${this.heightM.toFixed(1)} m)`);
  }

  update(time) {
    for (const { material } of this.shells) material.uniforms.uTime.value = time;
    animateApBody(this.body, time);
  }
}
