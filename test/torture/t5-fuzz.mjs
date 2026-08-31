/**
 * T5 -- differential fuzz vs an independent float64 oracle (PRO4/T-H).
 *
 * A second, deliberately-independent implementation of the single-target camera
 * math (dt door + maxDt clamp + zoom animation + all four bounds types incl. the
 * D1 SOFT hold-out + the blend window + resize re-clamp + every single-target
 * follow strategy) is stepped in lockstep with the REAL camera. Both consume the
 * identical seeded op stream; after every op the two poses (pos/target as f32,
 * plus zoom/visibleW/visibleH/_maxX/_maxY as f64) must agree.
 *
 * The oracle keeps pos/target/look in plain f64 variables and rounds through
 * Math.fround at EXACTLY the points the real camera's Float32Array stores round,
 * so a genuine implementation divergence (not just f32 noise) is what trips it.
 * Tolerance: abs <= 1e-3 OR rel <= 1e-5. On divergence it prints the seed, op
 * index, op name, field, and both values, then exits non-zero (replayable).
 *
 * EXCLUDED (own tiers): shake sampling, sequences, parallax, multi-target, debug.
 * Op mix (per contract): update 60, setZoom 8, setMode 6, setBoundsType/Edges 6,
 * setBoundsRect/clear 5, resize 5, setSoftZone 4, teleport 6.
 *
 * 100k ops x 8 seeds, zero divergence.
 */

import { CinematicCameraPro } from '../../src/index.js';
import { makePrng, SEED, die } from './harness.mjs';

const OPS = 100000;
const f = Math.fround;
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerpN = (a, b, t) => (t === 1 ? b : a + t * (b - a));

// Derived seed corpus: the run seed plus seven decorrelated siblings.
function seedCorpus() {
    const out = [SEED >>> 0];
    let x = SEED >>> 0;
    for (let i = 0; i < 7; i++) {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        out.push(x === 0 ? 1 : x);
    }
    return out;
}

// -- the oracle: an independent float64 mirror of Pro's single-target update ---
function makeOracle(cam) {
    return {
        // constants snapshot (never fuzzed -> read once from the real camera)
        deadzoneX: cam.deadzoneX, deadzoneY: cam.deadzoneY,
        lookaheadDist: cam.lookaheadDist, lookaheadSpeed: cam.lookaheadSpeed,
        lerpSpeed: cam.lerpSpeed, predictTime: cam.predictTime,
        minZoom: cam.minZoom, maxZoom: cam.maxZoom, maxDt: cam.maxDt,
        hybridSnap: cam.hybridVerticalSnap,
        // pose (f32-tracked)
        ox: cam.pos[0], oy: cam.pos[1],
        otx: cam.target[0], oty: cam.target[1],
        olx: cam.look[0], oly: cam.look[1],
        // zoom / anim
        zoom: cam.zoom, zoomFrom: cam.zoom, zoomTo: cam.zoom,
        zoomDur: 0, zoomElapsed: 0, blendRemain: 0,
        mode: cam.mode,
        // dims / derived
        viewW: cam.viewW, viewH: cam.viewH, worldW: cam.worldW, worldH: cam.worldH,
        visibleW: cam.visibleW, visibleH: cam.visibleH, maxX: cam._maxX, maxY: cam._maxY,
        // bounds mirror
        bL: cam._bounds.left, bR: cam._bounds.right, bT: cam._bounds.top, bB: cam._bounds.bottom,
        softZone: cam._bounds.softZone, elasticMax: cam._bounds.elasticMax,
        elasticStrength: cam._bounds.elasticStrength,
        boundsX: 0, boundsY: 0, boundsW: 0, boundsH: 0, customBounds: false,
    };
}

function oBoundsForZoom(O) {
    O.visibleW = O.viewW / O.zoom;
    O.visibleH = O.viewH / O.zoom;
    O.maxX = O.worldW - O.visibleW; if (O.maxX < 0) O.maxX = 0;
    O.maxY = O.worldH - O.visibleH; if (O.maxY < 0) O.maxY = 0;
}

