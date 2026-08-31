// =============================================================================
// qa-boundary-pro2.test.js -- QA-authored coverage closing gaps found while
// independently verifying PRO2's A1-A8 assertions (fail-closed doors,
// 1.2.0). Each test here targets a specific boundary the planner's own
// coder/reviewer suites (t1/t3/t4/t9/regressions/metadata) do not literally
// pin, per the qa VERIFY checklist. Not a duplicate of any existing test --
// where existing coverage already proved a case it is cited in the qa report
// instead of being re-asserted here.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CinematicCameraPro,
    createShakeState, addShake, updateShake, computeShake, clearShakes,
} from '../src/index.js';
// v2.0.0 detach: getPreset left the root barrel -- it lives on the ./shake subpath.
import { getPreset } from '../src/ShakePresets.js';

/** Every primitive field of a shake slot, for a true deep compare (not just trauma/time). */
function slotSnapshot(slot) {
    return {
        active: slot.active, isDefault: slot.isDefault,
        trauma: slot.trauma, decay: slot.decay,
        freq: slot.freq, time: slot.time,
        maxOffset: slot.maxOffset, maxAngle: slot.maxAngle,
        dirX: slot.dirX, dirY: slot.dirY, isDirectional: slot.isDirectional,
    };
}

/** Full observable camera state: pose + anchor/zoom-target internals + mt fields. */
function fullSnapshot(cam) {
    return {
        pos0: cam.pos[0], pos1: cam.pos[1],
        target0: cam.target[0], target1: cam.target[1],
        look0: cam.look[0], look1: cam.look[1],
        zoom: cam.zoom, mode: cam.mode,
        zoomFrom: cam._zoomFrom, zoomTo: cam._zoomTo,
        zoomDur: cam._zoomDur, zoomElapsed: cam._zoomElapsed,
        hasAnchor: cam._hasAnchor,
        zoomAnchorX: cam._zoomAnchorX, zoomAnchorY: cam._zoomAnchorY,
        zoomTarget: cam._zoomTarget,
        mtActive: cam._mt.active, mtCount: cam._mt.count,
        mtTargets: cam._mt.targets, mtPaddingX: cam._mt.paddingX,
        visibleW: cam.visibleW, visibleH: cam.visibleH,
    };
}

// -----------------------------------------------------------------------------
// A1 gap: updateShake(state, NaN) must leave EVERY field of the slot unchanged,
// not just trauma/time (t1/regressions only pin those two fields). Deep compare
// all 11 primitive fields on an active, fully-configured (directional) slot.
// -----------------------------------------------------------------------------
test('A1 gap: updateShake(state, NaN) leaves every slot field byte-identical (deep compare)', () => {
    const s = createShakeState();
    addShake(s, { trauma: 0.6, decay: 1.2, freq: 18, maxOffset: 20, maxAngle: 0.04, dirX: 1, dirY: 0 });
    const before = slotSnapshot(s.slots[0]);
    updateShake(s, NaN);
    const after = slotSnapshot(s.slots[0]);
    assert.deepEqual(after, before, 'a rejected dt must not touch a single field of the slot');

    // Every OTHER (untouched) slot must also stay fully inactive/default.
    for (let i = 1; i < s.slotCount; i++) {
        assert.equal(s.slots[i].active, false, 'slot ' + i + ' must stay inactive');
    }
});

// -----------------------------------------------------------------------------
// A1 gap: cam.update(NaN, ...) must leave pos/target/zoom/look byte-identical.
// Existing regressions test checks pos/target/zoom only; look[] is untested.
// -----------------------------------------------------------------------------
test('A1 gap: cam.update(NaN, ...) leaves pos/target/zoom/look byte-identical', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    for (let f = 0; f < 20; f++) cam.update(1 / 60, 900 + f, 700 + (f & 3));
    const before = {
        pos: [cam.pos[0], cam.pos[1]], target: [cam.target[0], cam.target[1]],
        look: [cam.look[0], cam.look[1]], zoom: cam.zoom,
    };
    cam.update(NaN, 900, 700);
    assert.ok(Object.is(cam.pos[0], before.pos[0]) && Object.is(cam.pos[1], before.pos[1]), 'pos unchanged');
    assert.ok(Object.is(cam.target[0], before.target[0]) && Object.is(cam.target[1], before.target[1]), 'target unchanged');
    assert.ok(Object.is(cam.look[0], before.look[0]) && Object.is(cam.look[1], before.look[1]), 'look unchanged');
    assert.ok(Object.is(cam.zoom, before.zoom), 'zoom unchanged');
});

