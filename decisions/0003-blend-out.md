# 0003 -- Sequence blend-out, stop() ticker release, and the `at:0` fix

Status: accepted (v1.3.0, session PRO3)
Findings: CP-10b (blendOutTime was decorative -- stored, read by nothing, so
completion was a hard handoff to follow), CP-5 (stop() called timeline.reset(),
which detached the update callback but never released the shared-ticker
refcount, so a stopped-not-destroyed sequence pinned the RAF loop forever), and
CP-11 (`opts && opts.at || undefined` dropped `at: 0`, silently appending a step
that asked to start at t=0). Hazards: H-C (the no-sequence hot body pays as close
to nothing as measurable), H-E (replay-after-stop stays correct).

This record is a repo-only artifact: `decisions/` is NOT in package.json
`files[]` and never ships in the tarball (see 0001, Packaging note).

## D-a -- the blend mechanism (implemented)

State lives on the CAMERA: one new field `this._blendRemain` (SECONDS, 0 =
inactive), in the constructor's sequence/state cluster next to `_seq`. The
sequence carries only the budget, `state.blend` (see D-b). The math lives in
step 6 of `update()`, exclusive with the plain follow lerp:

```js
} else if (this._blendRemain > 0) {
    const r = this._blendRemain - dt;
    if (r <= 0) {
        this._blendRemain = 0;
        this.pos[0] = this.target[0];   // window over: land exactly
        this.pos[1] = this.target[1];
    } else {
        const k = dt / this._blendRemain; // k < 1 (dt < old remaining)
        this._blendRemain = r;
        this.pos[0] += (this.target[0] - this.pos[0]) * k; // deadline convergence
        this.pos[1] += (this.target[1] - this.pos[1]) * k;
    }
} else {
    ...existing plain lerp, byte-identical to 1.2.0...
}
```

Linear convergence to a MOVING follow target that lands exactly at window end.
With a static target the per-frame step is CONSTANT (a linear glide). Zero
allocation, no user callback.

ZOOM IS NOT BLENDED: there is no follow-side zoom target to return to, so the
sequence's final zoom persists (1.2.0 behavior, now documented). dt=0 during a
blend: k=0, no decrement -- the blend freezes with the camera (consistent with
the PRO2 dt policy); dt is clamped by `maxDt` as usual before step 6.

Mode limits (F17): LOCK, CUT, and HYBRID with a locked vertical write `cam.pos`
directly before step 6, so `(target - pos)` is already 0 and a blend cannot act
in those modes by construction. Documented, not special-cased. Looping
sequences never fire timeline onComplete (F6), so they never arm a blend.

Rejected alternatives:
- Eased factor over a fixed window: needs a stored start pose and jumps when the
  follow target moves during the blend. The deadline lerp tracks a moving
  target for free.
- Temporary `lerpSpeed` mutation: publicly observable, and the restore is
  fragile (a stop mid-blend would have to remember and revert the old value).
- Blend state on the sequence object: forces `_seq` to outlive completion, kills
  the existing `if (seq && !seq.playing) this._seq = null` cleanup, and adds a
  per-frame deref on the hot path. State on the camera keeps completion cleanup
  intact.

### Measured cost of the one compare (H-C)

The non-blending path (the overwhelmingly common case) gains exactly ONE
`this._blendRemain > 0` compare on a monomorphic number field. Measured: 200k
`update()` calls on a no-sequence camera, current tree WITH the branch vs a
scratch copy with the branch hand-removed (step 6 reverted to the plain-lerp-only
1.2.0 form), 15 trials each, warmed:

```
WITH    branch: median ~8.09 ms  (~40.5 ns/update)
WITHOUT branch: median ~7.93 ms  (~39.7 ns/update)
delta (median): ~0.16 ms over 200000 updates = ~0.8 ns/update
```

The delta is under one nanosecond per update and sits inside the run-to-run
noise of the ~40 ns/update body (the min-delta swung between ~0.5 and ~1.9 ns
across runs, occasionally near zero). The compare is, for practical purposes,
free -- one register test the branch predictor pins to "not taken". The T6 alloc
gate is unchanged (0 B/op, maxMajor 0, maxPauseMs 4).

## D-b -- completion-vs-stop discriminator (`state.blend`)

`update()` already dereferences `seq._state` every sequence frame. The
completion wrapper (in `createCameraSequence`) sets `state.blend = blendOutTime`;
`stop()` and `destroy()` set it 0. The two existing cleanup branches in
`update()` (multi-target and single-target paths, both already gated on
`if (seq && !seq.playing)`) gain one assignment each:

```js
if (seq && !seq.playing) { this._blendRemain = seq._state.blend; this._seq = null; }
```

So a natural completion copies the armed budget into `_blendRemain` and glides;
a `stop()`/`destroy()` completion copies 0 and hands off hard. Because the
assignment lives inside a branch already gated on `seq`, a non-sequence caller's
instruction stream is bit-identical to 1.2.0 except for D-a's single compare.
`cam.stopSequence()` and `cam.playSequence()` both zero `_blendRemain` directly
(an explicit stop, or a new cinematic, cancels any pending blend).

