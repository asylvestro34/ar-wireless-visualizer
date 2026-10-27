// Cisco AP catalog. Values are approximate 5 GHz planning figures (peak antenna gain, -3 dB
// beamwidth, typical max conducted TX). Verify against the current datasheet before design work.
//   pattern: 'omni' | 'patch' | 'sector'  (selects the radiation-pattern generator)

export const AP_CATALOG = [
  {
    group: 'Catalyst Wi-Fi 7 (internal omni)',
    models: [
      { id: 'cw9178i', name: 'Catalyst CW9178I', pattern: 'omni', gainDbi: 5, beamwidthDeg: 360, txDbm: 23 },
      { id: 'cw9176i', name: 'Catalyst CW9176I', pattern: 'omni', gainDbi: 5, beamwidthDeg: 360, txDbm: 23 },
    ],
  },
  {
    group: 'Catalyst Wi-Fi 6E (internal omni)',
    models: [
      { id: 'cw9166i', name: 'Catalyst CW9166I', pattern: 'omni', gainDbi: 5, beamwidthDeg: 360, txDbm: 23 },
      { id: 'cw9164i', name: 'Catalyst CW9164I', pattern: 'omni', gainDbi: 5, beamwidthDeg: 360, txDbm: 23 },
      { id: 'cw9162i', name: 'Catalyst CW9162I', pattern: 'omni', gainDbi: 5, beamwidthDeg: 360, txDbm: 20 },
    ],
  },
  {
    group: 'Catalyst Wi-Fi 6 (internal omni)',
    models: [
      { id: 'c9130axi', name: 'Catalyst 9130AXI', pattern: 'omni', gainDbi: 6, beamwidthDeg: 360, txDbm: 23 },
      { id: 'c9120axi', name: 'Catalyst 9120AXI', pattern: 'omni', gainDbi: 6, beamwidthDeg: 360, txDbm: 23 },
    ],
  },
  {
    group: 'Meraki (internal omni)',
    models: [
      { id: 'mr57', name: 'Meraki MR57', pattern: 'omni', gainDbi: 6, beamwidthDeg: 360, txDbm: 23 },
      { id: 'mr46', name: 'Meraki MR46', pattern: 'omni', gainDbi: 5, beamwidthDeg: 360, txDbm: 23 },
      { id: 'mr36', name: 'Meraki MR36', pattern: 'omni', gainDbi: 5, beamwidthDeg: 360, txDbm: 23 },
    ],
  },
  {
    group: 'Aironet (internal omni)',
    models: [
      { id: 'ap3802i', name: 'Aironet 3802I', pattern: 'omni', gainDbi: 6, beamwidthDeg: 360, txDbm: 23 },
      { id: 'ap2802i', name: 'Aironet 2802I', pattern: 'omni', gainDbi: 6, beamwidthDeg: 360, txDbm: 23 },
    ],
  },
  {
    group: 'Directional / external antenna',
    models: [
      { id: 'cw9166d1', name: 'Catalyst CW9166D1 (directional)', pattern: 'patch', gainDbi: 8, beamwidthDeg: 100, txDbm: 23 },
      { id: 'c-ant-p1-d', name: 'C-ANT-P1-D patch (60°)', pattern: 'patch', gainDbi: 8, beamwidthDeg: 60, txDbm: 23 },
      { id: 'sector-30', name: 'High-gain sector (30°)', pattern: 'sector', gainDbi: 14, beamwidthDeg: 30, txDbm: 23 },
    ],
  },
];

const BY_ID = new Map(AP_CATALOG.flatMap((g) => g.models).map((m) => [m.id, m]));

export function getApModel(id) {
  return BY_ID.get(id) ?? null;
}
