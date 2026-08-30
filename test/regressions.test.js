// =============================================================================
// regressions.test.js -- one named test per BRIEF/roadmap finding fixed in
// 1.0.1. Each banner restates the finding; each test would FAIL if its fix were
// reverted. These are the executable proof the four defects are closed.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    CinematicCameraPro, FollowMode,
    createShakeState, addShake, addTraumaSimple, updateShake, computeShake,
    createMultiTargetState,
} from '../src/index.js';
import { PUBLIC_METHODS, callByName } from './torture/public-surface.mjs';
import { pumpRaf, rafCount } from './helpers.mjs'; // RAF polyfill + pump (CP-5)

const __dirname = dirname(fileURLToPath(import.meta.url));

// Pump the store-only RAF until the sequence's timeline completes (or a guard
// trips). Each pump advances lite-ticker by 16 ms; completion flips seq.playing.
function pumpToCompletion(seq, guard = 20000) {
    while (seq.playing && guard-- > 0) pumpRaf();
    return seq.playing === false;
}

const noopSink = { translate() {}, rotate() {}, scale() {} };

// -----------------------------------------------------------------------------
// CP-1 -- the standalone functional API is reachable from the package entry.
//   Revert (drop the two exports from index.js) and both imports above become
//   `undefined`, failing this test at the type checks.
// -----------------------------------------------------------------------------
test('CP-1: standalone constructors are importable from the package entry', () => {
    assert.equal(typeof createShakeState, 'function', 'createShakeState must be on the entry');
    assert.equal(typeof createMultiTargetState, 'function', 'createMultiTargetState must be on the entry');

    // A consumer can now build a state and drive the documented API end to end.
    const s = createShakeState();
    addShake(s, { trauma: 0.5 });
    assert.equal(s.active, true);

    const mt = createMultiTargetState();
    assert.equal(mt.active, false);
    assert.equal(mt.count, 0);
});

// -----------------------------------------------------------------------------
// CP-8 -- post-destroy calls fail closed with a named error (P7 inverted).
//   Before: destroy() nulled `_shake`/`pos`/... and a later update() was a raw
//   TypeError on null. Now a destroyed camera fails closed on the ENTIRE public
//   surface -- every method is rebound to a thrower with code
//   ERR_CAMERA_DESTROYED, matching base CinematicCamera. This loops the full
//   enumerated method set so the guarantee cannot silently drift: revert the
//   destroy() rebind chain and the Pro-only methods throw a raw TypeError
//   (code undefined) here -> fails (anti-vacuity).
// -----------------------------------------------------------------------------
test('CP-8: EVERY public method throws ERR_CAMERA_DESTROYED after destroy()', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400);
    cam.destroy();

    for (const name of PUBLIC_METHODS) {
        if (name === 'destroy') continue; // covered by the double-destroy test
        assert.throws(
            () => callByName(cam, name, noopSink),
            (err) => err.code === 'ERR_CAMERA_DESTROYED',
            name + '() after destroy must throw ERR_CAMERA_DESTROYED');
    }
});

test('CP-8: double destroy() throws ERR_CAMERA_DESTROYED', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400);
    cam.destroy();
    assert.throws(() => cam.destroy(), (err) => {
        assert.equal(err.code, 'ERR_CAMERA_DESTROYED');
        return true;
    });
});

// -----------------------------------------------------------------------------
// CP-13 -- apply() floor-snaps the world scroll uniformly (P9 inverted).
//   `| 0` truncates toward zero, so a negative fractional camera position snaps
//   the wrong way and desyncs from the base camera (which floors). At pos
//   (-3.7, -0.4) the scroll translate must be (4, 1): -floor(-3.7)=4,
//   -floor(-0.4)=1. With `| 0` it would be (3, 0). Revert -> (3, 0) -> fails.
// -----------------------------------------------------------------------------
test('CP-13: apply() floor-snaps uniformly at negative fractional pos', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400);
    cam.pos[0] = -3.7;
    cam.pos[1] = -0.4;
    // No shake -> offset (0,0); zoom 1 -> the center translate pair cancels, so
    // the LAST translate call is the world scroll.
    const translates = [];
    const rec = {
        translate(x, y) { translates.push([x, y]); },
        rotate() {},
        scale() {},
    };
    cam.apply(rec);
    const scroll = translates[translates.length - 1];
    assert.deepEqual(scroll, [4, 1], 'floor snap must match base semantics, not | 0 truncation');
});