function oStrategy(O, dt, px, py, pvx, pvy) {
    const halfW = O.visibleW * 0.5;
    const halfH = O.visibleH * 0.5;
    switch (O.mode) {
        case 0: { // SMOOTH
            const len = Math.sqrt(pvx * pvx + pvy * pvy);
            const tlx = len > 0 ? (pvx / len) * O.lookaheadDist : 0;
            const tly = len > 0 ? (pvy / len) * O.lookaheadDist : 0;
            O.olx = f(O.olx + (tlx - O.olx) * O.lookaheadSpeed * dt);
            O.oly = f(O.oly + (tly - O.oly) * O.lookaheadSpeed * dt);
            const dx = px + O.olx - halfW;
            const dy = py + O.oly - halfH;
            if (dx < O.otx - O.deadzoneX) O.otx = f(dx + O.deadzoneX);
            else if (dx > O.otx + O.deadzoneX) O.otx = f(dx - O.deadzoneX);
            if (dy < O.oty - O.deadzoneY) O.oty = f(dy + O.deadzoneY);
            else if (dy > O.oty + O.deadzoneY) O.oty = f(dy - O.deadzoneY);
            break;
        }
        case 1: { // LOCK
            O.otx = f(px - halfW); O.oty = f(py - halfH);
            O.ox = O.otx; O.oy = O.oty;
            O.olx = 0; O.oly = 0;
            break;
        }
        case 2: { // PREDICTIVE
            const predX = px + pvx * O.predictTime;
            const predY = py + pvy * O.predictTime;
            const tlx = predX - px;
            const tly = predY - py;
            O.olx = f(O.olx + (tlx - O.olx) * O.lookaheadSpeed * dt);
            O.oly = f(O.oly + (tly - O.oly) * O.lookaheadSpeed * dt);
            O.otx = f(px + O.olx - halfW);
            O.oty = f(py + O.oly - halfH);
            break;
        }
        case 3: { // CUT
            O.otx = f(px - halfW); O.oty = f(py - halfH);
            O.ox = O.otx; O.oy = O.oty;
            O.olx = 0; O.oly = 0;
            break;
        }
        case 4: { // HYBRID
            const len = Math.sqrt(pvx * pvx + pvy * pvy);
            const tlx = len > 0 ? (pvx / len) * O.lookaheadDist : 0;
            O.olx = f(O.olx + (tlx - O.olx) * O.lookaheadSpeed * dt);
            const dx = px + O.olx - halfW;
            if (dx < O.otx - O.deadzoneX) O.otx = f(dx + O.deadzoneX);
            else if (dx > O.otx + O.deadzoneX) O.otx = f(dx - O.deadzoneX);
            const dy = py - halfH;
            if (O.hybridSnap !== false) { O.oty = f(dy); O.oy = O.oty; }
            else { O.oty = f(dy); O.oy = f(O.oy + (O.oty - O.oy) * O.lerpSpeed * 3 * dt); }
            O.oly = 0;
            break;
        }
    }
}

function oEdge(O, type, axis, edge, isMin, sz, eMax, eStr, dt) {
    const val = axis === 0 ? O.otx : O.oty;
    if (type === 0) { // HARD
        if (isMin && val < edge) { if (axis === 0) O.otx = f(edge); else O.oty = f(edge); }
        if (!isMin && val > edge) { if (axis === 0) O.otx = f(edge); else O.oty = f(edge); }
    } else if (type === 1) { // SOFT (D1 hold-out)
        const s = isMin ? 1 : -1;
        const d = s * (val - edge);
        if (d < sz) {
            let u = d / sz; if (u < 0) u = 0; else if (u > 1) u = 1;
            const g = edge + s * sz * 0.5 * (1 + u * u);
            if (axis === 0) O.otx = f(g); else O.oty = f(g);
        }
    } else if (type === 2) { // ELASTIC
        if (isMin && val < edge) {
            if (edge - val > eMax) { if (axis === 0) O.otx = f(edge - eMax); else O.oty = f(edge - eMax); }
            const sl = 1 - Math.exp(-eStr * dt);
            if (axis === 0) O.ox = f(O.ox + (edge - O.ox) * sl); else O.oy = f(O.oy + (edge - O.oy) * sl);
        }
        if (!isMin && val > edge) {
            if (val - edge > eMax) { if (axis === 0) O.otx = f(edge + eMax); else O.oty = f(edge + eMax); }
            const sl = 1 - Math.exp(-eStr * dt);
            if (axis === 0) O.ox = f(O.ox + (edge - O.ox) * sl); else O.oy = f(O.oy + (edge - O.oy) * sl);
        }
    }
    // type 3 NONE: nothing
}

