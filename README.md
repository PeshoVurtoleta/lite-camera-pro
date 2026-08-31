# @zakkster/lite-camera-pro

[![npm version](https://img.shields.io/npm/v/@zakkster/lite-camera-pro.svg?style=for-the-badge&color=latest)](https://www.npmjs.com/package/@zakkster/lite-camera-pro)
![Zero-GC](https://img.shields.io/badge/Zero--GC-Hot%20path-00C853?style=for-the-badge&logo=leaf&logoColor=white)
[![sponsor](https://img.shields.io/badge/sponsor-PeshoVurtoleta-ea4aaa.svg?logo=github)](https://github.com/sponsors/PeshoVurtoleta)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@zakkster/lite-camera-pro?style=for-the-badge)](https://bundlephobia.com/result?p=@zakkster/lite-camera-pro)
[![npm downloads](https://img.shields.io/npm/dm/@zakkster/lite-camera-pro?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-camera-pro)
[![npm total downloads](https://img.shields.io/npm/dt/@zakkster/lite-camera-pro?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-camera-pro)
![TypeScript](https://img.shields.io/badge/TypeScript-Types-informational)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

### Cinematic Camera System for Canvas2D Games

> Zero-GC. Zero external deps. Framework-agnostic.
> The class you ship, the subsystems you opt into.

**Full TypeScript -- 348 tests -- detached by design: a class-only camera is 17.68 KB gz (was 24.49 KB before 2.0.0)**

```
npm install @zakkster/lite-camera-pro
```

v2.0.0 detach: parallax, timeline sequences and the debug HUD are no longer
bundled into the class -- opt in per instance with `withParallax` / `withSequences`
/ `withDebug` from their subpaths. A class-only consumer ships none of them (nor
`lite-timeline`). See the [migration table](#migration-from-1x-to-200).

Need only screen shake? Import the `./shake` subpath and pull just the engine +
presets (3.09 KB gz -- esm, unminified, gzip -9):

```js
import { createShakeState, addShake, updateShake, computeShake, getPreset } from '@zakkster/lite-camera-pro/shake';
```

---

## Why Pro?

You already ship games with `@zakkster/lite-camera`. It handles follow, deadzone, lookahead, and basic shake. That's enough to prototype.

**lite-camera-pro** is what you reach for when the prototype becomes a product:

- The boss reveal that zooms in, shakes, holds, then swoops back
- The co-op mode where the camera frames both players automatically
- The parallax layers that scroll at different depths
- The platformer camera that's smooth horizontally but pixel-locked vertically
- The explosion that layers three different shakes simultaneously

All of it runs at 60fps with **zero garbage collection** in the hot path.

---

## Architecture

```mermaid
graph TB
    subgraph "@zakkster/lite-camera-pro"
        Core["CinematicCameraPro<br/><i>894 lines · main class</i>"]
        Follow["FollowMode<br/><i>179 lines · 5 strategies</i>"]
        Multi["MultiTarget<br/><i>125 lines · bbox framing</i>"]
        Shake["ShakeEngine<br/><i>286 lines · 8-slot noise pool</i>"]
        Presets["ShakePresets<br/><i>177 lines · 8 built-in profiles</i>"]
        Seq["CameraSequence<br/><i>513 lines · timeline cinematics</i>"]
        Parallax["ParallaxManager<br/><i>199 lines · 16 layers</i>"]
        Bounds["BoundsSystem<br/><i>220 lines · per-edge behavior</i>"]
        Debug["DebugHUD<br/><i>290 lines · toggleable overlay</i>"]
    end

    Core --> Follow
    Core --> Multi
    Core --> Shake
    Core --> Seq
    Core --> Parallax
    Core --> Bounds
    Core --> Debug
    Shake --> Presets

    style Core fill:#fbbf24,stroke:#92400e,color:#000
    style Seq fill:#a78bfa,stroke:#5b21b6,color:#000
    style Shake fill:#ef4444,stroke:#991b1b,color:#fff
    style Follow fill:#22d3ee,stroke:#155e75,color:#000
    style Multi fill:#34d399,stroke:#065f46,color:#000
    style Parallax fill:#34d399,stroke:#065f46,color:#000
    style Bounds fill:#22d3ee,stroke:#155e75,color:#000
    style Presets fill:#f87171,stroke:#991b1b,color:#000
    style Debug fill:#6b7280,stroke:#374151,color:#fff
```

Every module is a separate file. Tree-shaking drops what you don't use.

---

## Dependency Graph

```mermaid
graph LR
    Pro["lite-camera-pro"]
    Cam["lite-camera"]
    Ease["lite-ease"]
    Lerp["lite-lerp"]
    Noise["lite-noise"]
    TL["lite-timeline"]

    Pro --> Cam
    Pro --> Ease
    Pro --> Lerp
    Pro --> Noise
    Pro --> TL

    style Pro fill:#fbbf24,stroke:#92400e,color:#000,stroke-width:2px
    style Cam fill:#1e1e2e,stroke:#fbbf24,color:#fbbf24
    style Ease fill:#1e1e2e,stroke:#a78bfa,color:#a78bfa
    style Lerp fill:#1e1e2e,stroke:#34d399,color:#34d399
    style Noise fill:#1e1e2e,stroke:#ef4444,color:#ef4444
    style TL fill:#1e1e2e,stroke:#a78bfa,color:#a78bfa
```

All `@zakkster` packages. Zero third-party dependencies in the final bundle.

---

## lite-camera vs lite-camera-pro

| Feature | lite-camera | lite-camera-pro |
|:---|:---:|:---:|
| Smooth follow + deadzone + lookahead | ✓ | ✓ |
| Basic RNG shake | ✓ | — |
| Canvas transform apply | ✓ | ✓ |
| Debug rectangle | ✓ | ✓ |
| | | |
| **Zoom** (smooth, eased, anchor-point) | | ✓ |
| **Dynamic zoom-at-target** (tracks moving objects) | | ✓ |
| **5 follow modes** (smooth / lock / predictive / cut / hybrid) | | ✓ |
| **Multi-target auto-framing** (bounding box + auto-zoom) | | ✓ |
| **Noise-based shake** (simplex, 8 simultaneous layers) | | ✓ |
| **Directional shake** (recoil, landing, per-axis) | | ✓ |
| **8 shake presets** + custom registry | | ✓ |
| **Cinematic sequences** (timeline-driven camera moves) | | ✓ |
| **Fluent sequence builder** (moveTo · zoomTo · shake · wait · call) | | ✓ |
| **Sequence presets** (panTo · dramaticZoom · bossReveal) | | ✓ |
| **Parallax layer manager** (16 layers, per-layer speed) | | ✓ |
| **Smart bounds** (hard / soft / elastic / none — per-edge) | | ✓ |
| **Dynamic bounds** (room transitions, arenas) | | ✓ |
| **Pro debug HUD** (toggleable panels, trauma bars, sequence progress) | | ✓ |
| **Zero-alloc coordinate conversion** (screenToWorld / worldToScreen) | | ✓ |
| **Save / Load** (getState / setState) | | ✓ |
| **TypeScript declarations** | | ✓ |

---

## Quick Start

```js
import { CinematicCameraPro, FollowMode } from '@zakkster/lite-camera-pro';
// v2.0.0: opt into the subsystems you use, from their subpaths.
import { withDebug } from '@zakkster/lite-camera-pro/debug';

const cam = new CinematicCameraPro(
    canvas.width,   // viewport width
    canvas.height,  // viewport height
    WORLD_W,        // world width
    WORLD_H         // world height
);
withDebug(cam);     // installs cam.debug/cam.debugHUD (+ withParallax / withSequences as needed)

// ── Game loop ──
function update(dt) {
    cam.update(dt, player.x, player.y, player.vx, player.vy);
}

function render(ctx) {
    ctx.save();
    cam.apply(ctx);       // transforms the canvas
    drawWorld(ctx);
    cam.debug(ctx);       // world-space overlay (needs withDebug)
    ctx.restore();
    cam.debugHUD(ctx);    // screen-space HUD (needs withDebug)
}
```

A camera that only follows and shakes needs no attach at all -- `update`,
`apply`, `shake`, `setZoom`, `trackMultiple`, bounds and coordinate conversion
are all on the class.

---

## Feature Guide

### Follow Modes

```mermaid
stateDiagram-v2
    direction LR
    SMOOTH --> LOCK : setMode()
    SMOOTH --> PREDICTIVE : setMode()
    SMOOTH --> CUT : setMode()
    SMOOTH --> HYBRID : setMode()
    LOCK --> SMOOTH : setMode()
    PREDICTIVE --> SMOOTH : setMode()
    CUT --> SMOOTH : setMode()
    HYBRID --> SMOOTH : setMode()

    note right of SMOOTH : Deadzone + lookahead + lerp<br/>Default. Good for everything.
    note right of LOCK : Instant snap. No interpolation.<br/>Top-down shooters.
    note right of PREDICTIVE : Velocity extrapolation.<br/>Racing games, fast runners.
    note right of CUT : Hard jump. Zero lerp.<br/>Cutscene transitions.
    note right of HYBRID : Smooth-X, locked-Y.<br/>Platformer standard.
```

Switch mid-gameplay. No position jumps (except CUT, which jumps by design).

```js
cam.setMode(FollowMode.SMOOTH);      // deadzone + lookahead + lerp
cam.setMode(FollowMode.LOCK);        // instant snap, no interpolation
cam.setMode(FollowMode.PREDICTIVE);  // velocity extrapolation
cam.setMode(FollowMode.CUT);         // hard cut (cutscene transitions)
cam.setMode(FollowMode.HYBRID);      // smooth horizontal, locked vertical

// Predictive tuning
cam.predictTime = 0.5; // seconds of velocity extrapolation

// Hybrid tuning
cam.hybridVerticalSnap = true;  // instant vertical (default)
cam.hybridVerticalSnap = false; // fast-lerp vertical
```

---

### Zoom System

```js
// Smooth zoom with easing
cam.setZoom(2.0, 0.5, easeOutExpo);    // zoom to 2× over 0.5s

// Zoom toward a static world point
cam.zoomAt(400, 300, 1.8, 0.8, easeOutExpo);

// Zoom toward a MOVING target — anchor follows the object each frame
cam.zoomAt(boss, 1.8, 0.8, easeOutExpo);

// Zoom limits
cam.minZoom = 0.25;
cam.maxZoom = 4.0;

// Read visible area (cached, zero-alloc — use for frustum culling)
const w = cam.visibleW;  // viewW / zoom
const h = cam.visibleH;  // viewH / zoom

// Zoom-aware resize (v2.1.0). The four dims are readonly; resize() is the one
// write path. visibleW/_maxX are correct on return (no stale frame) and the pose
// is re-clamped into the zoom-aware box -- no yank. At zoom 2, a camera settled
// at pos 2560 in a 3200x2400 world resized to view 1600x1200 lands pos 2400,
// visibleW 800 (the inherited base resize alone yanks it to 1600 with a stale 400).
cam.resize(1600, 1200, 3200, 2400);
```

**Coordinate conversion** (zero-alloc, caller-owned `out` pattern):
```js
const pt = { x: 0, y: 0 }; // allocate once at init
cam.screenToWorld(mouseX, mouseY, pt);
cam.worldToScreen(enemy.x, enemy.y, pt);
```

---

### Multi-Target Framing

```mermaid
graph LR
    subgraph Viewport
        direction TB
        P1["Player 1"]
        P2["Player 2"]
        BB["Bounding Box<br/>+ padding"]
    end

    BB --> AutoZoom["Auto-Zoom<br/><i>fit bbox into viewport</i>"]
    BB --> AutoCenter["Auto-Center<br/><i>track bbox midpoint</i>"]
    AutoZoom --> Smooth["Exponential<br/>Damping"]
    AutoCenter --> Smooth

    style P1 fill:#fbbf24,stroke:#92400e,color:#000
    style P2 fill:#22d3ee,stroke:#155e75,color:#000
    style BB fill:none,stroke:#a78bfa,stroke-dasharray:5 5,color:#a78bfa
    style AutoZoom fill:#a78bfa,stroke:#5b21b6,color:#000
    style AutoCenter fill:#a78bfa,stroke:#5b21b6,color:#000
    style Smooth fill:#34d399,stroke:#065f46,color:#000
```

```js
// Track two players — camera auto-zooms to keep both visible
cam.trackMultiple([player1, player2], {
    padding:    120,   // world-space padding around the bounding box
    minZoom:    0.4,
    maxZoom:    1.8,
    zoomSpeed:  4.0,   // zoom smoothing (higher = snappier)
    followSpeed: 5.0,  // position smoothing
});

// Add a third target dynamically
cam.trackMultiple([player1, player2, boss], { padding: 100 });

// Return to single-target follow (smooth transition)
cam.trackSingle();
```

---

### Shake System

```mermaid
graph TB
    subgraph "Shake Engine — 8 simultaneous slots"
        S1["Slot 1<br/>EXPLOSION<br/>trauma=0.8"]
        S2["Slot 2<br/>RECOIL ↑<br/>trauma=0.5"]
        S3["Slot 3<br/>RUMBLE<br/>trauma=0.2"]
        S4["Slot 4–8<br/><i>available</i>"]
    end

    S1 --> Sum["Sum All Layers"]
    S2 --> Sum
    S3 --> Sum
    Sum --> Noise["Simplex Noise<br/><i>smooth, organic</i>"]
    Noise --> Out["offsetX · offsetY · angle"]
    Out --> Canvas["ctx.translate() + ctx.rotate()"]

    style S1 fill:#ef4444,stroke:#991b1b,color:#fff
    style S2 fill:#a78bfa,stroke:#5b21b6,color:#000
    style S3 fill:#f97316,stroke:#9a3412,color:#000
    style S4 fill:#374151,stroke:#4b5563,color:#9ca3af
    style Noise fill:#fbbf24,stroke:#92400e,color:#000
    style Sum fill:#1e1e2e,stroke:#6b7280,color:#d1d5db
    style Out fill:#1e1e2e,stroke:#6b7280,color:#d1d5db
    style Canvas fill:#1e1e2e,stroke:#6b7280,color:#d1d5db
```

Multiple shakes run simultaneously and sum together. Each slot has its own trauma, frequency, decay rate, and direction.

```js
// Backward-compatible simple trauma
cam.addTrauma(0.5);

// v2.0.0: named presets moved to the ./shake subpath; cam.shakePreset was
// dropped. Fetch a preset and fire it -- the guard is now OPTIONAL (getPreset
// returns null on an unknown name, and v2.1.0 makes cam.shake(null) a documented
// no-op; a non-object profile throws ERR_SHAKE_PROFILE).
import { getPreset, registerPreset } from '@zakkster/lite-camera-pro/shake';

const preset = (name, i = 1) => { const p = getPreset(name); if (p) cam.shake(p, i); };

preset('explosion');       // big boom
preset('earthquake');      // sustained rumble
preset('recoil');          // directional upward kick
preset('impact');          // sharp snappy jolt
preset('landing');         // vertical downward push
preset('damage');          // quick pulse, no rotation
preset('rumble');          // continuous low vibration
preset('heavy_impact');    // maximum everything

// Custom profile (cam.shake is on the class -- no attach needed)
cam.shake({
    trauma:    0.6,
    freq:      18,      // noise frequency (higher = jittery)
    decay:     1.5,     // trauma units lost per second
    maxOffset: 20,      // max pixel displacement
    maxAngle:  0.03,    // max rotation (radians)
    dirX:      1,       // directional X (0 = omnidirectional)
    dirY:      0,       // directional Y
});

// Layer multiple shakes for complex events
preset('explosion');
preset('recoil', 0.7);  // half intensity
preset('rumble');

// Register custom presets (registry lives on ./shake)
registerPreset('sword_clash', {
    trauma: 0.3, freq: 28, decay: 3.0,
    maxOffset: 8, maxAngle: 0.03,
    dirX: 1, dirY: 0,
});

preset('sword_clash');

// Stop all shakes immediately
cam.clearShakes();

// Base-shake bridge (v2.1.0): the inherited lite-camera fields are live
// accessors onto the default omni slot, so a base-style caller's shake works.
cam.shakeMaxOffset = 20;   // px at full trauma (default 15)
cam.shakeMaxAngle  = 0.04; // rad at full trauma (default 0.05)
cam.shakeTrauma    = 1;    // ASSIGNS min(1, v) (addTrauma accumulates); <= 0 stops it
// A non-finite write throws ERR_CAMERA_SHAKE; writing a max field alone fires nothing.
```

---

### Cinematic Sequences

```mermaid
sequenceDiagram
    participant G as Gameplay
    participant S as Sequence
    participant C as Camera

    G->>S: camera.playSequence(seq)
    Note over G: Follow mode paused

    S->>C: moveTo(boss.x, boss.y, 1200ms)
    S->>C: zoomTo(1.8, 800ms)
    S->>C: shake('explosion')
    S->>C: wait(600ms)
    S->>C: call(() => boss.startPhase2())
    S->>C: moveAndZoom(player, 1.0, 1000ms)

    S-->>G: onComplete callback
    Note over G: Follow mode resumes<br/>smooth blend-back
```

**The killer feature.** Chain camera moves with a fluent API. The sequence takes full control of position and zoom. When it ends, follow mode resumes with a smooth transition.

```js
// v2.0.0: attach the sequence factory once (or call createCameraSequence(cam,
// opts) from ./sequence directly).
import { withSequences } from '@zakkster/lite-camera-pro/sequence';
withSequences(cam);

const seq = cam.createSequence({ onComplete: () => showUI() })
    .moveTo(boss.x, boss.y, 1200)                     // pan to boss
    .zoomTo(1.8, 800)                                  // zoom in
    .shake('explosion')                                 // screen shake
    .wait(600)                                          // hold for drama
    .call(() => boss.startPhase2())                     // trigger game event
    .moveAndZoom(player.x, player.y, 1.0, 1000);      // return to player

cam.playSequence(seq);

// Playback control
cam.stopSequence();      // cancel + smooth return to follow
seq.pause();             // freeze
seq.resume();            // continue
seq.seek(2000);          // jump to 2s mark
```

**Sequence presets** for common patterns:
```js
import { panTo, dramaticZoom, bossReveal, timedShake } from '@zakkster/lite-camera-pro';

// Simple pan
cam.playSequence(panTo(cam, 800, 400, 1500));

// Boss reveal: zoom in → shake → hold → return
cam.playSequence(bossReveal(cam, boss.x, boss.y, 3000));

// Dramatic zoom with overshoot easing
cam.playSequence(dramaticZoom(cam, boss.x, boss.y, 2.5, 1200));
```

---

### Parallax Layers

```mermaid
graph LR
    subgraph "Scroll Speed"
        Sky["☁ Sky<br/>speed: 0.1"]
        Mountains["⛰ Mountains<br/>speed: 0.3"]
        Trees["🌲 Trees<br/>speed: 0.7"]
        Game["🎮 Game Layer<br/>speed: 1.0"]
        Foreground["🌿 Foreground<br/>speed: 1.3"]
    end

    Sky ~~~ Mountains ~~~ Trees ~~~ Game ~~~ Foreground

    style Sky fill:#1e3a5f,stroke:#2563eb,color:#93c5fd
    style Mountains fill:#1e3a5f,stroke:#2563eb,color:#93c5fd
    style Trees fill:#064e3b,stroke:#059669,color:#6ee7b7
    style Game fill:#fbbf24,stroke:#92400e,color:#000
    style Foreground fill:#064e3b,stroke:#059669,color:#6ee7b7
```

Up to 16 layers. Each scrolls at its own speed relative to the camera.

```js
// v2.0.0: attach the parallax subsystem once, from the ./parallax subpath.
import { withParallax } from '@zakkster/lite-camera-pro/parallax';
withParallax(cam);

cam.addParallaxLayer('sky',        0.1);   // barely moves
cam.addParallaxLayer('mountains',  0.3);   // slow
cam.addParallaxLayer('trees',      0.7);   // medium
// game layer is the normal camera (1.0)
cam.addParallaxLayer('foreground', 1.3);   // moves faster than camera

// Render each layer with its own transform
ctx.save();
cam.applyParallax('sky', ctx);
drawSky(ctx);
ctx.restore();

ctx.save();
cam.applyParallax('mountains', ctx);
drawMountains(ctx);
ctx.restore();

ctx.save();
cam.apply(ctx);     // normal game layer
drawWorld(ctx);
ctx.restore();

ctx.save();
cam.applyParallax('foreground', ctx);
drawForeground(ctx);
ctx.restore();

// Update or remove layers
cam.addParallaxLayer('sky', 0.15);   // update speed by re-adding same id
cam.removeParallaxLayer('foreground');

// Tiling: WrapMode wraps a layer's scroll into tile space (negative-safe
// Euclidean modulo). A REPEAT mode requires the tile size for its axis, or
// addParallaxLayer throws ERR_PARALLAX_TILE (fail closed on both add paths).
import { WrapMode } from '@zakkster/lite-camera-pro/parallax';
cam.addParallaxLayer('clouds', 0.2, 0.2, { wrap: WrapMode.REPEAT_X, tileW: 256 });
// scroll of 3*256 + 7 reads 7; a scroll of -9 reads 247. NONE layers are
// byte-identical to a non-wrapping build (one `wrap !== 0` compare, ~1.72 ns/layer).
```

---

### Smart Bounds

```mermaid
graph LR
    subgraph "Boundary Behavior"
        H["HARD<br/><i>stops at edge</i>"]
        S["SOFT<br/><i>holds a half-zone back</i>"]
        E["ELASTIC<br/><i>overshoot + spring back</i>"]
        N["NONE<br/><i>no enforcement</i>"]
    end

    style H fill:#ef4444,stroke:#991b1b,color:#fff
    style S fill:#fbbf24,stroke:#92400e,color:#000
    style E fill:#a78bfa,stroke:#5b21b6,color:#000
    style N fill:#374151,stroke:#4b5563,color:#9ca3af
```

Configure boundary behavior per-edge. Mix and match.

`SOFT` decelerates as the camera nears the edge and holds a half-zone back: the
granted position is monotone, fixed at the zone entry, and never nearer the edge
than requested (a quadratic hold-out `g = edge + s*sz*0.5*(1 + u*u)`). Only `HARD`
reaches the edge itself. With `softZone` 80 at edge 0, a requested 40 is granted
50, 20 -> 42.5, 79 -> 79.01.

```js
import { BoundsType } from '@zakkster/lite-camera-pro';

// All edges the same
cam.setBoundsType(BoundsType.SOFT);

// Per-edge configuration
cam.setBoundsEdges({
    left:   BoundsType.HARD,
    right:  BoundsType.SOFT,
    top:    BoundsType.ELASTIC,
    bottom: BoundsType.HARD,
});

// Tuning (guarded setter: softZone >= 0, all finite, else ERR_CAMERA_BOUNDS)
cam.setSoftZone(80, 30, 8.0);      // softZone, elasticMax, elasticStrength
// or the raw fields:
cam._bounds.softZone = 80;         // deceleration zone width (pixels)
cam._bounds.elasticMax = 30;       // max overshoot (pixels)
cam._bounds.elasticStrength = 8.0; // spring-back speed

// Dynamic bounds for rooms / arenas
cam.setBoundsRect(200, 200, 1200, 800);   // constrain to rectangle
cam.clearBoundsRect();                      // revert to full world
```

Bounds edge types fail closed: a garbage type (`setBoundsType(999)`) or a
non-finite rect throws `ERR_CAMERA_BOUNDS` with nothing mutated.

---

### Debug HUD

The Pro debug overlay shows everything at a glance. Each panel is individually toggleable.

```js
// v2.0.0: attach the debug subsystem once, from the new ./debug subpath. It
// builds cam.debugConfig (the constructor no longer does) and installs
// cam.debug/cam.debugHUD.
import { withDebug } from '@zakkster/lite-camera-pro/debug';
withDebug(cam);

// Toggle panels on/off
cam.debugConfig.show.shake    = false;
cam.debugConfig.show.parallax = false;
cam.debugConfig.show.bounds   = true;

// Render
ctx.save();
cam.apply(ctx);
cam.debug(ctx);       // world-space: deadzone rect, lookahead vector, world bounds
ctx.restore();
cam.debugHUD(ctx);    // screen-space: position, zoom, mode, shake bars, sequence %
```

**Panels:** position · zoom · follow mode · shake slots (per-slot trauma bars) · sequence progress · parallax layers · bounds type

The debug HUD uses **zero allocations per frame** — it draws directly to canvas with no intermediate objects.

---

### Save & Load

```js
// Capture snapshot
const snapshot = cam.getState();
// → { posX, posY, targetX, targetY, zoom, mode }

// Restore
cam.setState(snapshot);
// Updates position, zoom, mode, and recalculates visible dimensions

// Serialize for save files
localStorage.setItem('camera', JSON.stringify(cam.getState()));
cam.setState(JSON.parse(localStorage.getItem('camera')));
```

---

## Update Loop Integration

```mermaid
flowchart TB
    Start["camera.update(dt, px, py, vx, vy)"] --> SeqCheck{Sequence<br/>active?}

    SeqCheck -->|Yes| SeqPath["Read sequence state<br/><i>position + zoom from timeline</i>"]
    SeqCheck -->|No| MTCheck{Multi-target<br/>active?}

    MTCheck -->|Yes| MTPath["Compute bounding box<br/>Auto-zoom + center"]
    MTCheck -->|No| SinglePath["Follow strategy<br/><i>SMOOTH / LOCK / PREDICTIVE / CUT / HYBRID</i>"]

    SinglePath --> ZoomAnim["Zoom animation<br/><i>lerp + easing</i>"]
    ZoomAnim --> BoundsCalc["Update visible dims"]

    SeqPath --> Bounds
    MTPath --> Bounds
    BoundsCalc --> Bounds

    Bounds["Apply bounds<br/><i>HARD / SOFT / ELASTIC / NONE</i>"]
    Bounds --> Lerp["Smooth follow<br/><i>pos += (target - pos) × speed × dt</i>"]
    Lerp --> Parallax["Update parallax layers"]
    Parallax --> Shake["Update shake decay"]
    Shake --> Done["Frame complete"]

    style Start fill:#fbbf24,stroke:#92400e,color:#000
    style SeqPath fill:#a78bfa,stroke:#5b21b6,color:#000
    style MTPath fill:#34d399,stroke:#065f46,color:#000
    style SinglePath fill:#22d3ee,stroke:#155e75,color:#000
    style Shake fill:#ef4444,stroke:#991b1b,color:#fff
    style Done fill:#1e1e2e,stroke:#6b7280,color:#d1d5db
```

One call to `update()` handles everything. The camera automatically dispatches to the right code path based on active state (sequence > multi-target > follow mode).

---

## Module Reference

| Module | Lines | Purpose |
|:---|---:|:---|
| `CinematicCameraPro.js` | 1127 | Main class + fail-closed detach stubs. Zoom, modes, multi-target, shake, bounds |
| `CameraSequence.js` | 638 | Fluent timeline builder + sequence presets + `withSequences` (`./sequence`) |
| `ShakeEngine.js` | 328 | 8-slot noise-based shake pool |
| `DebugHUD.js` | 319 | Screen/world debug overlays + `withDebug` (`./debug`) |
| `ParallaxManager.js` | 240 | 16-layer scroll manager + `withParallax` (`./parallax`) |
| `BoundsSystem.js` | 220 | Per-edge boundary enforcement |
| `ShakePresets.js` | 192 | 8 frozen profiles + custom registry (`./shake`) |
| `FollowMode.js` | 179 | 5 pure follow strategies |
| `index.d.ts` | 166 | Full TypeScript declarations |
| `MultiTarget.js` | 133 | Bounding box framing + auto-zoom |
| `index.js` | 32 | Public exports -- the 20-name root surface (D5) |

---

## Zero-GC Design

Every hot-path function in lite-camera-pro is allocation-free:

- **Coordinate conversion** uses caller-owned `out` objects (never returns `{ x, y }`)
- **Visible dimensions** are cached as `cam.visibleW` / `cam.visibleH` (no `getVisibleArea()`)
- **Shake slots** are pre-allocated in a fixed-size pool (8 slots, reused via steal)
- **Follow modes** are pure functions that mutate `cam.target[]` directly
- **Debug HUD** draws directly to canvas — no intermediate line objects
- **Parallax layers** are pre-allocated (16 slots, mutated in place)
- **Bounds state** is a single pre-allocated config object

The only allocations happen during **setup** (constructor, `createSequence()`, `trackMultiple()`) — never inside the 60fps update/render loop.

---

## TypeScript

Full declarations ship in `src/index.d.ts`:

```ts
// v2.0.0: the class + core enums come from "."; sequences/presets from subpaths.
import { CinematicCameraPro, FollowMode, BoundsType } from '@zakkster/lite-camera-pro';
import { withSequences, type CameraSequence } from '@zakkster/lite-camera-pro/sequence';
import { getPreset } from '@zakkster/lite-camera-pro/shake';

const cam = new CinematicCameraPro(800, 600, 3200, 2400);
cam.setMode(FollowMode.PREDICTIVE);
cam.setBoundsType(BoundsType.ELASTIC);
withSequences(cam);

const seq: CameraSequence = cam.createSequence()
    .moveTo(400, 300, 1200)
    .zoomTo(2.0, 800)
    .shake('explosion');
```

---

## Testing

```bash
npm test          # node:test -- 348 tests
npm run test:gc   # same, under --expose-gc
npm run torture   # node --expose-gc test/torture.mjs -- prints "ok"
```

The suite covers the class facade (initialization, coordinate conversion, all 5
follow modes, multi-target framing, zoom animation, the shake engine, bounds,
save/load, destruction), the attached subsystems (parallax, sequences, debug),
the directly-exported functional API, and the v2.0.0 detach gates: a static
import-graph walk (`test/import-graph.test.js`), literal bundle probes
(`test/bundle-literals.test.js`), the class-only 3PPLE replay
(`test/consumer-tripple.test.js`), and the `.`/subpath size ceilings
(`test/size.mjs`).

---

## Migration from lite-camera

lite-camera-pro extends `CinematicCamera`. Drop-in replacement:

```diff
- import { CinematicCamera } from '@zakkster/lite-camera';
+ import { CinematicCameraPro as CinematicCamera } from '@zakkster/lite-camera-pro';

  const cam = new CinematicCamera(800, 600, 3200, 2400);
  // Everything from lite-camera still works: addTrauma(), update(), apply().
  // (v2.0.0: debug() now needs withDebug(cam) -- see the 1.x -> 2.0.0 table below.)
```

Then add Pro features incrementally. Nothing breaks.

---

## Migration from 1.x to 2.0.0

v2.0.0 detached four subsystems from the class so a class-only consumer stops
bundling them (and `lite-timeline`). The core -- follow, zoom, shake, multi-target,
bounds, coordinate conversion, save/load -- is unchanged. Add the opt-ins you use:

| 1.x | 2.0.0 |
| --- | --- |
| `cam.shakePreset(name, i)` | `import { getPreset } from '@zakkster/lite-camera-pro/shake';`<br>`const p = getPreset(name); if (p) cam.shake(p, i);` |
| `cam.createSequence(opts)` | `import { withSequences } from '@zakkster/lite-camera-pro/sequence';`<br>`withSequences(cam); cam.createSequence(opts);` |
| `cam.addParallaxLayer(...)` / `applyParallax` | `import { withParallax } from '@zakkster/lite-camera-pro/parallax';`<br>`withParallax(cam);` then call sites unchanged |
| `cam.debug(ctx)` / `cam.debugHUD(ctx)` | `import { withDebug } from '@zakkster/lite-camera-pro/debug';`<br>`withDebug(cam);` then call sites unchanged |
| `import { getPreset, createCameraSequence, createParallaxState, drawDebugHUD } from '@zakkster/lite-camera-pro';` | import those names from `./shake`, `./sequence`, `./parallax`, `./debug` |

The `getPreset` guard is MANDATORY: an unknown name returns `null` and
`cam.shake(null)` throws, so `if (p)` preserves the old no-op-on-unknown-name.
An unattached subsystem method throws a named error (`ERR_PARALLAX_NOT_ATTACHED`,
`ERR_SEQUENCE_NOT_ATTACHED`, `ERR_DEBUG_NOT_ATTACHED`) whose message names the
exact import + call to fix it; a second `withX` throws `ERR_ALREADY_ATTACHED`.

---

## License

MIT © Zahary Shinikchiev. See [LICENSE](LICENSE).
