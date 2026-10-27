import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PATH_LOSS_EXPONENT } from './rfEngine.js';

// Boresight of every directional pattern is local -Z (horizontal, away from the mounting surface).
// Geometries are normalised so the farthest extent is ~1.0; the caller scales them by the
// range (m) at which a given RSSI threshold is reached.

export const ANTENNA_TYPES = {
  omni: {
    id: 'omni',
    name: 'Internal Omni',
    models: 'Catalyst CW9166 / Meraki MR46',
    gainDbi: 4,
    beamwidthDeg: 360,
  },
  patch: {
    id: 'patch',
    name: 'Directional Patch 60°',
    models: 'Cisco C-ANT-P1-D',
    gainDbi: 8,
    beamwidthDeg: 60,
    maxAttenuationDb: 20,
  },
  sector: {
    id: 'sector',
    name: 'Narrow Sector 30°',
    models: 'High-ceiling stadium / warehouse',
    gainDbi: 14,
    beamwidthDeg: 30,
    maxAttenuationDb: 25,
  },
};

// Parabolic main-lobe model: -3 dB at half the beamwidth, floored at the front-to-back ratio.
export function gainRelativeDb(angleRad, beamwidthDeg, maxAttenuationDb) {
  const ratio = THREE.MathUtils.radToDeg(angleRad) / beamwidthDeg;
  return -Math.min(12 * ratio * ratio, maxAttenuationDb);
}

// Standard omni donut: vertical axis, horizontal ring.
function createOmniGeometry() {
  const geo = new THREE.TorusGeometry(0.62, 0.38, 48, 96);
  geo.rotateX(Math.PI / 2);
  return geo;
}

// Radial-displaced sphere: range in each direction follows the antenna gain at that angle,
// so the surface is a constant-RSSI contour under the log-distance model.
function createLobeGeometry(beamwidthDeg, maxAttenuationDb) {
  let geo = new THREE.SphereGeometry(1, 96, 64);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);

  const pos = geo.attributes.position;
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(-dir.z, -1, 1));
    const gainDb = gainRelativeDb(angle, beamwidthDeg, maxAttenuationDb);
    const range = Math.pow(10, gainDb / (10 * PATH_LOSS_EXPONENT));
    pos.setXYZ(i, dir.x * range, dir.y * range, dir.z * range);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const cache = new Map();

// Returns a shared, normalised geometry for the antenna type ('omni' | 'patch' | 'sector').
export function getAntennaGeometry(type) {
  const spec = ANTENNA_TYPES[type];
  if (!spec) throw new Error(`Unknown antenna type: ${type}`);
  if (!cache.has(type)) {
    cache.set(
      type,
      type === 'omni' ? createOmniGeometry() : createLobeGeometry(spec.beamwidthDeg, spec.maxAttenuationDb)
    );
  }
  return cache.get(type);
}

// Small physical AP body drawn at the origin of the lobe.
export function createApBody() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.035, 40),
    new THREE.MeshBasicMaterial({ color: 0xf2f6fa })
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.008, 8, 40).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x049fd9 })
  );
  ring.position.y = -0.02;
  group.add(shell, ring);
  return group;
}
