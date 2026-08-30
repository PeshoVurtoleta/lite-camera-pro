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
import { die, rafCount, pumpRaf } from './harness.mjs';

/** Retained sink so the control's allocations survive GC (heapUsed grows). */
const leak = [];

export async function run() {
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
