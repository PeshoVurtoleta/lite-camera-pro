/**
 * T9 -- controls. Every gate must be provably able to fail.
 *
 * A gate that cannot fail is decorative. This tier runs a deliberately-broken
 * variant of the T6 alloc lane IN PROCESS and asserts the gate flags it, so a
 * plain `node --expose-gc test/torture.mjs` already proves the alloc gate bites.
 *
 * There is also the whole-suite control: CAMPRO_TORTURE_BREAK=1 injects retained
 * allocations into the REAL T6 hot loop, so that gate rejects and the process
 * exits non-zero (verified by the runner: reaching the end in BREAK mode is a
 * fault). This in-process control covers the same lane without the env flag.
 */

import { GcProfiler, checkNoGc } from '@zakkster/lite-gc-profiler';
import { createTimeline } from '@zakkster/lite-timeline';
import { createShakeState, computeShake } from '../../src/index.js';
import { createParallaxState, updateParallax } from '../../src/ParallaxManager.js';
import { die, rafCount, pumpRaf, makeCam } from './harness.mjs';

/** Retained sink so the control's allocations survive GC (heapUsed grows). */
const leak = [];

// PRO4/T-I env-armed controls. Each, armed ALONE, reverts one PRO4 fix in-
// process and runs the exact gate predicate that guards it; the gate catches the
// reverted behavior and the tier die()s (exit non-zero). Unarmed, each is
// dormant so a plain torture run stays green. This proves the five new gates are
// not decorative -- flip the fix back and the gate bites.
const C_INVERT_SOFT = process.env.CAMPRO_T9_INVERT_SOFT === '1';
const C_NO_WRAP_DOOR = process.env.CAMPRO_T9_NO_WRAP_DOOR === '1';
const C_NO_RELEASE = process.env.CAMPRO_T9_NO_RELEASE === '1';
const C_POISON_ORACLE = process.env.CAMPRO_T9_POISON_ORACLE === '1';
const C_NO_CP20 = process.env.CAMPRO_T9_NO_CP20 === '1';

