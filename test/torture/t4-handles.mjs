/**
 * T4 -- lifecycle / handle abuse.
 *
 * CP-8 (PRO0): after destroy(), every method that reads nulled internal state is
 * rebound to a thrower with code ERR_CAMERA_DESTROYED, and a double destroy()
 * throws the same. PRO2 adds the save-file / count / preset abuse tables that
 * PRO0 deferred: a garbage snapshot, an out-of-range target count, and a
 * defective preset registration each fail loud at their door and mutate nothing.
 */

import { CinematicCameraPro } from '../../src/index.js';
import { registerPreset, getPreset } from '../../src/index.js';
import { PUBLIC_METHODS, callByName } from './public-surface.mjs';
import { check, noopSink, rafCount, pumpRaf } from './harness.mjs';

function expectDeadCode(fn, label) {
    let code;
    try { fn(); } catch (e) { code = e.code; }
    check(code === 'ERR_CAMERA_DESTROYED', () => `T4: ${label} must throw ERR_CAMERA_DESTROYED (got ${String(code)})`);
}

function expectCode(fn, code, label) {
    let got;
    let threw = false;
    try { fn(); } catch (e) { threw = true; got = e.code; }
    check(threw && got === code, () => `T4: ${label} must throw ${code} (threw=${threw} got=${String(got)})`);
}

/** Full observable pose; a rejected door must leave it byte-identical. */
function poseOf(cam) {
    return [cam.pos[0], cam.pos[1], cam.target[0], cam.target[1],
        cam.zoom, cam.mode, cam.visibleW, cam.visibleH, cam._mt.count, cam._mt.active];
}
function samePose(a, b, label) {
    for (let i = 0; i < a.length; i++) {
        check(Object.is(a[i], b[i]), () => `T4: ${label} mutated field ${i} (${String(a[i])} -> ${String(b[i])})`);
    }
}

export async function run() {
    // --- CP-8: post-destroy calls fail closed on the ENTIRE public surface --
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

    // --- setState save-file abuse: garbage snapshot -> ERR_CAMERA_STATE, no-op
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.update(1 / 60, 900, 700); // a real pose to protect
        const BAD_SNAPSHOTS = [
            null, undefined, 42, 'save',
            { posX: 5 },                        // pairing: posY missing
            { posY: 5 },                        // pairing: posX missing
            { targetX: 5 },                     // pairing: targetY missing
            { posX: NaN, posY: 0 },             // non-finite
            { posX: 0, posY: Infinity },        // non-finite
            { targetX: -Infinity, targetY: 0 }, // non-finite
            { zoom: NaN },                      // non-finite zoom
            { zoom: Infinity },                 // non-finite zoom
            { mode: 99 },                       // out of range
            { mode: 2.5 },                      // non-integer
            { mode: -1 },                       // negative
        ];
        for (const snap of BAD_SNAPSHOTS) {
            const before = poseOf(cam);
            expectCode(() => cam.setState(snap), 'ERR_CAMERA_STATE', 'setState ' + JSON.stringify(snap));
            samePose(before, poseOf(cam), 'setState ' + JSON.stringify(snap));
        }
        // zoom 0 is a documented clamp, NOT an error.
        cam.setState({ zoom: 0 });
        check(cam.zoom === 0.25, () => `T4: setState zoom 0 must clamp to 0.25 (got ${cam.zoom})`);
        // a valid pose-only snapshot applies.
        cam.setState({ posX: 10, posY: 20, zoom: 1.5, mode: 1 });
        check(cam.pos[0] === 10 && cam.zoom === 1.5 && cam.mode === 1,
            () => 'T4: a valid snapshot must apply');
    }

    // --- setTargetCount abuse on a 2-target camera -> ERR_CAMERA_TARGETS ----
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.trackMultiple([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
        for (const bad of [-1, 2.5, NaN, 64, Infinity, undefined]) {
            const countBefore = cam._mt.count;
            expectCode(() => cam.setTargetCount(bad), 'ERR_CAMERA_TARGETS', 'setTargetCount ' + String(bad));
            check(cam._mt.count === countBefore, () => `T4: setTargetCount(${String(bad)}) must not mutate count`);
        }
        // valid counts within [0, 2] apply.
        cam.setTargetCount(1);
        check(cam._mt.count === 1, () => 'T4: setTargetCount(1) must apply');
    }

    // --- registerPreset abuse -> ERR_SHAKE_PRESET ---------------------------
    {
        for (const badName of [42, undefined, null, '', {}]) {
            expectCode(() => registerPreset(badName, { trauma: 0.5 }), 'ERR_SHAKE_PRESET',
                'registerPreset name ' + String(badName));
        }
        for (const badProfile of [null, undefined, 42, 'x']) {
            expectCode(() => registerPreset('t4_bad', badProfile), 'ERR_SHAKE_PRESET',
                'registerPreset profile ' + String(badProfile));
        }
        check(getPreset('t4_bad') === null, () => 'T4: a rejected registerPreset must not enter the registry');
        // a valid registration succeeds.
        registerPreset('t4_ok', { trauma: 0.3, freq: 20 });
        check(getPreset('t4_ok') !== null, () => 'T4: a valid registerPreset must store the preset');
    }

    // --- PRO3/CP-5: replaced-sequence handling + mid-sequence stopSequence ---
    // (F23: these were deferred to PRO3 in PRO0; now asserted.)
    {
        // Replacing an attached sequence destroys the old one (its timeline
        // releases the shared ticker). Re-playing the REPLACED (destroyed)
        // sequence is inert -- play() short-circuits on isDestroyed.
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 5);
        const seqA = cam.createSequence().moveTo(200, 200, 800);
        const seqB = cam.createSequence().moveTo(300, 300, 800);
        cam.playSequence(seqA);
        pumpRaf();
        cam.playSequence(seqB);       // seqA destroyed here (ownership transfer)
        pumpRaf();
        seqA.play();                  // must be a no-op: seqA is destroyed
        check(seqA.playing === false, () => 'T4/CP-5: re-playing a replaced (destroyed) sequence must be inert');
        check(cam.sequencePlaying === true && cam._seq === seqB,
            () => 'T4/CP-5: the live sequence must remain seqB after a replaced-seq replay attempt');

        // Mid-sequence stopSequence() must release the shared ticker: after it,
        // pumping produces no new RAF requests (nothing live re-requests).
        cam.stopSequence();
        const c0 = rafCount();
        pumpRaf(); pumpRaf(); pumpRaf(); pumpRaf();
        check(rafCount() === c0,
            () => `T4/CP-5: mid-sequence stopSequence left a live ticker (rafCount grew by ${rafCount() - c0})`);
        cam.destroy();
    }
}
