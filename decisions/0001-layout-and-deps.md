# 0001 -- Multi-file layout and first-party runtime deps

Status: accepted (v1.1.0, session PRO1)
Findings: CP-17 (dependency provenance), CP-16a (typed functional layer).

This record documents two deliberate departures from the suite law, why each is
load-bearing for @zakkster/lite-camera-pro, and the evidence that keeps the
dependency floors honest. It is a repo-only artifact: `decisions/` is NOT in
package.json `files[]` and never ships in the tarball (the base package
`@zakkster/lite-camera` ships no `decisions/` either).

## Exemption A -- multi-file `src/` vs the single-PascalCase-file law

Suite law: "Single PascalCase main file per package." Pro keeps a `src/`
directory of single-purpose PascalCase modules (ShakeEngine.js, ShakePresets.js,
ParallaxManager.js, BoundsSystem.js, MultiTarget.js, FollowMode.js,
CameraSequence.js, DebugHUD.js, CinematicCameraPro.js) behind an `index.js`
barrel.

Why it is load-bearing:

- v1.1.0 adds a subpath exports map (`./shake`, `./parallax`, `./bounds`,
  `./multi`, `./follow`, `./sequence`). A consumer who imports only
  `@zakkster/lite-camera-pro/shake` pays for the shake engine plus its
  tree-shaken noise dependency and nothing else. That per-subpath cost boundary
  is only expressible if each subsystem is its own module file behind its own
  exports entry. A single concatenated file would force every consumer to pull
  the whole camera surface.
- Each module stays single-purpose and PascalCase-named; the spirit of the law
  (one clear unit per file, no kitchen-sink modules) is preserved.
- There is NO build step. The files that ship are the files that are authored and
  the files the exports map points at. `sideEffects: false` holds.
- `src/Shake.js` is a two-line re-export barrel over ShakeEngine.js +
  ShakePresets.js, never a copy of their code. The camera class and the
  `./shake` subpath import the SAME module files, so there is one runtime
  identity per function (no forked state shapes -- see t8-cross.mjs Object.is
  proof).

## Exemption B -- five runtime deps vs the zero-dep law

Suite law: "Zero runtime deps." Pro declares five, all first-party `@zakkster/*`:
lite-camera, lite-lerp, lite-ease, lite-noise, lite-timeline.

Why it is load-bearing:

- Pro is the suite's composition layer: a cinematic camera is, by design, the
  integration of base camera motion (lite-camera), interpolation (lite-lerp),
  easing (lite-ease), organic shake (lite-noise), and timeline sequencing
  (lite-timeline). Re-vendoring any of them would fork code the suite already
  ships and maintains.
- Every dep is first-party and itself zero-runtime-dep, so the transitive
  runtime cost is bounded and auditable.
- The subpath map keeps a consumer's real cost to what they import: `./shake`
  drags only lite-noise (tree-shaken); `./parallax`, `./bounds`, `./multi`,
  `./follow` are pure math and drag nothing; only `./sequence` drags
  lite-timeline + lite-ease, and that is documented on the entry so the cost is
  a conscious choice.

## Tested-against versions

These are the versions installed and tested against for v1.1.0. "Installed ==
tested-against" -- the torture gate, the size gate, and the tsc smoke all ran
against exactly these.

| dependency         | tested-against | declared floor |
|--------------------|----------------|----------------|
| @zakkster/lite-camera   | 1.2.2     | ^1.2.2 |
| @zakkster/lite-ease     | 1.1.0     | ^1.0.0 |
| @zakkster/lite-lerp     | 1.3.0     | ^1.0.0 |
| @zakkster/lite-noise    | 1.6.0     | ^1.0.0 |
| @zakkster/lite-timeline | 1.0.1     | ^1.0.0 |

The lite-camera row is refreshed for v2.1.0 (PRO4): tested-against 1.2.2, floor
raised to `^1.2.2` (see the floor-bump note below).

## Floor policy

Raise a floor ONLY when a consumed feature requires it. A floor is the lowest
major-compatible version at which every function Pro actually calls is present.
Per-dep evidence below verifies each consumed function against the earliest
retrievable point of that dep's history; where a function is present there, the
floor stays `^1.0.0` (semver forbids removing an export within a major, so any
published 1.x that carries the feature satisfies the consumer).