// -----------------------------------------------------------------------------
// CP-14 + H-F -- trauma default / zero / NaN policy, fail closed.
//   The old `profile.trauma || 0.5` laundered a NaN into 0.5 (H-F: the poison
//   door) and turned an explicit 0 into 0.5. Now: undefined -> 0.5 (fires);
//   0 -> inert (fires nothing); non-finite -> NO slot activated, and no later
//   frame can be poisoned. Revert the guard and the NaN/zero assertions fail.
// -----------------------------------------------------------------------------
test('CP-14: undefined trauma defaults to 0.5 and fires', () => {
    const s = createShakeState();
    addShake(s, {}); // no trauma key
    assert.equal(s.active, true);
    assert.equal(s.slots[0].active, true);
    assert.equal(s.slots[0].trauma, 0.5);
});

test('CP-14: trauma 0 is inert (fires nothing)', () => {
    const s = createShakeState();
    addShake(s, { trauma: 0 });
    assert.equal(s.active, false);
    for (let i = 0; i < s.slotCount; i++) assert.equal(s.slots[i].active, false);

    // addTraumaSimple(0) is inert too.
    addTraumaSimple(s, 0);
    assert.equal(s.active, false);
});

test('CP-14/H-F: NaN trauma activates no slot and cannot poison a 1000-frame run', () => {
    const s = createShakeState();
    addShake(s, { trauma: NaN });
    assert.equal(s.active, false, 'NaN trauma must not activate the state');
    for (let i = 0; i < s.slotCount; i++) {
        assert.equal(s.slots[i].active, false, 'no slot may be active');
    }

    // Infinity trauma and NaN intensity are equally fail-closed.
    addShake(s, { trauma: Infinity });
    addShake(s, { trauma: 0.8 }, NaN);
    assert.equal(s.active, false);

    // addTraumaSimple with a non-finite amount is a no-op.
    addTraumaSimple(s, NaN);
    assert.equal(s.active, false);

    // Drive 1000 frames: with no slot ever activated, the computed output stays
    // finite (0) forever. A laundered NaN would have propagated to offsetX here.
    for (let f = 0; f < 1000; f++) {
        updateShake(s, 1 / 60);
        computeShake(s);
        assert.ok(Number.isFinite(s.offsetX), 'offsetX poisoned at frame ' + f);
        assert.ok(Number.isFinite(s.offsetY), 'offsetY poisoned at frame ' + f);
        assert.ok(Number.isFinite(s.angle), 'angle poisoned at frame ' + f);
    }
    assert.equal(s.offsetX, 0);
    assert.equal(s.offsetY, 0);
    assert.equal(s.angle, 0);
});

// -----------------------------------------------------------------------------
// CP-3 -- one NaN dt no longer poisons the shake engine forever (P3 inverted).
//   Before: updateShake(state, NaN) drove time/trauma to NaN, the trauma <= 0
//   test never fired, the slot never deactivated, and computeShake emitted NaN
//   every later frame. Now the reject door makes that frame a no-op and the
//   slot decays normally. cam.update(NaN, ...) likewise mutates nothing. Revert
//   either door and these assertions fail.
// -----------------------------------------------------------------------------
test('CP-3: updateShake(state, NaN) is a no-op; the slot decays after good frames', () => {
    const s = createShakeState();
    addTraumaSimple(s, 0.8);
    const traumaBefore = s.slots[0].trauma;
    const timeBefore = s.slots[0].time;
    updateShake(s, NaN); // the single poison frame -- now rejected
    assert.equal(s.slots[0].trauma, traumaBefore, 'NaN dt must not advance trauma');
    assert.equal(s.slots[0].time, timeBefore, 'NaN dt must not advance time');

    for (let f = 0; f < 10000; f++) updateShake(s, 1 / 60);
    computeShake(s);
    assert.equal(s.active, false, 'the slot must have decayed to inactive');
    assert.equal(s.offsetX, 0, 'offsetX must be exactly zero');
    assert.equal(s.offsetY, 0, 'offsetY must be exactly zero');
    assert.equal(s.angle, 0, 'angle must be exactly zero');
});

