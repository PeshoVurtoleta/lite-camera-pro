# @zakkster/lite-camera-pro

[![npm version](https://img.shields.io/npm/v/@zakkster/lite-camera-pro.svg?style=for-the-badge&color=latest)](https://www.npmjs.com/package/@zakkster/lite-camera-pro)
![Zero-GC](https://img.shields.io/badge/Zero--GC-Hot%20path-00C853?style=for-the-badge&logo=leaf&logoColor=white)
[![sponsor](https://img.shields.io/badge/sponsor-PeshoVurtoleta-ea4aaa.svg?logo=github)](https://github.com/sponsors/PeshoVurtoleta)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@zakkster/lite-camera-pro?style=for-the-badge)](https://bundlephobia.com/result?p=@zakkster/lite-camera-pro)
[![npm downloads](https://img.shields.io/npm/dm/@zakkster/lite-camera-pro?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-camera-pro)
[![npm total downloads](https://img.shields.io/npm/dt/@zakkster/lite-camera-pro?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-camera-pro)
![TypeScript](https://img.shields.io/badge/TypeScript-Types-informational)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> Cinematic Canvas2D camera for games. The class you ship, the subsystems you
> opt into. Zero garbage collection in the update/render hot path.

## The cinematic layer the camera stack was missing

`@zakkster/lite-camera` gives you follow, deadzone, lookahead and a basic RNG
shake -- enough to prototype. `lite-camera-pro` is what you reach for when the
prototype becomes a product: the boss reveal that zooms in, shakes, holds and
swoops back; the co-op mode that frames both players; the parallax depth; the
platformer camera that is smooth horizontally and pixel-locked vertically; the
explosion that layers three shakes at once. All of it runs at 60fps with zero
allocation in the frame loop.

The engine is what a real consumer shipped a win-modal screen shake on, replacing
six hand-authored GSAP keyframes (see [Why this exists](#why-this-exists)). The
2.0.0 detach then made the class stop paying for subsystems it never calls: a
class-only camera is 17.60 KB gz and pulls in none of parallax, sequences, the
debug HUD or `lite-timeline`.

```
npm install @zakkster/lite-camera-pro
```

```js
import { CinematicCameraPro, FollowMode } from '@zakkster/lite-camera-pro';

const cam = new CinematicCameraPro(
    canvas.width, canvas.height,   // viewport
    WORLD_W, WORLD_H               // world
);

function update(dt) {
    cam.update(dt, player.x, player.y, player.vx, player.vy);
}

function render(ctx) {
    ctx.save();
    cam.apply(ctx);       // translate + scale + rotate the canvas (shake included)
    drawWorld(ctx);
    ctx.restore();
}

cam.setMode(FollowMode.HYBRID);   // smooth-X, locked-Y
cam.addTrauma(0.5);               // instant kick
cam.setZoom(2.0, 0.5);            // eased zoom to 2x over 0.5s
```

A camera that only follows and shakes needs no attach at all -- `update`,
`apply`, `shake`, `setZoom`, `trackMultiple`, bounds and coordinate conversion
are all on the class. Need only screen shake? Import the `./shake` subpath and
pull the engine plus presets (3.07 KB gz -- esm, unminified, gzip -9):

```js
import { createShakeState, addShake, updateShake, computeShake, getPreset } from '@zakkster/lite-camera-pro/shake';
```

## Table of contents

- [The cinematic layer the camera stack was missing](#the-cinematic-layer-the-camera-stack-was-missing)
- [Why this exists](#why-this-exists)
- [What you get](#what-you-get)
- [The shake engine](#the-shake-engine)
- [API reference](#api-reference)
- [Composability with the ecosystem](#composability-with-the-ecosystem)
- [Zero-GC design notes](#zero-gc-design-notes)
- [Design decisions worth knowing](#design-decisions-worth-knowing)
- [Migration](#migration)
- [Testing](#testing)
- [What this is not](#what-this-is-not)
- [Ecosystem](#ecosystem)
- [License](#license)

## Why this exists

Three problems this package was built to close, each surfaced by a shipping
consumer -- the Las Vegas scratch-card game whose win-modal shake replaced six
GSAP keyframes:

1. **A shake engine you cannot reach standalone.** The tree-shakeable functional
   API (`createShakeState`, `addShake`, `updateShake`, `computeShake`) was
   documented but exported one file too low, so every function took a state no
   consumer could construct. Fixed: the root surface and the `./shake` subpath
   both expose it (`createShakeState` is the entry point).
2. **A class that pays for everything.** A bundler cannot tree-shake a reachable
   class method, so a consumer that imported `CinematicCameraPro` for its shake
   shipped parallax, sequences, the debug HUD and all of `lite-timeline` too --
   measured at 73.5 KB gz of dead weight. The 2.0.0 detach severs those four
   from the class and the root barrel; they return per instance on their
   subpaths.
3. **A preset you cannot shorten.** A preset's on-screen duration is welded to
   `trauma / decay`, and `intensity` scales trauma -- so amplitude and duration
   move together. The escape hatch (a hand-written profile with a higher `decay`)
   is documented directly under the [preset table](#shake).

**The dependency story.** `lite-camera-pro` has five runtime dependencies and
every one is first-party `@zakkster`: `lite-camera` (the base `CinematicCamera`),
`lite-ease`, `lite-lerp`, `lite-noise` and `lite-timeline`. There are zero
third-party packages in the final bundle. `lite-timeline` is reached ONLY through
the `./sequence` subpath -- a class-only consumer ships none of it. The
multi-file `src/` layout and these first-party floors are the two deliberate
departures from suite single-file law, recorded and justified in
[decisions/0001](decisions/0001-layout-and-deps.md).

## What you get

Everything `lite-camera` does, plus the cinematic layer on top:

| Capability | lite-camera | lite-camera-pro |
|:---|:---:|:---:|
| Smooth follow + deadzone + lookahead | yes | yes |
| Canvas transform apply | yes | yes |
| Basic RNG shake | yes | (replaced by the noise engine) |
| Smooth eased zoom + anchor-point zoom | -- | yes |
| Dynamic zoom-at-a-moving-target | -- | yes |
| 5 follow modes (smooth / lock / predictive / cut / hybrid) | -- | yes |
| Multi-target auto-framing (bounding box + auto-zoom) | -- | yes |
| Noise-based shake, 8 simultaneous summed slots | -- | yes |
| Directional shake (recoil, landing, per-axis) | -- | yes |
| 8 shake presets + custom registry | -- | yes |
| Cinematic timeline sequences (`./sequence`) | -- | yes |
| Fluent sequence builder + sequence presets | -- | yes |
| Parallax layer manager, 16 layers + tile wrap (`./parallax`) | -- | yes |
| Smart bounds: hard / soft / elastic / none, per-edge | -- | yes |
| Dynamic bounds (room transitions, arenas) | -- | yes |
| Pro debug HUD, toggleable panels (`./debug`) | -- | yes |
| Zero-alloc coordinate conversion (screenToWorld / worldToScreen) | -- | yes |
| Save / load pose (getState / setState) | -- | yes |
| Full TypeScript declarations | -- | yes |

The class carries the core (follow, zoom, shake, multi-target, bounds,
coordinate conversion, save/load). Parallax, sequences and debug are opt-ins you
attach per instance with `withParallax` / `withSequences` / `withDebug`.

## The shake engine

<details>
<summary><b>The trauma model, the 8-slot pool, and reproducibility</b></summary>

The shake is simplex-noise driven, not RNG, so it reads as smooth organic camera
motion instead of per-frame jitter. Each active shake occupies a **slot** in a
fixed pool of 8, and every slot carries its own `trauma`, `freq`, `decay`,
`maxOffset`, `maxAngle` and direction. Every frame, all active slots are summed.

- **`trauma^2` perceptual scaling.** Displacement scales with the square of
  trauma, so a shake feels like it falls off sharply as it decays rather than
  fading linearly -- the classic "trauma, not shake" curve.
- **8 slots with steal.** `addShake` takes the first inactive slot; when all 8
  are live it steals the one with the lowest trauma. Layering three shakes for
  one explosion is just three `addShake` calls.
- **`seedOffset = seed * 7919`.** Each camera offsets its noise sampling by its
  constructor `seed` (default 42) times the prime 7919. Two cameras with
  different seeds decorrelate -- they do not shake in lockstep.
- **Determinism note.** The simplex permutation table is a GLOBAL singleton owned
  by `lite-noise`, not per camera. Calling `seedNoise()` anywhere in the app
  re-shapes the shake of every camera at once. The per-camera `seedOffset`
  decorrelates cameras from each other but does NOT isolate any of them from a
  global reseed. For reproducible shake, seed the global table once at startup
  and leave it.

**Tier ramp (a shipped consumer's).** The win-modal ramp was derived from the
presets, and the peaks land where the preset arithmetic (`trauma / decay` for
duration, `trauma^2 * maxOffset` for amplitude) says they should:

| tier | source | peak px | peak deg | duration |
|:---|:---|---:|---:|---:|
| jackpot | `impact` @ 0.8 | 5.8 | 0.34 | 301 ms |
| megaJackpot | `impact` @ 1.15 | 11.9 | 0.76 | 434 ms |
| ultraJackpot | custom profile @ 1.0 | 35.7 | 2.11 | 651 ms |

Provenance: consumer-derived (BRIEF), reproducible from preset arithmetic.

</details>

## API reference

### The class

```js
new CinematicCameraPro(viewW, viewH, worldW, worldH, seed = 42)
```

Per frame: `cam.update(dt, playerX, playerY, playerVX = 0, playerVY = 0)`, then
`ctx.save(); cam.apply(ctx); drawWorld(ctx); ctx.restore();`. `update()`
dispatches by priority: active sequence > multi-target > single-target follow
mode. `apply(ctx)` translates, scales and rotates the sink to the camera
transform, shake included. `dt` and every duration argument follow the
[units table](#units-seconds-vs-milliseconds).

### Units: seconds vs milliseconds

The class API speaks **seconds**; the sequence builder speaks **milliseconds**.
Do not mix them. (Linked from [the class](#the-class) and [Sequences](#sequences).)

| Seconds (class API) | Milliseconds (sequence builder) |
|:---|:---|
| `update(dt, ...)` | `moveTo(x, y, durationMs)` |
| `maxDt` (default 0.1) | `zoomTo(level, durationMs)` |
| `setZoom(level, duration)`, `zoomAt(..., duration)` | `moveAndZoom(x, y, level, durationMs)` |
| `decay` (trauma per second) | `wait(ms)` |
| `blendOutTime` (default 0.3) | `seek(ms)` |
| `predictTime` (default 0.3) | `'+=n'` / `'-=n'` position grammar |

### Follow modes

```js
cam.setMode(FollowMode.SMOOTH);      // deadzone + lookahead + lerp (default)
cam.setMode(FollowMode.LOCK);        // instant snap, no interpolation
cam.setMode(FollowMode.PREDICTIVE);  // velocity extrapolation (cam.predictTime seconds)
cam.setMode(FollowMode.CUT);         // hard jump, zero lerp (cutscene transitions)
cam.setMode(FollowMode.HYBRID);      // smooth horizontal, locked vertical
cam.hybridVerticalSnap = false;      // fast-lerp vertical instead of instant
```

### Zoom + conversion

```js
cam.setZoom(2.0, 0.5, easeOutExpo);       // eased zoom to 2x over 0.5s
cam.zoomAt(400, 300, 1.8, 0.8);           // zoom toward a static world point
cam.zoomAt(boss, 1.8, 0.8);               // zoom toward a MOVING {x, y}, re-read each frame
cam.minZoom = 0.25; cam.maxZoom = 4.0;    // clamp limits
const w = cam.visibleW;                   // cached viewW / zoom (zero-alloc; use for culling)

const pt = { x: 0, y: 0 };                // allocate once
cam.screenToWorld(mouseX, mouseY, pt);    // mutates pt, returns pt
cam.worldToScreen(enemy.x, enemy.y, pt);

cam.resize(1600, 1200, 3200, 2400);       // zoom-aware; the four dims are readonly
```

### Multi-target

```js
cam.trackMultiple([player1, player2], {
    padding: 120, minZoom: 0.4, maxZoom: 1.8, zoomSpeed: 4.0, followSpeed: 5.0,
});
cam.trackSingle();                        // back to single-target follow
```

### Shake

```js
cam.addTrauma(0.5);                       // simple omnidirectional trauma
cam.shake({ trauma: 0.6, freq: 18, decay: 1.5, maxOffset: 20, maxAngle: 0.03, dirX: 1, dirY: 0 });
cam.clearShakes();

import { getPreset, registerPreset } from '@zakkster/lite-camera-pro/shake';
const p = getPreset('explosion'); if (p) cam.shake(p);   // guard OPTIONAL: cam.shake(null) is a no-op
```

| preset | trauma | freq | decay | maxOffset | maxAngle | dir | duration (trauma/decay) |
|:---|---:|---:|---:|---:|---:|:---:|---:|
| `explosion` | 0.8 | 12 | 0.7 | 25 | 0.06 | omni | 1.14 s |
| `earthquake` | 0.5 | 6 | 0.3 | 30 | 0.02 | omni | 1.67 s |
| `recoil` | 0.5 | 20 | 2.5 | 12 | 0.02 | up | 0.20 s |
| `impact` | 0.7 | 25 | 2.0 | 18 | 0.04 | omni | 0.35 s |
| `landing` | 0.4 | 18 | 1.5 | 10 | 0.01 | down | 0.27 s |
| `damage` | 0.35 | 22 | 3.0 | 6 | 0 | omni | 0.12 s |
| `rumble` | 0.2 | 30 | 0.15 | 3 | 0 | omni | 1.33 s |
| `heavy_impact` | 1.0 | 10 | 0.5 | 35 | 0.08 | omni | 2.00 s |

A preset's on-screen duration is `trauma / decay`, not a separate field, and
`intensity` scales BOTH amplitude AND duration (it multiplies trauma) -- to
shorten a preset without dropping its peak, copy the profile with a higher
`decay` (the consumer raised `heavy_impact`'s decay 0.5 -> 1.6 to land the same
peak in 0.63 s).

The base-shake bridge (`cam.shakeTrauma` / `cam.shakeMaxOffset` default 15 px /
`cam.shakeMaxAngle` default 0.05 rad) are live accessors onto the default omni
slot, so a base-style `lite-camera` caller's shake works unchanged.

### Sequences

Fluent timeline that takes over position and zoom. Step durations are in
**milliseconds** (see the [units table](#units-seconds-vs-milliseconds));
`blendOutTime` is in seconds.

```js
import { withSequences } from '@zakkster/lite-camera-pro/sequence';
withSequences(cam);

const seq = cam.createSequence({ onComplete: () => showUI(), blendOutTime: 0.3 })
    .moveTo(boss.x, boss.y, 1200)
    .zoomTo(1.8, 800)
    .shake('explosion')
    .wait(600)
    .call(() => boss.startPhase2())
    .moveAndZoom(player.x, player.y, 1.0, 1000);

cam.playSequence(seq);
cam.stopSequence();          // hard handoff: releases the shared ticker, no blend
seq.pause(); seq.resume(); seq.seek(2000);
```

Sequence presets (return a sequence): `panTo(cam, x, y, ms)`,
`dramaticZoom(cam, x, y, level, ms)`, `bossReveal(cam, x, y, ms)`,
`timedShake(cam, presetName, ms)`. `bossReveal` captures its return pose at BUILD
time -- build it immediately before playing.

### Parallax

```js
import { withParallax, WrapMode } from '@zakkster/lite-camera-pro/parallax';
withParallax(cam);

cam.addParallaxLayer('sky', 0.1);                    // barely moves
cam.addParallaxLayer('mountains', 0.3);
cam.addParallaxLayer('clouds', 0.2, 0.2, { wrap: WrapMode.REPEAT_X, tileW: 256 });
cam.removeParallaxLayer('sky');

ctx.save(); cam.applyParallax('mountains', ctx); drawMountains(ctx); ctx.restore();
```

Up to 16 layers, each scrolling at its own speed. A REPEAT wrap mode folds the
layer scroll into tile space (negative-safe Euclidean modulo) and requires the
tile size for its axis, or `addParallaxLayer` throws `ERR_PARALLAX_TILE`.

### Bounds

```js
import { BoundsType } from '@zakkster/lite-camera-pro';
cam.setBoundsType(BoundsType.SOFT);
cam.setBoundsEdges({ left: BoundsType.HARD, right: BoundsType.SOFT, top: BoundsType.ELASTIC, bottom: BoundsType.HARD });
cam.setSoftZone(80, 30, 8.0);                        // softZone, elasticMax, elasticStrength (guarded)
cam.setBoundsRect(200, 200, 1200, 800);              // constrain to a rectangle
cam.clearBoundsRect();
```

`SOFT` decelerates as the camera nears the edge and holds a half-zone back (a
quadratic hold-out, `g = edge + s*sz*0.5*(1 + u*u)`); only `HARD` reaches the
edge itself. See [decisions/0005](decisions/0005-soft-bounds.md).

### Debug

```js
import { withDebug } from '@zakkster/lite-camera-pro/debug';
withDebug(cam);
cam.debugConfig.show.shake = false;                  // toggle panels
ctx.save(); cam.apply(ctx); cam.debug(ctx); ctx.restore();   // world-space overlay
cam.debugHUD(ctx);                                   // screen-space HUD (after restore)
```

### State (pose-only)

```js
const snap = cam.getState();   // { posX, posY, targetX, targetY, zoom, mode }
cam.setState(snap);            // restores pose + recomputes visible dims
cam.destroy();                 // every method then throws ERR_CAMERA_DESTROYED
```

The snapshot is pose-only -- shake, sequences and zoom animations are not
serialized.

### TypeScript + CameraProSink

Full declarations ship in `src/index.d.ts`. `apply(ctx: CameraProSink)` accepts
any object with `translate`, `rotate` and `scale`:

```ts
import { CinematicCameraPro, FollowMode, BoundsType } from '@zakkster/lite-camera-pro';
import { withSequences, type CameraSequence } from '@zakkster/lite-camera-pro/sequence';

interface CameraProSink { translate(x: number, y: number): void; rotate(a: number): void; scale(x: number, y: number): void }
```

`CameraProSink` extends the base `CameraSink` (translate + rotate) with `scale`.
`CanvasRenderingContext2D` structurally satisfies it -- and so does any
three-method recorder object (see [Composability](#composability-with-the-ecosystem)).

### Subpath weights

Import only what you use. gz, esm, unminified, gzip -9 (`node test/size.mjs`):

| subpath | gz | contents |
|:---|---:|:---|
| `.` | 17.60 KB | class + the 22-name root surface (no parallax/sequence/debug/presets) |
| `./shake` | 3.07 KB | shake engine + presets/getPreset/registerPreset/listPresets |
| `./parallax` | 1.63 KB | parallax state + layer functions + WrapMode + withParallax |
| `./bounds` | 1.55 KB | bounds state + edge setters + applyBounds + BoundsType |
| `./multi` | 0.89 KB | createMultiTargetState + updateMultiTarget |
| `./follow` | 0.71 KB | FollowMode + FOLLOW_STRATEGIES |
| `./sequence` | 7.40 KB | sequence builder + presets + withSequences (drags lite-timeline + lite-ease by design) |
| `./debug` | 2.10 KB | debug config + draws + withDebug |

### Constants and defaults

Verified against `src/`. Capacities are documented as capacities -- they are NOT
exported names; the root surface stays exactly 22.

| name | value | notes |
|:---|:---|:---|
| `VERSION` | `"2.1.1"` | exported |
| shake slots | 8 | pool capacity (module constant `MAX_SHAKE_SLOTS`, not exported) |
| parallax layers | 16 | pool capacity (module constant `MAX_LAYERS`, not exported) |
| `seed` | 42 | constructor default; `seedOffset = seed * 7919` |
| `maxDt` | 0.1 s | `update()` clamp, plain tunable |
| `minZoom` | 0.25 | camera zoom clamp default |
| `maxZoom` | 4.0 | camera zoom clamp default |
| `predictTime` | 0.3 s | PREDICTIVE extrapolation window |
| `shakeMaxOffset` | 15 px | default omni slot, at full trauma |
| `shakeMaxAngle` | 0.05 rad | default omni slot, at full trauma |
| `blendOutTime` | 0.3 s | sequence completion blend default |
| `softZone` | 80 px | bounds default |
| `elasticMax` | 30 px | bounds default |
| `elasticStrength` | 8.0 | bounds default |

### Error codes

Every door throws a house-style `Error` with a `.code`. All 15:

| code | raised by |
|:---|:---|
| `ERR_CAMERA_MODE` | `setMode`: mode must be an integer FollowMode in [0, 4] |
| `ERR_CAMERA_STATE` | `setState`: snapshot validated in full before any write |
| `ERR_CAMERA_ZOOM` | `setZoom` / `zoomAt`: level/anchor/duration finite, duration >= 0 |
| `ERR_CAMERA_TARGETS` | `trackMultiple` / `setTargetCount`: array of finite-x/y objects |
| `ERR_SHAKE_PRESET` | `registerPreset`: non-empty string name + object profile |
| `ERR_SHAKE_PROFILE` | `shake` / `addShake`: null/undefined is a no-op; any other non-object is an error |
| `ERR_CAMERA_SHAKE` | `shakeTrauma` / `shakeMaxOffset` / `shakeMaxAngle` setters: value must be finite |
| `ERR_CAMERA_BOUNDS` | `setBoundsType` / `setBoundsEdges` / `setBoundsRect` / `setSoftZone` |
| `ERR_PARALLAX_TILE` | `addParallaxLayer`: a REPEAT wrap needs a finite tile size > 0 |
| `ERR_SEQUENCE_OPTIONS` | `createSequence({ blendOutTime })`: finite >= 0 seconds |
| `ERR_PARALLAX_NOT_ATTACHED` | parallax method before `withParallax(cam)` |
| `ERR_SEQUENCE_NOT_ATTACHED` | `createSequence` before `withSequences(cam)` |
| `ERR_DEBUG_NOT_ATTACHED` | `debug` / `debugHUD` before `withDebug(cam)` |
| `ERR_ALREADY_ATTACHED` | a second `withX` of the same subsystem on one camera |
| `ERR_CAMERA_DESTROYED` | every public method after `destroy()` (beats not-attached) |

## Composability with the ecosystem

An end-to-end pipeline: attach the subsystems, drive a boss reveal, resume
follow. Everything below is one camera.

```js
import { CinematicCameraPro, FollowMode, BoundsType } from '@zakkster/lite-camera-pro';
import { withSequences } from '@zakkster/lite-camera-pro/sequence';
import { withParallax } from '@zakkster/lite-camera-pro/parallax';
import { getPreset } from '@zakkster/lite-camera-pro/shake';

const cam = new CinematicCameraPro(800, 600, 3200, 2400);
withParallax(cam); withSequences(cam);
cam.setMode(FollowMode.SMOOTH);
cam.setBoundsType(BoundsType.SOFT);
cam.addParallaxLayer('sky', 0.2);

const reveal = cam.createSequence({ onComplete: () => resumeGameplay() })
    .moveTo(boss.x, boss.y, 1200)
    .zoomTo(1.8, 800)
    .shake('explosion')
    .wait(600)
    .moveAndZoom(player.x, player.y, 1.0, 1000);
cam.playSequence(reveal);
```

**Driving a non-canvas sink.** `apply(ctx)` touches exactly three methods --
`ctx.translate(x, y)`, `ctx.rotate(a)` and `ctx.scale(x, y)` -- nothing else. A
`CanvasRenderingContext2D` satisfies that, but so does a nine-line recorder that
writes a CSS `transform` onto a DOM node. The camera can drive a modal, an HTML
overlay or any transformable surface; Canvas2D is the default, not a requirement.

```js
// A CameraProSink that renders to a DOM element's CSS transform.
function cssTransformSink(el) {
    let tx = 0, ty = 0, rot = 0, sx = 1, sy = 1;
    return {
        translate(x, y) { tx = x; ty = y; },
        rotate(a) { rot = a; },
        scale(x, y) { sx = x; sy = y;
            el.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}rad) scale(${sx}, ${sy})`;
        },
    };
}
const sink = cssTransformSink(document.getElementById('modal'));
cam.apply(sink);   // the win-modal shake, no canvas anywhere
```

## Zero-GC design notes

<details>
<summary><b>Where the allocations are, and where they are not</b></summary>

| operation | allocates | when |
|:---|:---:|:---|
| `update()` (any dispatch path) | no | -- |
| `apply()` / `applyParallax()` | no | -- |
| `screenToWorld` / `worldToScreen` | no | caller-owned `out` object |
| `addTrauma` / `shake` / `computeShake` | no | pre-allocated 8-slot pool, reused via steal |
| follow strategies | no | pure functions mutating `cam.target[]` in place |
| bounds / parallax step | no | single pre-allocated config; 16 layer slots in place |
| debug HUD draw | no | draws directly to canvas, no intermediate objects |
| `getPreset(name)` | warm | one `toLowerCase()` on the lookup |
| `play()` sequence rebuild | warm | rebuilds the timeline from a snapshot |
| `getState()` | warm | returns a fresh pose snapshot object |
| `debugHUD` string formatting | warm | HUD label strings |
| constructor / `withX` / `createSequence` / `trackMultiple` | once | setup only |

Hot rows are all zero. The only allocations happen at setup or on warm,
non-per-frame calls -- never inside the 60fps update/render loop.

Gated: `node --expose-gc test/torture.mjs` drives a steady-state camera through
200k `update()` + `apply()` + `applyParallax()` frames with an always-active
shake and gates the window at `maxMajor: 0` / `maxPauseMs: 4` (measured: gc
major=0, maxMs 0.11). It also pins the 8-slot shake pool and the 16-layer
parallax array by identity -- a per-frame `new` would either trip a major GC or
swap one of those references. Prints `ok`.

</details>

## Design decisions worth knowing

One record per decision, all in [decisions/](decisions/) (repo-only, never
shipped in the tarball):

- **[0001 -- Multi-file layout and first-party deps](decisions/0001-layout-and-deps.md)**
  (accepted, v1.1.0). Documents the two departures from single-file law: the
  `src/` module layout behind an `index.js` barrel, and the five first-party
  `@zakkster` runtime deps, with the evidence that keeps the floors honest.
- **[0002 -- Delta-time policy](decisions/0002-dt-policy.md)** (accepted, v1.2.0).
  Pins how `update()` and `updateShake()` treat `dt`: a NaN dt used to poison the
  shake engine forever (CP-3) and a dt spike diverged the position lerp (CP-4);
  the policy closes both with hot bodies paying zero.
- **[0003 -- Sequence blend-out and ticker release](decisions/0003-blend-out.md)**
  (accepted, v1.3.0). `blendOutTime` was decorative (CP-10b), `stop()` leaked the
  shared-ticker refcount (CP-5), and `at: 0` was silently dropped (CP-11); all
  three fixed, with completion now blending position back to follow.
- **[0004 -- The detach](decisions/0004-detach.md)** (accepted, v2.0.0). Severs
  the four subsystems (presets, sequences, parallax, debug) and `lite-timeline`
  from the reachable class graph so a class-only consumer stops shipping 44 KB of
  subsystem source it never calls; they return per instance via `withX`.
- **[0005 -- SOFT bounds hold-out](decisions/0005-soft-bounds.md)** (accepted,
  v2.1.0). The old SOFT map accelerated the camera INTO the edge it promised to
  cushion (CP-6); replaced with a quadratic half-zone hold-out that is monotone
  and never nearer the edge than requested.
- **[0006 -- Parallax wrap](decisions/0006-parallax-wrap.md)** (accepted,
  v2.1.0). `WrapMode` was stored and never read (CP-10a); a REPEAT mode now folds
  scroll into tile space, failing closed at the `addParallaxLayer` door when the
  tile size is missing.
- **[0007 -- The base shake bridge](decisions/0007-base-shake-bridge.md)**
  (accepted, v2.1.0). The base's public shake fields were inert on Pro (CP-9),
  breaking the drop-in-superset promise; prototype accessors now bridge
  `shakeTrauma` / `shakeMaxOffset` / `shakeMaxAngle` onto the default omni slot.
- **[0008 -- Callback lifecycle](decisions/0008-callback-lifecycle.md)**
  (accepted, v2.1.0). Re-entrant `destroy()` from a user callback crashed on
  nulled arrays (CP-20); natural completion now auto-releases the ticker (CP-24),
  with the shake door (CP-25) and bounds door (CP-26) alongside.

## Migration

### From lite-camera

`CinematicCameraPro` extends `CinematicCamera`. Drop-in replacement:

```diff
- import { CinematicCamera } from '@zakkster/lite-camera';
+ import { CinematicCameraPro as CinematicCamera } from '@zakkster/lite-camera-pro';

  const cam = new CinematicCamera(800, 600, 3200, 2400);
  // addTrauma(), update(), apply() all still work. Add Pro features incrementally.
```

### From 1.x to 2.0.0

v2.0.0 detached four subsystems from the class so a class-only consumer stops
bundling them (and `lite-timeline`). The core is unchanged. Add the opt-ins you
use:

| 1.x | 2.0.0 |
|:---|:---|
| `cam.shakePreset(name, i)` | `import { getPreset } from '@zakkster/lite-camera-pro/shake';` then `const p = getPreset(name); if (p) cam.shake(p, i);` |
| `cam.createSequence(opts)` | `import { withSequences } from '@zakkster/lite-camera-pro/sequence';` then `withSequences(cam);` |
| `cam.addParallaxLayer(...)` / `applyParallax` | `import { withParallax } from '@zakkster/lite-camera-pro/parallax';` then `withParallax(cam);` -- call sites unchanged |
| `cam.debug(ctx)` / `cam.debugHUD(ctx)` | `import { withDebug } from '@zakkster/lite-camera-pro/debug';` then `withDebug(cam);` -- call sites unchanged |
| root import of `getPreset` / `createCameraSequence` / `createParallaxState` / `drawDebugHUD` | import those from `./shake` / `./sequence` / `./parallax` / `./debug` |

The `getPreset` guard is now **OPTIONAL**, not mandatory: an unknown name returns
`null`, and since 2.1.0 `cam.shake(null)` is a documented no-op (any other
non-object profile throws `ERR_SHAKE_PROFILE`). The old `if (p)` idiom still works
and is still recommended, but it is no longer required to avoid a throw. An
unattached subsystem method throws a named error whose message names the exact
import + call to fix it; a second `withX` throws `ERR_ALREADY_ATTACHED`.

## Testing

```bash
npm test            # node:test suite
npm run test:gc     # same, under --expose-gc
npm run torture     # node --expose-gc test/torture.mjs -- prints "ok"
npm run verify      # test:gc + torture + size gate
npm run typecheck   # tsc over test/types-smoke
npm run bundle-check # esbuild bundle of ./src/index.js
npm run prepublishOnly # verify + typecheck + bundle-check
```

The suite is **385 tests**. It covers the class facade (initialization,
coordinate conversion, all 5 follow modes, multi-target framing, zoom, shake,
bounds, save/load, destruction), the attached subsystems (parallax, sequences,
debug), the directly-exported functional API, and the v2.0.0 detach gates: a
static import-graph walk (`test/import-graph.test.js`), literal bundle probes
(`test/bundle-literals.test.js`), the class-only replay
(`test/consumer-tripple.test.js`) and the `.`/subpath size ceilings
(`test/size.mjs`). Two permanent metadata gates live in
`test/metadata.test.js`: **Gate A** (ASCII on the shipped set + repo docs) and
**Gate B** (docs-drift: every export is documented in `llms.txt`, every relative
link resolves, and the TOC matches the headings both ways). The zero-GC proof is
`test/torture.mjs` (see [Zero-GC design notes](#zero-gc-design-notes)).

## What this is not

`lite-camera-pro` is a cinematic layer, not a kitchen sink. It deliberately does
NOT own:

| not | that lives in |
|:---|:---|
| base camera maths / the `CameraSink` contract | `@zakkster/lite-camera` |
| a ticker or timeline engine | `@zakkster/lite-timeline` (reached via `./sequence`) |
| the simplex generator / permutation table | `@zakkster/lite-noise` (global singleton) |
| a reactive/signal-driven transform | `lite-camera-max` |
| easing curves / interpolation | `@zakkster/lite-ease`, `@zakkster/lite-lerp` |
| WebGL / 3D projection | out of scope (2D orthographic only) |
| a renderer / draw calls | you draw; the camera only transforms the sink |

## Ecosystem

Runtime dependencies, all first-party `@zakkster`:

- **[lite-camera](https://www.npmjs.com/package/@zakkster/lite-camera)** -- the
  base `CinematicCamera` Pro extends.
- **lite-ease** / **lite-lerp** -- easing curves and interpolation.
- **lite-noise** -- the simplex generator behind the shake.
- **lite-timeline** -- the sequence ticker, reached only via `./sequence`.

Related: **lite-camera** (the base) and **lite-camera-max** (the reactive,
signal-driven camera). All part of the **LiteLibrariesSuite** -- ~170 zero-GC,
single-file ESM micro-libraries under the `@zakkster/*` scope.

See also [CHANGELOG.md](CHANGELOG.md) and [llms.txt](llms.txt).

## License

MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>. See [LICENSE](LICENSE).
