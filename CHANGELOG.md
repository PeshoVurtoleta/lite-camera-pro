# Changelog

All notable changes to `@zakkster/lite-camera-pro` are documented here. The
format follows Keep a Changelog, and this project adheres to Semantic
Versioning. Version lives in three places at once -- `package.json`, the
`VERSION` const in `src/index.js`, and the `Version:` header in `llms.txt` --
bumped together or not at all.

## [2.1.1] -- 2026-08-31

The evaluation kit: docs, demo, types, hygiene. No runtime behavior change --
the only src/*.js edits are comment bytes, proven below.

### Added
- `CameraProSink` in `src/index.d.ts`: `extends CameraSink { scale(x, y) }`
  (the base's 2-method sink + scale). `apply(ctx)` retyped to accept it --
  `apply` calls exactly `translate`/`rotate`/`scale`, so a 9-line recorder
  object can drive a CSS transform with no canvas (BRIEF note B).
  `CanvasRenderingContext2D` structurally satisfies the type; nothing breaks.
  `test/types-smoke/smoke.ts` pins both directions (recorder compiles,
  2-method sink rejected -- verified once, kept as a commented negative case).
- llms.txt: noise-determinism note (the simplex perm table is global to
  lite-noise -- `seedNoise()` anywhere in the app re-shapes every camera's
  shake; the constructor `seed` / `seedOffset*7919` decorrelates cameras but
  does not isolate them from a global reseed); preset-duration note beside
  the preset list (duration = trauma/decay; `intensity` scales amplitude AND
  duration -- shorten a preset by copying it with a higher `decay`, BRIEF
  note A); `apply()` sink contract line.
- metadata.test.js Gate A: permanent ASCII gate over src/*.js, src/index.d.ts,
  README.md, CHANGELOG.md, llms.txt, LICENSE, decisions/*.md and
  test/**/*.{js,mjs,ts} -- zero codepoints above U+007F except U+00D7 and
  U+00B5, with in-file positive/exemption/coverage controls and an
  exact-count exemption ledger (empty). Observed RED before the sweep
  (offender records captured), green after.
- metadata.test.js Gate B (docs-drift guard): every export of `.` and each
  subpath module is documented in llms.txt as a whole word (exists ->
  documented; root exactly 22, >= 60 name-checks, `__notAnExport__` negative
  probe); every relative `](target)` link in README.md + llms.txt resolves
  on disk (>= 8); the README TOC slugs and `##` headings agree both ways
  (>= 12 entries). Four tests, each with an in-test control.
- README: a `Units: seconds vs milliseconds` table (anchored, linked from
  both the class and the sequences sections), the BRIEF note A sentence
  directly beneath the preset table (duration = trauma/decay; `intensity`
  scales amplitude AND duration), and the BRIEF note B recorder recipe under
  Composability (`apply(ctx)` touches exactly translate/rotate/scale, so a
  nine-line sink drives a CSS transform with no canvas).
- demo/CameraProModule.html: a `WrapMode.REPEAT_X` marker-fence parallax layer
  (`markers`, speedX 0.35 / speedY 0, tileW 180) added once at init beside the
  five existing layers -- an evenly spaced amber beacon motif drawn in a
  cached-bounds loop so 2.1.0's wrap is visible (the fence repeats seamlessly
  as you scroll); the panel counter reads N/16 and a legend names it.
- demo/CameraProModule.html: a Zero-GC Evidence panel (after Debug Overlay).
  A 256-slot `Float64Array` ring is written once per frame from the existing
  rAF loop -- `performance.memory.usedJSHeapSize` when the counter exists, else
  the frame's own ms -- with a power-of-2 masked index (`& 255`); a ~8 Hz
  frame-counter-masked readout formats min/max plus per-frame delta (heap) or a
  p99 (frame-time fallback, sorted in a pre-allocated scratch buffer) into
  $-cached text nodes. An "Alloc storm" toggle is the control: armed, the rAF
  body deliberately allocates an array + string per frame so the series
  climbs/sawtooths, proving the meter is live. Steady state holds the heap
  flat. Sampling and readout add zero allocation off the storm branch.

### Changed
- demo truth-audit: the Smart Bounds SOFT option label
  "SOFT -- smoothstep deceleration" -> "SOFT -- quadratic hold-out
  (decelerates)" (the curve became a quadratic half-zone hold-out at CP-6 /
  decisions/0005; "smoothstep" now appears zero times in demo/). Both demo
  pages swept for stale 2.1.x claims -- no other false string found.