Rejected: a separate `_completed` boolean -- a second deref carrying the same
information `state.blend` already carries.

## D-c -- units + the door

`blendOutTime` stays SECONDS and unrenamed: it integrates against `update(dt)`
seconds, the published docs already said seconds, and renaming would break a
published option for cosmetics. Every touchpoint gains the loud line: "SECONDS
(class-API units). Step durations on this same builder are MILLISECONDS
(timeline units)." The door lives at `createCameraSequence` (cold, setup-time):
a non-finite or negative `blendOutTime` throws a house-style Error with code
`ERR_SEQUENCE_OPTIONS`. 0 is legal -- a hard handoff, identical to 1.2.0.

Rejected: stripping the option (loses a real, cheap feature); a silent clamp
(PRO2 doctrine is a named error at a setup-time door, not a laundered value).

No other option key gains validation this session. Unknown-key rejection (a
did-you-mean hint for a typo'd option) is a real gap but a breaking behavior
change -- deferred to the 2.0.0 session, out of scope here.

## D-d -- resume() zombie guard

`resume()` becomes `if (timeline && isPlaying) timeline.play()`. `pause()`
leaves `isPlaying` true; `stop()` and completion clear it -- so the predicate is
exactly "paused". This matters beyond hygiene: `timeline.play()` auto-seeks to 0
when it is at the end, and lite-timeline's seek fires duration-0 tracks, so a
resume-after-completion would REPLAY the whole cinematic -- re-firing every
`.call(fn)` and, via the shake step's onComplete, real `addShake` impulses on
the live camera. That is a live mutation, not a cosmetic replay, so a
document-only fix was rejected.

Meaning by state after 1.3.0: playing -> pause freezes pose (ticker held,
`state.active` true); paused -> resume continues, stop releases; stopped ->
timeline null, resume/pause no-op, progress 0, play() replays from a fresh
snapshot; completed -> resume NO-OP, play() replays; destroyed -> inert.

## D-e -- the T7 conservation gate + T9 control

`harness.mjs` keeps store-only RAF counting and adds one latest-callback slot
(cb + id). `cancelAnimationFrame` clears the slot on id match; a new `pumpRaf()`
export takes-and-clears the slot and invokes it once with a synthetic monotonic
timestamp (+16 ms steps). t7 gate, after the play/stop/destroy churn + settle:
`c0 = rafCount(); pumpRaf() x 4; assert rafCount() === c0`. A live (leaked)
ticker re-requests on each pump (+4, the pre-fix failure); a released ticker
cleared its slot at destroy, so the pump is a no-op (+0). The t9 control builds
the pre-fix shape in-process (createTimeline directly, a dummy track, play, then
`reset()` instead of `destroy()`) and asserts the pump DOES grow the count
(die() otherwise: the detector is vacuous), then destroys it so the tier leaves
shared-ticker refs at 0.

## D-f -- resolveAt (the CP-11 fix)

One module-level helper resolves a step's `at`:

```js
function resolveAt(opts, alt) {
    if (opts !== null && typeof opts === 'object' && opts.at !== undefined) return opts.at;
    if (alt !== null && typeof alt === 'object' && alt.at !== undefined) return alt.at;
    return undefined;
}
```

All six builders call it; `shake` alone passes its intensity arg as `alt` so the
2-arg `shake(name, {at})` form is preserved. `at: 0` is honored (absolute t=0),
`at: undefined` behaves as omitted, `at: null` is passed through and ignored by
lite-timeline (append), documented as such. Build-time only; never on the hot
path. The old `opts && opts.at || undefined` treated `at: 0` as falsy and
appended.

## D-g -- before/after (every row pinned by a named test in regressions.test.js)

| member       | state            | 1.2.0                              | 1.3.0                                                        | test |
| ------------ | ---------------- | ---------------------------------- | ----------------------------------------------------------- | ---- |
| stop()       | playing          | timeline.reset(), ticker held      | timeline.destroy() + null, ticker released                  | CP-5 stop-releases |
| play()       | after stop       | replays (rebuild)                  | replays (rebuild), unchanged                                | H-E replay |
| progress     | after stop       | 0 (reset)                          | 0 (null branch)                                             | H-E progress-pin |
| duration     | after stop       | timeline.duration, at-aware (1600) | step-sum fallback (1500), documented                        | CP-11 duration-divergence |
| seek(t)      | after stop       | seeks old build                    | rebuilds w/ fresh snapshot, then seeks; fires crossed 0-dur | seek-after-stop |
| resume()     | after stop       | replays (zombie)                   | no-op                                                       | D-d zombie/stop |
| resume()     | after completion | replays + REFIRES SHAKES           | no-op                                                       | D-d zombie/completion |
| pause/resume | playing          | works                              | unchanged                                                  | H-E pause |
| destroy()    | any              | dead                               | unchanged                                                  | existing |
| completion   | any              | hard handoff to follow lerp        | blend over blendOutTime s (0 = 1.2.0)                       | CP-10b |
