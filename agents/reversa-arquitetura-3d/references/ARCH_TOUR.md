# Architecture Tour

Animated camera traversing the scene at a cinematic pace, with a synchronized **narrative overlay**. Works like a "trailer" of the system: someone presses play and the video unfolds automatically, stopping at key points with explanatory captions.

## Concept

The tour is not an isolated mode — it is an **animated layer** that overlays any of the other modes (Code City, Dependency Graph 3D, Layer Stack, Call Graph). The skill receives a sequence of waypoints and narrations, and the camera travels between them.

## When to use

- Presentations for non-technical stakeholders.
- Onboarding new developers ("press play and see how the system works").
- Short executive demonstration (1 to 3 minutes).
- Accompaniment of the mini-site's `deck.html`.

## Data model: the choreography

```json
{
  "baseMode": "code-city",
  "duration": 90,
  "waypoints": [
    {
      "at": 0,
      "camera": { "position": [200, 250, 400], "target": [0, 0, 0] },
      "overlay": "This is the payments system seen from above."
    },
    {
      "at": 12,
      "camera": { "position": [50, 30, 80], "target": [40, 0, 20] },
      "overlay": "The tallest district, src/payments, concentrates 40% of the code."
    },
    {
      "at": 24,
      "camera": { "position": [80, 60, 60], "target": [60, 20, 30] },
      "highlight": ["src/payments/charge.ts", "src/payments/refund.ts"],
      "overlay": "Charge and refund are the central files."
    },
    {
      "at": 40,
      "camera": { "position": [-100, 80, 200], "target": [-50, 0, 0] },
      "switchMode": "dependency-graph",
      "overlay": "Now let's look at its dependencies."
    }
  ]
}
```

- `at`: second in the timeline when the waypoint fires.
- `camera`: camera position and target upon arrival.
- `highlight`: list of node/module IDs to highlight (others fade out).
- `overlay`: caption text.
- `switchMode` (optional): switches the base mode mid-tour with a transition.

## Interpolation algorithm

Between two waypoints, the camera interpolates position and target with easing.

```javascript
import { CatmullRomCurve3 } from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";

const positions = waypoints.map((w) => new THREE.Vector3(...w.camera.position));
const targets = waypoints.map((w) => new THREE.Vector3(...w.camera.target));
const positionCurve = new CatmullRomCurve3(positions);
const targetCurve = new CatmullRomCurve3(targets);

let startTime = null;
function playTour() {
    startTime = performance.now();
    controls.enabled = false; // disable manual interaction
    animateTour();
}

function animateTour() {
    const now = performance.now();
    const elapsed = (now - startTime) / 1000;

    if (elapsed >= tour.duration) {
        finishTour();
        return;
    }

    const t = elapsed / tour.duration; // 0..1
    const pos = positionCurve.getPoint(t);
    const tgt = targetCurve.getPoint(t);
    camera.position.copy(pos);
    camera.lookAt(tgt);

    updateOverlay(elapsed);
    updateHighlights(elapsed);

    renderer.render(scene, camera);
    requestAnimationFrame(animateTour);
}
```

## Narrative overlay

Text box positioned at the footer or side, with smooth transitions between captions.

```html
<div id="tour-overlay">
    <p id="tour-text"></p>
    <div id="tour-progress"><div id="tour-progress-fill"></div></div>
    <div id="tour-controls">
        <button id="tour-pause">Pause</button>
        <button id="tour-restart">Restart</button>
        <button id="tour-skip">Skip</button>
    </div>
</div>
```

```javascript
function updateOverlay(elapsed) {
    const current = waypoints.findLast((w) => w.at <= elapsed);
    if (!current) return;
    const textEl = document.getElementById("tour-text");
    if (textEl.dataset.at !== String(current.at)) {
        textEl.dataset.at = current.at;
        textEl.style.opacity = 0;
        setTimeout(() => {
            textEl.textContent = current.overlay;
            textEl.style.opacity = 1;
        }, 300);
    }
    const progress = (elapsed / tour.duration) * 100;
    document.getElementById("tour-progress-fill").style.width = progress + "%";
}
```

## Element highlighting

During highlights, selected modules gain emissive and the others reduce opacity.

```javascript
function updateHighlights(elapsed) {
    const current = waypoints.findLast((w) => w.at <= elapsed);
    const highlightIds = new Set(current?.highlight ?? []);

    modules.forEach((m, i) => {
        const isHighlighted = highlightIds.size === 0 || highlightIds.has(m.name);
        const targetOpacity = isHighlighted ? 1.0 : 0.15;
        // animating opacity via InstancedMesh is more involved;
        // alternative: change color to a desaturated version when opacity is low
        const baseColor = colorForModule(m);
        const finalColor = isHighlighted ? baseColor : dim(baseColor, 0.3);
        instanced.setColorAt(i, new THREE.Color(finalColor));
    });
    instanced.instanceColor.needsUpdate = true;
}

function dim(hex, factor) {
    const c = new THREE.Color(hex);
    c.r *= factor; c.g *= factor; c.b *= factor;
    return c.getHex();
}
```

## Mid-tour mode switch

When a waypoint has `switchMode`, fade out the current scene, dispose, create the new scene, fade in.

```javascript
function switchSceneMode(newMode) {
    fadeOverlay.style.opacity = 1;
    setTimeout(() => {
        clearScene();
        if (newMode === "dependency-graph") buildDependencyGraph();
        else if (newMode === "code-city") buildCodeCity();
        // etc
        fadeOverlay.style.opacity = 0;
    }, 600);
}
```

## Tour controls

- **Pause**: stops `requestAnimationFrame`, freezes time.
- **Restart**: resets `startTime` to now.
- **Skip**: jumps to the next waypoint.
- **Manual takeover**: if the user drags the mouse on the scene, interrupts the tour and enables OrbitControls.

```javascript
renderer.domElement.addEventListener("pointerdown", () => {
    if (tourPlaying) {
        pauseTour();
        controls.enabled = true;
        showResumeButton();
    }
});
```

## Optional soundtrack

The tour can include subtle ambient music via `<audio>` embedded as base64 (short, ~30s looped) or via Web Audio API generating procedural drones. Default: no audio.

## Choreography generation

The skill receives ready-made waypoints OR generates them automatically from heuristics:

- Start from above looking at the center.
- Dive into the 3 largest buildings (Code City).
- Fly through the dependency graph highlighting the most central node.
- End showing the layer stack of violating layers (if any).

Each heuristic can be enabled or disabled via parameter.

## Tour sidebar

```html
<aside id="sidebar">
    <h3>Architecture Tour</h3>

    <label>Total duration
        <input type="range" min="30" max="300" value="90" data-param="duration"> s
    </label>

    <label>Base mode
        <select data-param="baseMode">
            <option value="code-city">Code City</option>
            <option value="dependency-graph">Dependency Graph</option>
            <option value="layer-stack">Layer Stack</option>
        </select>
    </label>

    <label>
        <input type="checkbox" data-param="autoPlay"> Play on open
    </label>

    <label>
        <input type="checkbox" data-param="includeViolationsScene" checked> Include violations scene
    </label>

    <button id="play-tour">Play Tour</button>
    <button id="pause-tour">Pause</button>
    <button id="restart-tour">Restart</button>
</aside>
```

## Performance

The tour inherits performance from the base mode. Adding a tour costs little: only camera interpolation and opacity animations. Be careful with `switchMode` mid-tour: dispose + rebuild can cause 200-500ms stutter.
