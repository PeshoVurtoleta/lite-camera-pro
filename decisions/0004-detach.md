# 0004 -- the detach: a class consumer stops paying for four subsystems

Status: accepted (v2.0.0, PRO6). Supersedes nothing; extends CP-1's layering law.
Findings: CP-21 (dead subsystem imports), CP-22 (dead constructor state),
CP-23 (prove absence with a graph walk + literal probes, not identifier probes).

## Problem

A bundler cannot tree-shake a reachable class method. `CinematicCameraPro`
imported `getPreset` (ShakePresets.js), `createCameraSequence` (CameraSequence.js
-> `@zakkster/lite-timeline`), the ParallaxManager functions and the DebugHUD
draws, and called them from prototype methods. Every consumer that shipped the
class therefore shipped all four modules -- 44,316 B of subsystem source plus
11,151 B of `lite-timeline` -- and built two state objects (`_parallax`,
`debugConfig`) in every constructor, whether or not it ever called parallax,
sequences, presets or debug. A single-file HTML consumer (3PPLE) pays this in
every artifact.

## D1 -- attach surface: three uniform withX(cam) -> cam

`withParallax` (`./parallax`), `withSequences` (`./sequence`), `withDebug`
(new `./debug`). NOT four-of-a-kind: presets are DROPPED, not detached, so a
`withPresets` would be fake machinery. Each `withX`:

- installs the subsystem's real methods as OWN-properties on the instance, never
  on the prototype -- two cameras in one page must attach independently;
- returns `cam` for chaining;
- `withParallax` also sets `cam._parallax = createParallaxState()` and carries the
  per-frame tick fn on `cam._parallaxTick` (so ParallaxManager stays out of the
  "." import graph -- the class cannot statically import it); `withDebug` sets
  `cam.debugConfig = createDebugHUDConfig()`; `withSequences` installs
  `cam.createSequence(opts) -> createCameraSequence(this, opts)`, one cold closure
  per camera. Sequences otherwise need nothing: every `_seq` site duck-types and
  `playSequence` already accepts any `./sequence`-built object.

Second attach of the same subsystem throws `ERR_ALREADY_ATTACHED` --
idempotent-return was rejected because a silent re-attach would discard live
parallax layers. No unattach: `destroy()` is the only exit (it rebinds the
attached own-properties to the `_dead` sentinel), and destroyed beats
unattached -- a post-destroy call reports `ERR_CAMERA_DESTROYED`, never a
not-attached code.

Rejected alternative -- a second class hierarchy (`CinematicCameraProFull extends
CinematicCameraPro`): it forks the type, doubles the surface a consumer must
learn, and still cannot let a consumer take parallax-but-not-debug without a
combinatorial explosion of subclasses. Per-instance attach composes freely and
keeps one class.

Destroyed-check unification (QA-1, fixed same session). The three withX
originally gated only their own already-attached condition, which diverged on a
destroyed camera: `withParallax`/`withDebug` read the null attach guard as
"unattached" and silently re-attached LIVE methods over the `_dead` sentinels
(a zombie), while `withSequences` (guarded on `hasOwnProperty(cam,
'createSequence')`, which `destroy()` stamps) threw the WRONG code
`ERR_ALREADY_ATTACHED`. All three now check destroyed FIRST, before the
already-attached check, via `Object.hasOwn(cam, 'update')` -- `destroy()` rebinds
`update` as an own-property, so a live camera (update on the prototype only) is
distinguishable from a corpse with one cheap, allocation-free test -- and throw
`ERR_CAMERA_DESTROYED`. Destroyed beats unattached holds for the attach path too,
not just the method path.

## D2 -- the hot guard at update() step 7: measure, do not prefer

The sever nulls `this._parallax`, so step 7 needs a guard that tolerates null.
Two candidates, measured before the sever landed (probe:
`test/perf/parallax-guard.mjs`, PRO3 style, 2e7 iters/run, 11 runs, first
discarded as warmup, statistic = median of per-run mean ns/op, spread = max-min
of the ten kept runs):

- (i) explicit null compare: `this._parallax !== null && this._parallax.activeCount > 0`
- (ii) a module-local frozen inert sentinel `{ activeCount: 0 }` assigned in the
  constructor: `this._parallax.activeCount > 0` (no null compare).

Acceptance rule, FIXED IN ADVANCE: adopt (i) unless (i)'s median exceeds (ii)'s
by more than 1.0 ns/op AND by more than 3x the larger spread. The bar is
deliberately high: (ii) forks the state shape (a camera whose `_parallax` is a
fake-but-real object) against H-B, and PRO3 already accepted ~0.8 ns/frame for a
null compare. Option (iii), a per-frame fn-ref call to save the compare, was
rejected outright (an indirect call in the hot body to save a register test).

Owner-measured (verbatim):