// -----------------------------------------------------------------------------
// dt policy grid gap: dt === undefined (an "undefined-where-optional" case the
// T-M task list names explicitly) must reject the same as NaN -- update() and
// updateShake() are documented to accept only a number; undefined must not slip
// past `dt < 0` (undefined < 0 is false) or `dt > maxDt` (also false) and mutate
// state through a coerced NaN path.
// -----------------------------------------------------------------------------
test('dt policy gap: update(undefined, ...) and updateShake(state, undefined) reject as no-ops', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 4);
    for (let f = 0; f < 10; f++) cam.update(1 / 60, 500 + f, 400);
    const before = fullSnapshot(cam);
    cam.update(undefined, 500, 400);
    assert.deepEqual(fullSnapshot(cam), before, 'update(undefined, ...) must be a full no-op');

    const s = createShakeState();
    addShake(s, { trauma: 0.5 });
    const trauma = s.slots[0].trauma, time = s.slots[0].time;
    updateShake(s, undefined);
    assert.equal(s.slots[0].trauma, trauma, 'updateShake(state, undefined) must not advance trauma');
    assert.equal(s.slots[0].time, time, 'updateShake(state, undefined) must not advance time');
});

// -----------------------------------------------------------------------------
// A4 / D-c gap: setTargetCount(-0) must be accepted-as-0, not rejected. -0 is
// not in any existing DEGEN grid (which only carries NaN/+-Infinity); D-c's
// contract (Number.isInteger(-0) && -0 >= 0 && -0 <= max) is true, so -0 must
// pass the door. Behaviourally it must act exactly like 0 (mt.count > 0 is
// false for -0, so update() takes the same skip path).
// -----------------------------------------------------------------------------
test('A4/D-c gap: setTargetCount(-0) is accepted-as-0, behaves like 0', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    cam.trackMultiple([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    assert.doesNotThrow(() => cam.setTargetCount(-0), 'setTargetCount(-0) must not throw');
    // eslint-disable-next-line eqeqeq -- deliberate loose compare: -0 == 0 is
    // true in JS even though Object.is(-0, 0) is false; the door accepts -0
    // as-is (D-c "accepted-as-0" means door-legal + behaviourally zero, not
    // necessarily re-normalized to +0).
    assert.ok(cam._mt.count == 0, 'count must read back value-equal to 0, got ' + cam._mt.count);
    assert.equal(cam._mt.count > 0, false, 'count must behave as not-greater-than-0 (update() skip path)');
    // A frame must not crash and must not run the multi-target lerp (count<=0).
    cam.update(1 / 60, 10, 10);
    assert.ok(Number.isFinite(cam.pos[0]), 'update() after setTargetCount(-0) stays finite');
});

// -----------------------------------------------------------------------------
// A3 gap: a THROWING door must leave the FULL camera state deep-equal -- not
// just the pose fields t1/t4 individually check, but pos+target+look+zoom+mode
// simultaneously WITH an active zoom anchor (_zoomAnchorX/_zoomAnchorY/
// _hasAnchor/_zoomTarget) and an active multi-target set (_mt.count/.active/
// .targets/.paddingX) all populated at once. No existing test builds this
// combined fixture before probing setState/zoomAt/trackMultiple throws.
// -----------------------------------------------------------------------------
test('A3 gap: a throwing setState/zoomAt/trackMultiple mutates NOTHING on a fully-populated camera', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
    cam.zoomAt(500, 300, 2, 0.5);           // active anchor + in-flight zoom
    cam.update(1 / 60, 900, 700);
    cam.trackMultiple([{ x: 1, y: 2 }, { x: 3, y: 4 }], { paddingX: 99 }); // active mt

    const before = fullSnapshot(cam);

    assert.throws(() => cam.setState({ posX: NaN, posY: 0 }), (e) => e.code === 'ERR_CAMERA_STATE');
    assert.deepEqual(fullSnapshot(cam), before, 'setState throw must not mutate the fully-populated camera');

    assert.throws(() => cam.zoomAt(NaN, 0, 1), (e) => e.code === 'ERR_CAMERA_ZOOM');
    assert.deepEqual(fullSnapshot(cam), before, 'zoomAt throw must not mutate the fully-populated camera');

    assert.throws(() => cam.trackMultiple([{ x: 0, y: 0 }, null]), (e) => e.code === 'ERR_CAMERA_TARGETS');
    assert.deepEqual(fullSnapshot(cam), before, 'trackMultiple throw must not mutate the fully-populated camera');
});

