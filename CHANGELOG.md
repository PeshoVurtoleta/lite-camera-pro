# Changelog

All notable changes to `@zakkster/lite-camera-pro` are documented here. The
format follows Keep a Changelog, and this project adheres to Semantic
Versioning. Version lives in three places at once -- `package.json`, the
`VERSION` const in `src/index.js`, and the `Version:` header in `llms.txt` --
bumped together or not at all.

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