```
D2 parallax-guard probe -- 2e7 iters/run, 11 runs (1 warmup discarded)
  (i)  null-compare : median 40.978 ns/op   spread 6.534 ns/op
  (ii) sentinel     : median 38.908 ns/op   spread 1.970 ns/op
  delta (i)-(ii)    : 2.070 ns/op   larger spread 6.534 ns/op
  rule: (ii) iff delta > 1.0 AND delta > 3x spread (19.602)
  VERDICT: ADOPT (i) null-compare
```

The delta (2.070 ns/op) exceeds 1.0 but is nowhere near 3x the larger spread
(19.602), so clause two of the fixed rule fails: **(i) the null compare ships.**
The coder's independent runs agreed (deltas 1.9-2.5 ns/op, both landing on (i)).
The warm `applyParallax` path needs no guard -- it is a fail-closed stub until
attach, so its delta is 0 ns by construction; the per-frame tick reaches
`updateParallax` through `this._parallaxTick` (set by `withParallax`), never a
static import.

## D3 -- error grammar: per-subsystem NOT_ATTACHED codes, no tombstones

`ERR_PARALLAX_NOT_ATTACHED`, `ERR_SEQUENCE_NOT_ATTACHED`,
`ERR_DEBUG_NOT_ATTACHED` -- greppable in a consumer's log aggregator. Double
attach shares one `ERR_ALREADY_ATTACHED` (a construction-time programmer error,
not a production signal worth three codes). Every message names the exact fix,
e.g. `"CinematicCameraPro: parallax not attached. import { withParallax } from
'@zakkster/lite-camera-pro/parallax'; withParallax(camera);"`. `shakePreset()`
gets NO throwing tombstone: it is removed from the prototype outright. A major may
remove; absence is the honest signal, and a tombstone would buy a nicer message
for permanent bytes on a method the brief blessed dropping.

## D4 -- migration idioms

See the CHANGELOG 2.0.0 migration table (all idioms compile). The load-bearing
one: `cam.shakePreset(n, i)` -> `const p = getPreset(n); if (p) cam.shake(p, i)`
with `getPreset` from `./shake`. The `if (p)` guard is MANDATORY, not stylistic:
`getPreset` returns `null` on an unknown name and `cam.shake(null)` throws
(ShakeEngine dereferences `profile.trauma`), so only the guard preserves the
pre-2.0.0 documented no-op-on-unknown-name. A null door on `cam.shake` is out of
scope (a behavior change to an attached path), ledgered as CP-25 -> PRO4.

## D5 -- the root surface after trim: exactly 20 names

`VERSION`, `CinematicCameraPro`, `default`, `FollowMode`, `FOLLOW_STRATEGIES`,
`createMultiTargetState`, `updateMultiTarget`, `createShakeState`, `addShake`,
`addTraumaSimple`, `updateShake`, `computeShake`, `clearShakes`, `BoundsType`,
`createBoundsState`, `setBoundsAll`, `setBoundsEdges`, `setBoundsRect`,
`clearBoundsRect`, `applyBounds`. Nothing else -- precisely the set the class
itself still reaches, so keeping it costs zero extra bytes at "." while honoring
CP-1's law for the core layer. The snapshot is pinned in two independently
maintained places (`test/subpaths.test.js` ROOT_2_0_0 and
`test/torture/t8-cross.mjs` ROOT_2_0_0); drift in one without the other trips a
gate.

## Proof (not inference)

- G1 `test/import-graph.test.js`: a static `from '...'` walk from `src/index.js`
  reaches none of the four modules and no `lite-timeline`; the same walk from
  `src/CameraSequence.js` DOES reach `lite-timeline` (positive control); zero
  dynamic `import(` in `src/`.
- G2 `test/bundle-literals.test.js`: the "." bundle text lacks `#fbbf24`
  (DebugHUD palette), `heavy_impact` (presets), `moveAndZoom` (sequence step);
  an all-attached fixture bundle contains all three. Literals, per CP-23.
- G3 `test/size.mjs`: "." gz ceiling = measured + 0.25 KB slack.
- G4 `test/consumer-tripple.test.js`: the class-only surface with ZERO attach
  pins apply()-order, live-anchor zoomAt, the shake clamp, worldToScreen
  identity, and `_parallax === null && debugConfig === null` after construction.
- G5: the entire existing sequence/parallax/debug behavioral suite passes
  UNCHANGED with all three attached.

## Measured weights (one `node test/size.mjs` run, this tree)

```
.           raw 61.47 KB  gz 15.62 KB   (was 97.43 KB / 24.49 KB -- ~36% gz drop)
./shake     raw  9.48 KB  gz  3.01 KB
./parallax  raw  3.78 KB  gz  1.10 KB
./bounds    raw  3.74 KB  gz  1.13 KB
./multi     raw  2.41 KB  gz  0.89 KB
./follow    raw  3.16 KB  gz  0.71 KB
./sequence  raw 28.37 KB  gz  7.27 KB
./debug     raw  7.22 KB  gz  2.04 KB
```

The drop is 36%, not the planner's optimistic 40% projection: gz of the removed
subsystems (heavy on repeated string literals) compresses well below their raw
share. The gate is fixed at the measured number, never widened to a projection.
