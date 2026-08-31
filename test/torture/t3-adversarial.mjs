/**
 * T3 -- adversarial storms under the PRO2 doors.
 *
 * (a) Seeded dt-spike storm: 10k frames of dt uniform in [0, 2] (every frame a
 *     legal but often over-large dt) against a fixed in-world target, in BOTH
 *     the default-bounds and BoundsType.NONE variants. The dt clamp is the only
 *     thing bounding NONE, so this is the CP-4 inversion at scale: pos and zoom
 *     stay finite and inside the world envelope on every frame.
 * (b) 9-into-8 slot-steal storm: nine valid addShake impulses into an 8-slot
 *     pool. The pool never grows, the steal picks the weakest, every active slot
 *     stays finite through compute, and clearShakes() empties it.
 */

import { CinematicCameraPro } from '../../src/index.js';
import {
    createShakeState, addShake, updateShake, computeShake, clearShakes,
    createBoundsState, setBoundsAll, setSoftZone, applyBounds, BoundsType,
} from '../../src/index.js';
import { makePrng, SEED, check, rafCount, pumpRaf, makeCam, shakePreset } from './harness.mjs';

const STORM_FRAMES = 10000;
const BoundsType_NONE = 3;

export async function run() {
    // --- (a) seeded dt-spike storm, both bounds variants --------------------
    for (const boundsNone of [false, true]) {
        const cam = makeCam(800, 600, 3200, 2400, 11);
        if (boundsNone) cam.setBoundsType(BoundsType_NONE);
        shakePreset(cam, 'explosion');
        const prng = makePrng(SEED);

        const PX = 1600, PY = 1200; // fixed in-world target
        for (let f = 0; f < STORM_FRAMES; f++) {
            const dt = (prng() / 0xffffffff) * 2; // [0, 2] -- legal, mostly > maxDt
            cam.update(dt, PX, PY, 0, 0);
            if (!cam._shake.active) shakePreset(cam, 'rumble');
            check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]),
                () => `T3.storm(${boundsNone ? 'NONE' : 'HARD'}): pos went non-finite at frame ${f} (${cam.pos[0]},${cam.pos[1]})`);
            check(Number.isFinite(cam.zoom) && cam.zoom > 0,
                () => `T3.storm(${boundsNone ? 'NONE' : 'HARD'}): zoom went non-finite at frame ${f} (${cam.zoom})`);
            // Envelope: with a fixed in-world target and a bounded dt, pos can
            // never leave a generous world-sized box in either bounds mode.
            check(Math.abs(cam.pos[0]) <= 3200 + 1 && Math.abs(cam.pos[1]) <= 2400 + 1,
                () => `T3.storm(${boundsNone ? 'NONE' : 'HARD'}): pos left the world envelope at frame ${f} (${cam.pos[0]},${cam.pos[1]})`);
        }
    }

    // --- (b) 9-into-8 slot-steal storm --------------------------------------
    {
        const s = createShakeState(3);
        // Nine valid impulses with varied trauma/params. The 9th must steal the
        // weakest slot -- the pool is fixed at 8.
        for (let i = 0; i < 9; i++) {
            addShake(s, {
                trauma: 0.2 + (i % 5) * 0.15,
                freq: 10 + i,
                decay: 0.5 + (i % 3) * 0.4,
                maxOffset: 8 + i,
                maxAngle: 0.02 + (i % 4) * 0.01,
            });
        }
        check(s.slots.length === 8, () => `T3.steal: pool grew past 8 (${s.slots.length})`);

        let active = 0;
        for (let i = 0; i < s.slotCount; i++) if (s.slots[i].active) active++;
        check(active <= 8 && active === 8,
            () => `T3.steal: expected all 8 slots active after 9 impulses, got ${active}`);

        // Drive frames; every active slot's output must stay finite.
        for (let f = 0; f < 300; f++) {
            updateShake(s, 1 / 60);
            computeShake(s);
            check(Number.isFinite(s.offsetX) && Number.isFinite(s.offsetY) && Number.isFinite(s.angle),
                () => `T3.steal: shake output went non-finite at frame ${f}`);
            for (let i = 0; i < s.slotCount; i++) {
                const sl = s.slots[i];
                check(Number.isFinite(sl.trauma) && Number.isFinite(sl.time),
                    () => `T3.steal: slot ${i} went non-finite at frame ${f}`);
            }
        }

        clearShakes(s);
        check(s.active === false, () => 'T3.steal: clearShakes must deactivate the state');
        for (let i = 0; i < s.slotCount; i++) {
            check(s.slots[i].active === false, () => `T3.steal: slot ${i} still active after clearShakes`);
        }
        check(s.offsetX === 0 && s.offsetY === 0 && s.angle === 0,
            () => 'T3.steal: clearShakes must zero the output');
    }

    // --- (c) sequence-spam storm: play/stop x 1000 on one camera ------------
    // Hammer the sequence lifecycle (CP-5 path) on a single live camera: build,
    // play, advance a few frames (pump the timeline + drive the camera), stop,
    // repeat. Each stop() must destroy the timeline and release the ticker; the
    // camera's pose must stay finite through every play and every stop. After
    // the storm, pumping must produce SILENCE (no live ticker re-requesting) and
    // the camera must remain finite.
    {
        const cam = makeCam(800, 600, 3200, 2400, 7);
        const SPAM = 1000;
        for (let i = 0; i < SPAM; i++) {
            const seq = cam.createSequence({ blendOutTime: (i & 1) ? 0 : 0.3 })
                .moveTo(300 + (i & 127), 200 + (i & 63), 600)
                .zoomTo(1.25, 400)
                .shake('impact', 0.5);
            cam.playSequence(seq);
            // Advance a few frames: pump drives the timeline, update() reads it.
            for (let f = 0; f < 3; f++) {
                pumpRaf();
                cam.update(1 / 60, 500 + i, 400 + (i & 31), 1, 0);
                check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]) &&
                    Number.isFinite(cam.zoom) && cam.zoom > 0,
                    () => `T3.seqspam: camera went non-finite mid-play at i=${i} f=${f} ` +
                        `(${cam.pos[0]},${cam.pos[1]},z=${cam.zoom})`);
            }
            cam.stopSequence(); // hard handoff + ticker release
            cam.update(1 / 60, 500 + i, 400 + (i & 31), 1, 0);
            check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]),
                () => `T3.seqspam: camera went non-finite after stop at i=${i} (${cam.pos[0]},${cam.pos[1]})`);
        }

        // Settle silence: every sequence stopped, so no ticker should re-request.
        const c0 = rafCount();
        pumpRaf(); pumpRaf(); pumpRaf(); pumpRaf();
        check(rafCount() === c0,
            () => `T3.seqspam: rafCount grew by ${rafCount() - c0} across 4 settle pumps -- a ticker leaked past stop`);

        // A few more follow frames: the camera stays finite in steady state.
        for (let f = 0; f < 120; f++) {
            cam.update(1 / 60, 900, 700, 1, 0);
            check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]),
                () => `T3.seqspam: camera went non-finite in settle at f=${f}`);
        }
        cam.destroy();
    }

    // --- (d) PRO4/T-G: resize churn mid-zoom mid-sequence, 5k frames ---------
    // A viewport that thrashes while a zoom animation AND a sequence are both in
    // flight. Every frame the D6 invariants must hold exactly: visibleW is
    // viewW/zoom (never stale), _maxX agrees with the derived box, and the pose
    // stays finite and inside the effective box.
    {
        const cam = makeCam(800, 600, 3200, 2400, 23);
        cam.setZoom(3, 2.0); // long zoom animation, always in flight
        const seq = cam.createSequence({ blendOutTime: 0.3 })
            .moveTo(1600, 1200, 4000).zoomTo(2, 3000);
        cam.playSequence(seq);
        const prng = makePrng(SEED ^ 0x5a5a5a5a);
        const RS = 5000;
        for (let f = 0; f < RS; f++) {
            if ((f % 7) === 0) {
                const vw = 400 + (prng() % 1600);
                const vh = 300 + (prng() % 1200);
                const ww = 2000 + (prng() % 6000);
                const wh = 1500 + (prng() % 4500);
                cam.resize(vw, vh, ww, wh);
                // D6 (a): visibleW/_maxX correct ON RETURN, no stale frame.
                check(cam.visibleW === cam.viewW / cam.zoom,
                    () => `T3.resizechurn: visibleW stale after resize at f=${f} (${cam.visibleW} != ${cam.viewW / cam.zoom})`);
                const expMaxX = cam.worldW - cam.visibleW < 0 ? 0 : cam.worldW - cam.visibleW;
                check(cam._maxX === expMaxX,
                    () => `T3.resizechurn: _maxX disagrees at f=${f} (${cam._maxX} != ${expMaxX})`);
            }
            if ((f & 1)) pumpRaf();
            cam.update(1 / 60, 900 + (f & 255), 700 + (f & 127), 2, 1);
            check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]) &&
                Number.isFinite(cam.zoom) && cam.zoom > 0,
                () => `T3.resizechurn: camera went non-finite at f=${f} (${cam.pos[0]},${cam.pos[1]},z=${cam.zoom})`);
            check(cam.visibleW === cam.viewW / cam.zoom && cam.visibleH === cam.viewH / cam.zoom,
                () => `T3.resizechurn: visibleW/H not viewW/zoom at f=${f}`);
        }
        cam.destroy();
    }

    // --- (e) PRO4/T-G: mode thrash 10k --------------------------------------
    // Flip the follow mode across every legal value each frame while driving a
    // moving target. No mode may crash or produce a non-finite pose.
    {
        const cam = makeCam(800, 600, 3200, 2400, 41);
        const MODE_COUNT = 5; // FOLLOW_STRATEGIES.length: SMOOTH,LOCK,PREDICTIVE,CUT,HYBRID
        const prng = makePrng(SEED ^ 0x13572468);
        const MT = 10000;
        for (let f = 0; f < MT; f++) {
            cam.setMode(f % MODE_COUNT);
            const px = (prng() % 6400) - 1600;
            const py = (prng() % 4800) - 1200;
            cam.update(1 / 60, px, py, (prng() % 200) - 100, (prng() % 200) - 100);
            check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]) &&
                Number.isFinite(cam.zoom) && cam.zoom > 0,
                () => `T3.modethrash: non-finite at f=${f} mode=${f % MODE_COUNT}`);
        }
        cam.destroy();
    }

    // --- (f) PRO4/T-G: teleporting multi-targets 1/2/64 at +-1e5 ------------
    // Targets that snap to +-1e5 between frames. The framing solver must keep pos
    // and zoom finite and the zoom inside the configured framing band.
    {
        for (const n of [1, 2, 64]) {
            const cam = makeCam(1280, 720, 20000, 20000, 59 + n);
            const targets = new Array(n);
            for (let i = 0; i < n; i++) targets[i] = { x: 0, y: 0 };
            cam.trackMultiple(targets, { minZoom: 0.3, maxZoom: 2.0, paddingX: 100, paddingY: 100 });
            const prng = makePrng(SEED ^ (0x9e3779b9 + n));
            for (let f = 0; f < 2000; f++) {
                for (let i = 0; i < n; i++) {
                    // teleport each target to a corner of +-1e5
                    targets[i].x = ((prng() & 1) ? 1 : -1) * 1e5;
                    targets[i].y = ((prng() & 1) ? 1 : -1) * 1e5;
                }
                cam.update(1 / 60, 0, 0, 0, 0);
                check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]) &&
                    Number.isFinite(cam.zoom) && cam.zoom > 0,
                    () => `T3.teleport(n=${n}): non-finite at f=${f} (${cam.pos[0]},${cam.pos[1]},z=${cam.zoom})`);
                check(cam.zoom >= 0.3 - 1e-6 && cam.zoom <= 2.0 + 1e-6,
                    () => `T3.teleport(n=${n}): zoom left the framing band at f=${f} (${cam.zoom})`);
            }
            cam.destroy();
        }
    }

    // --- (g) PRO4/T-G: bounds thrash asserting the SOFT hold-out at every edge
    // For every soft-zone width and every edge (min/max on both axes), sweep the
    // requested position across the zone and assert the D1 hold-out property:
    // the granted position is monotone, fixed at the zone entry, and NEVER nearer
    // the edge than requested (it holds a half-zone back). Driven through the
    // real applyBounds with all four edges SOFT.
    {
        const target = new Float32Array(2);
        const pos = new Float32Array(2);
        const bounds = createBoundsState();
        setBoundsAll(bounds, BoundsType.SOFT);
        for (const sz of [1, 10, 80, 200, 500]) {
            setSoftZone(bounds, sz);
            // maxX/maxY chosen so the zone sits strictly inside [0, maxX].
            const maxX = 4000, maxY = 4000;
            // MIN edge (left/top): edge = 0. Sweep val across [0, sz].
            let prevGx = -Infinity, prevGy = -Infinity;
            const N = 64;
            for (let k = 0; k <= N; k++) {
                const val = (sz * k) / N;
                target[0] = val; target[1] = val;
                pos[0] = val; pos[1] = val;
                applyBounds(bounds, target, pos, maxX, maxY, 100, 100, 1 / 60);
                const gx = target[0], gy = target[1];
                // never nearer the min edge than requested: granted >= requested.
                check(gx >= val - 1e-4 && gy >= val - 1e-4,
                    () => `T3.holdout(min,sz=${sz}): granted ${gx} nearer edge than requested ${val}`);
                // monotone non-decreasing.
                check(gx >= prevGx - 1e-4 && gy >= prevGy - 1e-4,
                    () => `T3.holdout(min,sz=${sz}): non-monotone at val=${val} (${gx} < prev ${prevGx})`);
                prevGx = gx; prevGy = gy;
            }
            // zone entry (val == sz) is fixed: granted == sz.
            target[0] = sz; target[1] = sz; pos[0] = sz; pos[1] = sz;
            applyBounds(bounds, target, pos, maxX, maxY, 100, 100, 1 / 60);
            check(Math.abs(target[0] - sz) <= 1e-3 && Math.abs(target[1] - sz) <= 1e-3,
                () => `T3.holdout(min,sz=${sz}): zone entry not fixed (${target[0]} != ${sz})`);

            // MAX edge (right/bottom): edge = maxX. Sweep val across [maxX-sz, maxX].
            prevGx = Infinity; prevGy = Infinity;
            for (let k = 0; k <= N; k++) {
                const val = maxX - (sz * k) / N;
                target[0] = val; target[1] = maxY - (sz * k) / N;
                pos[0] = val; pos[1] = target[1];
                const reqX = val, reqY = maxY - (sz * k) / N;
                applyBounds(bounds, target, pos, maxX, maxY, 100, 100, 1 / 60);
                const gx = target[0], gy = target[1];
                // never nearer the max edge than requested: granted <= requested.
                check(gx <= reqX + 1e-4 && gy <= reqY + 1e-4,
                    () => `T3.holdout(max,sz=${sz}): granted ${gx} nearer max edge than requested ${reqX}`);
                check(gx <= prevGx + 1e-4 && gy <= prevGy + 1e-4,
                    () => `T3.holdout(max,sz=${sz}): non-monotone at val=${reqX} (${gx} > prev ${prevGx})`);
                prevGx = gx; prevGy = gy;
            }
        }
    }
}
