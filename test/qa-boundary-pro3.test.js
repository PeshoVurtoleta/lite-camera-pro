// =============================================================================
// qa-boundary-pro3.test.js -- QA-authored coverage closing gaps found while
// independently verifying PRO3's A1-A8 assertions (CP-5 ticker release,
// CP-11 resolveAt, CP-10b blend-out, v1.3.0). Each test targets a boundary the
// planner's own coder/reviewer suites (t1/t3/t4/t6/t7/t9/regressions/metadata)
// do not literally pin, per the qa VERIFY checklist. Not a duplicate of any
// existing test -- checked against test/regressions.test.js and
// test/CinematicCameraPro.test.js before writing (see PRO3-PLAN.md Phase 2).
//
// Numbered per the qa brief's candidate list, most valuable first.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CinematicCameraPro, FollowMode } from '../src/index.js';
import { pumpRaf, rafCount, makeCam } from './helpers.mjs';

function pumpToCompletion(seq, guard = 20000) {
    while (seq.playing && guard-- > 0) pumpRaf();
    return seq.playing === false;
}

// -----------------------------------------------------------------------------
// 1. Reviewer NOTE-2 edge: multi-target framing active WHILE a sequence
//    completes. update()'s step-6 branch order is `(seq active || mt active)`
//    BEFORE the blend-arm compare, so the multi-target snap branch wins every
//    frame multi-target stays active: _blendRemain is armed (by the
//    seq-completion cleanup that ALSO runs inside the multi-target branch,
//    CinematicCameraPro.js:810) but never decremented -- deferred, not lost.
//    The moment multi-target is cleared, the single-target path resumes and
//    the frozen _blendRemain starts converging (a glide, not a snap).
// -----------------------------------------------------------------------------
test('1. multi-target defers an armed blend; clearing multi-target resumes the glide', () => {
    const DT = 1 / 60;
    const cam = makeCam(800, 600, 3200, 2400, 9);
    cam.setMode(FollowMode.PREDICTIVE);
    cam.trackMultiple([{ x: 100, y: 100 }, { x: 900, y: 700 }], { padding: 50 });

    const seq = cam.createSequence({ blendOutTime: 0.3 }).moveTo(700, 500, 200);
    cam.playSequence(seq);
    assert.ok(pumpToCompletion(seq), 'sequence must complete under the pump');

    // First post-completion frame: cleanup arms _blendRemain from state.blend
    // (0.3) even though the multi-target snap branch is the one that runs.
    cam.update(DT, 400, 300, 0, 0);
    assert.equal(cam._blendRemain, 0.3, 'blend must arm to the full budget on the first post-completion frame');
    assert.ok(
        Object.is(cam.pos[0], cam.target[0]) && Object.is(cam.pos[1], cam.target[1]),
        'multi-target snap branch wins: pos must equal target exactly (no glide yet)'
    );

    // 5 more frames with multi-target still active: _blendRemain must stay
    // FROZEN at exactly 0.3 -- deferred, never decremented while mt owns pos.
    for (let i = 0; i < 5; i++) cam.update(DT, 400, 300, 0, 0);
    assert.equal(cam._blendRemain, 0.3, 'a deferred blend must not decay while multi-target owns position');

    // Clear multi-target -> single-target path resumes -> the frozen budget
    // starts converging on the very next frame (exact deadline-convergence math).
    cam.trackSingle();
    cam.update(DT, 400, 300, 0, 0);
    assert.equal(cam._blendRemain, 0.3 - DT, 'blend must resume decrementing the frame multi-target clears');
    assert.ok(
        !Object.is(cam.pos[0], cam.target[0]) || !Object.is(cam.pos[1], cam.target[1]),
        'position must glide (not snap) once the single-target path resumes'
    );
    // Natural completion nulls cam._seq (D-b cleanup) before cam.destroy() ever
    // runs, so cam.destroy() cannot reach this seq's timeline any more --
    // release it explicitly (see finding 8: an orphaned completed sequence
    // leaks the shared-ticker refcount forever otherwise).
    seq.destroy();
    cam.destroy();
});