function oBox(O) {
    let minBX = 0, maxBX = O.maxX, minBY = 0, maxBY = O.maxY;
    if (O.customBounds) {
        minBX = O.boundsX; minBY = O.boundsY;
        maxBX = O.boundsX + O.boundsW - O.visibleW;
        maxBY = O.boundsY + O.boundsH - O.visibleH;
        if (maxBX < minBX) { const mid = (minBX + maxBX) * 0.5; minBX = maxBX = mid; }
        if (maxBY < minBY) { const mid = (minBY + maxBY) * 0.5; minBY = maxBY = mid; }
    }
    return [minBX, maxBX, minBY, maxBY];
}

function oApplyBounds(O, dt) {
    const [minBX, maxBX, minBY, maxBY] = oBox(O);
    const sz = O.softZone, eMax = O.elasticMax, eStr = O.elasticStrength;
    oEdge(O, O.bL, 0, minBX, true, sz, eMax, eStr, dt);
    oEdge(O, O.bR, 0, maxBX, false, sz, eMax, eStr, dt);
    oEdge(O, O.bT, 1, minBY, true, sz, eMax, eStr, dt);
    oEdge(O, O.bB, 1, maxBY, false, sz, eMax, eStr, dt);
}

function oClampToBounds(O) {
    const [minBX, maxBX, minBY, maxBY] = oBox(O);
    if (O.otx < minBX) O.otx = f(minBX); else if (O.otx > maxBX) O.otx = f(maxBX);
    if (O.oty < minBY) O.oty = f(minBY); else if (O.oty > maxBY) O.oty = f(maxBY);
    if (O.ox < minBX) O.ox = f(minBX); else if (O.ox > maxBX) O.ox = f(maxBX);
    if (O.oy < minBY) O.oy = f(minBY); else if (O.oy > maxBY) O.oy = f(maxBY);
}

function oUpdate(O, dt, px, py, pvx, pvy) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (dt > O.maxDt) dt = O.maxDt;
    if (O.zoomDur > 0) {
        O.zoomElapsed += dt;
        const t = clampN(O.zoomElapsed / O.zoomDur, 0, 1);
        O.zoom = lerpN(O.zoomFrom, O.zoomTo, t);
        if (O.zoomElapsed >= O.zoomDur) { O.zoom = O.zoomTo; O.zoomDur = 0; }
    }
    oBoundsForZoom(O);
    oStrategy(O, dt, px, py, pvx, pvy);
    oApplyBounds(O, dt);
    if (O.blendRemain > 0) {
        const r = O.blendRemain - dt;
        if (r <= 0) { O.blendRemain = 0; O.ox = O.otx; O.oy = O.oty; }
        else {
            const k = dt / O.blendRemain; O.blendRemain = r;
            O.ox = f(O.ox + (O.otx - O.ox) * k);
            O.oy = f(O.oy + (O.oty - O.oy) * k);
        }
    } else {
        O.ox = f(O.ox + (O.otx - O.ox) * O.lerpSpeed * dt);
        O.oy = f(O.oy + (O.oty - O.oy) * O.lerpSpeed * dt);
    }
}

// -- divergence check --------------------------------------------------------
function diverged(a, b) {
    const d = Math.abs(a - b);
    if (d <= 1e-3) return false;
    const rel = d / Math.max(Math.abs(a), Math.abs(b), 1e-30);
    return rel > 1e-5;
}

