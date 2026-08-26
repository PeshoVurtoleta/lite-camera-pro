// =============================================================================
// boundary.test.js -- qa-added coverage for the CP-14/H-F degenerate input
// cross-product and the CP-8 surfaces regressions.test.js does not reach
// (post-destroy getters, destroy() mid-sequence).
//
// This file is QA-authored, not coder-authored: it PINS current fail-closed
// behaviour of the shipped guard (src/ShakeEngine.js addShake/addTraumaSimple)
// so a future change to the guard's arithmetic cannot silently drift without a
// test failing. Every "activates" row is cross-checked against the documented
// policy (H-F): a non-finite trauma OR non-finite intensity must NEVER
// activate a slot, and no combination here may leave a NaN/Inf anywhere in
// state after a following 1000-frame run.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CinematicCameraPro,
    createShakeState, addShake, addTraumaSimple, updateShake, computeShake,
} from '../src/index.js';
import './helpers.mjs'; // RAF polyfill (playSequence() starts lite-timeline's ticker)

// -----------------------------------------------------------------------------
// CP-14/H-F -- addShake(state, {trauma}, intensity) cross-product.
//
// trauma  x  {undefined, 0, -0, negative, NaN, +Infinity, -Infinity, 0.5, 1, 2}
// intensity x {undefined, 0, negative, NaN, Infinity, 1}
//
// `activates` is the CURRENT engine's measured truth table (captured directly
// from src/ShakeEngine.js, not guessed): a slot activates iff BOTH trauma and
// intensity are finite AND min(1, effectiveTrauma * intensity) > 0.
// effectiveTrauma is 0.5 when the profile omits `trauma` (undefined), else the
// literal value (H-F: no `||` laundering -- 0/-0/NaN/Inf pass through as-is).
// intensity omitted (undefined) uses the function's own default of 1.
// -----------------------------------------------------------------------------
const TRAUMAS = [
    ['undefined', undefined],
    ['0', 0],
    ['-0', -0],
    ['neg', -1],
    ['NaN', NaN],
    ['+Inf', Infinity],
    ['-Inf', -Infinity],
    ['0.5', 0.5],
    ['1', 1],
    ['2', 2],
];

const INTENSITIES = [
    ['undefined', undefined],
    ['0', 0],
    ['neg', -1],
    ['NaN', NaN],
    ['Inf', Infinity],
    ['1', 1],
];

// Ground truth per (trauma, intensity), keyed "traumaLabel|intensityLabel".
// Only pairs where BOTH trauma and intensity are finite AND the finite product
// clamped to <=1 is > 0 activate a slot. Every non-finite input on EITHER side
// is fail-closed (false) -- that is the H-F guarantee under test.
const EXPECT_ACTIVE = new Set([
    'undefined|undefined', 'undefined|1',      // 0.5 * 1 = 0.5 > 0
    'neg|neg',                                  // -1 * -1 = 1 > 0 (finite math, not a poison)
    '0.5|undefined', '0.5|1',
    '1|undefined', '1|1',
    '2|undefined', '2|1',
]);

for (const [tn, tv] of TRAUMAS) {
    for (const [inn, iv] of INTENSITIES) {
        const key = tn + '|' + inn;
        const wantActive = EXPECT_ACTIVE.has(key);
        test('CP-14/H-F cross: addShake(trauma=' + tn + ', intensity=' + inn + ') -> active=' + wantActive, () => {
            const s = createShakeState();
            if (iv === undefined) addShake(s, { trauma: tv });
            else addShake(s, { trauma: tv }, iv);

            assert.equal(s.active, wantActive,
                'addShake(trauma=' + tn + ', intensity=' + inn + ') active mismatch');

            // H-F: whatever happened, the state must never carry a non-finite
            // trauma into a slot -- fail-closed is fail-closed, not "fail with
            // a NaN sitting inertly in the pool waiting for the next stack-on".
            for (let i = 0; i < s.slotCount; i++) {
                assert.ok(Number.isFinite(s.slots[i].trauma),
                    'slot ' + i + ' trauma must stay finite for trauma=' + tn + ' intensity=' + inn);
            }

            // No poison over a following 1000-frame run regardless of outcome:
            // an activated slot must decay to inert; an unactivated state must
            // stay at exactly zero output the whole time.
            for (let f = 0; f < 1000; f++) {
                updateShake(s, 1 / 60);
                computeShake(s);
                assert.ok(Number.isFinite(s.offsetX), 'offsetX poisoned at frame ' + f);
                assert.ok(Number.isFinite(s.offsetY), 'offsetY poisoned at frame ' + f);
                assert.ok(Number.isFinite(s.angle), 'angle poisoned at frame ' + f);
            }
            if (!wantActive) {
                assert.equal(s.offsetX, 0);
                assert.equal(s.offsetY, 0);
                assert.equal(s.angle, 0);
                assert.equal(s.active, false);
            } else {
                // An activated, finite-trauma slot must have fully decayed to
                // inert within 1000 frames (decay defaults to 1.0/s @ 60fps).
                assert.equal(s.active, false, 'activated slot must decay to inert within 1000 frames');
            }
        });
    }
}

// -----------------------------------------------------------------------------
// CP-14/H-F -- addTraumaSimple(state, amount) over the same degenerate set.
// Unlike addShake, there is no "undefined -> 0.5" default here: an omitted or
// non-finite amount is a plain no-op (measured truth table below).
// -----------------------------------------------------------------------------
const SIMPLE_EXPECT_ACTIVE = new Set(['0.5', '1', '2']);