test('CP-3: cam.update(NaN, ...) leaves pos/target/zoom byte-identical', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    for (let f = 0; f < 20; f++) cam.update(1 / 60, 900 + f, 700); // a real pose
    const px = cam.pos[0], py = cam.pos[1];
    const tx = cam.target[0], ty = cam.target[1];
    const z = cam.zoom;
    cam.update(NaN, 900, 700); // rejected: nothing mutates
    assert.ok(Object.is(cam.pos[0], px) && Object.is(cam.pos[1], py), 'pos must not change');
    assert.ok(Object.is(cam.target[0], tx) && Object.is(cam.target[1], ty), 'target must not change');
    assert.ok(Object.is(cam.zoom, z), 'zoom must not change');
    // 1k good frames after the poison frame keep pos finite.
    for (let f = 0; f < 1000; f++) cam.update(1 / 60, 900, 700);
    assert.ok(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]), 'pos stays finite');
});

// -----------------------------------------------------------------------------
// CP-4 -- a dt spike no longer diverges the single-target lerp (P11 inverted).
//   Before: pos += (target - pos) * lerpSpeed * dt is unstable for
//   lerpSpeed * dt > 2, so 40 frames of dt = 0.5 with BoundsType.NONE blew pos
//   past 1e6. Now update() clamps dt to maxDt (0.1) so lerpSpeed * dt <= 0.5 and
//   pos stays in the world envelope. Revert the clamp -> divergence -> fails.
// -----------------------------------------------------------------------------
test('CP-4: 40 frames of dt=0.5 stay in the world envelope under BoundsType.NONE', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    cam.setBoundsType(3); // BoundsType.NONE -- only the dt clamp bounds this
    for (let f = 0; f < 40; f++) cam.update(0.5, 1240, 900);
    assert.ok(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]), 'pos must stay finite');
    assert.ok(Math.abs(cam.pos[0]) < 4000 && Math.abs(cam.pos[1]) < 4000,
        'pos must stay in the world envelope, got ' + cam.pos[0] + ',' + cam.pos[1]);
});

// -----------------------------------------------------------------------------
// CP-12 -- garbage into the facade fails loud at the door, not at frame N+1
//   (P5 inverted). setMode/setState/setZoom/zoomAt reject with a named code and
//   mutate nothing; setState({zoom:0}) is a documented clamp; shakePreset with a
//   bad name is a no-op returning this. Revert any door and the matching branch
//   here fails (raw TypeError, wrong code, or a mutated pose).
// -----------------------------------------------------------------------------
test('CP-12: setMode(99) throws ERR_CAMERA_MODE at the setter', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    assert.throws(() => cam.setMode(99), (e) => e.code === 'ERR_CAMERA_MODE');
    // mode untouched -> a later update still works
    cam.update(1 / 60, 100, 100);
    assert.ok(Number.isFinite(cam.pos[0]));
});

test('CP-12: setState({zoom:NaN}) throws ERR_CAMERA_STATE and mutates nothing', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    cam.update(1 / 60, 900, 700);
    const px = cam.pos[0], z = cam.zoom, vw = cam.visibleW;
    assert.throws(() => cam.setState({ zoom: NaN }), (e) => e.code === 'ERR_CAMERA_STATE');
    assert.ok(Object.is(cam.pos[0], px) && Object.is(cam.zoom, z) && Object.is(cam.visibleW, vw),
        'a rejected setState must mutate nothing');
});

test('CP-12: setState({posX:5}) violates the pairing rule and mutates nothing', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    const px = cam.pos[0], py = cam.pos[1];
    assert.throws(() => cam.setState({ posX: 5 }), (e) => e.code === 'ERR_CAMERA_STATE');
    assert.ok(Object.is(cam.pos[0], px) && Object.is(cam.pos[1], py), 'pos must not change');
});

test('CP-12: setState({zoom:0}) is a documented clamp to minZoom (0.25)', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    cam.setState({ zoom: 0 });
    assert.equal(cam.zoom, 0.25);
    assert.equal(cam.visibleW, 3200); // 800 / 0.25
});

test('CP-12: shakePreset(undefined) is a no-op returning this', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    assert.equal(cam.shakePreset(undefined), cam);
    assert.equal(cam._shake.active, false);
    for (let i = 0; i < cam._shake.slotCount; i++) {
        assert.equal(cam._shake.slots[i].active, false);
    }
});

