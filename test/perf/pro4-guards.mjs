// test/perf/pro4-guards.mjs -- PRO4 hot-path A/B measurements.
// node --expose-gc test/perf/pro4-guards.mjs
//
// Two numbers the decision records need:
//   D3 (0007): the CP-9 base-shake bridge adds prototype accessors + two cold
//     instance fields. H-G demands they cost the hot path nothing. Measured as
//     200k update()+apply() on a live, shaking camera -- the accessors are never
//     read on that path (the regressions.test.js source gate proves the names
//     are absent from the bodies), so this is the steady-state throughput the
//     accessor presence must not move.
//   D4 (0008): the CP-20 re-entrant-destroy guard adds `if (this._destroyed)
//     return;` right after the _zoomEase() user callback, INSIDE the
//     `_zoomDur > 0` branch. Measured as an A/B of two update bodies that differ
//     only by that line, both driven WITH an active zoom animation so the branch
//     (and the check) runs every frame -- the worst case for the guard.
//
// Both are steady-state throughput probes: no allocation in the loop bodies.

import { CinematicCameraPro } from '../../src/CinematicCameraPro.js';
import { FOLLOW_STRATEGIES } from '../../src/FollowMode.js';
import { applyBounds } from '../../src/BoundsSystem.js';
import { updateShake } from '../../src/ShakeEngine.js';
import { lerp, clamp } from '@zakkster/lite-lerp';

const RUNS = 11;
const f = (n) => n.toFixed(3);

function median(means) {
    means.sort((a, b) => a - b);
    return means.length % 2
        ? means[(means.length - 1) >> 1]
        : (means[means.length / 2 - 1] + means[means.length / 2]) / 2;
}

// --------------------------------------------------------------------------
// D3 bridge: 200k update()+apply() on a shaking camera. Accessor presence must
// not change the instance shape or the hot-path throughput.
// --------------------------------------------------------------------------
const BRIDGE_ITERS = 200000;

const noopSink = { translate() {}, rotate() {}, scale() {} };

function runBridge() {
    const cam = new CinematicCameraPro(800, 600, 8000, 6000, 42);
    cam.addTrauma(1); // keep a slot alive so apply() computes shake every frame
    let px = 0, py = 0;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < BRIDGE_ITERS; i++) {
        px = (px + 1.7) % 8000;
        py = (py + 1.3) % 6000;
        if ((i & 63) === 0) cam.addTrauma(0.5); // re-arm so shake stays active
        cam.update(0.016, px, py, 0, 0);
        cam.apply(noopSink);
    }
    const t1 = process.hrtime.bigint();
    return Number(t1 - t0) / BRIDGE_ITERS;
}

// --------------------------------------------------------------------------
// D4 CP-20 check: two update bodies differing only by the destroyed check,
// both with a live zoom animation so the branch runs every frame.
// --------------------------------------------------------------------------
const CP20_ITERS = 2e7;

function tickNoCheck(cam, dt, px, py) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (dt > cam.maxDt) dt = cam.maxDt;
    if (cam._zoomDur > 0) {
        cam._zoomElapsed += dt;
        let t = clamp(cam._zoomElapsed / cam._zoomDur, 0, 1);
        if (cam._zoomEase) t = cam._zoomEase(t);
        // (no destroyed check here)
        cam.zoom = lerp(cam._zoomFrom, cam._zoomTo, t);
        if (cam._zoomElapsed >= cam._zoomDur) { cam._zoomElapsed = 0; } // keep looping the anim
    }
    cam._updateBoundsForZoom();
    const strategy = FOLLOW_STRATEGIES[cam.mode];
    strategy(cam, dt, px, py, 0, 0);
    applyBounds(cam._bounds, cam.target, cam.pos, cam._maxX, cam._maxY, cam.visibleW, cam.visibleH, dt);
    cam.pos[0] += (cam.target[0] - cam.pos[0]) * cam.lerpSpeed * dt;
    cam.pos[1] += (cam.target[1] - cam.pos[1]) * cam.lerpSpeed * dt;
    updateShake(cam._shake, dt);
}

function tickWithCheck(cam, dt, px, py) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (dt > cam.maxDt) dt = cam.maxDt;
    if (cam._zoomDur > 0) {
        cam._zoomElapsed += dt;
        let t = clamp(cam._zoomElapsed / cam._zoomDur, 0, 1);
        if (cam._zoomEase) t = cam._zoomEase(t);
        if (cam._destroyed) return; // >>> the CP-20 guard
        cam.zoom = lerp(cam._zoomFrom, cam._zoomTo, t);
        if (cam._zoomElapsed >= cam._zoomDur) { cam._zoomElapsed = 0; }
    }
    cam._updateBoundsForZoom();
    const strategy = FOLLOW_STRATEGIES[cam.mode];
    strategy(cam, dt, px, py, 0, 0);
    applyBounds(cam._bounds, cam.target, cam.pos, cam._maxX, cam._maxY, cam.visibleW, cam.visibleH, dt);
    cam.pos[0] += (cam.target[0] - cam.pos[0]) * cam.lerpSpeed * dt;
    cam.pos[1] += (cam.target[1] - cam.pos[1]) * cam.lerpSpeed * dt;
    updateShake(cam._shake, dt);
}

function runCp20(tick) {
    const cam = new CinematicCameraPro(800, 600, 8000, 6000, 42);
    cam._zoomFrom = 1; cam._zoomTo = 2; cam._zoomDur = 1; cam._zoomElapsed = 0; cam._zoomEase = null;
    let px = 0, py = 0;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < CP20_ITERS; i++) {
        px = (px + 1.7) % 8000;
        py = (py + 1.3) % 6000;
        tick(cam, 0.016, px, py);
    }
    const t1 = process.hrtime.bigint();
    return Number(t1 - t0) / CP20_ITERS;
}

function measure(runner, arg) {
    const means = [];
    for (let r = 0; r < RUNS; r++) { const ns = runner(arg); if (r > 0) means.push(ns); globalThis.gc?.(); }
    const m = median(means);
    return { median: m, spread: means[means.length - 1] - means[0] };
}

const bridge = measure(runBridge);
const cp20No = measure(runCp20, tickNoCheck);
const cp20Yes = measure(runCp20, tickWithCheck);
const cp20Delta = cp20Yes.median - cp20No.median;

console.log('D3 bridge probe -- ' + BRIDGE_ITERS.toExponential(0) + ' update()+apply() per run, ' + RUNS + ' runs (1 warmup)');
console.log('  update+apply (accessors present): median ' + f(bridge.median) + ' ns/op  spread ' + f(bridge.spread));
console.log('  accessors live on the prototype; the hidden class is stable, so this is the');
console.log('  steady-state cost the bridge must not move (H-G source gate proves absence from the bodies).');
console.log('');
console.log('D4 CP-20-check probe -- ' + CP20_ITERS.toExponential(0) + ' iters/run, mid-zoom-animation (branch runs every frame)');
console.log('  no check   : median ' + f(cp20No.median) + ' ns/op  spread ' + f(cp20No.spread));
console.log('  with check : median ' + f(cp20Yes.median) + ' ns/op  spread ' + f(cp20Yes.spread));
console.log('  delta      : ' + f(cp20Delta) + ' ns/op (worst case: only paid inside _zoomDur > 0)');
