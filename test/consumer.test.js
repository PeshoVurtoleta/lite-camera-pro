// =============================================================================
// consumer.test.js -- the feel-freeze (H-A), replayed THROUGH the subpath.
//
// The Las Vegas scratch-card consumer (BRIEF.md) ships a three-tier win-shake
// ramp derived from this engine's presets. This test pins the ramp so no later
// session can silently change how the shake FEELS. It captures the CURRENT
// engine's peak amplitude (px), peak rotation (deg) and active duration for each
// tier and asserts them against COMMITTED LITERALS -- peaks within 1%, duration
// within one frame.
//
// v1.1.0: imports come from the '@zakkster/lite-camera-pro/shake' subpath
// (package self-reference), replaying the BRIEF integration with the standalone
// functions (createShakeState + addShake + updateShake + computeShake +
// getPreset) -- the consumer's real code path, no class. The subpath and the
// class share ONE runtime engine (H-B, no fork), so the committed literals below
// -- captured from the untouched 1.0.0 engine via the class -- reproduce exactly
// through the functional layer.
//
// Determinism: a fixed shake seed (42) plus lite-noise's GLOBAL default perm
// table. This test MUST NOT call seedNoise() -- the baseline was captured against
// that default table and reseeding it would move every peak.
//
// The literals below are THIS engine's numbers, not the BRIEF's (which are the
// consumer's machine). They cross-check: the per-tier degrees land on the BRIEF
// table (0.34 / 0.77 / 2.11) and the ratios between tiers match.
//
// Tier inputs use explicit, finite, non-zero trauma (impact @ 0.8 / 1.15 and a
// custom profile @ trauma 1.0), so CP-14's falsy-default fix cannot move this
// baseline -- none of these calls exercise the undefined/0/NaN paths.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createShakeState,
    addShake,
    updateShake,
    computeShake,
    getPreset,
} from '@zakkster/lite-camera-pro/shake';

const DEG = 180 / Math.PI;

/** Fire one tier, step the engine at 60Hz, return peak px / peak deg / active-frame count. */
function ramp(fire) {
    // seed 42 == the fixed camera seed the class ctor forwards to createShakeState.
    const shake = createShakeState(42);
    fire(shake);
    let peakPx = 0;
    let peakDeg = 0;
    let frames = 0;
    for (let f = 0; f < 5000; f++) {
        updateShake(shake, 1 / 60);
        computeShake(shake);
        const px = Math.sqrt(shake.offsetX * shake.offsetX + shake.offsetY * shake.offsetY);
        const dg = Math.abs(shake.angle) * DEG;
        if (px > peakPx) peakPx = px;
        if (dg > peakDeg) peakDeg = dg;
        frames++;
        if (!shake.active) break;
    }
    return { peakPx, peakDeg, frames };
}

// -- COMMITTED LITERALS (captured from the untouched 1.0.0 engine) ------------
const TIERS = [
    {
        name: 'jackpot -- impact @ 0.8',
        fire: (s) => addShake(s, getPreset('impact'), 0.8),
        peakPx: 2.909276374189556,
        peakDeg: 0.341774155011402,
        frames: 17,
    },
    {
        name: 'megaJackpot -- impact @ 1.15',
        fire: (s) => addShake(s, getPreset('impact'), 1.15),
        peakPx: 6.516419357074793,
        peakDeg: 0.7655318176824075,
        frames: 25,
    },
    {
        name: 'ultraJackpot -- custom profile @ 1.0',
        fire: (s) => addShake(s, { trauma: 1.0, freq: 10, decay: 1.6, maxOffset: 35, maxAngle: 0.08 }),
        peakPx: 23.31383423579953,
        peakDeg: 2.1095628355400295,
        frames: 38,
    },
];

function within1pct(actual, expected) {
    return Math.abs(actual - expected) <= Math.abs(expected) * 0.01;
}

for (const tier of TIERS) {
    test('feel-freeze: ' + tier.name, () => {
        const got = ramp(tier.fire);
        assert.ok(
            within1pct(got.peakPx, tier.peakPx),
            'peak px ' + got.peakPx + ' drifted >1% from ' + tier.peakPx);
        assert.ok(
            within1pct(got.peakDeg, tier.peakDeg),
            'peak deg ' + got.peakDeg + ' drifted >1% from ' + tier.peakDeg);
        assert.ok(
            Math.abs(got.frames - tier.frames) <= 1,
            'duration ' + got.frames + ' frames drifted >1 from ' + tier.frames);
    });
}
