import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

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
    this.reticleHasHit = false;
    this._matrix = new THREE.Matrix4();

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
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
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: this.overlayRoot },
    });
  }

  get isPresenting() {
    return !!this.session;
  }

  async _handleStart() {
    const session = this.renderer.xr.getSession();
    this.session = session;
    session.addEventListener('selectstart', this._onSelectStart);
    session.addEventListener('select', this._onSelect);
    session.addEventListener('end', this._onEnd);

    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this.viewerSource = await session.requestHitTestSource({ space: viewerSpace });
    } catch (err) {
      console.warn('Viewer hit-test unavailable', err);
    }

    try {
      this.touchSource = await session.requestHitTestSourceForTransientInput({ profile: 'generic-touchscreen' });
    } catch (err) {
      console.warn('Touch hit-test unavailable, falling back to reticle', err);
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
    this.reticleHasHit = false;
    this.session = null;
    this.onSessionEnd();
  }

  // Call once per XR frame to refresh the reticle and the latest touch ray hit.
  update(frame) {
    if (!frame || !this.session) return;
    const refSpace = this.renderer.xr.getReferenceSpace();

    if (this.viewerSource) {
      const hits = frame.getHitTestResults(this.viewerSource);
      const pose = hits.length ? hits[0].getPose(refSpace) : null;
      if (pose) {
        this.reticle.matrix.fromArray(pose.transform.matrix);
        this.reticle.visible = true;
        this.reticleHasHit = true;
      } else {
        this.reticle.visible = false;
        this.reticleHasHit = false;
      }
    }

    if (this.touchSource) {
      const touches = frame.getHitTestResultsForTransientInput(this.touchSource);
      for (const touch of touches) {
        const pose = touch.results.length ? touch.results[0].getPose(refSpace) : null;
        if (pose) this.lastTouchHit = pose.transform.matrix.slice();
      }
    }
  }

  // Tap: anchor at the surface under the finger (falls back to the reticle if touch hit-testing is unsupported).
  _handleSelect() {
    let matrix = this.lastTouchHit;
    if (!matrix && !this.touchSource && this.reticleHasHit) matrix = this.reticle.matrix.elements;

    if (!matrix) {
      this.onMessage('No surface detected there. Move the phone slowly and tap a detected ceiling, wall or floor.');
      return;
    }

    this._matrix.fromArray(matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(this._matrix);
    // Hit pose +Y is the surface normal.
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(this._matrix);
    const surface = normal.y > 0.7 ? 'floor' : normal.y < -0.7 ? 'ceiling' : 'wall';

    this.lastTouchHit = null;
    this.onPlace({ position, normal, surface });
  }

  endSession() {
    this.session?.end();
  }
}