// The pre-PRO4 (inverted) smoothstep SOFT map, for the INVERT_SOFT control only.
function oldSoftGrant(edge, sz, val, isMin) {
    const ss = (e0, e1, x) => { const t = x < e0 ? 0 : (x > e1 ? 1 : (x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
    if (isMin && val < edge + sz) { let g = edge + (val - edge) * ss(edge, edge + sz, val); if (g < edge) g = edge; return g; }
    if (!isMin && val > edge - sz) { let g = edge + (val - edge) * ss(edge, edge - sz, val); if (g > edge) g = edge; return g; }
    return val;
}

export async function run() {
    // --- PRO4/T-I armed controls (one at a time) ----------------------------
    if (C_INVERT_SOFT) {
        // Revert the D1 hold-out to the old inverted map; the t3/t5 hold-out
        // predicate (granted never nearer the edge than requested) must reject.
        const edge = 0, sz = 80, val = 40; // P4: old map grants 20 (nearer edge)
        const g = oldSoftGrant(edge, sz, val, true);
        if (g >= val) die('T9 INVERT_SOFT: old map granted ' + g + ' >= ' + val + ' -- hold-out gate is vacuous');
        die('T9 INVERT_SOFT control armed: reverted SOFT map granted ' + g + ' (nearer the edge than the requested ' +
            val + ') -- the hold-out gate correctly rejects it');
    }
    if (C_NO_WRAP_DOOR) {
        // Bypass the ERR_PARALLAX_TILE door: a REPEAT_X layer with tileW 0. The
        // wrap-correctness predicate (scrollX finite, in [0, tile)) must reject.
        const st = createParallaxState();
        const layer = st.layers[0];
        layer.active = true; layer.id = 'bad'; layer.speedX = 1; layer.speedY = 1;
        layer.wrap = 1; layer.tileW = 0; layer.tileH = 0; // door would have thrown
        st.activeCount = 1;
        updateParallax(st, 775, 0, 1);
        if (Number.isFinite(layer.scrollX) && layer.scrollX >= 0) {
            die('T9 NO_WRAP_DOOR: door-bypassed wrap produced a finite in-range scroll -- the wrap gate is vacuous');
        }
        die('T9 NO_WRAP_DOOR control armed: a REPEAT_X layer with no tile produced scrollX=' + layer.scrollX +
            ' -- the door + wrap gate correctly reject it');
    }
    if (C_NO_RELEASE) {
        // Pre-fix completion cleanup: null _seq WITHOUT the duck-typed stop().
        // The t7 conservation predicate (ticker stops re-requesting after
        // completion) must reject the leaked ticker.
        const cam = makeCam(800, 600, 3200, 2400, 9);
        const seq = cam.createSequence({ blendOutTime: 0.2 }).moveTo(500, 400, 100);
        cam.playSequence(seq);
        for (let i = 0; i < 200 && seq.playing; i++) pumpRaf();
        // reproduce the reverted branch: adopt blend + null _seq, NO stop().
        cam._blendRemain = seq._state.blend; cam._seq = null;
        const before = rafCount();
        pumpRaf();
        if (rafCount() === before) {
            seq.destroy(); cam.destroy();
            die('T9 NO_RELEASE: a leaked completed ticker did NOT re-request -- the conservation gate is vacuous');
        }
        seq.destroy(); cam.destroy();
        die('T9 NO_RELEASE control armed: a completed sequence nulled without stop() kept the ticker re-requesting -- ' +
            'the CP-24 conservation gate correctly rejects it');
    }
    if (C_POISON_ORACLE) {
        // Poison the fuzz oracle (wrong lerpSpeed) and confirm the divergence
        // detector fires against the real camera within a few frames.
        const cam = makeCam(800, 600, 3200, 2400, 42);
        let ox = cam.pos[0], oy = cam.pos[1];
        let otx = cam.target[0], oty = cam.target[1];
        const f = Math.fround;
        const badLerp = cam.lerpSpeed * 2; // poison
        let diverged = false;
        for (let i = 0; i < 200 && !diverged; i++) {
            const dt = 1 / 60, px = 900 + i, py = 700;
            cam.setMode(1); // LOCK: target = px - half, then pos lerps
            cam.update(dt, px, py, 0, 0);
            // oracle mirror with LOCK but poisoned lerp
            const halfW = (cam.viewW / cam.zoom) * 0.5, halfH = (cam.viewH / cam.zoom) * 0.5;
            otx = f(px - halfW); oty = f(py - halfH); ox = otx; oy = oty;
            ox = f(ox + (otx - ox) * badLerp * dt); oy = f(oy + (oty - oy) * badLerp * dt);
            if (Math.abs(cam.pos[0] - ox) > 1e-3) diverged = true;
        }
        cam.destroy();
        if (!diverged) die('T9 POISON_ORACLE: a poisoned oracle never diverged -- the fuzz gate is vacuous');
        die('T9 POISON_ORACLE control armed: a poisoned oracle diverged from the real camera -- the fuzz gate correctly rejects it');
    }
    if (C_NO_CP20) {
        // Reproduce the pre-fix re-entrant destroy: a zoom-ease callback that
        // destroys the camera, then a hand-rolled update WITHOUT the _destroyed
        // check -- the raw null deref is exactly what the CP-20 guard prevents.
        const cam = makeCam(800, 600, 3200, 2400, 42);
        cam.setZoom(2, 0.5, (t) => { cam.destroy(); return t; });
        let raw = false;
        try {
            // no-check zoom-anim body: advance elapsed, ease (destroys cam), then
            // read nulled state as the reverted code would.
            cam._zoomElapsed += 0.1;
            const t = cam._zoomEase(1); // destroys the camera
            void t;
            const z = cam._zoomFrom + (cam._zoomTo - cam._zoomFrom) * 0.5;
            cam.pos[0] = z; // pos is nulled by destroy() -> raw TypeError
        } catch (e) {
            raw = e instanceof TypeError && e.code === undefined;
        }
        if (!raw) die('T9 NO_CP20: the reverted re-entrant path did not raw-crash -- the CP-20 gate is vacuous');
        die('T9 NO_CP20 control armed: the reverted re-entrant destroy raw-crashed (TypeError, no .code) -- ' +
            'the CP-20 guard + gate correctly prevent it');
    }

    // D-i doors-disabled control: prove the T1 / regressions finite-check
    // detector is NOT vacuous. Hand-poison a shake state the way the pre-door
    // engine could be driven -- an active slot carrying NaN trauma with the
    // state marked active -- run computeShake, and confirm the detector
    // predicate (Number.isFinite on state.offsetX) FLAGS it. If a poisoned
    // state slipped past as finite, every T1/regressions offsetX check would be
    // decorative, so a finite result here is itself a gate failure.
    {
        const poisoned = createShakeState();
        poisoned.slots[0].active = true;
        poisoned.slots[0].trauma = NaN;
        poisoned.active = true;
        computeShake(poisoned);
        if (Number.isFinite(poisoned.offsetX)) {
            die('T9 doors-disabled control: a NaN-trauma active slot produced a FINITE ' +
                'offsetX -- the T1/regressions finite-check detector is vacuous');
        }
    }

    // Leaked-ticker control (D-e/F22): prove the T7 conservation gate is NOT
    // vacuous. Build the PRE-FIX stop() shape in-process -- a live timeline that
    // is reset() instead of destroy()ed, so the shared ticker keeps running --
    // and confirm pumping its stored RAF callback DOES grow rafCount(). If it
    // did not, pumpRaf() would be inert and t7's `delta == 0` assertion would
    // pass on a leaked build too (decorative). Then destroy() for real so the
    // shared-ticker refcount returns to 0 (T9 runs after T7; leave it clean).
    {
        const tl = createTimeline({});                 // acquires + starts the shared ticker
        tl.add({ duration: 1000, onUpdate() {} });     // a dummy track to advance
        tl.play();                                     // attaches update; ticker live
        const before = rafCount();
        const fired = pumpRaf();                       // live _tick re-requests -> +1
        const after = rafCount();
        if (!fired || after <= before) {
            die('T9 leaked-ticker control: pumping a live (reset-not-destroyed) ticker did ' +
                'NOT grow rafCount (fired=' + fired + ' delta=' + (after - before) + ') -- ' +
                'the T7 conservation gate cannot fail');
        }
        tl.reset();     // pre-fix stop() shape: detaches update but holds the ticker ref
        tl.destroy();   // real cleanup: releases the ref, ticker destroyed, slot cleared
    }

    // Control: a hot body that RETAINS an allocation every iteration must be
    // rejected by the same gate T6 uses (maxMajor:0). Retaining ~2 KB per
    // iteration over 120k iterations is ~240 MB of surviving garbage -- V8 is
    // forced into at least one major collection, and checkNoGc flags it.
    const gc = new GcProfiler().start();
    for (let i = 0; i < 120000; i++) {
        leak.push(new Float64Array(256)); // 2 KB, retained -> real heap growth
        if ((i & 8191) === 0) {
            gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
        }
    }
    await new Promise((r) => setTimeout(r, 50));
    const s = gc.summary();
    const report = checkNoGc(s, { maxMajor: 0, maxPauseMs: 4 });
    gc.stop();
    leak.length = 0; // release the control's garbage

    if (report.ok) {
        die('T9 control: an allocating+retaining hot loop passed the zero-alloc gate ' +
            '(major=' + s.gc.major + ' maxMs=' + s.gc.maxMs.toFixed(3) + ') -- the T6 gate cannot fail');
    }
}
