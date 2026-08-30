// =============================================================================
// regressions.test.js -- one named test per BRIEF/roadmap finding fixed in
// 1.0.1. Each banner restates the finding; each test would FAIL if its fix were
// reverted. These are the executable proof the four defects are closed.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CinematicCameraPro,
    createShakeState, addShake, addTraumaSimple, updateShake, computeShake,
    createMultiTargetState,
} from '../src/index.js';
import { PUBLIC_METHODS, callByName } from './torture/public-surface.mjs';
import './helpers.mjs'; // RAF polyfill (destroy() path is used below)

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
