# 0008 -- callback lifecycle: re-entrant destroy, completion release, doors

Status: accepted (v2.1.0, PRO4). Fixes CP-20, CP-24, CP-25, CP-26.

## CP-20 -- destroyed-flag check after the user callback, one site

destroy() sets `this._destroyed = true` BEFORE nulling anything. update() gains,
immediately after `t = this._zoomEase(t)` (the only synchronous user callback in
the body), `if (this._destroyed) return;` -- an aborted frame mutates nothing
further, matching the dt door's documented contract. Pre-fix, a callback that
called `cam.destroy()` mid-frame let update() fall through to
`FOLLOW_STRATEGIES[this.mode](...)` on nulled typed arrays: a raw
`TypeError: Cannot read properties of null` with no `.code`.

Not a steady-state cost: the check lives inside the `_zoomEase` branch inside
`if (this._zoomDur > 0)` -- a camera not mid-zoom-animation executes zero new
instructions. Measured anyway (H-C, `test/perf/pro4-guards.mjs`, 2e7 iters/run,
mid-zoom-animation so the branch runs every frame): with-check 43.12 ns/op vs
no-check 44.77 ns/op, delta -1.65 ns/op -- within noise, free.

REJECTED: a deferred-destroy latch (makes destroy() a lie -- the camera stays
alive a frame, and a post-destroy call inside the same callback would NOT throw
ERR_CAMERA_DESTROYED, regressing CP-8); documented-named-error-only (the crash
today is raw; documenting a raw crash is not a door).

Sequence .call(fn)/onComplete are the same hazard class but run inside the
timeline tick; T4 covers cam.destroy() from a step callback and from onComplete,
asserting "named error or clean no-op, never raw". No source door was needed
there -- the camera-side abort suffices.

## CP-24 -- camera-side release of a completed sequence's timeline

At the two completion-cleanup branches (the multi-target and single-target
paths), duck-typed, exact order:

    this._blendRemain = seq._state.blend;   // read FIRST -- stop() zeroes it (PRO3 D-b)
    if (typeof seq.stop === "function") seq.stop();
    this._seq = null;

The branch runs on the first update() AFTER completion -- OUTSIDE the ticker tick
-- which is precisely why it dodges the CP-20 re-entrancy class. Duck-typing is
mandatory: the 2.0.0 attach law forbids a live import from the class to the
detached ./sequence module; the import-graph and literal gates enforce it.

"Release" per the PRO3 lifecycle triangle: the timeline is destroyed, the shared
ticker refcount drops, steps are kept, progress resets to 0, and play() rebuilds
(H-E -- stop() is the existing release-with-replay precedent; T-J proves replay).
Documented boundary: release happens on the first update() after completion; a
caller who stops updating holds the ref until stop()/destroy().

### The seq.stop()-on-a-completed-timeline probe (run before writing the release)

A five-line probe built a one-step sequence, pumped the RAF polyfill to natural
completion, then called stop() and asserted no throw + ticker released + replay.
Recorded output:

    after pumps=3 playing=false active=false blend=0.3 progress=1
    stop() threw=null
    rafCount c0=1 beforeStop=4 afterStop=4 afterPump=4   (ticker released: no growth after stop)
    replay play() threw=null playing=true active=true progress=0

stop() behaves on a naturally completed timeline: no throw, the ticker is
released (rafCount does not grow after the pump), and play() replays. The
deferred-release latch fallback was therefore NOT needed and is rejected below.

REJECTED: synthetic completion (invents an onComplete the author never
scheduled); a camera-side deferred-release latch (a second lifecycle mechanism
for the same event when the completion branch already runs at the right time and
place, and the probe proved stop() is safe there).

### Zero-step: fixed at the source