test('CP-12: setZoom(NaN) and zoomAt(NaN,0,1) throw ERR_CAMERA_ZOOM', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    assert.throws(() => cam.setZoom(NaN), (e) => e.code === 'ERR_CAMERA_ZOOM');
    assert.throws(() => cam.zoomAt(NaN, 0, 1), (e) => e.code === 'ERR_CAMERA_ZOOM');
});

// -----------------------------------------------------------------------------
// CP-19 -- multi-target over-reads are unreachable (setter doors). Before:
//   setTargetCount(64) on 2 targets, or a garbage trackMultiple entry, crashed
//   updateMultiTarget at frame N+1 reading .x on undefined. Now both reject at
//   the setter with ERR_CAMERA_TARGETS. Revert the doors -> raw TypeError at the
//   next update() -> the code check here fails.
// -----------------------------------------------------------------------------
test('CP-19: setTargetCount(64) on 2 targets throws ERR_CAMERA_TARGETS at the setter', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    cam.trackMultiple([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
    assert.throws(() => cam.setTargetCount(64), (e) => e.code === 'ERR_CAMERA_TARGETS');
    assert.equal(cam._mt.count, 2, 'count must not change');
});

test('CP-19: trackMultiple(null) and a garbage entry throw ERR_CAMERA_TARGETS', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    assert.throws(() => cam.trackMultiple(null), (e) => e.code === 'ERR_CAMERA_TARGETS');
    assert.throws(() => cam.trackMultiple([{ x: NaN, y: 0 }]), (e) => e.code === 'ERR_CAMERA_TARGETS');
});

// =============================================================================
// PRO3 (v1.3.0) -- sequence integrity: CP-5, CP-11, CP-10b, and the D-g rows.
// =============================================================================

// -----------------------------------------------------------------------------
// CP-11 -- resolveAt honors `at: 0` (and the whole position vocabulary). Before:
//   the five builders used `opts && opts.at || undefined`, so `at: 0` (falsy)
//   was dropped and the step appended sequentially. Duration pins prove the
//   timeline is built at-aware. Revert to the `|| undefined` form and the at:0
//   case reads 1500 instead of 1000 -> fails.
// -----------------------------------------------------------------------------
test('CP-11: at:0 / at:1 / at:"<" / at:"+=100" / at:undefined duration pins', () => {
    const mk = (at) => {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        const seq = cam.createSequence().moveTo(100, 100, 1000)
            .wait(500, at === undefined ? undefined : { at });
        seq.play();               // build the timeline (at-aware duration)
        const d = seq.duration;
        seq.destroy();            // release the ticker ref
        return d;
    };
    assert.equal(mk(0), 1000, 'at:0 -> wait overlaps from t=0, total = max(1000, 500) = 1000');
    assert.equal(mk(1), 1000, 'at:1 -> wait 1..501, total 1000');
    assert.equal(mk('<'), 1000, 'at:"<" -> wait at prev start (0), total 1000');
    assert.equal(mk('+=100'), 1600, 'at:"+=100" -> wait 1100..1600, total 1600');
    assert.equal(mk(undefined), 1500, 'appended -> wait 1000..1500, total 1500');
});

test('CP-11: shake(name, { at: 0 }) is honored (fires at t=0, not appended)', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    const seq = cam.createSequence()
        .moveTo(500, 500, 1000)
        .shake('impact', { at: 0 });   // 2-arg form: intensity slot carries { at }
    seq.seek(1);                        // cross only t=0..1ms
    // If at:0 honored, the duration-0 shake at t=0 fired -> addShake made it active.
    // If it were appended (t=1000), seeking to 1ms would NOT cross it.
    assert.equal(cam._shake.active, true, 'shake at:0 must fire when seeking past t=0');
    seq.destroy();
});

// -----------------------------------------------------------------------------
// CP-5 -- stop() releases the shared ticker. Before: stop() called
//   timeline.reset(), which detached the update callback but never released the
//   refcount, so the RAF loop stayed live forever. Now stop() destroys the
//   timeline. Pumping the stored RAF callback drives lite-ticker's _tick, which
//   re-requests a frame ONLY while the ticker is running -- so after stop() the
//   pump must produce zero new requests. Revert stop() to reset() and the pump
//   grows the count -> fails.
// -----------------------------------------------------------------------------
test('CP-5: stop() releases the ticker -- pumpRaf delta is 0 after stop', async () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    const seq = cam.createSequence().moveTo(400, 300, 1000).zoomTo(1.5, 800);
    cam.playSequence(seq);
    pumpRaf(); pumpRaf();            // advance a few frames while live
    seq.stop();                      // must destroy the timeline + release ticker
    await new Promise((r) => setTimeout(r, 10));
    const c0 = rafCount();
    pumpRaf(); pumpRaf(); pumpRaf(); pumpRaf();
    assert.equal(rafCount(), c0, 'a released ticker must not re-request on pump');
    cam.destroy();
});