- demo/QuickStart.html: the frame loop's per-frame `cam.viewW = ... /
  cam.viewH = ...` direct writes (the exact writable-dims trap CP-7 closed --
  the d.ts declares dims readonly) replaced with the blessed door: a resize
  listener calling `cam.resize(canvas.width, canvas.height, WORLD_W,
  WORLD_H)`, registered after the canvas-sizing listener so FIFO order keeps
  the dims current. Two fewer writes per frame; the demo now teaches the
  2.1.0 contract instead of the trap. Verified on a cold-origin drill
  (console clean, v2.1.1 stamped from the library VERSION const).
- ASCII sweep (the debt the gate now forbids): 7,457 bytes of non-ASCII
  across nine src files (U+2500 banner runs, em/en dashes, arrows, U+00B2)
  and 195 bytes in README.md replaced with ASCII equivalents at identical
  character widths. decisions/, test/, llms.txt, CHANGELOG.md and LICENSE
  were already clean. Proof the sweep is comment-only: of the 8 esbuild
  entry bundles, 5 are SHA-256-identical pre/post and the 3 that differ
  (".", ./sequence, ./shake) differ ONLY in comment lines -- zero code
  lines changed. Comments survive esbuild's unminified output, so measured
  weights moved DOWN: "." 18109 -> 18021 B gz (17.68 -> 17.60 KB),
  ./sequence 7.41 -> 7.40 KB, ./shake 3164 -> 3148 B gz (3.09 -> 3.07 KB);
  budgets unchanged (ceilings).
- llms.txt: two stale 2.0.x lifecycle claims corrected to the shipped 2.1.0
  behavior -- natural completion now documents the CP-24 auto-release (first
  update() after completion; zero-step play() no-op), and "re-entrant
  destroy/stop is unguarded (routed to PRO4)" now documents the CP-20 door
  + decisions/0008 contract (clean frame abort; ERR_CAMERA_DESTROYED after).
- README rebuilt on the LiteSepforge blueprint spine (positioning H2 ->
  TOC -> Why this exists -> What you get -> shake-engine deep-dive -> API
  reference -> Composability -> Zero-GC notes -> Design decisions ->
  Migration -> Testing -> What this is not -> Ecosystem -> License), with
  the stale claims corrected: the false "Zero external deps" box is replaced
  by the recorded dependency story (five first-party @zakkster deps, zero
  third-party, lite-timeline only via ./sequence, decisions/0001); the hard
  "348 tests" is replaced by the live count (385); the mermaid architecture /
  dependency / flow diagrams are dropped (npm renders raw, line counts
  drift); the Module Reference "Lines" column is replaced by measured gz
  subpath weights; and the migration guide's F1 claim is fixed -- the
  `getPreset` guard is OPTIONAL, not mandatory (cam.shake(null) is a
  documented no-op since 2.1.0).
- Version triangle -> 2.1.1.

### Removed
- `Cookbook.md` (25.6 KB unversioned sidecar; still-true recipes folded into
  README/llms -- the sink recipe, soft bounds, parallax wrap, shake
  layering; the rest duplicated the API reference). Never shipped in
  `files[]`.
- `examples/` (five 1.x-era scaffolds superseded by `demo/`):
  lite-camera-pro-day1-demo.html, lite-camera-pro-day2-demo.html,
  lite-camera-pro-day3-demo.html, lite-camera-pro-phase2-demo.html,
  lite-camera-pro-phase3-demo.html. Never shipped in `files[]`.

## [2.1.0] -- 2026-08-31

Subsystem truth: four documented behaviors that were false are now measured
behavior (CP-6, CP-7, CP-9, CP-10a), plus four fail-closed doors and two
re-entrancy fixes (CP-20, CP-24, CP-25, CP-26). No attached feel outside the
defects changed; the consumer fixture stays byte-green (H-A).

### Added

- `cam.resize(viewW, viewH, worldW, worldH)` -- a zoom-aware resize override
  (CP-7). visibleW/_maxX are correct ON RETURN (no stale frame) and target AND
  pos are HARD re-clamped into the zoom-aware box. P10 inverted: zoom 2, world
  3200x2400, pos 2560, `resize(1600, 1200, 3200, 2400)` -> visibleW **800**,
  _maxX **2400**, pos **2400** (base alone: 1600 and a stale 400).
- Base-shake bridge (CP-9): `cam.shakeTrauma` / `cam.shakeMaxOffset` (15 px) /
  `cam.shakeMaxAngle` (0.05 rad) are live accessors onto the default omni slot,
  so a base-style caller's shake works on Pro. P8 inverted: `shakeMaxOffset = 60;
  shakeTrauma = 1` now produces a nonzero apply offset (**0.784** vs a dead 0 in
  2.0.0). Cold-path only; the 200k update+apply A/B is **102.4 ns/op** with the
  accessors present, and the H-G source gate proves the names are absent from
  the hot bodies.
- Parallax `WrapMode` is real (CP-10a): `tileW`/`tileH` layer opts, a negative-
  safe Euclidean wrap `s - floor(s/tile)*tile` written back into scrollX/scrollY.
  A REPEAT_X layer, tileW 256, at 3*256+7 reads **7**; at -9 reads **247**. The
  only new hot-body cost is one `wrap !== 0` compare, measured at **~1.72
  ns/layer**; NONE layers stay byte-identical (wrap is subpath-only, not in ".").
- `setSoftZone(state/cam, softZone, elasticMax?, elasticStrength?)` and
  `clampToBounds(state, ...)` exports (root + ./bounds); the class reaches both,
  so the "." surface grows 20 -> 22 names.
- Four fail-closed error codes: `ERR_CAMERA_BOUNDS` (CP-26 bounds setters),
  `ERR_PARALLAX_TILE` (CP-10a tile door), `ERR_SHAKE_PROFILE` (CP-25 non-object
  profile), `ERR_CAMERA_SHAKE` (CP-9 non-finite accessor write).

### Changed

- **SOFT bounds now decelerate (CP-6).** The old smoothstep map compressed the
  granted position TOWARD the edge (the inverse of the promise). The new
  quadratic half-zone hold-out `g = edge + s*sz*0.5*(1 + u*u)` is monotone, fixed
  at the zone entry, and NEVER nearer the edge than requested; only HARD reaches
  the edge. P4 inverted (sz 80, edge 0): 40 -> **50.0** (was 20), 20 -> **42.5**
  (was 3.13), 79 -> **79.01** (was 78.96). HARD/ELASTIC/NONE byte-identical.
- Dims (viewW/viewH/worldW/worldH) are readonly in the d.ts (match the base);
  write them only through `resize()`.
- lite-camera dependency floor raised `^1.0.0` -> `^1.2.2` (the resize override
  consumes the base's 1.2.x resize contract; see decisions/0001).
- Two QA pins flipped ("// flipped by PRO4 (v2.1.0)"): qa-boundary-pro3 test 8
  (CP-24 completion now releases the ticker) and test 7 (zero-step play() is a
  documented no-op), and qa-boundary-pro6's CP-25 pin (shake(null) is a no-op,
  not a raw TypeError).

### Fixed

- **CP-20** re-entrant `destroy()` from a zoom-ease callback no longer raw-
  crashes: a `_destroyed` flag set first in destroy() and one check after the
  ease callback abort the frame cleanly (delta **-1.65 ns/op**, within noise,
  and only inside the zoom-animation branch).
- **CP-24** a naturally completed sequence releases the shared-ticker refcount
  via a camera-side duck-typed `seq.stop()` on the first update after completion;
  a zero-step sequence's `play()` acquires no timeline at all.
- **CP-25** `shake(null)`/`shake(undefined)` is a documented no-op (the guarded
  getPreset idiom is now optional, never wrong); a non-object profile throws
  `ERR_SHAKE_PROFILE`.
- **CP-26** the bounds setters fail closed on a non-integer / out-of-range edge
  type, a non-finite rect, or a non-finite/negative softZone (validate-before-
  mutate; `ERR_CAMERA_BOUNDS`).
- **QA-3** (found in qa) the three base-shake bridge GETTERS
  (`shakeTrauma`/`shakeMaxOffset`/`shakeMaxAngle`) now fail closed post-destroy
  with `ERR_CAMERA_DESTROYED`, symmetric with the setters -- reads no longer
  silently return 0 / a stale value on a destroyed camera.

**Size note -- read this if an artifact-size gate just fired.** The "." bundle
grew **15.62 KB -> 17.68 KB gz** (15996 B -> 18109 B) because the "." graph
(`CinematicCameraPro` + `BoundsSystem` + `ShakeEngine`) gained real feature code:
the SOFT hold-out rewrite + `clampToBounds` + the CP-26 bounds doors, the CP-7
resize override, the CP-9 base-shake bridge, the CP-20 guard, and the CP-25 shake
door. The detach is intact -- parallax/sequence/debug stay out of "." (the
import-graph + bundle-literal gates are still green), so the wrap work is
subpath-only. New feature surface, not re-entangling; the size gate ceiling was
re-measured to 18109 + 0.25 KB slack, never widened to pass.

## [2.0.0] -- 2026-08-31

The detach. A bundler cannot drop a reachable class method, so every camera a
single-file HTML consumer shipped carried four subsystems it never called --
`DebugHUD.js`, `CameraSequence.js`, `ParallaxManager.js`, `ShakePresets.js` --
plus all of `@zakkster/lite-timeline`, and two state objects (`_parallax`,
`debugConfig`) built in every constructor (CP-21, CP-22). This release severs all
four import edges from `CinematicCameraPro.js` and from the root barrel, replaces
them with per-instance opt-in attach on the subpaths, and proves absence with a
static import-graph walk plus literal probes rather than identifier probes
(CP-23). No attached or core path changes behavior -- packaging, again. It is a
MAJOR because the "." entry loses >35% of its gz weight and a class-only consumer
that wants 1.x behavior must add three `withX` lines.

**Deliberate size drop -- read this if an artifact-size gate just fired.** The
"." bundle went **24.49 KB -> 15.62 KB gz** (raw 97.43 KB -> 61.47 KB), a ~36%
drop, because a class-only consumer no longer bundles the four subsystems or
`lite-timeline`. If your build gates artifact size against the published README
figure, THAT GATE FIRING IS THE GATE WORKING: bump your expected size on the same
commit you take 2.0.0. Dead weight removed for a class-only consumer: **44,316 B**
of subsystem source (`DebugHUD.js` 9,100 + `CameraSequence.js` 23,421 +
`ParallaxManager.js` 6,262 + `ShakePresets.js` 5,533) plus `lite-timeline`
11,151 B. These figures supersede the brief's 38,578 B / 17,683 B: those predate
PRO3, which grew `CameraSequence.js` from 17,683 B to 23,421 B (blend-out,
completion cleanup, the `at:` grammar). The measured "." weight in this file, the
README and `llms.txt` all come from one `node test/size.mjs` run.

### Added

- **Per-instance attach on the subpaths.** `withParallax(cam)` (`./parallax`),
  `withSequences(cam)` (`./sequence`), `withDebug(cam)` (new `./debug`). Each
  installs the subsystem's real methods as own-properties on that one instance
  (never prototype mutation -- two cameras in a page attach independently),
  returns `cam` for chaining, and is single-shot: a second attach throws
  `ERR_ALREADY_ATTACHED`. `destroy()` is the only exit, and destroyed beats
  unattached. See `decisions/0004-detach.md`.
- **New `./debug` subpath** (`DebugHUD.js`): `createDebugHUDConfig`,
  `drawDebugHUD`, `drawDebugWorld`, `withDebug`, plus `DebugHUD.d.ts`.
- **Fail-closed stubs (D3).** A detached subsystem method called before its
  `withX` throws a named error whose message names the exact import + call that
  fixes it: `ERR_PARALLAX_NOT_ATTACHED`, `ERR_SEQUENCE_NOT_ATTACHED`,
  `ERR_DEBUG_NOT_ATTACHED` -- never a raw `TypeError`, never a silent no-op.
- **Detach gates.** `test/import-graph.test.js` (G1: static graph walk, both
  directions), `test/bundle-literals.test.js` (G2: literal probes into a scratch
  bundle), `test/consumer-tripple.test.js` (G4: the class-only surface with zero
  attach), and a `.`/`./debug` ceiling in `test/size.mjs` (G3).

### Changed

- **Root "." surface trimmed to exactly 20 names** (D5): `VERSION`,
  `CinematicCameraPro`, `default`, `FollowMode`, `FOLLOW_STRATEGIES`,
  `createMultiTargetState`, `updateMultiTarget`, `createShakeState`, `addShake`,
  `addTraumaSimple`, `updateShake`, `computeShake`, `clearShakes`, `BoundsType`,
  `createBoundsState`, `setBoundsAll`, `setBoundsEdges`, `setBoundsRect`,
  `clearBoundsRect`, `applyBounds`. Presets, sequence factories, parallax
  functions and the debug draws are reached on `./shake`, `./sequence`,
  `./parallax`, `./debug`.
- **Constructor allocates no parallax/debug state.** `cam._parallax === null` and
  `cam.debugConfig === null` on a fresh camera; `update()` step 7 tolerates the
  null with a single compare measured at ~2 ns/frame over the ~40 ns body
  (`decisions/0004-detach.md`, D2). `withParallax`/`withDebug` build the state.

### Removed

- **`cam.shakePreset(name, intensity)`** -- dropped from the prototype at the
  major, no throwing tombstone (absence is the honest signal). `typeof
  cam.shakePreset === 'undefined'`.

### Fixed

- **QA-2:** `withDebug(cam)` without `withParallax` no longer raw-`TypeError`s in
  `cam.debugHUD()`. `drawDebugHUD` now guards both `cam._parallax` reads with
  `!== null` (CP-22) -- a null parallax simply skips the HUD's parallax panel.
- **QA-1:** attaching to a destroyed camera is now uniform. `withParallax`,
  `withSequences` and `withDebug` detect a corpse first (`Object.hasOwn(cam,
  'update')`, the own-property `destroy()` stamps) and throw
  `ERR_CAMERA_DESTROYED` -- no more silent zombie re-attach over the `_dead`
  sentinels (parallax/debug) and no more misleading `ERR_ALREADY_ATTACHED`
  (sequences). Live double-attach still throws `ERR_ALREADY_ATTACHED`. (QA.)

### Migration (all idioms compile)

| 1.x | 2.0.0 |
| --- | --- |
| `cam.shakePreset(name, i)` | `import { getPreset } from '@zakkster/lite-camera-pro/shake';`<br>`const p = getPreset(name); if (p) cam.shake(p, i);` |
| `cam.createSequence(opts)` | `import { withSequences } from '@zakkster/lite-camera-pro/sequence';`<br>`withSequences(cam); cam.createSequence(opts);`<br>_or_ `import { createCameraSequence } from '@zakkster/lite-camera-pro/sequence';`<br>`createCameraSequence(cam, opts);` |
| `cam.addParallaxLayer(...)` / `removeParallaxLayer` / `applyParallax` | `import { withParallax } from '@zakkster/lite-camera-pro/parallax';`<br>`withParallax(cam);` then the call sites are unchanged |
| `cam.debug(ctx)` / `cam.debugHUD(ctx)` | `import { withDebug } from '@zakkster/lite-camera-pro/debug';`<br>`withDebug(cam);` then the call sites are unchanged |
| `import { getPreset, createCameraSequence, createParallaxState, drawDebugHUD } from '@zakkster/lite-camera-pro';` | import the removed names from `./shake`, `./sequence`, `./parallax`, `./debug` |

The `getPreset` guard is MANDATORY: `getPreset` returns `null` on an unknown name
and `cam.shake(null)` throws, so the `if (p)` guard preserves the pre-2.0.0
documented no-op-on-unknown-name. Adding a null door to `cam.shake` is out of
scope (a behavior change to an attached path), ledgered as CP-25 -> PRO4.

## [1.3.0] -- 2026-08-31

Sequence integrity. Three reproduced sequence defects are closed and the one
decorative option is made real. `stop()` leaked the shared-ticker refcount, so a
stopped sequence pinned the RAF loop forever (CP-5); a step's `at: 0` was dropped
as falsy and silently appended (CP-11); `blendOutTime` was stored and read by
nothing, so completion was a hard handoff (CP-10b); and `resume()` after stop or
completion replayed the whole cinematic, re-firing shakes and callbacks on the
live camera (D-d). The camera hot path gains exactly one `_blendRemain > 0`
compare on the non-blending update branch -- measured at ~0.16 ms per 200k
updates (~0.8 ns/update, inside the run-to-run noise of the ~40 ns/update body);
the T6 alloc gate is unchanged (0 B/op, maxMajor 0, maxPauseMs 4). Full rationale
in `decisions/0003-blend-out.md` (repo-only). No new public exports; the T8
main-entry surface is unchanged but for the VERSION value.

### Added

- **Real completion blend-out.** `blendOutTime` (SECONDS, default 0.3) now drives
  a linear deadline convergence of camera POSITION back to the follow target when
  a sequence completes, landing exactly at the window end (0 = hard handoff,
  identical to 1.2.0). Zoom is not blended (no follow-side zoom target exists;
  the sequence's final zoom persists). Visible only in position-lerping follow
  modes (SMOOTH, PREDICTIVE); LOCK/CUT/HYBRID write pos directly. `stop()` and
  `stopSequence()` never blend; looping sequences never complete, so never blend.
- **`ERR_SEQUENCE_OPTIONS` door.** `createSequence({ blendOutTime })` /
  `createCameraSequence` validate `blendOutTime` as a finite number >= 0 seconds
  at construction (a cold setup-time door, house-style named Error). Documented in
  `llms.txt`; the bidirectional ERR-code drift guard picks it up.
- **Ticker-conservation gate + control** in the torture harness: a `pumpRaf()`
  export drives one stored RAF callback, so T7 asserts a stopped sequence adds
  zero new RAF requests (delta 0 across 4 pumps), and a T9 leaked-ticker control
  (`reset()` instead of `destroy()`) proves the gate can fail. T3 gains a
  play/stop x1000 sequence-spam storm; T6's loop runs a >= 60-frame blend-armed
  phase under the same budget.
- **Decision record.** `decisions/0003-blend-out.md` (blend math, the
  completion-vs-stop discriminator, the resume guard, resolveAt, the measured
  compare cost, and the before/after table).

- **QA boundary suite + a documented lifecycle gap (CP-24).**
  `test/qa-boundary-pro3.test.js` (9 tests) pins the multi-target blend
  deferral, the door boundary table, blend interruption, seek-after-stop
  re-snapshot, the `at:'>'` grammar token, and zero-step sequences -- and
  found CP-24: natural COMPLETION does not release the shared ticker; a
  completed sequence holds its timeline (and the ticker refcount) until
  `stop()`/`destroy()`/`play()`, and an empty played sequence never
  self-completes. 1.3.0 ships the documented contract (stop() JSDoc +
  llms lifecycle block: release long-lived completed sequences
  explicitly); the structural release is PRO4 lifecycle work because
  completion fires mid-tick from the ticker itself (the CP-20 re-entrancy
  class).

### Fixed

- **CP-5: `stop()` releases the shared ticker.** It now destroys the sequence
  timeline (which releases the refcount) instead of calling `timeline.reset()`,
  which detached the update callback but pinned the RAF loop. Under a pumped RAF
  polyfill, requests after `stop()` went from 16 in a 300 ms settle to 0.
- **CP-11: `at: 0` is honored.** A new module-level `resolveAt` helper replaces
  the five `opts && opts.at || undefined` builders (and rewires `shake`'s 2-arg
  form). `.moveTo(100,100,1000).wait(500,{at:0})` now builds 1000 ms (was 1500);
  `at: 1` -> 1000, `at: '<'` -> 1000, `at: '+=100'` -> 1600, `at: undefined` ->
  1500 (append), `shake(name, { at: 0 })` fires at t=0.
- **CP-10b: `blendOutTime` is no longer decorative** (see Added).
- **D-d: `resume()` no longer replays a stopped or completed sequence.** It is
  now guarded to the paused state (`timeline && isPlaying`); a
  resume-after-completion is a no-op instead of re-firing every `.call(fn)` and
  shake step via the timeline's auto-seek(0).

### Changed

- **Measured subpath weights** (esbuild esm, minify=false, gzip -9): `.` gz
  23.19 -> 24.40 KB; `./sequence` gz 6.01 -> 7.03 KB (it carries the new blend
  docs, the door, and resolveAt). `./shake` unchanged at 3.01 KB. Synced into
  `llms.txt`.
- **After stop(), `duration` falls back to the naive step-sum** (timeline
  destroyed): an `at: '+=100'` build reads 1600 ms while live and 1500 ms after
  stop. `progress` after stop is 0. Documented divergence.

## [1.2.0] -- 2026-08-30

Fail-closed doors. Three reproduced ways ordinary runtime garbage permanently
broke the render are closed at the entry, not patched in the body: a NaN dt that
poisoned shake and camera forever (CP-3), a frame-time spike that diverged the
position lerp (CP-4), and garbage into seven facade entries that crashed or froze
at frame N+1 (CP-12, CP-19). The hot bodies are untouched: the only additions to
an update path are two 2-line entry doors (`update()`, `updateShake()`), so the
T6 alloc gate still holds at maxMajor 0 / maxPauseMs 4 with the shake and parallax
pools pinned by identity. No new exports; the T8 main-entry surface is unchanged
but for the VERSION value. Full policy in `decisions/0002-dt-policy.md` (repo-only).

Credit: the ROADMAP audit catalogued CP-3/CP-4/CP-12; the PRO1 qa pass surfaced
the CP-19 facade over-reads.

### Added

- **`cam.maxDt` tunable (default 0.1s).** `update()` clamps a finite dt above this
  ceiling before integrating so a frame-time spike cannot diverge the position
  lerp; a dt exactly == maxDt passes untouched. A plain field beside `lerpSpeed`,
  not a per-frame-validated input (H-C).
- **Fail-closed doors** on `setMode`, `setState`, `setZoom`, `zoomAt`,
  `trackMultiple`, `setTargetCount` (facade) and `registerPreset` (shake
  registry). Setters validate at the call so a defect fails loud there instead of
  as a raw crash on the next frame. Shake profiles now finiteness-check every
  numeric (decay/freq/maxOffset/maxAngle/dirX/dirY, not just trauma/intensity) in
  the cold entry; the `profile.dirX || 0` NaN-laundering is removed.
- **Five error codes** (house style, `.code` on a named Error): `ERR_CAMERA_MODE`,
  `ERR_CAMERA_STATE`, `ERR_CAMERA_ZOOM`, `ERR_CAMERA_TARGETS`, `ERR_SHAKE_PRESET`.
  Documented in `llms.txt`; a metadata drift guard asserts every code greppable in
  `src/` is documented and vice versa (both directions, fail closed).
- **dt policy decision record.** `decisions/0002-dt-policy.md` adopts reject
  (Policy A) + clamp (Policy B) and records the rejection of an exponential-damping
  rewrite (Policy C) by measurement. Repo-only; not shipped in the tarball.

### Changed

- **Measured door cost in the subpath weights** (esm, unminified, gzip -9):
  `./shake` 2.82 -> 3.01 KB gz (the addShake full-profile guard + the preset
  registry doors), `./sequence` 5.94 -> 6.01 KB gz (drags the preset registry),
  `.` 21.70 -> 23.19 KB gz (all doors + their JSDoc). `./parallax`, `./bounds`,
  `./multi`, `./follow` unchanged. The `./shake` budget gate (16384 B) holds at
  3082 B.

### Fixed

- **CP-3 -- a NaN dt no longer poisons the shake engine forever.** Before:
  `updateShake(state, NaN)` drove `time`/`trauma` to NaN, the `trauma <= 0` test
  never fired, and `computeShake` emitted NaN every later frame; after one poison
  frame plus 10k good frames the slot was still active with a NaN offset. Now the
  reject door makes that frame a no-op and the slot decays to `active === false`,
  `offsetX === 0`. The same poison via a profile (a NaN `decay`) is closed by the
  addShake full-profile finiteness check.
- **CP-4 -- a dt spike no longer diverges the position lerp.** Before: 40 frames
  of `dt = 0.5` with `BoundsType.NONE` blew `pos` past 1e6 (the explicit
  integrator is unstable for `lerpSpeed * dt > 2`). Now `update()` clamps dt to
  `maxDt`, bounding `lerpSpeed * dt <= 0.5` at defaults; pos stays in the world
  envelope. The exponential-damping alternative was rejected: measured against the
  linear lerp at `lerpSpeed = 5` over 600 frames it drifts 15.884 px at dt = 1/60
  and 32.981 px at dt = 1/30 -- four to five orders of magnitude above the f32
  position-storage noise (~1.19e-4 px at a 1000 px offset), a visible change to how
  valid frames feel (`decisions/0002-dt-policy.md`).
- **CP-12 -- garbage into the facade fails loud, not at frame N+1.** Before:
  `setMode(99)` left the strategy lookup undefined and the next `update()` threw a
  raw un-coded TypeError; `setState({ zoom: 0 })` skipped the setZoom clamp and set
  `visibleW` to Infinity; `setState({ zoom: NaN })` emitted `scale(NaN)` (a black
  screen, no error); `shakePreset(undefined)` threw a raw TypeError from
  `name.toLowerCase()`; `setZoom(NaN)` set zoom to NaN. Now each rejects at its door
  (`ERR_CAMERA_MODE` / `ERR_CAMERA_STATE` / `ERR_CAMERA_ZOOM`) or is a documented
  no-op (`shakePreset` unknown name), and `setState({ zoom: 0 })` clamps to 0.25.
- **CP-19 -- multi-target over-reads are unreachable.** Before: `setTargetCount(64)`
  on 2 targets, or `trackMultiple` with a garbage entry, crashed `updateMultiTarget`
  at frame N+1 reading `.x` on undefined. Now `trackMultiple` validates the array and
  every entry at call time and `setTargetCount` bounds the count to the array length,
  both throwing `ERR_CAMERA_TARGETS`; the facade over-read is unreachable.

## [1.1.0] -- 2026-08-26

Subpath exports. A consumer who needs only screen shake now imports
`@zakkster/lite-camera-pro/shake` and pays for the shake engine plus its
tree-shaken noise sampler -- nothing else. No runtime behavior changed: the hot
bodies (`computeShake`, `updateShake`, `apply`, `updateParallax`, `applyBounds`,
`updateMultiTarget`) are byte-identical, and the camera class imports the same
module files the subpaths expose (one engine, no fork -- proven by the T8
Object.is identity check).

Measured: the Las Vegas scratch-card consumer (BRIEF.md) reported a 73.5 KB gz
whole-package pull for a three-tier win-shake ramp that touches only the shake
API. Through `@zakkster/lite-camera-pro/shake` the same integration measures
**2.82 KB gz** (2,883 B; 8.79 KB raw, esbuild esm, minify=false, gzip -9) --
about **26x smaller**. Of that bundle, lite-noise's `Noise.js` contributes
2,009 B (5.1% of its 39,613 B source), so tree-shaking through the noise
dependency works as intended.

### Added

- **Subpath exports map.** Seven entries beside `.`: `./shake`, `./parallax`,
  `./bounds`, `./multi`, `./follow`, `./sequence`, and `./package.json`. Each
  runtime entry carries a sibling `types` condition (declared first, per the
  TypeScript exports-map requirement). Per-subpath gz weights (esm, unminified,
  gzip -9): `./shake` 2.82 KB, `./parallax` 0.89 KB, `./bounds` 1.13 KB,
  `./multi` 0.89 KB, `./follow` 0.71 KB, `./sequence` 5.94 KB, `.` 21.70 KB.
  `./sequence` drags `@zakkster/lite-timeline` + `@zakkster/lite-ease` by design
  -- it is the only subpath that does.
- **`src/Shake.js` barrel.** A two-line re-export over `ShakeEngine.js` +
  `ShakePresets.js` (never a copy), so a shake-only consumer gets the engine,
  the presets, and `getPreset`/`registerPreset`/`listPresets` from one import.
- **Typed functional layer (CP-16a).** `src/index.d.ts` now re-exports six
  per-subsystem sibling declarations (`Shake.d.ts`, `ParallaxManager.d.ts`,
  `BoundsSystem.d.ts`, `MultiTarget.d.ts`, `FollowMode.d.ts`,
  `CameraSequence.d.ts`), each declaring its module's complete runtime surface
  -- state interfaces, enums, defaults, no `any`. The standalone functions are
  now visible and typed at the main entry, not just the class.
- **Size gate.** `test/size.mjs` bundles every subpath with the esbuild JS API
  and asserts `./shake` gz stays at or under the fixed 16,384 B charter budget.
  Wired into `npm run verify`.
- **Dependency decision record (CP-17).** `decisions/0001-layout-and-deps.md`
  documents the multi-file layout and the five first-party runtime deps, with
  per-dep floor evidence. Repo-only; not shipped in the tarball.
- **TypeScript smoke.** `test/types-smoke/smoke.ts` exercises every subpath plus
  the main entry under `strict` + `noImplicitAny` + node16 resolution;
  `npm run typecheck` runs it and joins `prepublishOnly`.

## [1.0.1] -- 2026-08-25

Foundation release: make the suite run, gate it, and land the fixes that cost
nothing at the public surface. No behavior change to any valid, finite,
in-bounds call -- CP-13 and CP-14 change only what defective input does.

### Fixed

- **CP-1 -- the standalone functional API is now reachable from the package
  entry.** `src/index.js` re-exports `createShakeState` (Shake Engine) and
  `createMultiTargetState` (Multi-Target); before, every state-taking function
  in the documented tree-shakeable layer took a state no consumer could
  construct. Reported in `BRIEF.md` by the Las Vegas scratch-card consumer.
- **CP-8 -- use-after-destroy fails closed.** After
  `CinematicCameraPro.destroy()`, EVERY public method throws an error with code
  `ERR_CAMERA_DESTROYED` (fail closed) instead of a raw null deref. destroy()
  calls `super.destroy()` for base parity, then rebinds the whole public surface
  to the named-error sentinel, so the guarantee cannot drift as methods are
  added. A double `destroy()` throws the same named error.
- **CP-13 -- uniform floor snap.** `apply()` and `applyParallaxLayer()` now
  snap the world/layer scroll with `Math.floor` instead of `| 0`, matching the
  base camera. `| 0` truncated toward zero, disagreeing with the base by a full
  pixel at negative fractional positions and taking a double-length integer step
  about the origin.
- **CP-14 + H-F -- trauma default fail-closed.** `addShake`/`addTraumaSimple`
  replaced the falsy `profile.trauma || 0.5` default: `undefined` still means
  0.5, but a non-finite trauma/intensity now activates NO slot (fail closed) and
  an explicit `0` fires nothing. The old `||` laundered `NaN` into 0.5 -- the
  only reason a NaN could not poison the shake sum from the trauma side (H-F).
  The laundering is removed and the poison door closed in one change. Guards live
  in the cold entry functions only; the per-frame `updateShake`/`computeShake`
  loops are unchanged.

### Added

- **node:test suite.** Ported both vitest suites to `node:test` +
  `node:assert/strict` (facade + standalone subsystems), added
  `test/consumer.test.js` (the feel-freeze pinning the consumer's three-tier
  shake ramp), `test/regressions.test.js` (one named test per finding above),
  and `test/metadata.test.js` (three-place version law, packaging, CP-1 export
  guard). Removed vitest and its config.
- **Torture gate.** `test/torture.mjs` plus a tiered harness
  (`@zakkster/lite-gc-profiler` + `@zakkster/lite-leak` + `@zakkster/lite-signal`
  dev-only): metamorphic laws (T0), degenerate known-bad pins (T1), lifecycle
  abuse (T4), the zero-alloc budget gate (T6: 200k `update`+`apply` under active
  shake, `maxMajor:0`/`maxPauseMs:4`, pool-not-reallocated), retention soak (T7),
  and the BREAK control (T9). `CAMPRO_TORTURE_BREAK=1` exits non-zero.
- **Version law.** `export const VERSION = "1.0.1"` from `src/index.js`, this
  `CHANGELOG.md`, and a `Version:` header in `llms.txt`.

### Changed

- Corrected three stale dependency header comments: `src/index.js` no longer
  credits `lite-random` (not a dependency); `src/BoundsSystem.js` and
  `src/MultiTarget.js` no longer claim a `@zakkster/lite-lerp` dependency they
  do not import (their clamps are inline).

## [1.0.0] -- 2025-06-28

Initial release. Cinematic Canvas2D camera system extending
`@zakkster/lite-camera`'s `CinematicCamera`: smooth/eased zoom, five follow
modes, multi-target auto-framing, an 8-slot simplex-noise shake engine with
presets, fluent timeline sequences, a 16-layer parallax manager, per-edge
bounds, a debug HUD, and zero-alloc coordinate conversion.

[1.2.0]: https://github.com/PeshoVurtoleta/lite-camera-pro/releases/tag/v1.2.0
[1.0.1]: https://github.com/PeshoVurtoleta/lite-camera-pro/releases/tag/v1.0.1
[1.0.0]: https://github.com/PeshoVurtoleta/lite-camera-pro/releases/tag/v1.0.0
