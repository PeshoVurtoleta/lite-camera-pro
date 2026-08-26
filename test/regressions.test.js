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