test('CP-5/F2: a stopped seq does not pin the loop after a later clean seq destroys', async () => {
    const camA = new CinematicCameraPro(800, 600, 3200, 2400, 2);
    const seqA = camA.createSequence().moveTo(200, 200, 800);
    camA.playSequence(seqA);
    pumpRaf();
    seqA.stop();                     // pre-fix: stopped-not-destroyed pins the loop

    const camB = new CinematicCameraPro(800, 600, 3200, 2400, 3);
    const seqB = camB.createSequence().moveTo(300, 300, 800);
    camB.playSequence(seqB);
    pumpRaf();
    seqB.destroy();                  // a later CLEAN sequence destroys

    await new Promise((r) => setTimeout(r, 10));
    const c0 = rafCount();
    pumpRaf(); pumpRaf(); pumpRaf(); pumpRaf();
    assert.equal(rafCount(), c0, 'no ticker may survive once every seq is stopped/destroyed (F2)');
    camA.destroy();
    camB.destroy();
});

// -----------------------------------------------------------------------------
// D-d -- resume() is a no-op unless the sequence is paused. Before: resume() was
//   `if (timeline) timeline.play()`, so resuming after stop or completion
//   REPLAYED the whole cinematic -- re-firing shakes and callbacks on the live
//   camera. Now it is `if (timeline && isPlaying)`; pause() keeps isPlaying,
//   stop()/completion clear it.
// -----------------------------------------------------------------------------
test('D-d: resume() after stop() is a no-op (does not replay)', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    const seq = cam.createSequence().shake('impact', { at: 0 }).moveTo(400, 400, 600);
    cam.playSequence(seq);
    seq.stop();                       // timeline destroyed
    cam.clearShakes();
    const c0 = rafCount();
    seq.resume();                     // must do nothing
    assert.equal(cam._shake.active, false, 'resume-after-stop must not refire the shake');
    assert.equal(rafCount(), c0, 'resume-after-stop must not request a frame');
    assert.equal(seq.playing, false);
    cam.destroy();
});

test('D-d/A7: resume() after completion refires no shake and adds 0 RAF requests', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    // shake at t=0 so a zombie replay (auto-seek(0)) would refire it immediately.
    const seq = cam.createSequence({ blendOutTime: 0 })
        .shake('impact', { at: 0 })
        .moveTo(500, 500, 300);
    cam.playSequence(seq);
    assert.ok(pumpToCompletion(seq), 'sequence must complete under the pump');
    cam.clearShakes();                // clear the legitimate shake-step impulse
    for (let i = 0; i < cam._shake.slotCount; i++) {
        assert.equal(cam._shake.slots[i].active, false);
    }
    const c0 = rafCount();
    seq.resume();                     // completed -> must be a no-op
    assert.equal(cam._shake.active, false, 'every shake slot must stay inactive');
    for (let i = 0; i < cam._shake.slotCount; i++) {
        assert.equal(cam._shake.slots[i].active, false, 'resume must not refire a shake slot');
    }
    assert.equal(rafCount(), c0, 'resume-after-completion adds 0 RAF requests');
    cam.destroy();
});

// -----------------------------------------------------------------------------
// A7 / D-g -- replay + progress + duration after stop.
// -----------------------------------------------------------------------------
test('A7/H-E: play -> stop -> play replays; progress after stop is 0', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    const seq = cam.createSequence().moveTo(300, 300, 500).zoomTo(1.4, 400);
    cam.playSequence(seq);
    pumpRaf();
    assert.equal(seq.playing, true);
    seq.stop();
    assert.equal(seq.progress, 0, 'progress after stop must be 0');
    assert.equal(seq.playing, false);
    seq.play();                       // rebuilds from a fresh snapshot
    assert.equal(seq.playing, true, 'play() after stop must replay');
    seq.destroy();
});

