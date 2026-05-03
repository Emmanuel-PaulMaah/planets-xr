# Planets XR on iOS

iOS Safari does not implement WebXR, so the Android/Quest "Enter AR" path
(`navigator.xr` + `ARButton`) cannot run on iPhone or iPad. Apple's platform AR
runtime is **ARKit**, and the only way to reach it from a web page is **AR Quick
Look** — Safari intercepts a tap on an `<a rel="ar">` link whose `href` points
to a `.usdz` (or `.reality`) file and opens the system AR viewer.

This app uses that path on iOS.

## Flow

1. **Detect iOS** — `main.js` checks `navigator.userAgent` for iPhone / iPad /
   iPod, plus the iPadOS-as-MacIntel + touch-points heuristic. When detected,
   the launch button is relabelled to **"View in AR (Quick Look)"** and routed
   to `startIOSAR()` instead of `startAR()`.

2. **Build the scene in memory** — `startIOSAR()` constructs a normal
   `THREE.Scene` containing the planets the user picked, arranged in the same
   line as the WebXR version. Materials are forced to
   `MeshStandardMaterial` because that's the only material family
   `USDZExporter` knows how to write. The Sun keeps its glow via an
   `emissiveMap`.

3. **Export to USDZ on the fly** — `THREE.USDZExporter().parse(scene)` returns
   an `ArrayBuffer` containing a valid `.usdz` zip. We wrap it in a `Blob` with
   MIME type `model/vnd.usdz+zip` and create an object URL.

4. **Trigger AR Quick Look** — we build an `<a rel="ar" href="blob:…#allowsContentScaling=0">`
   with a hidden `<img>` child (Safari requires the image child for the
   interception to fire) and present it as a big "Open in AR" button. The
   user's tap on that button is the user gesture Safari needs to hand off to
   ARKit.

5. **Hand-off and return** — Safari opens the USDZ in the system AR viewer.
   The user places the model on a detected plane, pinches to scale, and walks
   around it with full ARKit world tracking. Dismissing AR Quick Look returns
   to the page; we tear down the overlay and revoke the blob URL.

## Why not the WebXR path?

| Capability                | Android Chrome (WebXR) | iOS Safari (AR Quick Look) |
| ------------------------- | ---------------------- | -------------------------- |
| Live three.js scene in AR | ✅                     | ❌ (static USDZ only)      |
| Per-frame JS animation    | ✅                     | ❌                         |
| Hit-testing from JS       | ✅                     | ❌ (handled by viewer)     |
| Real ARKit world tracking | n/a                    | ✅                         |
| Pinch-to-scale, move      | manual                 | ✅ (built in)              |

The trade-off: planets don't spin inside AR Quick Look because the three.js
`USDZExporter` doesn't currently emit USD animation tracks. Everything else
(textures, rings, emissive Sun, relative sizes) carries over.

## Requirements

- iOS 12 or newer (AR Quick Look ships with iOS 12; iPhone 12 Pro Max runs iOS
  14+ so it's well covered, and its LiDAR scanner gives noticeably better plane
  detection).
- The page must be served over **HTTPS** or `http://localhost`. Safari blocks
  AR Quick Look (and `getUserMedia`, etc.) on plain HTTP origins.
- No `model-viewer`, no extra dependencies — just the existing `three` import
  plus `examples/jsm/exporters/USDZExporter.js`.

## Files involved

- [`main.js`](./main.js) — `isIOS` detection, launch-button branching, and the
  `startIOSAR()` function.
- [`index.html`](./index.html) — `viewport-fit=cover` and safe-area-inset
  padding so the menu and back button clear the iPhone notch / home indicator.
