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
import { BREAK, noopSink, die } from './harness.mjs';

const HOT = 200000;

/** Retained sink for the BREAK control -- survives GC so heapUsed grows. */
const retained = [];

export async function run() {
    // WIRE: steady-state camera allocated OUTSIDE the loop, stepped inside.
    const cam = new CinematicCameraPro(800, 600, 4000, 4000, 42);
    cam.addParallaxLayer('sky', 0.2);
    cam.addParallaxLayer('mid', 0.6);
    cam.shakePreset('explosion');

    // Identity witnesses: these references must not change across the window.
    const slotsRef = cam._shake.slots;
    const slotCount = cam._shake.slotCount;
    const layersRef = cam._parallax.layers;
    const layerCount = cam._parallax.layers.length;

    const gc = new GcProfiler().start();
    for (let i = 0; i < HOT; i++) {
        cam.update(1 / 60, 1000 + (i & 1023), 800 + (i & 511), 1, 0);
        // Keep the shake branch hot: re-arm the moment it sleeps.
        if (!cam._shake.active) cam.shakePreset('explosion');
        cam.apply(noopSink);
        cam.applyParallax('mid', noopSink);
        if (BREAK && (i & 31) === 0) retained.push(new Float64Array(512));
        if ((i & 8191) === 0) {
            gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
        }
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