test('A7/CP-11: duration after stop falls to the step-sum (1500 for the +=100 build)', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    const seq = cam.createSequence().moveTo(100, 100, 1000).wait(500, { at: '+=100' });
    seq.play();
    assert.equal(seq.duration, 1600, 'live timeline duration is at-aware (1600)');
    seq.stop();
    assert.equal(seq.duration, 1500, 'after stop (timeline destroyed) duration is the naive step-sum');
    seq.destroy();
});

// -----------------------------------------------------------------------------
// D-g -- seek() after stop() rebuilds from a FRESH snapshot and fires the
//   duration-0 tracks it crosses.
// -----------------------------------------------------------------------------
test('D-g: seek() after stop() rebuilds and fires a crossed 0-duration callback', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    let called = 0;
    const seq = cam.createSequence()
        .moveTo(200, 200, 1000)
        .call(() => { called++; }, { at: 0 });
    cam.playSequence(seq);
    seq.stop();                       // timeline destroyed
    assert.equal(called, 0, 'nothing fired yet from a plain play/stop at t=0..0');
    seq.seek(10);                     // rebuilds (timeline was null) then seeks past t=0
    assert.equal(called, 1, 'seek-after-stop must rebuild and fire the at:0 callback');
    seq.destroy();
});

// -----------------------------------------------------------------------------
// CP-10b / A5 -- the completion blend is real.
//   (1) blendOutTime:0 is behavior-identical to a plain follow from the final
//       pose (control-camera equivalence, OWNER NOTE 1).
//   (2) default 0.3 reaches a static follow target in 18 +/- 1 frames at
//       dt=1/60 with a monotone-non-increasing gap and a per-frame step that
//       never exceeds the first step.
//   (3) stop() never blends.
// -----------------------------------------------------------------------------
test('CP-10b/A5: blendOutTime:0 completion == plain follow from the final pose', () => {
    const DT = 1 / 60;
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 9);
    cam.setMode(FollowMode.PREDICTIVE);
    const seq = cam.createSequence({ blendOutTime: 0 })
        .moveTo(700, 500, 300)
        .zoomTo(1.3, 200);
    cam.playSequence(seq);
    assert.ok(pumpToCompletion(seq), 'must complete');
    // First post-completion frame: cleanup arms _blendRemain from state.blend
    // (which is 0 here), nulls _seq, then runs plain follow.
    cam.update(DT, 900, 700, 30, 20);
    assert.equal(cam._blendRemain, 0, 'blendOutTime:0 must NOT arm a blend');

    // Control matched to the camera's exact pose, then stepped identically.
    const control = new CinematicCameraPro(800, 600, 3200, 2400, 9);
    control.setMode(FollowMode.PREDICTIVE);
    control.setState({
        posX: cam.pos[0], posY: cam.pos[1],
        targetX: cam.target[0], targetY: cam.target[1],
        zoom: cam.zoom, mode: cam.mode,
    });
    control.look[0] = cam.look[0];
    control.look[1] = cam.look[1];
    for (let f = 0; f < 200; f++) {
        const px = 900 + f * 2, py = 700 + ((f * 5) % 90), pvx = 30, pvy = (f & 32) ? -20 : 20;
        cam.update(DT, px, py, pvx, pvy);
        control.update(DT, px, py, pvx, pvy);
        assert.ok(Object.is(cam.pos[0], control.pos[0]) && Object.is(cam.pos[1], control.pos[1]),
            `A5 equivalence: pos diverged at frame ${f}`);
    }
    cam.destroy();
    control.destroy();
});

