/**
 * T0 -- metamorphic laws. Properties that must hold for ANY valid input:
 *   - apply() is idempotent within a frame: calling it twice without an
 *     intervening update() emits an identical transform stream (it is a pure
 *     read of the shake state sampled in update()).
 *   - determinism: two cameras with the same seed, fed the same (dt, px, py)
 *     stream, produce byte-identical pos / shake output.
 *   - clearShakes() zeroes the offsets exactly.
 *   - slot invariant: after updateShake, the set of active slots is exactly the
 *     set of slots with trauma > 0.
 */

import { CinematicCameraPro } from '../../src/index.js';
import { createShakeState, addShake, updateShake } from '../../src/index.js';
import { makePrng, SEED, check, makeRecorderSink } from './harness.mjs';

const FRAMES = 600;

export async function run() {
    // --- Law 1: apply() idempotent within a frame ---------------------------
    {
        const cam = new CinematicCameraPro(800, 600, 4000, 4000, 7);
        cam.shakePreset('explosion');
        const a = makeRecorderSink();
        const b = makeRecorderSink();
        for (let f = 0; f < 120; f++) {
            cam.update(1 / 60, 500 + f, 400 + (f & 31));
            a.reset(); b.reset();
            cam.apply(a);
            cam.apply(b); // no update() between -> must be identical
            check(a.ops.length === b.ops.length,
                () => `T0.idempotent: op count diverged at frame ${f}`);
            for (let k = 0; k < a.ops.length; k++) {
                check(Object.is(a.ops[k], b.ops[k]),
                    () => `T0.idempotent: op ${k} diverged at frame ${f} (${a.ops[k]} vs ${b.ops[k]})`);
            }
        }
    }

    // --- Law 2: determinism (same seed + same stream -> same output) --------
    {
        const prng = makePrng(SEED);
        // Pre-roll a fixed input stream so both cameras see the identical drive.
        const N = FRAMES;
        const px = new Float64Array(N);
        const py = new Float64Array(N);
        for (let i = 0; i < N; i++) {
            px[i] = (prng() % 3200);
            py[i] = (prng() % 2400);
        }
        const c1 = new CinematicCameraPro(800, 600, 4000, 4000, 99);
        const c2 = new CinematicCameraPro(800, 600, 4000, 4000, 99);
        c1.shakePreset('impact', 0.9);
        c2.shakePreset('impact', 0.9);
        const s1 = makeRecorderSink();
        const s2 = makeRecorderSink();
        for (let i = 0; i < N; i++) {
            c1.update(1 / 60, px[i], py[i]);
            c2.update(1 / 60, px[i], py[i]);
            s1.reset(); s2.reset();
            c1.apply(s1); c2.apply(s2);
            check(Object.is(c1.pos[0], c2.pos[0]) && Object.is(c1.pos[1], c2.pos[1]),
                () => `T0.determinism: pos diverged at frame ${i} (seed=${SEED})`);
            check(s1.ops.length === s2.ops.length,
                () => `T0.determinism: transform op count diverged at frame ${i} (seed=${SEED})`);
            for (let k = 0; k < s1.ops.length; k++) {
                check(Object.is(s1.ops[k], s2.ops[k]),
                    () => `T0.determinism: transform op ${k} diverged at frame ${i} (seed=${SEED})`);
            }
        }
    }

    // --- Law 3: clearShakes() zeroes offsets exactly ------------------------
    {
        const cam = new CinematicCameraPro(800, 600, 4000, 4000, 3);
        cam.shakePreset('heavy_impact');
        for (let f = 0; f < 20; f++) cam.update(1 / 60, 100, 100);
        cam.clearShakes();
        check(cam._shake.offsetX === 0 && cam._shake.offsetY === 0 && cam._shake.angle === 0,
            () => 'T0.clear: offsets not exactly zero after clearShakes()');
        check(cam._shake.active === false, () => 'T0.clear: state still active after clearShakes()');
    }

    // --- Law 4: slot invariant (active <=> trauma > 0 after update) ---------
    {
        const s = createShakeState(5);
        addShake(s, { trauma: 0.9, decay: 3.0 });
        addShake(s, { trauma: 0.5, decay: 1.0, freq: 20 });
        addShake(s, { trauma: 0.2, decay: 8.0, freq: 25 });
        for (let f = 0; f < 400; f++) {
            updateShake(s, 1 / 60);
            for (let i = 0; i < s.slotCount; i++) {
                const slot = s.slots[i];
                // A slot is active iff it still holds positive trauma.
                check(slot.active === (slot.trauma > 0),
                    () => `T0.slot-invariant: slot ${i} active=${slot.active} trauma=${slot.trauma} at frame ${f}`);
            }
        }
    }
}
