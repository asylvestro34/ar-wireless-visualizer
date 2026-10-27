// RF propagation model: Log-Distance Path Loss for 5 GHz Wi-Fi.
//   PL(d)   = PL0 + 10 * n * log10(d)      (PL0 = 40.05 dB @ 1 m, n = 2.8)
//   RSSI(d) = EIRP - PL(d)

export const REF_LOSS_DB = 40.05;
export const PATH_LOSS_EXPONENT = 2.8;
export const MIN_DISTANCE_M = 0.1;
export const CELL_EDGE_DBM = -75;

export const FT_TO_M = 0.3048;

export function pathLoss(distanceM) {
  const d = Math.max(distanceM, MIN_DISTANCE_M);
  return REF_LOSS_DB + 10 * PATH_LOSS_EXPONENT * Math.log10(d);
}

export function rssiAt(eirpDbm, distanceM) {
  return eirpDbm - pathLoss(distanceM);
}

// Inverse of rssiAt: distance (m) at which the signal falls to rssiDbm.
export function distanceForRssi(eirpDbm, rssiDbm) {
  return Math.pow(10, (eirpDbm - rssiDbm - REF_LOSS_DB) / (10 * PATH_LOSS_EXPONENT));
}

export function eirpDbm(txPowerDbm, antennaGainDbi) {
  return txPowerDbm + antennaGainDbi;
}

// Coverage bands, strongest first. `min` is the lower inclusive bound (integer dBm bands).
export const RSSI_BANDS = [
  { id: 'excellent', min: -50, hex: '#00f2fe', label: 'Excellent', note: '≥ -50 dBm' },
  { id: 'target',    min: -62, hex: '#00e676', label: 'Voice / Data target', note: '-51 to -62 dBm' },
  { id: 'standard',  min: -67, hex: '#ffeb3b', label: 'Standard web', note: '-63 to -67 dBm' },
  { id: 'edge',      min: -75, hex: '#ff5722', label: 'Cell edge', note: '-68 to -75 dBm' },
];

// Midpoints between the integer band limits, used for the smooth shader blend.
export const BAND_BOUNDARIES = [-50.5, -62.5, -67.5];

export function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// Returns { hex, rgb: [r,g,b] (sRGB 0..1), alpha, band } for a given RSSI. Alpha is 0 below -75 dBm.
export function rssiToColor(rssiDbm) {
  const r = Math.round(rssiDbm);
  for (const band of RSSI_BANDS) {
    if (r >= band.min) {
      return { hex: band.hex, rgb: hexToRgb(band.hex), alpha: 1, band: band.id };
    }
  }
  return { hex: '#000000', rgb: [0, 0, 0], alpha: 0, band: 'none' };
}

export function rssiAtDistanceColor(eirpDbm_, distanceM) {
  return rssiToColor(rssiAt(eirpDbm_, distanceM));
}

// Shader uniform data derived from the same tables so JS and GLSL stay in sync.
export function getShaderGradientData() {
  return {
    colors: RSSI_BANDS.map((b) => hexToRgb(b.hex)),
    boundaries: BAND_BOUNDARIES.slice(),
    cellEdge: CELL_EDGE_DBM,
  };
}

// RSSI thresholds at which concentric volumetric shells are generated (outermost last).
export const SHELL_THRESHOLDS_DBM = [-50, -62, -67, -74];

export function legendGradientCss() {
  const maxDbm = -40;
  const minDbm = -80;
  const pos = (dbm) => (((maxDbm - dbm) / (maxDbm - minDbm)) * 100).toFixed(2);
  const stops = [];
  stops.push(`${RSSI_BANDS[0].hex} 0%`);
  stops.push(`${RSSI_BANDS[0].hex} ${pos(-50.5)}%`);
  stops.push(`${RSSI_BANDS[1].hex} ${pos(-50.5)}%`);
  stops.push(`${RSSI_BANDS[1].hex} ${pos(-62.5)}%`);
  stops.push(`${RSSI_BANDS[2].hex} ${pos(-62.5)}%`);
  stops.push(`${RSSI_BANDS[2].hex} ${pos(-67.5)}%`);
  stops.push(`${RSSI_BANDS[3].hex} ${pos(-67.5)}%`);
  stops.push(`${RSSI_BANDS[3].hex} ${pos(-75.5)}%`);
  stops.push(`rgba(255,87,34,0) 100%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

// Tick labels positioned on the same -40..-80 dBm axis as legendGradientCss().
export const LEGEND_LABELS = [-50, -62, -67, -75].map((dbm) => ({
  text: dbm === -75 ? '-75 dBm' : String(dbm),
  leftPct: ((-40 - dbm) / 40) * 100,
}));

export function formatDistance(m) {
  const ft = m / FT_TO_M;
  return `${m.toFixed(1)} m / ${ft.toFixed(0)} ft`;
}