// -----------------------------------------------------------------------------
// 2. blendOutTime door boundary table (D-c). 0 and -0 are legal (Object.is
//    aware: -0 < 0 is false, so it slips the door); 0.0001 is legal.
//    -0.0001, NaN, +-Infinity, the string '0.3', and null all throw with
//    e.code === 'ERR_SEQUENCE_OPTIONS' -- asserting the CODE, not message text.
// -----------------------------------------------------------------------------
test('2. blendOutTime door: 0 / -0 / 0.0001 legal; -0.0001/NaN/Infinity/-Infinity/string/null throw ERR_SEQUENCE_OPTIONS', () => {
    const legal = [0, -0, 0.0001];
    for (const v of legal) {
        const cam = makeCam(800, 600, 3200, 2400, 1);
        assert.doesNotThrow(() => cam.createSequence({ blendOutTime: v }), `blendOutTime ${v} must be legal`);
        cam.destroy();
    }

    const illegal = [-0.0001, NaN, Infinity, -Infinity, '0.3', null];
    for (const v of illegal) {
        const cam = makeCam(800, 600, 3200, 2400, 1);
        let threw = null;
        try {
            cam.createSequence({ blendOutTime: v });
        } catch (e) {
            threw = e;
        }
        assert.ok(threw, `blendOutTime ${String(v)} must throw`);
        assert.equal(threw.code, 'ERR_SEQUENCE_OPTIONS', `blendOutTime ${String(v)} must carry the ERR_SEQUENCE_OPTIONS code`);
        cam.destroy();
    }
});

// -----------------------------------------------------------------------------
// 3. Blend interrupted mid-window by a NEW playSequence(). T-H: playSequence()
//    zeroes _blendRemain unconditionally. Pin: mid-glide value before the
//    interrupt, exact zero immediately after, and no residue once the new
//    sequence completes with blendOutTime:0 (hard handoff, no ghost glide).
// -----------------------------------------------------------------------------
test('3. a new playSequence() zeroes a mid-window blend; no residue after it completes', () => {
    const DT = 1 / 60;
    const cam = makeCam(800, 600, 3200, 2400, 9);
    cam.setMode(FollowMode.PREDICTIVE);

    const seqA = cam.createSequence({ blendOutTime: 0.3 }).moveTo(700, 500, 200);
    cam.playSequence(seqA);
    assert.ok(pumpToCompletion(seqA), 'A must complete');
    cam.update(DT, 400, 300, 0, 0); // arm
    for (let i = 0; i < 4; i++) cam.update(DT, 400, 300, 0, 0); // 5 frames into the glide
    assert.ok(cam._blendRemain > 0 && cam._blendRemain < 0.3, 'must be mid-glide before the interrupt');

    const seqB = cam.createSequence({ blendOutTime: 0 }).moveTo(900, 700, 100);
    cam.playSequence(seqB);
    assert.equal(cam._blendRemain, 0, 'playSequence() must zero a pending blend immediately');

    assert.ok(pumpToCompletion(seqB), 'B must complete');
    cam.update(DT, 400, 300, 0, 0);
    assert.equal(cam._blendRemain, 0, 'blendOutTime:0 completion of B must leave no glide residue');
    // Both A and B completed naturally -- cam._seq only ever pointed at
    // whichever one was live, so cam.destroy() can reach neither by now.
    // Release both explicitly (finding 8).
    seqA.destroy();
    seqB.destroy();
    cam.destroy();
});

// -----------------------------------------------------------------------------
// 4. stop() during the blend window of a PREVIOUS sequence: seq A completes
//    (blend armed), seq B plays (zeroes it per T-H), seq B is stop()ped ->
//    the discriminator (state.blend zeroed by stop()) must hand off HARD,
//    never re-arm a blend from B's abort.
// -----------------------------------------------------------------------------
test('4. seq B stop() after seq A armed a blend never re-arms it -- hard handoff', () => {
    const DT = 1 / 60;
    const cam = makeCam(800, 600, 3200, 2400, 9);
    cam.setMode(FollowMode.PREDICTIVE);

    const seqA = cam.createSequence({ blendOutTime: 0.3 }).moveTo(700, 500, 200);
    cam.playSequence(seqA);
    assert.ok(pumpToCompletion(seqA), 'A must complete');
    cam.update(DT, 400, 300, 0, 0);
    assert.equal(cam._blendRemain, 0.3 - DT, 'A must have armed the blend');

    const seqB = cam.createSequence({ blendOutTime: 0.3 }).moveTo(900, 700, 300);
    cam.playSequence(seqB);
    assert.equal(cam._blendRemain, 0, 'playSequence(B) must zero the pending blend from A');

    pumpRaf(); pumpRaf();
    seqB.stop();
    assert.equal(seqB.playing, false, 'B must be stopped');
    cam.update(DT, 400, 300, 0, 0);
    assert.equal(cam._blendRemain, 0, 'a stopped B must never arm a blend -- hard handoff');
    // A completed naturally and cam._seq no longer points at it -- release
    // explicitly (finding 8). B was already released by stop().
    seqA.destroy();
    cam.destroy();
});

