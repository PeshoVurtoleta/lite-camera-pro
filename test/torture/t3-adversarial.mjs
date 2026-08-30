/**
 * T3 -- adversarial storms under the PRO2 doors.
 *
 * (a) Seeded dt-spike storm: 10k frames of dt uniform in [0, 2] (every frame a
 *     legal but often over-large dt) against a fixed in-world target, in BOTH
 *     the default-bounds and BoundsType.NONE variants. The dt clamp is the only
 *     thing bounding NONE, so this is the CP-4 inversion at scale: pos and zoom
 *     stay finite and inside the world envelope on every frame.
 * (b) 9-into-8 slot-steal storm: nine valid addShake impulses into an 8-slot
 *     pool. The pool never grows, the steal picks the weakest, every active slot
 *     stays finite through compute, and clearShakes() empties it.
 */

import { CinematicCameraPro } from '../../src/index.js';
import {
    createShakeState, addShake, updateShake, computeShake, clearShakes,
} from '../../src/index.js';
import { makePrng, SEED, check } from './harness.mjs';

const STORM_FRAMES = 10000;
const BoundsType_NONE = 3;

export async function run() {
    // --- (a) seeded dt-spike storm, both bounds variants --------------------
    for (const boundsNone of [false, true]) {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 11);
        if (boundsNone) cam.setBoundsType(BoundsType_NONE);
        cam.shakePreset('explosion');
        const prng = makePrng(SEED);

        const PX = 1600, PY = 1200; // fixed in-world target
        for (let f = 0; f < STORM_FRAMES; f++) {
            const dt = (prng() / 0xffffffff) * 2; // [0, 2] -- legal, mostly > maxDt
            cam.update(dt, PX, PY, 0, 0);
            if (!cam._shake.active) cam.shakePreset('rumble');
            check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]),
                () => `T3.storm(${boundsNone ? 'NONE' : 'HARD'}): pos went non-finite at frame ${f} (${cam.pos[0]},${cam.pos[1]})`);
            check(Number.isFinite(cam.zoom) && cam.zoom > 0,
                () => `T3.storm(${boundsNone ? 'NONE' : 'HARD'}): zoom went non-finite at frame ${f} (${cam.zoom})`);
            // Envelope: with a fixed in-world target and a bounded dt, pos can
            // never leave a generous world-sized box in either bounds mode.
            check(Math.abs(cam.pos[0]) <= 3200 + 1 && Math.abs(cam.pos[1]) <= 2400 + 1,
                () => `T3.storm(${boundsNone ? 'NONE' : 'HARD'}): pos left the world envelope at frame ${f} (${cam.pos[0]},${cam.pos[1]})`);
        }
    }

    // --- (b) 9-into-8 slot-steal storm --------------------------------------
    {
        const s = createShakeState(3);
        // Nine valid impulses with varied trauma/params. The 9th must steal the
        // weakest slot -- the pool is fixed at 8.
        for (let i = 0; i < 9; i++) {
            addShake(s, {
                trauma: 0.2 + (i % 5) * 0.15,
                freq: 10 + i,
                decay: 0.5 + (i % 3) * 0.4,
                maxOffset: 8 + i,
                maxAngle: 0.02 + (i % 4) * 0.01,
            });
        }
        check(s.slots.length === 8, () => `T3.steal: pool grew past 8 (${s.slots.length})`);

        let active = 0;
        for (let i = 0; i < s.slotCount; i++) if (s.slots[i].active) active++;
        check(active <= 8 && active === 8,
            () => `T3.steal: expected all 8 slots active after 9 impulses, got ${active}`);

        // Drive frames; every active slot's output must stay finite.
        for (let f = 0; f < 300; f++) {
            updateShake(s, 1 / 60);
            computeShake(s);
            check(Number.isFinite(s.offsetX) && Number.isFinite(s.offsetY) && Number.isFinite(s.angle),
                () => `T3.steal: shake output went non-finite at frame ${f}`);
            for (let i = 0; i < s.slotCount; i++) {
                const sl = s.slots[i];
                check(Number.isFinite(sl.trauma) && Number.isFinite(sl.time),
                    () => `T3.steal: slot ${i} went non-finite at frame ${f}`);
            }
        }

        clearShakes(s);
        check(s.active === false, () => 'T3.steal: clearShakes must deactivate the state');
        for (let i = 0; i < s.slotCount; i++) {
            check(s.slots[i].active === false, () => `T3.steal: slot ${i} still active after clearShakes`);
        }
        check(s.offsetX === 0 && s.offsetY === 0 && s.angle === 0,
            () => 'T3.steal: clearShakes must zero the output');
    }
}
