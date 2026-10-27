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
// beamwidthDeg optionally overrides the type default (used by specific AP models).
export function getAntennaGeometry(type, beamwidthDeg) {
  const spec = ANTENNA_TYPES[type];
  if (!spec) throw new Error(`Unknown antenna type: ${type}`);
  const bw = type === 'omni' ? 360 : Math.round(beamwidthDeg ?? spec.beamwidthDeg);
  const key = `${type}:${bw}`;
  if (!cache.has(key)) {
    cache.set(key, type === 'omni' ? createOmniGeometry() : createLobeGeometry(bw, spec.maxAttenuationDb));
  }
  return cache.get(key);
}

// Visible AP marker at the lobe origin. Local -Y faces the room (the mounting surface is at +Y):
// white disc, cyan LED ring, a glowing halo and a pulsing ring that expands across the surface.
export function createApBody() {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.04, 48),
    new THREE.MeshBasicMaterial({ color: 0xf2f6fa })
  );
  const led = new THREE.Mesh(
    new THREE.TorusGeometry(0.095, 0.012, 8, 48).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00f2fe })
  );
  led.position.y = -0.022;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 48).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x049fd9, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false })
  );
  halo.position.y = -0.021;
  halo.renderOrder = 20;
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(0.19, 0.2, 64).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, side: THREE.DoubleSide, depthTest: false })
  );
  pulse.position.y = -0.021;
  pulse.renderOrder = 20;
  group.add(disc, led, halo, pulse);
  group.userData.pulse = pulse;
  return group;
}

// Animate the pulse ring (call every frame).
export function animateApBody(body, time) {
  const pulse = body.userData.pulse;
  if (!pulse) return;
  const t = (time * 0.8) % 1;
  pulse.scale.setScalar(1 + t * 3);
  pulse.material.opacity = 0.8 * (1 - t);
}

// Camera-facing label sprite with a Wi-Fi icon. Call setLabel(sprite, title, subtitle) to redraw.
export function createApLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  );
  sprite.scale.set(0.8, 0.25, 1);
  sprite.renderOrder = 30;
  sprite.userData.canvas = canvas;
  sprite.userData.texture = texture;
  return sprite;
}

export function setApLabel(sprite, title, subtitle) {
  const canvas = sprite.userData.canvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(11, 18, 32, 0.82)';
  ctx.strokeStyle = '#049fd9';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 28);
  ctx.fill();
  ctx.stroke();

  // Wi-Fi icon: dot plus three arcs
  ctx.strokeStyle = '#00f2fe';
  ctx.fillStyle = '#00f2fe';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  const cx = 78;
  const cy = 108;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  for (const r of [26, 46, 66]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e8f1fa';
  ctx.font = '600 44px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillText(title, 150, 76, 340);
  ctx.fillStyle = '#8fa3b8';
  ctx.font = '32px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillText(subtitle, 150, 124, 340);
  sprite.userData.texture.needsUpdate = true;
}
