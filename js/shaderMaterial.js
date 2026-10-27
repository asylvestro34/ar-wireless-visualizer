import * as THREE from 'three';
import { getShaderGradientData, REF_LOSS_DB, PATH_LOSS_EXPONENT } from './rfEngine.js';

const VERTEX_SHADER = /* glsl */ `
  uniform float uEirp;
  uniform float uScale;      // metres per geometry unit
  uniform float uRefLoss;
  uniform float uExponent;

  varying float vRssi;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    // RSSI per vertex from its distance to the AP origin (log-distance path loss).
    float d = max(length(position) * uScale, 0.1);
    vRssi = uEirp - (uRefLoss + 10.0 * uExponent * log(d) / 2.302585093);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColors[4];     // excellent, target, standard, edge
  uniform float uBounds[3];    // band boundaries in dBm
  uniform float uCellEdge;
  uniform float uBlend;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uTime;

  varying float vRssi;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormalView);
    if (!gl_FrontFacing) n = -n;
    float fresnel = pow(1.0 - clamp(dot(n, normalize(vViewDir)), 0.0, 1.0), uFresnelPower);

    vec3 c = uColors[3];
    c = mix(c, uColors[2], smoothstep(uBounds[2] - uBlend, uBounds[2] + uBlend, vRssi));
    c = mix(c, uColors[1], smoothstep(uBounds[1] - uBlend, uBounds[1] + uBlend, vRssi));
    c = mix(c, uColors[0], smoothstep(uBounds[0] - uBlend, uBounds[0] + uBlend, vRssi));

    // Fully transparent below the cell edge.
    float mask = smoothstep(uCellEdge - 1.5, uCellEdge, vRssi);
    float pulse = 0.94 + 0.06 * sin(uTime * 1.6 + vRssi * 0.35);

    // Base ~uOpacity keeps the volume see-through; the rim adds the glow.
    float alpha = clamp(uOpacity * (0.75 + 1.1 * fresnel), 0.0, 0.7) * mask * pulse;
    vec3 color = c * (0.9 + 1.4 * fresnel);

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

// Creates a semi-transparent volumetric RF shell material.
// Update uniforms uEirp / uScale as TX power or shell radius changes.
export function createRfMaterial({ eirp = 24, scale = 1, opacity = 0.35 } = {}) {
  const gradient = getShaderGradientData();
  return new THREE.ShaderMaterial({
    uniforms: {
      uEirp: { value: eirp },
      uScale: { value: scale },
      uRefLoss: { value: REF_LOSS_DB },
      uExponent: { value: PATH_LOSS_EXPONENT },
      uColors: { value: gradient.colors.map((c) => new THREE.Vector3(...c)) },
      uBounds: { value: gradient.boundaries },
      uCellEdge: { value: gradient.cellEdge },
      uBlend: { value: 1.0 },
      uOpacity: { value: opacity },
      uFresnelPower: { value: 2.5 },
      uTime: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