// -----------------------------------------------------------------------------
// 5. seek() after stop() re-snapshot (F9/D-g). Moving the camera between
//    stop() and seek() must make the REBUILT timeline's steps originate from
//    the NEW pose, not the old one (checked exactly via seek(0), where the
//    eased fraction is 0 so onUpdate's lerp(from,...,0) === from bit-for-bit),
//    and duration-0 callbacks crossed by the seek must fire synchronously.
// -----------------------------------------------------------------------------
test('5. seek() after stop() rebuilds from the NEW pose and fires crossed callbacks synchronously', () => {
    const cam = makeCam(800, 600, 3200, 2400, 1);
    let called = 0;
    const seq = cam.createSequence()
        .moveTo(0, 0, 1000)
        .call(() => { called++; }, { at: 0 });

    cam.playSequence(seq);   // builds at the ORIGINAL pose, no pump -> no advance
    seq.stop();               // destroys the timeline immediately
    assert.equal(called, 0, 'nothing must have fired from a plain play/stop at t=0');

    // Move the camera to a NEW, in-bounds pose between stop() and seek().
    cam.setState({ posX: 1000, posY: 800, targetX: 1000, targetY: 800, zoom: 1, mode: cam.mode });

    seq.seek(0); // timeline is null -> rebuilds from the fresh snapshot, then seeks to 0
    assert.equal(called, 1, 'seek() must rebuild and fire the at:0 callback synchronously, exactly once');

    const expectedX = cam.pos[0] + cam.visibleW * 0.5;
    const expectedY = cam.pos[1] + cam.visibleH * 0.5;
    assert.ok(Object.is(seq._state.x, expectedX), 'rebuilt track must originate from the NEW snapshot center X');
    assert.ok(Object.is(seq._state.y, expectedY), 'rebuilt track must originate from the NEW snapshot center Y');

    seq.destroy();
    cam.destroy();
});

// -----------------------------------------------------------------------------
// 6. resolveAt at:'>' pass-through (D-f): '>' = same END as the previous
//    track (Timeline.js:202). Pin both the simple case and the interaction
//    with a preceding '<' overlap.
// -----------------------------------------------------------------------------
test("6. resolveAt at:'>' duration pins (same-end-as-previous grammar token)", () => {
    function dur(build) {
        const cam = makeCam(800, 600, 3200, 2400, 1);
        const seq = cam.createSequence();
        build(seq);
        seq.play();
        const d = seq.duration;
        seq.destroy();
        cam.destroy();
        return d;
    }

    // moveTo ends at 1000; wait{at:'>'} starts at 1000 (same as append here).
    const d1 = dur((s) => s.moveTo(100, 100, 1000).wait(500, { at: '>' }));
    assert.equal(d1, 1500, "wait{at:'>'} after a single track starts at that track's end -> 1500");

    // moveTo: 0..1000. zoomTo{at:'<'}: starts at moveTo's START (0) -> 0..300.
    // wait{at:'>'}: starts at zoomTo's END (300, the IMMEDIATELY PRECEDING
    // track) -> 300..800. Total = max(1000, 800) = 1000.
    const d2 = dur((s) => s.moveTo(100, 100, 1000).zoomTo(2, 300, { at: '<' }).wait(500, { at: '>' }));
    assert.equal(d2, 1000, "'>' resolves against the immediately preceding track (zoomTo's end), not the running max");
});

