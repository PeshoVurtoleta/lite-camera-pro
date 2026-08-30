# 0002 -- Delta-time policy for the update path

Status: accepted (v1.2.0, session PRO2)
Findings: CP-3 (NaN dt poisons the shake engine forever), CP-4 (a dt spike
diverges the single-target position lerp). Hazards: H-C (hot bodies pay zero),
H-D (the clamp must not perturb valid-frame motion).

This record pins how `CinematicCameraPro.update()` and the standalone
`updateShake()` treat their `dt` argument, and why one candidate rewrite was
measured and rejected. It is a repo-only artifact: `decisions/` is NOT in
package.json `files[]` and never ships in the tarball (see 0001, Packaging note).

## The two defects dt policy closes

- CP-3: `updateShake(state, NaN)` drives `s.time` and `s.trauma` to `NaN`. The
  slot's `trauma <= 0` test is then false forever, so the slot never deactivates
  and `computeShake` emits `NaN` on every subsequent frame. A single poisoned
  frame breaks the render permanently.
- CP-4: the single-target position step is
  `pos += (target - pos) * lerpSpeed * dt`. This is a first-order explicit
  integrator; for `lerpSpeed * dt > 2` the error grows every frame. Measured:
  40 frames of `dt = 0.5` with `BoundsType.NONE` blow `pos` past 1e6.

Both are ordinary runtime garbage (a stalled tab, a debugger pause, a bad
frame-time source) permanently breaking the camera. The fix is a fail-closed
door at each entry, not a body rewrite.

## Policy A -- reject non-finite or negative dt (adopted)

At the very top of `update()` and at the entry of `updateShake()`:

    if (!Number.isFinite(dt) || dt < 0) return;

A rejected frame is a documented no-op: NOTHING is mutated and the method
returns. `NaN`, `+Infinity`, `-Infinity`, and any negative dt never reach the
zoom animation, the follow strategy, the bounds pass, the position lerp, the
parallax pass, or the shake update. `null` coerces via `Number.isFinite(null)
=== false` and is rejected too -- null is not zero.

### D-k -- a rejected frame is invisible

The door returns BEFORE every side effect in the body, including the finished-
sequence cleanup (`if (seq && !seq.playing) this._seq = null`). That cleanup
runs on the next legal frame instead. A rejected frame mutates no field the
caller can observe; it is exactly as if the frame had not been called.

### D-g -- dt === 0 and -0 are legal no-advance frames

`0 >= 0` and `-0 >= 0` are both true, so `dt < 0` is false for each: both pass
the door. A zero dt produces zero deltas everywhere (zoom elapsed unchanged,
lerp term zero, trauma decay zero, time advance zero). A zero-length frame is a
legal frame that advances nothing, not an error.

## Policy B -- clamp dt above maxDt (adopted)

After the reject door, `update()` clamps an over-large finite dt:

    if (dt > this.maxDt) dt = this.maxDt;

`this.maxDt` is a public tunable, default `0.1` (see D-f). This bounds
`lerpSpeed * dt` so the explicit integrator cannot diverge on a spike: at the
default `lerpSpeed = 5` and `maxDt = 0.1`, `lerpSpeed * dt <= 0.5`, well inside
the stable region. A dt exactly equal to `maxDt` passes untouched (`dt > maxDt`
is false), so a legal frame at the ceiling is not perturbed (H-D).

### D-f -- maxDt is a plain public field

`maxDt` lives in the constructor's tunable cluster beside `lerpSpeed`,
`predictTime`, etc. Consumers retune it directly (`cam.maxDt = 1 / 30`). Writing
garbage to it is out of contract and deliberately NOT guarded per frame: a
per-frame `Number.isFinite(this.maxDt)` read would add a hot-body branch that
never fires for a correct consumer, violating H-C. The field is a knob, not an
input.

### D-l -- updateShake's own door is reject-only, no clamp

The standalone `updateShake(state, dt)` (subpath `./shake`) has no `maxDt`
field and no camera to borrow one from, so its door is reject-only:

    if (!Number.isFinite(dt) || dt < 0) return;

A large but finite dt is self-limiting in the shake engine: `trauma` decays by
`decay * dt`, so an over-large dt pushes `trauma <= 0` and the slot deactivates
in a single step; `time` advances once and is only ever a noise sample argument
(bounded output). There is no integrator to diverge. `cam.update()` hands
`updateShake` an already-clamped dt, so the camera path still gets Policy B; a
direct standalone caller gets reject-only, which is sufficient for that surface.

## Policy C -- rewrite the position lerp to exponential damping (REJECTED)

Candidate C replaced the explicit step with frame-rate-independent exponential
damping, `pos += (target - pos) * (1 - exp(-lerpSpeed * dt))`, which is
unconditionally stable for any dt >= 0 and would make Policy B's clamp
unnecessary for CP-4.

Rejected by measurement. C changes the motion of EVERY valid frame, not just
the spike. A/B measured (linear lerp vs exp damping, `lerpSpeed = 5`, 600
frames):

- max drift 15.884 px at dt = 1/60,
- max drift 32.981 px at dt = 1/30.

That is a visible change to how the camera feels at normal frame rates -- the
consumer feel-freeze (consumer.test.js, H-A) exists precisely to forbid silent
motion changes of this size. For reference, the float32 position-storage noise
at a 1000 px camera offset is ~1.19e-4 px, so the 15-33 px drift is four to five
orders of magnitude above storage noise: unmistakably a behavior change, not
rounding. Policies A + B close CP-3 and CP-4 while leaving every valid frame
byte-identical; C buys unconditional stability at the price of changing valid
motion, so it is not adopted.

## Hot-path accounting (H-C)

The only additions to a hot body are the two 2-line entry doors. Below each
door, `update()` and `updateShake()` are byte-identical to 1.1.0:
`computeShake`, the per-slot loops, `addTraumaSimple`'s loop, and `apply()` gain
zero branches. The doors are comparisons only; the error objects that other
1.2.0 doors throw are constructed exclusively on cold throwing paths, never on
the update path. The T6 alloc gate (maxMajor 0 / maxPauseMs 4, pool identity
pinned) is the proof this holds.
