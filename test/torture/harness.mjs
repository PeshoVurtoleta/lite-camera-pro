/**
 * @zakkster/lite-camera-pro -- torture harness.
 *
 * Shared scratch: a seeded xorshift32 PRNG (replayable via TORTURE_SEED), a
 * pool of recorder sinks (the two/three-method Canvas2D contract apply() drives),
 * a counting requestAnimationFrame polyfill, the BREAK control flag, and the
 * zero-alloc fail helpers. Every tier imports from here so the discipline lives
 * in one place.
 *
 * Two rules that bite (torture-harness skill):
 *   1. GC entries arrive asynchronously -- a tier must `await` a settle tick
 *      before reading a GcProfiler summary().
 *   2. lite-leak held-value contract -- neither a `cleanup` closure nor a `tag`
 *      may close over the tracked target, or finalization is defeated.
 *
 * The RAF polyfill is store-only (COUNTING, never auto-firing). lite-timeline's
 * ticker loop is self-perpetuating (`_tick` requests the next frame); a polyfill
 * that fired the callback would be an infinite hot loop that starves the run.
 * Sequences here are exercised for retention, not for frame advancement, so we
 * count requests and return an id without ever invoking the callback.
 *
 * @license MIT
 */

// -- seed (replayable) ------------------------------------------------------
/** Seed for every PRNG in the run. Override with TORTURE_SEED for replay. */
export const SEED = (() => {
    const raw = process.env.TORTURE_SEED;
    if (raw === undefined) return 0x9e3779b9;
    const n = Number(raw) >>> 0;
    return n === 0 ? 1 : n; // xorshift32 must not be seeded with 0
})();

/** Deliberately-broken control mode: T6 injects a retained allocation. */
export const BREAK = process.env.CAMPRO_TORTURE_BREAK === '1';

/** Seeded xorshift32. Returns a function yielding a uint32 each call. */
export function makePrng(seed) {
    let x = (seed >>> 0) || 1;
    return function next() {
        x ^= x << 13; x >>>= 0;
        x ^= x >> 17;
        x ^= x << 5; x >>>= 0;
        return x >>> 0;
    };
}

// -- fail helpers -----------------------------------------------------------
/** Fail the whole gate. stdout stays clean; the reason goes to stderr. */
export function die(msg) {
    process.stderr.write('torture: FAIL -- ' + msg + '\n');
    process.exit(1);
}

/**
 * Assertion whose message is built ONLY on failure. Pass a thunk, not a string,
 * so the happy path allocates nothing.
 * @param {boolean} cond
 * @param {() => string} msgThunk
 */
export function check(cond, msgThunk) {
    if (!cond) die(msgThunk());
}

// -- recorder sink pool -----------------------------------------------------
// apply()/applyParallax() call translate/rotate/scale. A recording sink lets a
// law tier compare two transform streams; a no-op sink is enough for the gate
// tiers. Both are pooled -- reused across cycles, never allocated in a hot body.

/** A no-op sink honouring the apply() contract (translate + rotate + scale). */
export const noopSink = {
    translate(_x, _y) {},
    rotate(_a) {},
    scale(_x, _y) {},
};

/** A recording sink: pushes {op,a,b} for each call. reset() clears in place. */
export function makeRecorderSink() {
    const ops = [];
    return {
        ops,
        translate(x, y) { ops.push('t', x, y); },
        rotate(a) { ops.push('r', a, 0); },
        scale(x, y) { ops.push('s', x, y); },
        reset() { ops.length = 0; },
    };
}

// -- counting requestAnimationFrame polyfill --------------------------------
let _rafId = 0;
export let rafRequests = 0;
export function rafCount() { return rafRequests; }
if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = (_cb) => { rafRequests++; return ++_rafId; };
    globalThis.cancelAnimationFrame = (_handle) => {};
}
