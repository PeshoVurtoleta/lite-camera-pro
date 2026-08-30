# Changelog

All notable changes to `@zakkster/lite-camera-pro` are documented here. The
format follows Keep a Changelog, and this project adheres to Semantic
Versioning. Version lives in three places at once -- `package.json`, the
`VERSION` const in `src/index.js`, and the `Version:` header in `llms.txt` --
bumped together or not at all.

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
