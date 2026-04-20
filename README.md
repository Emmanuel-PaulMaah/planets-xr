# Planets XR

View planets from the solar system in augmented reality, right in your browser.

## How to Run

This project uses ES modules loaded from a CDN — no build step or `npm install` required. You just need a local HTTP server.

### Quick start (pick one)

```bash
# Python 3
python -m http.server 8000

# Node (npx, no install)
npx serve .

# VS Code
# Install the "Live Server" extension, right-click index.html → Open with Live Server
```

Then open **http://localhost:8000** on a WebXR-capable device (e.g. Chrome on Android).

### Usage

1. Select the planets you want to view from the menu.
2. Tap **Enter AR**.
3. Point your camera at a surface — the selected planets will appear in front of you.

## Requirements

- A browser that supports **WebXR** (Chrome 79+ on Android, or an XR headset browser).
- HTTPS or localhost (WebXR requires a secure context).