export async function run() {
    for (const seed of seedCorpus()) {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 42);
        const O = makeOracle(cam);
        const prng = makePrng(seed);
        const rnd = () => prng() / 0xffffffff;         // [0,1)
        const rint = (n) => prng() % n;

        // shared player inputs (both cam + oracle consume identical values)
        let px = 400, py = 300, pvx = 0, pvy = 0;

        const fields = ['pos0', 'pos1', 'tx', 'ty', 'zoom', 'visW', 'visH', 'maxX', 'maxY'];

        for (let i = 0; i < OPS; i++) {
            const roll = rint(100);
            let op = 'update';

            if (roll < 60) {
                op = 'update';
                const dt = rnd() * 0.2;                 // often > maxDt (0.1)
                pvx += (rnd() * 200 - 100); if (pvx > 800) pvx = 800; else if (pvx < -800) pvx = -800;
                pvy += (rnd() * 200 - 100); if (pvy > 800) pvy = 800; else if (pvy < -800) pvy = -800;
                px += pvx * dt; py += pvy * dt;
                cam.update(dt, px, py, pvx, pvy);
                oUpdate(O, dt, px, py, pvx, pvy);
            } else if (roll < 68) {
                op = 'setZoom';
                const level = rnd() * 6 - 1;             // spans the clamp both ways
                const anim = (prng() & 1) === 1;
                const dur = anim ? (0.05 + rnd() * 1.5) : 0;
                cam.setZoom(level, dur, null);
                if (dur <= 0) {
                    O.zoom = clampN(level, O.minZoom, O.maxZoom); O.zoomDur = 0; oBoundsForZoom(O);
                } else {
                    O.zoomFrom = O.zoom; O.zoomTo = clampN(level, O.minZoom, O.maxZoom);
                    O.zoomDur = dur; O.zoomElapsed = 0;
                }
            } else if (roll < 74) {
                op = 'setMode';
                const m = rint(5);
                cam.setMode(m); O.mode = m;
            } else if (roll < 80) {
                if (prng() & 1) {
                    op = 'setBoundsType';
                    const t = rint(4);
                    cam.setBoundsType(t); O.bL = O.bR = O.bT = O.bB = t;
                } else {
                    op = 'setBoundsEdges';
                    const cfg = {};
                    if (prng() & 1) { cfg.left = rint(4); O.bL = cfg.left; }
                    if (prng() & 1) { cfg.right = rint(4); O.bR = cfg.right; }
                    if (prng() & 1) { cfg.top = rint(4); O.bT = cfg.top; }
                    if (prng() & 1) { cfg.bottom = rint(4); O.bB = cfg.bottom; }
                    cam.setBoundsEdges(cfg);
                }
            } else if (roll < 85) {
                if (prng() & 1) {
                    op = 'setBoundsRect';
                    const x = rnd() * 1000, y = rnd() * 1000, w = 200 + rnd() * 3000, h = 200 + rnd() * 2000;
                    cam.setBoundsRect(x, y, w, h);
                    O.boundsX = x; O.boundsY = y; O.boundsW = w; O.boundsH = h; O.customBounds = true;
                } else {
                    op = 'clearBoundsRect';
                    cam.clearBoundsRect(); O.customBounds = false;
                }
            } else if (roll < 90) {
                op = 'resize';
                const vw = 200 + rint(1600), vh = 150 + rint(1200);
                const ww = 800 + rint(6000), wh = 600 + rint(4500);
                cam.resize(vw, vh, ww, wh);
                O.viewW = vw; O.viewH = vh; O.worldW = ww; O.worldH = wh;
                oBoundsForZoom(O); oClampToBounds(O);
            } else if (roll < 94) {
                op = 'setSoftZone';
                const sz = rnd() * 300;                  // finite, >= 0 (0 allowed)
                cam.setSoftZone(sz); O.softZone = sz;
            } else {
                op = 'teleport';
                px = (prng() & 1 ? 1 : -1) * (rnd() * 1e5);
                py = (prng() & 1 ? 1 : -1) * (rnd() * 1e5);
                pvx = 0; pvy = 0;
            }

            const real = [cam.pos[0], cam.pos[1], cam.target[0], cam.target[1],
                cam.zoom, cam.visibleW, cam.visibleH, cam._maxX, cam._maxY];
            const orac = [O.ox, O.oy, O.otx, O.oty, O.zoom, O.visibleW, O.visibleH, O.maxX, O.maxY];
            for (let k = 0; k < real.length; k++) {
                if (diverged(real[k], orac[k])) {
                    die('T5.fuzz divergence: seed=' + seed + ' op#' + i + ' op=' + op +
                        ' field=' + fields[k] + ' real=' + real[k] + ' oracle=' + orac[k] +
                        '  replay: TORTURE_SEED=' + seed + ' node --expose-gc test/torture.mjs');
                }
            }
        }
    }
}
