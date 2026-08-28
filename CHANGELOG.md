# Changelog

All notable changes to `@zakkster/lite-camera-pro` are documented here. The
format follows Keep a Changelog, and this project adheres to Semantic
Versioning. Version lives in three places at once -- `package.json`, the
`VERSION` const in `src/index.js`, and the `Version:` header in `llms.txt` --
bumped together or not at all.

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

[1.0.1]: https://github.com/PeshoVurtoleta/lite-camera-pro/releases/tag/v1.0.1
[1.0.0]: https://github.com/PeshoVurtoleta/lite-camera-pro/releases/tag/v1.0.0
