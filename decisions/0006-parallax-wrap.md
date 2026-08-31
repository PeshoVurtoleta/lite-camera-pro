# 0006 -- parallax wrap: tile-space wrap, fail closed at the door

Status: accepted (v2.1.0, PRO4). Fixes CP-10a.

## Problem

`WrapMode` was decorative. ParallaxManager.js stored `wrap` on the layer slot
and exported the enum, but NOTHING read it: `updateParallax` wrote the raw
scroll and never wrapped. A REPEAT_X layer scrolled off to infinity like every
other layer.

## Decision -- tile-space wrap on the preallocated slot

Opts gain `tileW`/`tileH` (world-space px), two numeric fields added to the layer
at `createParallaxState` (init 0, never allocated per call).

Fail-closed rule at `addParallaxLayer` (cold), on BOTH the new-slot and the
update-existing paths, validating the EFFECTIVE wrap/tile BEFORE any slot write:
wrap REPEAT_X|BOTH requires a finite tileW > 0; REPEAT_Y|BOTH requires a finite
tileH > 0; wrap itself an integer WrapMode 0..3. A violation is
`Error` code "ERR_PARALLAX_TILE" naming the missing field, nothing mutated.
Silently-unwrapped was the defect; a no-op default would re-ship it.

Wrap formula (negative-safe Euclidean): `s - Math.floor(s / tile) * tile` --
result in [0, tile) for every finite s. Chosen over `((s % t) + t) % t` (two
modulo ops, and -0 for exact multiples). The door guarantees tile > 0, so no NaN
route exists.

Emission: `updateParallax` writes the WRAPPED value back into
`layer.scrollX/scrollY` -- one source of truth, so `getLayerScroll` and
`applyParallaxLayer` emit wrapped values with zero added code. Verified: a
REPEAT_X layer, tileW 256, at scroll 3*256 + 7 reads 7; at -9 reads 247.

## Zero-alloc: NONE layers stay byte-identical

The two scroll assignments are unchanged and execute FIRST; the wrap math sits
behind one `if (layer.wrap !== 0)` per active layer, after them. NONE layers
(wrap 0) pay only that compare and produce byte-identical output.

Measured A/B (`test/perf/parallax-guard.mjs`, 2e7 iters/run, full 16-layer NONE
pool): no-wrap-block body 24.07 ns/op; wrap-compare body 51.55 ns/op; delta
~27.5 ns/frame over 16 layers = ~1.72 ns/layer for the single `wrap !== 0`
compare. That compare is the only new hot-body cost, and it is paid only on
active layers.

## Rejected alternative

A separate wrapped-layer index list or a second tick function: forks the state
shape (H-B) and doubles the attach surface to save one compare.