// -----------------------------------------------------------------------------
// 7. Zero-step sequence. FINDING (see qa report): a played empty sequence
//    NEVER completes -- lite-timeline's own completion gate requires
//    `tracks.length > 0` (Timeline.js:135), so with zero tracks `allFinished`
//    is computed but the completion branch is structurally unreachable.
//    seq.playing stays true forever, the camera is permanently pinned to the
//    (empty) sequence path, and the shared RAF ticker is held indefinitely
//    until the caller explicitly stop()s/destroy()s. This test PINS that
//    actual (surprising) behavior and proves stop()/destroy() are still safe
//    escape hatches -- it does not patch src (out of scope for qa).
// -----------------------------------------------------------------------------
test('7. zero-step sequence: play() never completes on its own; stop()/destroy() are safe and release the ticker', () => {
    const cam = makeCam(800, 600, 3200, 2400, 1);
    const seq = cam.createSequence(); // no steps queued
    assert.equal(seq.duration, 0, 'an empty sequence has duration 0 before play()');

    cam.playSequence(seq);
    assert.equal(seq.playing, true, 'play() starts an empty sequence like any other');
    assert.equal(seq.duration, 0, 'duration stays 0 (at-aware timeline.duration with zero tracks)');

    let completedWithin = -1;
    for (let i = 0; i < 300; i++) {
        pumpRaf();
        cam.update(1 / 60, 100, 100, 0, 0);
        if (!seq.playing) { completedWithin = i; break; }
    }
    assert.equal(completedWithin, -1, 'FINDING: a zero-step sequence never self-completes (tracks.length > 0 gate)');
    assert.equal(cam._blendRemain, 0, 'no blend can arm because the completion wrapper never runs');

    // The ticker stays live (re-requests on every pump) for as long as it plays.
    const before = rafCount();
    pumpRaf();
    assert.ok(rafCount() > before, 'the shared ticker keeps re-requesting while the empty sequence "plays" forever');

    // stop() and destroy() must not throw, and stop() must release the ticker.
    assert.doesNotThrow(() => seq.stop());
    assert.equal(seq.playing, false, 'stop() forces the zombie sequence out of the playing state');
    const c0 = rafCount();
    pumpRaf(); pumpRaf();
    assert.equal(rafCount(), c0, 'stop() must release the ticker even for a zero-step sequence');
    assert.doesNotThrow(() => seq.destroy());

    cam.destroy();
});

// -----------------------------------------------------------------------------
// 8. FINDING (discovered while probing the boundary matrix, not one of the
//    planner's seven candidates -- see qa report). Natural sequence
//    COMPLETION never releases the shared-ticker refcount that createTimeline
//    acquired: lite-timeline's internal `_stop()` (fired on natural
//    completion) only detaches the update listener (`removeFromTicker()`);
//    the refcount decrement lives EXCLUSIVELY in the timeline's own
//    `destroy()` (releaseTicker(), Timeline.js:35-42/321-327). CP-5 (this
//    session) taught CameraSequence.stop() to call timeline.destroy(), but
//    NEVER touches the case where the sequence simply finishes on its own --
//    buildTimeline()'s onComplete wrapper (CameraSequence.js:167-176) arms
//    the blend and calls the user callback, but never calls timeline.destroy().
//    Worse: CinematicCameraPro.update()'s completion cleanup (D-b, :810/:819)
//    nulls `cam._seq` the very next frame after completion, so by the time an
//    app calls `cam.destroy()`, `this._seq` is already null and the
//    `if (this._seq) this._seq.destroy()` guard in destroy() (:1088-1091)
//    cannot reach the completed sequence at all. The ONLY escape hatch is the
//    application holding on to its OWN reference to the object returned by
//    createSequence()/createCameraSequence() and calling `.destroy()` on it
//    explicitly post-completion -- which the `playSequence()`/`stopSequence()`
//    ergonomic contract does not document as required. Net effect: the
//    common "play a one-shot cinematic, let it finish, keep playing, later
//    cam.destroy()" pattern leaks the shared RAF ticker FOREVER (it never
//    stops re-requesting frames, in a real browser this runs at 60fps for the
//    rest of the page's life) with NO way to reclaim it once the seq
//    reference is dropped. This is NOT covered by t7's CP-5 churn variant
//    (which explicitly calls seq.stop(), never lets sequences complete
//    naturally) nor by any of regressions.test.js's CP-10b/A5 tests (which
//    call cam.destroy() only, after a natural completion -- they pass because
//    none of them assert on rafCount() afterward). Reported as a ledger
//    finding; NOT patched here (out of scope for qa). This test cleans up its
//    own repro via an explicit seq.destroy() so the suite stays leak-free.
// -----------------------------------------------------------------------------
test('8. FINDING: natural completion leaks the shared-ticker ref forever unless the app explicitly destroys the completed seq', () => {
    const cam = makeCam(800, 600, 3200, 2400, 9);
    cam.setMode(FollowMode.PREDICTIVE);
    const seq = cam.createSequence({ blendOutTime: 0.2 }).moveTo(500, 400, 100);
    cam.playSequence(seq);
    assert.ok(pumpToCompletion(seq), 'must complete');

    // Trigger the completion cleanup branch (nulls cam._seq) WITHOUT ever
    // calling seq.stop() or seq.destroy() -- the pattern a normal app follows.
    cam.update(1 / 60, 100, 100, 0, 0);
    assert.equal(cam._seq, null, 'cam._seq is nulled by the completion cleanup');
    assert.equal(seq.playing, false, 'the sequence itself looks fully inert');

    // Destroy the camera the normal way an app would -- this CANNOT reach the
    // orphaned seq any more (cam._seq was already null).
    cam.destroy();

    // Despite BOTH the camera and the sequence looking completely dead, the
    // shared ticker keeps re-requesting on every pump: the refcount it
    // acquired at createTimeline() time was never released.
    let stillLive = 0;
    for (let i = 0; i < 5; i++) {
        const before = rafCount();
        pumpRaf();
        if (rafCount() > before) stillLive++;
    }
    assert.equal(stillLive, 5, 'FINDING: the shared ticker never stops on its own after natural completion + cam.destroy()');

    // The only escape hatch: the app must have kept its OWN reference to the
    // sequence object and destroy it explicitly.
    seq.destroy();
    const c0 = rafCount();
    pumpRaf(); pumpRaf();
    assert.equal(rafCount(), c0, 'explicit seq.destroy() is confirmed as the only way to release the leaked ref');
});