test('CP-10b/A5: default 0.3 reaches a static target in 18 +/- 1 frames, monotone, bounded step', () => {
    const DT = 1 / 60;
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 9);
    cam.setMode(FollowMode.PREDICTIVE); // zero-velocity -> static, deadzone-free target
    const seq = cam.createSequence({ blendOutTime: 0.3 }).moveTo(1500, 1200, 200);
    cam.playSequence(seq);
    assert.ok(pumpToCompletion(seq), 'must complete');

    // Static player, zero velocity -> PREDICTIVE target is constant.
    const PX = 400, PY = 300;
    let frames = 0;
    let firstStep = -1;
    let prevGap = Infinity;
    let landed = -1;
    for (let f = 0; f < 60; f++) {
        const px = cam.pos[0], py = cam.pos[1];
        cam.update(DT, PX, PY, 0, 0);
        const step = Math.hypot(cam.pos[0] - px, cam.pos[1] - py);
        const gap = Math.hypot(cam.target[0] - cam.pos[0], cam.target[1] - cam.pos[1]);
        if (cam._blendRemain > 0 || landed === -1) frames++;
        if (firstStep < 0 && step > 0) firstStep = step;
        // monotone non-increasing gap (allow fp slack)
        assert.ok(gap <= prevGap + 1e-9, `gap must not grow at frame ${f} (${gap} > ${prevGap})`);
        prevGap = gap;
        if (firstStep > 0) {
            assert.ok(step <= firstStep * (1 + 1e-6), `step must not exceed the first step at frame ${f} (${step} > ${firstStep})`);
        }
        if (cam._blendRemain === 0 && landed === -1) { landed = f + 1; }
    }
    assert.ok(landed >= 17 && landed <= 19, `blend must land in 18 +/- 1 frames (landed at ${landed})`);
    assert.equal(prevGap, 0, 'at the landing frame pos must equal target exactly');
    cam.destroy();
});

test('CP-10b/A5: stop() (direct seq.stop) never blends', () => {
    const DT = 1 / 60;
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 9);
    cam.setMode(FollowMode.PREDICTIVE);
    const seq = cam.createSequence({ blendOutTime: 0.3 }).moveTo(1500, 1200, 400);
    cam.playSequence(seq);
    pumpRaf(); pumpRaf();
    seq.stop();                       // direct stop -> state.blend zeroed
    cam.update(DT, 400, 300, 0, 0);   // cleanup would arm _blendRemain from state.blend
    assert.equal(cam._blendRemain, 0, 'a stopped sequence must never arm a blend');
    // stopSequence() path too.
    const seq2 = cam.createSequence({ blendOutTime: 0.3 }).moveTo(1500, 1200, 400);
    cam.playSequence(seq2);
    pumpRaf();
    cam.stopSequence();
    cam.update(DT, 400, 300, 0, 0);
    assert.equal(cam._blendRemain, 0, 'stopSequence() must never arm a blend');
    cam.destroy();
});

// -----------------------------------------------------------------------------
// A6 -- H-C byte-equality: a camera that never touches a sequence produces the
//   exact 1.2.0 stream. Replays the fixture's captured schedule and compares
//   every field bit-for-bit (Object.is on the decoded Float64). The fixture was
//   captured on the pristine 1.2.0 tree BEFORE this diff; it is never regenerated.
// -----------------------------------------------------------------------------
test('A6/H-C: 600-frame no-sequence stream is byte-identical to the 1.2.0 fixture', () => {
    const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'pro3-follow-baseline.json'), 'utf8'));
    assert.equal(fx.encoding, 'f64le-base64');
    assert.equal(fx.frames, 600);
    const buf = Buffer.from(fx.data, 'base64');
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    const FRAMES = 600, FIELDS = 9, DT = 1 / 60;
    const cam = new CinematicCameraPro(800, 600, 1600, 1200, 1234);
    let tx = 0, ty = 0, rot = 0, sx = 0;
    const sink = {
        translate(x, y) { tx = x; ty = y; },
        rotate(a) { rot = a; },
        scale(x, _y) { sx = x; },
    };

    let off = 0;
    for (let f = 0; f < FRAMES; f++) {
        if (f === 100) cam.setZoom(1.6, 0.5);
        if (f === 200) cam.shake({ trauma: 0.6, freq: 15, decay: 1.2, maxOffset: 12, maxAngle: 0.04 }, 1);
        if (f === 300) cam.setMode(2);
        if (f === 400) cam.setMode(0);
        if (f === 450) cam.zoomAt(500, 400, 2.0, 0.5);

        const px = 100 + f * 1.5;
        const py = 80 + ((f * 7) % 120);
        const pvx = 90;
        const pvy = (f & 64) ? -40 : 40;

        cam.update(DT, px, py, pvx, pvy);
        cam.apply(sink);

        const row = [cam.pos[0], cam.pos[1], cam.look[0], cam.look[1], cam.zoom, tx, ty, rot, sx];
        for (let k = 0; k < FIELDS; k++) {
            const want = view.getFloat64(off, true);
            assert.ok(Object.is(row[k], want),
                `A6 mismatch frame ${f} field ${fx.fields[k]}: got ${row[k]} want ${want}`);
            off += 8;
        }
    }
    cam.destroy();
});
