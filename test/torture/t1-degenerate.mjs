/**
 * T1 -- degenerate input values. THIN for PRO0.
 *
 * The fail-closed doors do not exist yet (they land in PRO2). So this tier does
 * not assert the CORRECT behaviour -- it PINS the CURRENT known-bad behaviour,
 * keyed to its CP id, so PRO2 has an executable target to flip. Each check here
 * documents a defect that is still open; when PRO2 closes it, the pinned
 * assertion flips and this tier is rewritten to demand the fix.
 *
 * DO NOT "fix" anything here. A green T1 in PRO0 means the bugs are exactly as
 * catalogued -- no more, no less.
 */

import { CinematicCameraPro } from '../../src/index.js';
import { createShakeState, addTraumaSimple, updateShake, computeShake } from '../../src/index.js';
import { check, makeRecorderSink } from './harness.mjs';

export async function run() {
    // --- CP-3 (KNOWN-BAD): one NaN dt poisons the shake engine forever ------
    // updateShake(state, NaN) drives s.time / s.trauma to NaN; `trauma <= 0` is
    // then false forever, the slot never deactivates, and computeShake emits NaN
    // every subsequent frame. PRO2's dt door closes this.
    {
        const s = createShakeState();
        addTraumaSimple(s, 0.8);
        updateShake(s, NaN);              // the single poison frame
        for (let f = 0; f < 10000; f++) { // 10k good frames afterwards
            updateShake(s, 1 / 60);
        }
        computeShake(s);
        check(s.active === true,
            () => 'T1.CP-3: expected the poisoned slot to stay active (known-bad); it deactivated -- door landed early?');
        check(!Number.isFinite(s.offsetX),
            () => 'T1.CP-3: expected NaN offsetX after a NaN dt (known-bad); it was finite -- door landed early?');
    }

    // --- CP-4 (KNOWN-BAD): a dt spike diverges the single-target lerp -------
    // pos += (target - pos) * lerpSpeed * dt; for lerpSpeed*dt > 2 the error
    // grows every frame. 40 frames of dt = 0.5 blow pos far past world bounds.
    // PRO2's dt clamp closes this.
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.setBoundsType(3); // BoundsType.NONE, so nothing clamps the divergence
        for (let f = 0; f < 40; f++) cam.update(0.5, 1240, 900);
        check(Math.abs(cam.pos[0]) > 1e6,
            () => `T1.CP-4: expected |pos[0]| to diverge past 1e6 (known-bad); got ${cam.pos[0]} -- clamp landed early?`);
    }

    // --- CP-12 (KNOWN-BAD): garbage-in is fail-open across the facade -------
    // setMode(99): the strategy lookup is undefined and the next update() throws
    // a RAW TypeError (not a named door). PRO2 makes setMode reject at the door.
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.setMode(99);
        let threwRaw = false;
        let code;
        try { cam.update(1 / 60, 100, 100); } catch (e) { threwRaw = true; code = e.code; }
        check(threwRaw && code === undefined,
            () => 'T1.CP-12a: expected a raw (un-coded) throw from setMode(99) (known-bad); got a named door -- landed early?');
    }
    {
        // setState({zoom: 0}) skips the clamp setZoom enforces -> visibleW = Inf.
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.setState({ zoom: 0 });
        check(cam.visibleW === Infinity,
            () => `T1.CP-12b: expected visibleW = Infinity from zoom 0 (known-bad); got ${cam.visibleW} -- clamp landed early?`);
    }
    {
        // setState({zoom: NaN}) -> apply() emits scale(NaN): a black screen, no error.
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.setState({ zoom: NaN });
        const rec = makeRecorderSink();
        cam.apply(rec);
        let sawNaNScale = false;
        for (let k = 0; k + 2 < rec.ops.length; k += 3) {
            if (rec.ops[k] === 's' && Number.isNaN(rec.ops[k + 1])) { sawNaNScale = true; break; }
        }
        check(sawNaNScale,
            () => 'T1.CP-12c: expected apply() to emit scale(NaN) from zoom NaN (known-bad); it did not -- door landed early?');
    }
    {
        // shakePreset(undefined) -> raw TypeError from name.toLowerCase().
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        let threwRaw = false;
        let code;
        try { cam.shakePreset(undefined); } catch (e) { threwRaw = true; code = e.code; }
        check(threwRaw && code === undefined,
            () => 'T1.CP-12d: expected a raw throw from shakePreset(undefined) (known-bad); got a named door -- landed early?');
    }
}