// -----------------------------------------------------------------------------
// Adversarial: an entry the planner did not enumerate. Re-entrant destroy()
// during a shake step's onComplete (F13/CP-20 explicitly documents this as
// UNGUARDED in 1.3.0 -- routed to PRO4). Pin the actual failure mode rather
// than assert it is safe: calling cam.destroy() from inside a sequence's
// shake-step callback, mid-timeline-tick, must not corrupt state for OTHER
// live cameras and must leave THIS camera inert afterward (even though the
// in-flight tick may already have queued further synchronous work against a
// now-destroyed camera). This is a boundary-of-danger pin, not a safety claim.
// -----------------------------------------------------------------------------
test('adversarial: re-entrant cam.destroy() from a sequence shake-step callback does not corrupt a second live camera', () => {
    const camA = makeCam(800, 600, 3200, 2400, 1);
    const camB = makeCam(800, 600, 3200, 2400, 2);

    let destroyed = false;
    const seq = camA.createSequence()
        .moveTo(100, 100, 10)
        .shake('impact', { at: 0 }); // duration-0 -- onComplete fires synchronously

    // Monkey-patch: fire destroy() re-entrantly from inside the shake preset
    // resolution path by wrapping shake() is not available post-build, so we
    // instead arm destroy() via a `call` step at the same instant (documented
    // synchronous user-code execution point, F13).
    seq.call(() => { camA.destroy(); destroyed = true; }, { at: 0 });

    camA.playSequence(seq);
    pumpRaf();
    assert.equal(destroyed, true, 're-entrant destroy() must actually run synchronously from the callback');

    // camB, an unrelated live camera, must be completely unaffected.
    camB.update(1 / 60, 50, 50, 0, 0);
    camB.apply({ translate() {}, rotate() {}, scale() {} });
    assert.ok(Number.isFinite(camB.pos[0]) && Number.isFinite(camB.pos[1]), 'camB must stay finite and usable');

    // camA itself must be inert (documented ERR_CAMERA_DESTROYED contract),
    // not silently half-alive.
    assert.throws(() => camA.update(1 / 60, 0, 0, 0, 0), { code: 'ERR_CAMERA_DESTROYED' });

    camB.destroy();
});
