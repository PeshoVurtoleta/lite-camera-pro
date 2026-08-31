/**
 * T6 -- the zero-alloc gate.
 *
 * A steady-state camera allocated ONCE, outside the loop, then driven through
 * HOT frames of update() + apply() with an always-active shake. The window is
 * measured with lite-gc-profiler and gated at maxMajor:0 / maxPauseMs:4 --
 * matching @zakkster/lite-camera exactly. The budget is NOT widened here; if
 * 4ms proves unreachable on a machine that is a finding to report, not a bump.
 *
 * A heap-pause gate cannot see a pool that was silently reallocated to the same
 * size, so we also pin object identity: the 8-slot shake pool array and the
 * 16-layer parallax array must be the SAME references after the window, and
 * their lengths unchanged. A per-frame `new` inside the hot path would either
 * show as a major GC or swap one of these references.
 *
 * CAMPRO_TORTURE_BREAK=1 retains a Float64Array every 32 frames (~25 MB over the
 * run) so heapUsed climbs, V8 runs a major GC, and checkNoGc rejects the window.
 * That is the T9 control, exercisable from a plain run via the env flag.
 */

import { GcProfiler, checkNoGc } from '@zakkster/lite-gc-profiler';
import { CinematicCameraPro } from '../../src/index.js';
import { BREAK, noopSink, die, makeCam, shakePreset } from './harness.mjs';

const HOT = 200000;

/** Retained sink for the BREAK control -- survives GC so heapUsed grows. */
const retained = [];

export async function run() {
    // WIRE: steady-state camera allocated OUTSIDE the loop, stepped inside.
    const cam = makeCam(800, 600, 4000, 4000, 42);
    cam.addParallaxLayer('sky', 0.2);
    cam.addParallaxLayer('mid', 0.6);
    shakePreset(cam, 'explosion');

    // Identity witnesses: these references must not change across the window.
    const slotsRef = cam._shake.slots;
    const slotCount = cam._shake.slotCount;
    const layersRef = cam._parallax.layers;
    const layerCount = cam._parallax.layers.length;

    // A3 (OWNER NOTE 3): exercise the blend-armed step-6 branch under the SAME
    // budget. The honest way without a real RAF clock: arm the camera's
    // _blendRemain directly at a fixed point in the loop -- exactly the field
    // update()'s completion cleanup writes -- and let it glide down to a landing
    // over a contiguous window. 90/60 s of budget at dt=1/60 keeps the blend
    // branch armed for ~90 consecutive frames (>= 60), covering both the glide
    // sub-branch and the exact-land sub-branch, then the plain lerp resumes.
    const BLEND_ARM_AT = 1000;
    let blendFrames = 0;

    // Collect prior-tier garbage BEFORE opening the measured window. T6 gates on
    // ITS OWN allocation (maxMajor:0 across the 200k loop); a major GC triggered
    // by an earlier tier's dead objects (e.g. T3's sequence-spam timelines) is
    // not T6's allocation and must not be charged to it. This does not widen the
    // budget -- it isolates the measurement to this tier's hot loop.
    globalThis.gc?.();
    await new Promise((r) => setTimeout(r, 50));

    const gc = new GcProfiler().start();
    for (let i = 0; i < HOT; i++) {
        if (i === BLEND_ARM_AT) cam._blendRemain = 90 / 60;
        if (cam._blendRemain > 0) blendFrames++;
        cam.update(1 / 60, 1000 + (i & 1023), 800 + (i & 511), 1, 0);
        // Keep the shake branch hot: re-arm the moment it sleeps.
        if (!cam._shake.active) shakePreset(cam, 'explosion');
        cam.apply(noopSink);
        cam.applyParallax('mid', noopSink);
        if (BREAK && (i & 31) === 0) retained.push(new Float64Array(512));
        if ((i & 8191) === 0) {
            gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
        }
    }

    if (blendFrames < 60) {
        die('T6: blend-armed coverage was ' + blendFrames + ' frames (< 60) -- the A3 phase did not run');
    }

    await new Promise((r) => setTimeout(r, 50));
    const s = gc.summary();
    const report = checkNoGc(s, { maxMajor: 0, maxPauseMs: 4 });
    gc.stop();

    // Structural assertions no heap gate can make.
    if (cam._shake.slots !== slotsRef || cam._shake.slotCount !== slotCount) {
        die('T6: shake slot pool was reallocated (identity or count changed)');
    }
    if (cam._parallax.layers !== layersRef || cam._parallax.layers.length !== layerCount) {
        die('T6: parallax layer array was reallocated (identity or length changed)');
    }

    if (!report.ok) {
        const g = s.gc;
        die('T6 alloc gate rejected -- major=' + g.major + ' minor=' + g.minor +
            ' maxMs=' + g.maxMs.toFixed(3) +
            (BREAK ? ' (CAMPRO_TORTURE_BREAK control -- expected)' : ''));
    }

    // In BREAK mode the gate was SUPPOSED to reject; reaching here is itself a
    // failure -- the control silently passed.
    if (BREAK) {
        die('T6: CAMPRO_TORTURE_BREAK injected retained allocations but the gate passed');
    }
}
