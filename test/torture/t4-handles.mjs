/**
 * T4 -- lifecycle / handle abuse. THIN for PRO0.
 *
 * The one door that is REAL in this release is CP-8: after destroy(), every
 * method that reads nulled internal state is rebound to a thrower with code
 * ERR_CAMERA_DESTROYED, and a double destroy() throws the same. This tier proves
 * that door bites. The remaining lifecycle hardening (setState/save-file abuse,
 * re-play of a replaced sequence) is deferred to PRO2/PRO3 and marked todo.
 */

import { CinematicCameraPro } from '../../src/index.js';
import { PUBLIC_METHODS, callByName } from './public-surface.mjs';
import { check, noopSink } from './harness.mjs';

function expectDeadCode(fn, label) {
    let code;
    try { fn(); } catch (e) { code = e.code; }
    check(code === 'ERR_CAMERA_DESTROYED', () => `T4: ${label} must throw ERR_CAMERA_DESTROYED (got ${String(code)})`);
}

export async function run() {
    // --- CP-8: post-destroy calls fail closed on the ENTIRE public surface --
    // Loop over the full enumerated public-method set (not a hand-picked few) so
    // this gate SEES a future gap: add a method that reads nulled state, forget
    // to rebind it, and this tier flags the raw TypeError. The anti-vacuity
    // proof: reverting the destroy() rebind chain makes these throw a plain
    // TypeError (code undefined) and the check fails.
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.addTrauma(0.5);
        cam.update(1 / 60, 100, 100);
        cam.apply(noopSink);
        cam.destroy();

        for (const name of PUBLIC_METHODS) {
            if (name === 'destroy') continue; // covered by the double-destroy case
            expectDeadCode(() => callByName(cam, name, noopSink), name + '() after destroy');
        }
    }

    // --- CP-8: double destroy() throws the same named error ----------------
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.destroy();
        expectDeadCode(() => cam.destroy(), 'double destroy()');
    }

    // TODO(PRO2/PRO3): setState() save-file abuse (NaN/zoom-0 -> named clamp),
    // re-playing a replaced sequence, and setTargetCount(<0) belong here once
    // their doors exist. They are NOT asserted in PRO0 (the doors are open --
    // see T1's CP-12 pins).
}
