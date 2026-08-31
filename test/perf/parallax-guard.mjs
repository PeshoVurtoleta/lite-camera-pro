// test/perf/parallax-guard.mjs -- D2 hot-guard measurement (PRO3 style).
// node --expose-gc test/perf/parallax-guard.mjs
//
// The sever nulls this._parallax in the constructor, so update() step 7 needs
// a guard that tolerates a null parallax state. Two candidates, measured here
// so decisions/0004 records a number rather than a preference:
//   (i)  explicit null compare: this._parallax !== null && ...activeCount > 0
//   (ii) module-local frozen inert sentinel {activeCount: 0} assigned at
//        construction: this._parallax.activeCount > 0 (no null compare).
//
// Both tick functions are byte-identical below except that single parallax
// line, both driven through the real single-target follow path, real
// applyBounds and real updateShake, so the delta isolates the guard.
//
// Acceptance rule (fixed in advance, applied verbatim): adopt (i) unless (i)'s
// median exceeds (ii)'s by more than 1.0 ns/op AND by more than 3x the larger
// spread. (ii) forks the state shape (a camera whose _parallax is a
// fake-but-real object) against H-B, so the bar to adopt it is deliberately
// high; PRO3 already accepted ~0.8 ns/frame for a null compare.

import { CinematicCameraPro } from '../../src/CinematicCameraPro.js';
import { FOLLOW_STRATEGIES } from '../../src/FollowMode.js';
import { applyBounds } from '../../src/BoundsSystem.js';
import { updateParallax } from '../../src/ParallaxManager.js';
import { updateShake } from '../../src/ShakeEngine.js';

const ITERS = 2e7;
const RUNS = 11; // first discarded as warmup, 10 kept

// Module-local frozen inert sentinel for variant (ii). activeCount 0 -> the
// real updateParallax never runs; only the guard compare differs.
const INERT_PARALLAX = Object.freeze({ activeCount: 0 });

// Variant (i): explicit null compare in step 7.
function tickNullCompare(cam, dt, px, py) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (dt > cam.maxDt) dt = cam.maxDt;
    if (cam._zoomDur > 0) {
        cam._zoomElapsed += dt;
    }
    cam._updateBoundsForZoom();
    const strategy = FOLLOW_STRATEGIES[cam.mode];
    strategy(cam, dt, px, py, 0, 0);
    applyBounds(
        cam._bounds, cam.target, cam.pos,
        cam._maxX, cam._maxY,
        cam.visibleW, cam.visibleH, dt
    );
    cam.pos[0] += (cam.target[0] - cam.pos[0]) * cam.lerpSpeed * dt;
    cam.pos[1] += (cam.target[1] - cam.pos[1]) * cam.lerpSpeed * dt;
    // >>> guard variant (i)
    if (cam._parallax !== null && cam._parallax.activeCount > 0) {
        updateParallax(cam._parallax, cam.pos[0], cam.pos[1], cam.zoom);
    }
    updateShake(cam._shake, dt);
}

// Variant (ii): sentinel, no null compare in step 7.
function tickSentinel(cam, dt, px, py) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (dt > cam.maxDt) dt = cam.maxDt;
    if (cam._zoomDur > 0) {
        cam._zoomElapsed += dt;
    }
    cam._updateBoundsForZoom();
    const strategy = FOLLOW_STRATEGIES[cam.mode];
    strategy(cam, dt, px, py, 0, 0);
    applyBounds(
        cam._bounds, cam.target, cam.pos,
        cam._maxX, cam._maxY,
        cam.visibleW, cam.visibleH, dt
    );
    cam.pos[0] += (cam.target[0] - cam.pos[0]) * cam.lerpSpeed * dt;
    cam.pos[1] += (cam.target[1] - cam.pos[1]) * cam.lerpSpeed * dt;
    // >>> guard variant (ii)
    if (cam._parallax.activeCount > 0) {
        updateParallax(cam._parallax, cam.pos[0], cam.pos[1], cam.zoom);
    }
    updateShake(cam._shake, dt);
}

function makeCam(parallaxSlot) {
    const cam = new CinematicCameraPro(800, 600, 8000, 6000);
    cam._parallax = parallaxSlot; // (i) -> null, (ii) -> INERT sentinel
    return cam;
}

function runOne(tick, parallaxSlot) {
    const cam = makeCam(parallaxSlot);
    let px = 0, py = 0;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < ITERS; i++) {
        // A moving target so the follow strategy does real work each frame.
        px = (px + 1.7) % 8000;
        py = (py + 1.3) % 6000;
        tick(cam, 0.016, px, py);
    }
    const t1 = process.hrtime.bigint();
    return Number(t1 - t0) / ITERS; // mean ns/op for this run
}

function measure(label, tick, parallaxSlot) {
    const means = [];
    for (let r = 0; r < RUNS; r++) {
        const ns = runOne(tick, parallaxSlot);
        if (r > 0) means.push(ns); // discard warmup run
        globalThis.gc?.();
    }
    means.sort((a, b) => a - b);
    const median = means.length % 2
        ? means[(means.length - 1) >> 1]
        : (means[means.length / 2 - 1] + means[means.length / 2]) / 2;
    const spread = means[means.length - 1] - means[0];
    return { label, median, spread, means };
}

const a = measure('(i) null-compare', tickNullCompare, null);
const b = measure('(ii) sentinel', tickSentinel, INERT_PARALLAX);

const delta = a.median - b.median; // how much (i) costs over (ii)
const largerSpread = Math.max(a.spread, b.spread);
// Fixed rule: (ii) ships ONLY if delta > 1.0 ns/op AND delta > 3x largerSpread.
const adoptSentinel = delta > 1.0 && delta > 3 * largerSpread;
const verdict = adoptSentinel ? 'ADOPT (ii) sentinel' : 'ADOPT (i) null-compare';

const f = (n) => n.toFixed(3);
console.log('D2 parallax-guard probe -- ' + ITERS.toExponential(0) + ' iters/run, ' +
    RUNS + ' runs (1 warmup discarded)');
console.log('  (i)  null-compare : median ' + f(a.median) + ' ns/op  spread ' + f(a.spread) + ' ns/op');
console.log('  (ii) sentinel     : median ' + f(b.median) + ' ns/op  spread ' + f(b.spread) + ' ns/op');
console.log('  delta (i)-(ii)    : ' + f(delta) + ' ns/op   larger spread ' + f(largerSpread) + ' ns/op');
console.log('  rule: (ii) iff delta > 1.0 AND delta > 3x spread (' + f(3 * largerSpread) + ')');
console.log('  VERDICT: ' + verdict);
