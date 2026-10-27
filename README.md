# Cisco AR-RF

Browser-based WebAR tool for visualizing Wi-Fi access point coverage and 3D antenna radiation patterns in real spaces, using WebXR and Three.js. No build step: Three.js loads from a CDN via an import map.

## Features
- Antennas: Internal Omni (CW9166 / MR46), Patch 60° (C-ANT-P1-D), Sector 30° (high ceiling)
- Sliders: downtilt 0–90°, mounting height 8–30 ft, TX power 10–30 dBm
- RF model: `PL(d) = 40.05 + 28·log10(d)`, `RSSI = EIRP − PL` (EIRP = TX power + antenna gain)
- Volumetric Fresnel-glow shells coloured by RSSI:

| RSSI | Colour |
|------|--------|
| ≥ −50 dBm | Cyan `#00f2fe` |
| −51 to −62 | Green `#00e676` (voice/data target) |
| −63 to −67 | Amber `#ffeb3b` (standard web) |
| −68 to −75 | Red/orange `#ff5722` (cell edge) |
| < −75 | Transparent |

## Run locally
```bash
npm install
npm start          # http://localhost:8080
```
WebXR needs a secure context. On an Android phone use USB debugging with `adb reverse tcp:8080 tcp:8080` and open `http://localhost:8080` in Chrome, or serve over HTTPS (e.g. GitHub Pages).

## Deploy to GitHub Pages
1. Push the repo to GitHub.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Open `https://<user>.github.io/<repo>/` on your phone.

## Using the app
1. Open in **Chrome on an ARCore-capable Android device** and tap **START AR**.
2. Move the phone slowly until the cyan reticle appears on surfaces.
3. Tap a **ceiling or wall** to mount the AP at that point, or tap the **floor** to place it above the floor at the selected height.
   - **Wall:** the AP sits flat on the wall with its beam pointing out into the room, and the RF pattern is cut off at the wall plane. Use **Downtilt** to angle it down. Set the **Mounting Height** slider to the real height of the spot you tapped, then adjust it to move the AP up or down.
   - **Ceiling:** the pattern is cut at the ceiling plane; direction follows where the phone is facing.
   - Desktop preview of a wall mount: open `http://localhost:8080/?mount=wall`.
4. Pick an antenna and tune downtilt, height and TX power. Downtilt 0° is horizontal boresight, 90° points straight down.

## Notes and limitations
- iOS Safari does not support WebXR `immersive-ar`; the app falls back to an interactive 3D preview (drag to orbit). Desktop browsers also use the preview.
- Shell surfaces are constant-RSSI contours that include antenna gain; colour is computed per vertex from distance to the AP. With n = 2.8 the −75 dBm range is >100 m, so **Size: Compact** (default) shrinks the drawn bubble to ≤12 m; colours and the range readouts stay true. Switch to *True scale* for the unscaled model. Results are a planning aid, not a substitute for a site survey: walls, materials and interference are not modelled.
- Surface detection of ceilings depends on the device's ARCore support.

## Structure
```
index.html          HUD + canvas
css/style.css       glassmorphic dark UI
js/rfEngine.js      path loss, RSSI colour bands
js/antennaPatterns.js  procedural geometry
js/shaderMaterial.js   GLSL volumetric material
js/arController.js  WebXR session, hit-testing
js/app.js           scene, UI wiring, render loop
```
