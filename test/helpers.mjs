// test/helpers.mjs -- shared test scaffolding for the node:test suites.
//
// Two things every suite needs and neither owns:
//   1. A requestAnimationFrame polyfill. lite-timeline's ticker drives
//      sequences via RAF; under `node --test` there is no browser clock, so we
//      install a counting stand-in at import time (idempotent).
//   2. A recording Canvas2D-shaped sink. apply()/debug()/debugHUD() and the
//      parallax/HUD draws only ever call a handful of context methods; this
//      records each call so a test can assert transforms without a real canvas.

// -- requestAnimationFrame polyfill (store-only) ---------------------------
// lite-ticker's frame loop is self-perpetuating: `_tick` ends by requesting the
// next frame. A polyfill that auto-fires (setTimeout(cb, 0)) is therefore an
// infinite hot loop that never lets `node --test` idle or the process exit.
// The suite's sequence tests only assert `sequencePlaying` and doNotThrow -- none
// require the timeline to actually advance -- so we hand back a frame id without
// ever invoking the callback. The ticker starts, registers, and stays quiescent;
// the process exits cleanly with no dangling timers.
// Store-only COUNTING, plus a single latest-callback slot (cb + id) so a test
// can PUMP one frame on demand -- the same mechanism the torture harness uses to
// prove ticker conservation (CP-5). cancelAnimationFrame clears the slot on id
// match, so a paused/destroyed ticker leaves nothing to pump: pumping a LIVE
// ticker drives lite-ticker's _tick (which re-requests -> rafRequests grows),
// while a RELEASED ticker's pump is a no-op.
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
 * timestamp (+16 ms per pump). Takes-and-clears the slot first, so a live
 * ticker's re-request lands in a fresh slot; a released ticker is a no-op.
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

// -- recording context sink -------------------------------------------------
// Captures every method call and swallows style assignments. Zero external deps.
export function makeCtx() {
    const calls = [];
    const ctx = {
        calls,
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, textBaseline: '',
        count(name) {
            let n = 0;
            for (let i = 0; i < calls.length; i++) if (calls[i].name === name) n++;
            return n;
        },
    };
    const methods = ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath',
        'moveTo', 'lineTo', 'stroke', 'fill', 'fillRect', 'strokeRect', 'fillText',
        'closePath', 'arc', 'rect', 'clip', 'setTransform'];
    for (const name of methods) ctx[name] = (...args) => { calls.push({ name, args }); };
    return ctx;
}