## Per-dep evidence

### lite-camera -- floor ^1.0.0

Consumed base members (only these): `this._halfW` / `this._halfH` reads
(CinematicCameraPro.js:806,809) and `super.destroy()` (:908). Pro re-implements
`update()` wholesale -- greps for `super.update`, `_recompute`,
`_shakeX/_shakeY/_shakeA`, and `this.rng` in Pro's src are EMPTY, and Pro writes
its own zoom-aware `_maxX/_maxY` (:623-626).

Initial git commit `0a1a38b` (package.json version 1.0.0) already carries both
consumed members: `_halfW` at CinematicCamera.js:30, `destroy()` at :105. Floor
`^1.0.0` is honest.

Forward note (PRO4): when the resize override lands, the camera floor rises to
`^1.2.1`. Do NOT raise it now -- 1.1.0 consumes nothing past 1.0.0.

### lite-camera floor bump to ^1.2.2 (v2.1.0, PRO4)

The CP-7 resize override (`resize(viewW, viewH, worldW, worldH)`, D6/0008) now
calls `super.resize(...)` and depends on the base's own resize contract:
validate-before-mutate on the four dims (base throws `ERR_CAMERA_DIMS` with
nothing mutated), the shared `_recompute()` cold path, and the base's pose
re-clamp. That resize() method plus the dims-are-readonly d.ts hardening are
1.2.x work, so the floor rises from `^1.0.0` to `^1.2.2` -- the tested-against
version. This is a genuine consumed-feature bump (the override cannot exist
against a base without resize()), not a precautionary one. Refreshed
tested-against for v2.1.0: lite-camera 1.2.2, lite-ease 1.1.0, lite-lerp 1.3.0,
lite-noise 1.6.0, lite-timeline 1.0.1 -- installed == tested-against, and the
torture gate, the size gate, and the tsc smoke all ran against exactly these.

### lite-lerp -- floor ^1.0.0

Consumed: `lerp`, `clamp` (CinematicCameraPro.js:18). Earliest retrievable git
commit `16c8e93` (package.json version 1.0.6) carries both:
`clamp` at Lerp.js:7, `lerp` at Lerp.js:10. Both are foundational exports of a
lerp library; present at the earliest point in history, so `^1.0.0` is honest.

### lite-noise -- floor ^1.0.0

Consumed: `simplex2` (ShakeEngine.js:12). Earliest retrievable git commit
`6dc193f` (package.json version 1.1.0) carries it: `simplex2` at Noise.js:71.
`simplex2` is the core sampler of the library and present at the earliest point
in history, so `^1.0.0` is honest.

### lite-ease -- floor ^1.0.0

Consumed: `easeInOutCubic`, `easeOutExpo` (used by CameraSequence.js /
sequence helpers). The lite-ease working tree is NOT a git repository and ships
NO CHANGELOG.md, so no initial-commit hash is retrievable. Both functions are
verified present in the installed and source version 1.1.0:
`easeInOutCubic` at LiteEase.js:42, `easeOutExpo` at LiteEase.js:56. They are
foundational named easing exports; no evidence exists that they postdate 1.0.0.
Floor stays `^1.0.0`; if pre-1.1.0 provenance ever becomes retrievable and shows
either function is younger, this floor is revisited with that evidence.

### lite-timeline -- floor ^1.0.0

Consumed: `createTimeline` (CameraSequence.js). The lite-timeline working tree
is NOT a git repository and ships NO CHANGELOG.md, so no initial-commit hash is
retrievable. `createTimeline` is verified present in the installed and source
version 1.0.1 at Timeline.js:58 (also the default export at :333). It is the
primary factory export of the library; no evidence exists that it postdates
1.0.0. Floor stays `^1.0.0`, revisited if earlier provenance surfaces.

## Packaging note

`decisions/` is repo-only. It is absent from package.json `files[]` and does not
appear in `npm pack --dry-run`. The tarball ships `src/` (including the new
Shake.js barrel and the seven `.d.ts` files), README.md, CHANGELOG.md, llms.txt,
and LICENSE.
