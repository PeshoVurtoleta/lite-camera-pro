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
let _rafId = 0;
export let rafRequests = 0;
if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = (_cb) => { rafRequests++; return ++_rafId; };
    globalThis.cancelAnimationFrame = (_handle) => {};
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
