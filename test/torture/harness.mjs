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

// -- v2.0.0 detach attach helpers -------------------------------------------
// The class ships parallax/sequence/debug as fail-closed stubs; the torture
// tiers exercise the attached surface, so they attach all three at construction.
// shakePreset() was dropped at the major -- shakePreset() here replays the D4
// migration idiom (getPreset from ./shake, guarded, then shake) so tier bodies
// stay byte-identical in intent.
import { CinematicCameraPro } from '../../src/index.js';
import { withParallax } from '../../src/ParallaxManager.js';
import { withSequences } from '../../src/CameraSequence.js';
import { withDebug } from '../../src/DebugHUD.js';
import { getPreset } from '../../src/ShakePresets.js';

export function attachAll(cam) { return withDebug(withSequences(withParallax(cam))); }
export function makeCam(...args) { return attachAll(new CinematicCameraPro(...args)); }
export function shakePreset(cam, name, i) { const p = getPreset(name); if (p) cam.shake(p, i); }

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
// Store-only COUNTING as before (never auto-fires -- lite-ticker's _tick
// re-requests every frame, so an auto-firing polyfill is an infinite hot loop).
// PLUS a single latest-callback slot (D-e): the last cb+id handed to
// requestAnimationFrame is retained so a tier can PUMP one frame on demand.
// cancelAnimationFrame clears the slot on id match, so a paused/destroyed
// ticker leaves nothing to pump. This is what makes the T7 ticker-conservation
// gate bite: pumping a LIVE ticker's stored callback drives _tick, which
// re-requests (rafCount grows); a RELEASED ticker cleared its slot on destroy,
// so the pump is a no-op and the count holds.
let _rafId = 0;
export let rafRequests = 0;
export function rafCount() { return rafRequests; }

let _rafSlotCb = null;
let _rafSlotId = 0;
let _pumpClock = 0;

if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = (cb) => {
        rafRequests++;
        const id = ++_rafId;
        _rafSlotCb = cb;
        _rafSlotId = id;
        return id;
    };
    globalThis.cancelAnimationFrame = (handle) => {
        if (handle === _rafSlotId) { _rafSlotCb = null; _rafSlotId = 0; }
    };
}

/**
 * Invoke the latest stored RAF callback once with a synthetic monotonic
 * timestamp (+16 ms per pump). Takes-and-CLEARS the slot first, so a live
 * ticker's re-request lands in a fresh slot (and bumps rafCount); a released
 * ticker (slot already cleared by cancelAnimationFrame at destroy) is a no-op.
 * @returns {boolean} true if a callback fired.
 */
export function pumpRaf() {
    const cb = _rafSlotCb;
    if (cb === null) return false;
    _rafSlotCb = null;
    _rafSlotId = 0;
    _pumpClock += 16;
    cb(_pumpClock);
    return true;
}