// -----------------------------------------------------------------------------
// Boundary matrix "empty" case for getPreset/registerPreset: an empty string is
// neither undefined nor a garbage type -- it is a legal string that resolves to
// nothing in the registry. getPreset('') must return null (not throw, not find
// a stray '' key); registerPreset('', ...) must throw ERR_SHAKE_PRESET (already
// pinned in t4 for the setup path) so the two entry points agree on '' being
// invalid/absent.
// -----------------------------------------------------------------------------
test('boundary "empty": getPreset(\'\') returns null (registry has no \'\' key)', () => {
    assert.equal(getPreset(''), null);
});

// -----------------------------------------------------------------------------
// "duplicate dispose" for the shake engine's own reset entry point (clearShakes
// is the shake engine's teardown call, analogous to destroy()). A second,
// back-to-back clearShakes() on an already-cleared state must be a no-op, not
// throw and not leave any field in an inconsistent state.
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// VERIFY item 9: the ./shake subpath is public API in its own right -- prove
// the doors work through THAT surface too, not just the main entry. H-B (in
// subpaths.test.js) already proves main-entry updateShake/getPreset/
// registerPreset are the SAME function objects as the ./shake exports
// (Object.is identity), so this is not a second implementation to trust
// blindly -- but no existing test literally CALLS the doors through the
// subpath import. Close that gap directly here.
// -----------------------------------------------------------------------------
test('subpath gap: @zakkster/lite-camera-pro/shake doors work through the subpath import', async () => {
    const shakeSub = await import('@zakkster/lite-camera-pro/shake');

    // updateShake NaN door, called via the subpath export.
    const s = shakeSub.createShakeState();
    shakeSub.addTraumaSimple(s, 0.8);
    const trauma = s.slots[0].trauma, time = s.slots[0].time;
    shakeSub.updateShake(s, NaN);
    assert.equal(s.slots[0].trauma, trauma, 'subpath updateShake(state, NaN) must not advance trauma');
    assert.equal(s.slots[0].time, time, 'subpath updateShake(state, NaN) must not advance time');

    // getPreset(42) === null, called via the subpath export.
    assert.equal(shakeSub.getPreset(42), null, 'subpath getPreset(42) must be null');

    // registerPreset garbage -> ERR_SHAKE_PRESET, called via the subpath export.
    assert.throws(() => shakeSub.registerPreset(42, { trauma: 0.5 }),
        (e) => e.code === 'ERR_SHAKE_PRESET', 'subpath registerPreset(42, ...) must throw ERR_SHAKE_PRESET');
    assert.throws(() => shakeSub.registerPreset('x', null),
        (e) => e.code === 'ERR_SHAKE_PRESET', 'subpath registerPreset(name, null) must throw ERR_SHAKE_PRESET');
});

test('duplicate dispose: clearShakes() twice in a row is idempotent', () => {
    const s = createShakeState();
    addShake(s, { trauma: 0.8 });
    clearShakes(s);
    assert.equal(s.active, false);
    assert.doesNotThrow(() => clearShakes(s), 'second clearShakes() must not throw');
    assert.equal(s.active, false);
    assert.equal(s.offsetX, 0);
    assert.equal(s.offsetY, 0);
    assert.equal(s.angle, 0);
    for (let i = 0; i < s.slotCount; i++) {
        assert.equal(s.slots[i].active, false, 'slot ' + i + ' must stay inactive after double clear');
    }
});
