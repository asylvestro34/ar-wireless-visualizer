import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const SURFACE_COLORS = { floor: 0x00f2fe, wall: 0x00e676, ceiling: 0xffeb3b };

// Classify a hit pose: pose +Y is the surface normal (pointing towards the viewer).
export function classifyNormal(normal) {
  if (normal.y > 0.7) return 'floor';
  if (normal.y < -0.7) return 'ceiling';
  return 'wall';
}

// WebXR session manager: AR button, viewer reticle, touch hit-testing against real surfaces.
export class ARController {
  /**
   * @param {object} o
   * @param {THREE.WebGLRenderer} o.renderer
   * @param {THREE.Scene} o.scene
   * @param {HTMLElement} o.overlayRoot  DOM overlay root (HUD)
   * @param {(p: {position: THREE.Vector3, normal: THREE.Vector3, surface: 'ceiling'|'wall'|'floor'}) => void} o.onPlace
   * @param {() => void} [o.onSessionStart]
   * @param {() => void} [o.onSessionEnd]
   * @param {(msg: string) => void} [o.onMessage]
   */
  constructor({ renderer, scene, overlayRoot, onPlace, onSessionStart, onSessionEnd, onMessage }) {
    this.renderer = renderer;
    this.scene = scene;
    this.overlayRoot = overlayRoot;
    this.onPlace = onPlace;
    this.onSessionStart = onSessionStart || (() => {});
    this.onSessionEnd = onSessionEnd || (() => {});
    this.onMessage = onMessage || (() => {});

    this.session = null;
    this.viewerSource = null;
    this.touchSource = null;
    this.lastTouchHit = null;
    this.reticleSurface = null; // 'floor' | 'wall' | 'ceiling' | null
    this.stats = { frames: 0, viewerHits: 0, touchHits: 0, error: '' };
    this._matrix = new THREE.Matrix4();

    this.reticle = new THREE.Group();
    this.reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f2fe, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 48).rotateX(-Math.PI / 2), this.reticleMaterial);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.015, 16).rotateX(-Math.PI / 2), this.reticleMaterial);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 16).translate(0, 0.06, 0), this.reticleMaterial);
    ring.renderOrder = dot.renderOrder = arrow.renderOrder = 40;
    this.reticle.add(ring, dot, arrow); // arrow shows the surface normal
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    scene.add(this.reticle);

    this._onSelectStart = () => { this.lastTouchHit = null; };
    this._onSelect = this._handleSelect.bind(this);
    this._onEnd = this._handleEnd.bind(this);

    renderer.xr.addEventListener('sessionstart', () => this._handleStart());
  }

  static async isSupported() {
    if (!('xr' in navigator) || !navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  createButton() {
    return ARButton.createButton(this.renderer, {
      requiredFeatures: ['hit-test'],
      // Depth sensing makes hit-tests land on textureless walls and ceilings where plane detection fails.
      optionalFeatures: ['dom-overlay', 'depth-sensing'],
      depthSensing: {
        usagePreference: ['cpu-optimized', 'gpu-optimized'],
        dataFormatPreference: ['luminance-alpha', 'float32'],
      },
      domOverlay: { root: this.overlayRoot },
    });
  }

  get isPresenting() {
    return !!this.session;
  }

  // One-line status for the on-screen diagnostics.
  diagnostics() {
    if (!this.session) return '';
    const s = this.stats;
    const src = `${this.viewerSource ? 'view✓' : 'view✗'} ${this.touchSource ? 'touch✓' : 'touch✗'}`;
    return `${src} · hits ${s.viewerHits}/${s.frames}${s.error ? ` · ${s.error}` : ''}`;
  }

  async _requestHitSource(space) {
    try {
      // 'point' lets hit-tests land on tracked feature points (walls without detected planes).
      return await this.session.requestHitTestSource({ space, entityTypes: ['plane', 'point'] });
    } catch (err) {
      return this.session.requestHitTestSource({ space });
    }
  }

  async _handleStart() {
    const session = this.renderer.xr.getSession();
    this.session = session;
    this.stats = { frames: 0, viewerHits: 0, touchHits: 0, error: '' };
    session.addEventListener('selectstart', this._onSelectStart);
    session.addEventListener('select', this._onSelect);
    session.addEventListener('end', this._onEnd);

    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this.viewerSource = await this._requestHitSource(viewerSpace);
    } catch (err) {
      this.stats.error = `viewer: ${err.message || err}`;
      console.warn('Viewer hit-test unavailable', err);
    }

    try {
      this.touchSource = await session.requestHitTestSourceForTransientInput({
        profile: 'generic-touchscreen',
        entityTypes: ['plane', 'point'],
      });
    } catch (err) {
      try {
        this.touchSource = await session.requestHitTestSourceForTransientInput({ profile: 'generic-touchscreen' });
      } catch (err2) {
        console.warn('Touch hit-test unavailable, using the centre reticle', err2);
      }
    }

    this.onSessionStart();
  }

  _handleEnd() {
    this.viewerSource?.cancel();
    this.touchSource?.cancel();
    this.viewerSource = null;
    this.touchSource = null;
    this.lastTouchHit = null;
    this.reticle.visible = false;
    this.reticleSurface = null;
    this.session = null;
    this.onSessionEnd();
  }

  // Call once per XR frame to refresh the reticle and the latest touch ray hit.
  update(frame) {
    if (!frame || !this.session) return;
    const refSpace = this.renderer.xr.getReferenceSpace();
    this.stats.frames++;

    if (this.viewerSource) {
      const hits = frame.getHitTestResults(this.viewerSource);
      const pose = hits.length ? hits[0].getPose(refSpace) : null;
      if (pose) {
        this.reticle.matrix.fromArray(pose.transform.matrix);
        this.reticle.matrixWorldNeedsUpdate = true;
        this.reticle.visible = true;
        const normal = new THREE.Vector3(0, 1, 0).transformDirection(this.reticle.matrix);
        this.reticleSurface = classifyNormal(normal);
        this.reticleMaterial.color.setHex(SURFACE_COLORS[this.reticleSurface]);
        this.stats.viewerHits++;
      } else {
        this.reticle.visible = false;
        this.reticleSurface = null;
      }
    }

    if (this.touchSource) {
      for (const touch of frame.getHitTestResultsForTransientInput(this.touchSource)) {
        const pose = touch.results.length ? touch.results[0].getPose(refSpace) : null;
        if (pose) {
          this.lastTouchHit = pose.transform.matrix.slice();
          this.stats.touchHits++;
        }
      }
    }
  }

  // Tap: anchor at the surface under the finger, else at the surface under the centre reticle.
  _handleSelect() {
    let matrix = this.lastTouchHit;
    if (!matrix && this.reticle.visible) matrix = this.reticle.matrix.elements;

    if (!matrix) {
      this.onMessage('No surface found yet. Move the phone slowly to scan, or use "Place ahead of me".');
      return;
    }

    this._matrix.fromArray(matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(this._matrix);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(this._matrix);
    this.lastTouchHit = null;
    this.onPlace({ position, normal, surface: classifyNormal(normal) });
  }

  endSession() {
    this.session?.end();
  }
}