A zero-step sequence never self-completes (lite-timeline gates completion on
tracks.length > 0), so a built-but-empty timeline would pin the shared ticker
forever. Fixed in CameraSequence.js#play: zero steps is a documented no-op that
never acquires a timeline (playing false, _state.active false). qa-boundary-
pro3 test 7 was flipped to pin the new no-op behavior; test 8 (the CP-24 leak
finding) was flipped to pin the release. Both carry "// flipped by PRO4 (v2.1.0)".

## CP-25 -- the shake profile door (ShakeEngine.js#addShake)

`profile == null` (null or undefined) -> documented no-op return. This preserves
the 1.x shakePreset no-op through composition and keeps the 2.0.0 idiom
`const p = getPreset(n); if (p) cam.shake(p, i)` valid (the guard becomes
optional, never wrong), matching the getPreset-returns-null precedent in 0004.
Any OTHER non-object (string, number, boolean, function, array) -> Error code
"ERR_SHAKE_PROFILE" (a new literal, beside ERR_SHAKE_PRESET). The door sits above
the first `profile.trauma` deref, inside the existing CP-14/H-F cold guard block;
updateShake/computeShake gain zero instructions. qa-boundary-pro6's CP-25 pin
flipped ("// flipped by PRO4 (v2.1.0)"): shake(null) no longer raw-crashes.

QA-4 (S3, informational, no change): a profile object whose `trauma` getter calls
`cam.destroy()` has that getter read twice by addShake's `profile.trauma ===
undefined ? 0.5 : profile.trauma` pattern; the second read re-enters the
now-`_dead`-rebound destroy(), so shake() ITSELF throws ERR_CAMERA_DESTROYED
mid-call, and the camera is left honestly destroyed for any subsequent use.
Correct fail-closed behavior on a deliberately hostile profile -- recorded,
not patched.

## CP-26 -- the bounds doors (BoundsSystem.js, class delegates)

setBoundsAll/setBoundsEdges (the ./bounds functions the class setters delegate
to): each provided edge must be `Number.isInteger(v) && v >= 0 && v <= 3`, else
Error code "ERR_CAMERA_BOUNDS". ERR_CAMERA_* is the facade grammar; ERR_CAMERA_MODE
is the exact enum-range precedent. setBoundsEdges validates EVERY provided edge
BEFORE mutating any (validate-before-mutate). The same code covers setBoundsRect
non-finite args and setSoftZone (finite, softZone >= 0) -- the finiteness door D1
(0005) relies on to keep a NaN softZone out of the hot map. All doors are cold;
applyBounds's per-frame body gains nothing. resize interplay: super.resize()
runs first and a rejected resize throws base ERR_CAMERA_DIMS with nothing
mutated; the Pro override adds no second door and no second code.

## CP-7 resize override (D6) -- lives here for lifecycle proximity

`resize(viewW, viewH, worldW, worldH)`: read the live pose first (pure reads
mutate nothing, so a rejected super.resize leaves both sides untouched),
super.resize() (validates + sets dims + its own zoom-unaware clamp), restore the
pose, `_updateBoundsForZoom()`, then `clampToBounds(...)` -- a plain HARD clamp of
target AND pos into the zoom-aware box (custom rect honored). Three separately
falsifiable properties: visibleW/_maxX correct ON RETURN (no stale frame); target
AND pos re-clamped (no yank, no bounce -- base clamped only pos, to a zoom-unaware
max); the clamp is HARD, never SOFT/ELASTIC (0005). P10 pinned: zoom 2, world
3200x2400, pos settled 2560, resize(1600, 1200, 3200, 2400) -> visibleW 800
immediately, _maxX 2400, pos exactly 2400 (base alone: 1600 and a stale 400).
clampToBounds is a NEW zero-alloc export of BoundsSystem.js deriving the same
min/max box applyBounds derives; applyBounds's hot body is NOT refactored to
share it -- deliberate duplication guarded by the T-D3 10k-random-state
box-agreement sweep. REJECTED: hoisting the box math into a shared helper
(touches the per-frame body of applyBounds for a cold-path convenience).