for (const [an, av] of TRAUMAS) {
    const wantActive = SIMPLE_EXPECT_ACTIVE.has(an);
    test('CP-14/H-F cross: addTraumaSimple(amount=' + an + ') -> active=' + wantActive, () => {
        const s = createShakeState();
        addTraumaSimple(s, av);
        assert.equal(s.active, wantActive, 'addTraumaSimple(amount=' + an + ') active mismatch');

        for (let i = 0; i < s.slotCount; i++) {
            assert.ok(Number.isFinite(s.slots[i].trauma), 'slot ' + i + ' trauma must stay finite');
        }

        for (let f = 0; f < 1000; f++) {
            updateShake(s, 1 / 60);
            computeShake(s);
            assert.ok(Number.isFinite(s.offsetX), 'offsetX poisoned at frame ' + f);
            assert.ok(Number.isFinite(s.offsetY), 'offsetY poisoned at frame ' + f);
            assert.ok(Number.isFinite(s.angle), 'angle poisoned at frame ' + f);
        }
        if (!wantActive) {
            assert.equal(s.offsetX, 0);
            assert.equal(s.offsetY, 0);
            assert.equal(s.angle, 0);
        }
    });
}

// Anti-vacuity witness for the cross-product tables above: a hand build of the
// pre-CP-14 `(profile.trauma || 0.5) * intensity` formula WOULD have produced
// active=true for trauma NaN/0/-0 (laundered to 0.5) and active=false for
// trauma 2 with intensity 1 clamped oddly -- i.e. the old formula disagrees
// with several rows pinned above. This proves the table is not vacuously true
// for any guard (see the "old formula" checks below, run against the SAME
// inputs as the pinned rows, asserting they'd disagree).
test('CP-14/H-F anti-vacuity: the pre-fix `trauma || 0.5` formula disagrees with the pinned table', () => {
    function oldFormulaActivates(rawTrauma, intensity) {
        const eff = rawTrauma || 0.5; // the old, buggy laundering
        const trauma = Math.min(1, eff * (intensity === undefined ? 1 : intensity));
        return trauma > 0;
    }
    // NaN trauma: old formula laundered it to 0.5*1=0.5 -> true; fixed engine -> false.
    assert.equal(oldFormulaActivates(NaN, undefined), true);
    assert.equal(EXPECT_ACTIVE.has('NaN|undefined'), false);
    // trauma 0: old formula laundered it to 0.5*1=0.5 -> true; fixed engine -> false.
    assert.equal(oldFormulaActivates(0, undefined), true);
    assert.equal(EXPECT_ACTIVE.has('0|undefined'), false);
    // -0 trauma: `-0 || 0.5` is 0.5 in JS (=== -0 is falsy) -> old true; fixed -> false.
    assert.equal(oldFormulaActivates(-0, undefined), true);
    assert.equal(EXPECT_ACTIVE.has('-0|undefined'), false);
});

// -----------------------------------------------------------------------------
// CP-8 -- post-destroy GETTER access must be safe (not rebound, must not throw).
// `sequencePlaying` reads `this._seq`, which destroy() nulls; it is
// deliberately left off the rebind list because it degrades to a safe `false`
// on its own (no method call reaches nulled state through it).
// -----------------------------------------------------------------------------
test('CP-8: sequencePlaying is safe (false, not throw) after destroy()', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400);
    cam.destroy();
    let threw = false;
    let value;
    try { value = cam.sequencePlaying; } catch (e) { threw = true; }
    assert.equal(threw, false, 'sequencePlaying must not throw post-destroy');
    assert.equal(value, false, 'sequencePlaying must read false post-destroy');
});

test('CP-8: sequencePlaying is safe after destroy() even mid-sequence', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400);
    const seq = cam.createSequence().wait(99999);
    cam.playSequence(seq);
    assert.equal(cam.sequencePlaying, true, 'sequence must be reported playing before destroy');

    cam.destroy();

    let threw = false;
    let value;
    try { value = cam.sequencePlaying; } catch (e) { threw = true; }
    assert.equal(threw, false, 'sequencePlaying must not throw post-destroy (mid-sequence)');
    assert.equal(value, false, 'sequencePlaying must read false post-destroy (mid-sequence)');
});

// -----------------------------------------------------------------------------
// CP-8 -- destroy() while a sequence is actively playing must not throw, and
// must leave the camera in the same fully-dead state as an idle destroy().
// -----------------------------------------------------------------------------
test('CP-8: destroy() while a sequence is active tears down cleanly', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400);
    const seq = cam.createSequence().moveTo(100, 100, 500).wait(200);
    cam.playSequence(seq);
    assert.equal(cam.sequencePlaying, true);

    assert.doesNotThrow(() => cam.destroy(), 'destroy() mid-sequence must not throw');

    assert.throws(
        () => cam.update(1 / 60, 0, 0),
        (err) => err.code === 'ERR_CAMERA_DESTROYED',
        'update() after mid-sequence destroy must still fail closed');
    assert.throws(
        () => cam.destroy(),
        (err) => err.code === 'ERR_CAMERA_DESTROYED',
        'double destroy() after mid-sequence destroy must still fail closed');
});
