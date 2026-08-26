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
import { die } from './harness.mjs';

/** Retained sink so the control's allocations survive GC (heapUsed grows). */
const leak = [];

export async function run() {
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
