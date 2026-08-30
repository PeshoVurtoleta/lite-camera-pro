/**
 * T1 -- degenerate input values. REWRITTEN for PRO2: the doors exist now.
 *
 * Every known-bad pin from PRO0 is FLIPPED to demand the fail-closed door, then
 * the full grid runs each entry point against the degenerate set
 * {NaN, +Infinity, -Infinity, -0, negative, 1e9, undefined-where-optional} and
 * pins the exact outcome: a named throw code, an exact no-op (pose deep-compared
 * unchanged), or an exact clamp. If any door were reverted, the matching check
 * here fails (anti-vacuity).
 */

import { CinematicCameraPro } from '../../src/index.js';
import {
    createShakeState, addShake, addTraumaSimple, updateShake, computeShake, getPreset,
} from '../../src/index.js';
import { check } from './harness.mjs';

/** Full observable pose. A rejected door must leave every field byte-identical. */
function poseOf(cam) {
    return [
        cam.pos[0], cam.pos[1], cam.target[0], cam.target[1],
        cam.look[0], cam.look[1], cam.zoom, cam.mode,
        cam.visibleW, cam.visibleH, cam._hasAnchor, cam._zoomTarget,
    ];
}

function samePose(before, after, label) {
    check(before.length === after.length, () => `${label}: pose length changed`);
    for (let i = 0; i < before.length; i++) {
        check(Object.is(before[i], after[i]),
            () => `${label}: field ${i} mutated (${String(before[i])} -> ${String(after[i])})`);
    }
}

function expectThrow(fn, code, label) {
    let got;
    let threw = false;
    try { fn(); } catch (e) { threw = true; got = e.code; }
    check(threw, () => `${label}: expected a throw, none happened`);
    check(got === code, () => `${label}: expected code ${code}, got ${String(got)}`);
}

/** A door that throws must mutate NOTHING (validate-all-before-mutate). */
function expectThrowNoop(cam, fn, code, label) {
    const before = poseOf(cam);
    expectThrow(() => fn(cam), code, label);
    samePose(before, poseOf(cam), label + ' (no mutation)');
}

const DEGEN = [NaN, Infinity, -Infinity];

export async function run() {
    // ========================================================================
    //  FLIPPED KNOWN-BAD PINS (PRO0 T1 -> PRO2 doors)
    // ========================================================================

    // --- CP-3: one NaN dt is now a no-op; the slot decays normally ----------
    {
        const s = createShakeState();
        addTraumaSimple(s, 0.8);
        const traumaBefore = s.slots[0].trauma;
        const timeBefore = s.slots[0].time;
        updateShake(s, NaN);                       // rejected: nothing advances
        check(s.slots[0].trauma === traumaBefore && s.slots[0].time === timeBefore,
            () => 'T1.CP-3: NaN dt frame must not advance the slot');
        for (let f = 0; f < 10000; f++) updateShake(s, 1 / 60);
        computeShake(s);
        check(s.active === false,
            () => 'T1.CP-3: slot must have decayed to inactive after 10k good frames');
        check(s.offsetX === 0 && s.offsetY === 0 && s.angle === 0,
            () => `T1.CP-3: offsets must be exactly zero, got ${s.offsetX}`);
    }

    // --- CP-4: a dt spike no longer diverges the position lerp --------------
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.setBoundsType(3); // BoundsType.NONE -- only the dt clamp bounds this
        for (let f = 0; f < 40; f++) cam.update(0.5, 1240, 900); // each clamps to 0.1
        check(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]),
            () => `T1.CP-4: pos must stay finite, got ${cam.pos[0]}`);
        check(Math.abs(cam.pos[0]) < 4000 && Math.abs(cam.pos[1]) < 4000,
            () => `T1.CP-4: pos must stay in the world envelope, got ${cam.pos[0]},${cam.pos[1]}`);
    }

    // --- CP-12a: setMode(99) throws at the SETTER (not frame N+1) -----------
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        expectThrowNoop(cam, (c) => c.setMode(99), 'ERR_CAMERA_MODE', 'T1.CP-12a setMode(99)');
        cam.update(1 / 60, 100, 100); // mode untouched -> update still works
        check(Number.isFinite(cam.pos[0]), () => 'T1.CP-12a: update must still work after rejected setMode');
    }

    // --- CP-12b: setState({zoom:0}) clamps to minZoom (documented, not err) --
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.setState({ zoom: 0 });
        check(cam.zoom === 0.25, () => `T1.CP-12b: zoom 0 must clamp to 0.25, got ${cam.zoom}`);
        check(cam.visibleW === 3200, () => `T1.CP-12b: visibleW must be 3200 at zoom 0.25, got ${cam.visibleW}`);
    }

    // --- CP-12c: setState({zoom:NaN}) throws and mutates nothing ------------
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        expectThrowNoop(cam, (c) => c.setState({ zoom: NaN }), 'ERR_CAMERA_STATE', 'T1.CP-12c setState zoom NaN');
    }

    // --- CP-12d: shakePreset(undefined) is a no-op returning this ----------
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        check(cam.shakePreset(undefined) === cam, () => 'T1.CP-12d: shakePreset(undefined) must return this');
        check(cam._shake.active === false, () => 'T1.CP-12d: shakePreset(undefined) must activate nothing');
        check(getPreset(42) === null, () => 'T1.CP-12d: getPreset(42) must be null');
        check(getPreset(undefined) === null, () => 'T1.CP-12d: getPreset(undefined) must be null');
        check(getPreset('nope') === null, () => 'T1.CP-12d: getPreset(unknown) must be null');
    }

    // ========================================================================
    //  dt POLICY GRID (update())
    // ========================================================================
    {
        // Reject values leave the FULL pose byte-identical (D-k).
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
        for (let f = 0; f < 30; f++) cam.update(1 / 60, 1000 + f, 800 + (f & 15)); // non-trivial state
        for (const bad of [...DEGEN, -0.5, -1e9]) {
            const before = poseOf(cam);
            cam.update(bad, 1000, 800); // must be a no-op, must NOT throw
            samePose(before, poseOf(cam), `T1.dt reject ${String(bad)}`);
        }
    }
    {
        // dt === maxDt passes UNCLAMPED and dt = 1e9 clamps to maxDt -> same pos.
        const cRef = new CinematicCameraPro(800, 600, 3200, 2400, 3);
        const cBig = new CinematicCameraPro(800, 600, 3200, 2400, 3);
        const startX = cRef.pos[0];
        cRef.update(0.1, 1240, 900);   // 0.1 == maxDt, unclamped
        cBig.update(1e9, 1240, 900);   // clamps to 0.1
        check(Object.is(cRef.pos[0], cBig.pos[0]) && Object.is(cRef.pos[1], cBig.pos[1]),
            () => `T1.dt clamp: 1e9 must land on the maxDt frame (${cRef.pos[0]} vs ${cBig.pos[0]})`);
        check(cRef.pos[0] !== startX,
            () => 'T1.dt clamp: a maxDt frame must actually advance pos (not a no-op)');
    }
    {
        // dt = 0 and -0 are legal no-advance frames: no throw, pos unchanged.
        for (const z of [0, -0]) {
            const cam = new CinematicCameraPro(800, 600, 3200, 2400, 5);
            cam.update(1 / 60, 1240, 900); // seed some pos
            const px = cam.pos[0], py = cam.pos[1];
            cam.update(z, 1240, 900); // legal; lerp term is dt*... = 0 -> pos frozen
            check(Object.is(cam.pos[0], px) && Object.is(cam.pos[1], py),
                () => `T1.dt zero(${Object.is(z, -0) ? '-0' : '0'}): pos must not advance`);
        }
    }
    {
        // A legal small dt is NOT a no-op: pos advances toward the target.
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 9);
        cam.update(0.05, 1240, 900);
        check(cam.pos[0] !== 0, () => 'T1.dt legal: dt=0.05 must advance pos');
    }

    // updateShake standalone door: reject-only, no clamp.
    {
        const s = createShakeState();
        addShake(s, { trauma: 0.5 });
        const tb = s.slots[0].trauma;
        for (const bad of [...DEGEN, -1]) {
            updateShake(s, bad);
            check(s.slots[0].trauma === tb, () => `T1.updateShake reject ${String(bad)}: trauma advanced`);
        }
    }

    // ========================================================================
    //  addShake PER-FIELD FINITENESS (every numeric, not just trauma)
    // ========================================================================
    {
        const fields = ['trauma', 'decay', 'freq', 'maxOffset', 'maxAngle', 'dirX', 'dirY'];
        for (const field of fields) {
            for (const bad of DEGEN) {
                const s = createShakeState();
                const profile = { trauma: 0.5, decay: 1, freq: 15, maxOffset: 15, maxAngle: 0.05, dirX: 0, dirY: 0 };
                profile[field] = bad;
                addShake(s, profile);
                check(s.active === false,
                    () => `T1.addShake: ${field}=${String(bad)} must activate no slot`);
                for (let i = 0; i < s.slotCount; i++) {
                    check(s.slots[i].active === false,
                        () => `T1.addShake: ${field}=${String(bad)} left slot ${i} active`);
                }
            }
        }
        // Non-finite intensity is equally fail-closed.
        for (const bad of DEGEN) {
            const s = createShakeState();
            addShake(s, { trauma: 0.5 }, bad);
            check(s.active === false, () => `T1.addShake: intensity=${String(bad)} must activate no slot`);
        }
    }

    // ========================================================================
    //  setMode GRID
    // ========================================================================
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        for (const bad of [...DEGEN, -1, 5, 2.5, 1e9, undefined]) {
            expectThrowNoop(cam, (c) => c.setMode(bad), 'ERR_CAMERA_MODE', `T1.setMode(${String(bad)})`);
        }
        check(cam.setMode(0) === cam && cam.setMode(4) === cam,
            () => 'T1.setMode: valid FollowMode values must be accepted');
    }

    // ========================================================================
    //  setZoom GRID
    // ========================================================================
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        for (const bad of DEGEN) {
            expectThrowNoop(cam, (c) => c.setZoom(bad), 'ERR_CAMERA_ZOOM', `T1.setZoom level ${String(bad)}`);
        }
        for (const bad of [...DEGEN, -1, -1e9]) {
            expectThrowNoop(cam, (c) => c.setZoom(2, bad), 'ERR_CAMERA_ZOOM', `T1.setZoom dur ${String(bad)}`);
        }
        cam.setZoom(-0);              // finite level -> clamps to minZoom, no throw
        check(cam.zoom === 0.25, () => `T1.setZoom(-0): must clamp to 0.25, got ${cam.zoom}`);
        cam.setZoom(2, 0);            // duration 0 stays instant
        check(cam.zoom === 2, () => 'T1.setZoom(2,0): instant zoom must apply');
    }

    // ========================================================================
    //  zoomAt GRID (static + object forms)
    // ========================================================================
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        // static form: bad anchor x, y, level, negative dur
        for (const bad of DEGEN) {
            expectThrowNoop(cam, (c) => c.zoomAt(bad, 300, 2, 0.5), 'ERR_CAMERA_ZOOM', `T1.zoomAt x ${String(bad)}`);
            expectThrowNoop(cam, (c) => c.zoomAt(500, bad, 2, 0.5), 'ERR_CAMERA_ZOOM', `T1.zoomAt y ${String(bad)}`);
            expectThrowNoop(cam, (c) => c.zoomAt(500, 300, bad, 0.5), 'ERR_CAMERA_ZOOM', `T1.zoomAt level ${String(bad)}`);
        }
        for (const bad of [-1, -1e9]) {
            expectThrowNoop(cam, (c) => c.zoomAt(500, 300, 2, bad), 'ERR_CAMERA_ZOOM', `T1.zoomAt dur ${String(bad)}`);
        }
        // object form: garbage anchor coords / level / negative dur
        expectThrowNoop(cam, (c) => c.zoomAt({ x: NaN, y: 0 }, 2, 0.5), 'ERR_CAMERA_ZOOM', 'T1.zoomAt obj x NaN');
        expectThrowNoop(cam, (c) => c.zoomAt({ x: 0, y: Infinity }, 2, 0.5), 'ERR_CAMERA_ZOOM', 'T1.zoomAt obj y Inf');
        expectThrowNoop(cam, (c) => c.zoomAt({ x: 0, y: 0 }, NaN, 0.5), 'ERR_CAMERA_ZOOM', 'T1.zoomAt obj level NaN');
        expectThrowNoop(cam, (c) => c.zoomAt({ x: 0, y: 0 }, 2, -1), 'ERR_CAMERA_ZOOM', 'T1.zoomAt obj dur neg');
        // valid animated calls still work
        check(cam.zoomAt(500, 300, 2, 0.5) === cam, () => 'T1.zoomAt static valid must work');
        check(cam.zoomAt({ x: 10, y: 20 }, 1.5, 0.5) === cam, () => 'T1.zoomAt object valid must work');
    }

    // ========================================================================
    //  setState GRID
    // ========================================================================
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        cam.update(1 / 60, 800, 600); // non-trivial pose
        expectThrowNoop(cam, (c) => c.setState(null), 'ERR_CAMERA_STATE', 'T1.setState(null)');
        expectThrowNoop(cam, (c) => c.setState(42), 'ERR_CAMERA_STATE', 'T1.setState(42)');
        expectThrowNoop(cam, (c) => c.setState({ posX: 5 }), 'ERR_CAMERA_STATE', 'T1.setState posX-only');
        expectThrowNoop(cam, (c) => c.setState({ posY: 5 }), 'ERR_CAMERA_STATE', 'T1.setState posY-only');
        expectThrowNoop(cam, (c) => c.setState({ targetX: 5 }), 'ERR_CAMERA_STATE', 'T1.setState targetX-only');
        expectThrowNoop(cam, (c) => c.setState({ posX: NaN, posY: 0 }), 'ERR_CAMERA_STATE', 'T1.setState posX NaN');
        expectThrowNoop(cam, (c) => c.setState({ zoom: Infinity }), 'ERR_CAMERA_STATE', 'T1.setState zoom Inf');
        expectThrowNoop(cam, (c) => c.setState({ mode: 99 }), 'ERR_CAMERA_STATE', 'T1.setState mode 99');
        expectThrowNoop(cam, (c) => c.setState({ mode: 2.5 }), 'ERR_CAMERA_STATE', 'T1.setState mode 2.5');
        // valid pose-only snapshot round-trips
        check(cam.setState({ posX: 1, posY: 2, targetX: 3, targetY: 4, zoom: 2, mode: 1 }) === cam,
            () => 'T1.setState: a valid full snapshot must apply');
        check(cam.pos[0] === 1 && cam.target[1] === 4 && cam.zoom === 2 && cam.mode === 1,
            () => 'T1.setState: valid snapshot fields must be written');
    }

    // ========================================================================
    //  trackMultiple / setTargetCount GRID
    // ========================================================================
    {
        const cam = new CinematicCameraPro(800, 600, 3200, 2400, 1);
        expectThrowNoop(cam, (c) => c.trackMultiple(null), 'ERR_CAMERA_TARGETS', 'T1.trackMultiple(null)');
        expectThrowNoop(cam, (c) => c.trackMultiple('x'), 'ERR_CAMERA_TARGETS', 'T1.trackMultiple(str)');
        expectThrowNoop(cam, (c) => c.trackMultiple([{ x: NaN, y: 0 }]), 'ERR_CAMERA_TARGETS', 'T1.trackMultiple NaN x');
        expectThrowNoop(cam, (c) => c.trackMultiple([{ x: 0, y: 0 }, null]), 'ERR_CAMERA_TARGETS', 'T1.trackMultiple null entry');
        expectThrowNoop(cam, (c) => c.trackMultiple([{ x: 0, y: Infinity }]), 'ERR_CAMERA_TARGETS', 'T1.trackMultiple Inf y');
        // empty array is legal (count 0)
        cam.trackMultiple([]);
        check(cam._mt.count === 0 && cam._mt.active === true, () => 'T1.trackMultiple([]): legal, count 0');
        // valid targets
        cam.trackMultiple([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
        check(cam._mt.count === 2, () => 'T1.trackMultiple: valid targets set count');

        for (const bad of [...DEGEN, -1, 2.5, 3, 1e9, undefined]) {
            expectThrow(() => cam.setTargetCount(bad), 'ERR_CAMERA_TARGETS', `T1.setTargetCount(${String(bad)})`);
        }
        check(cam.setTargetCount(0) === cam && cam._mt.count === 0, () => 'T1.setTargetCount(0) legal');
        check(cam.setTargetCount(2) === cam && cam._mt.count === 2, () => 'T1.setTargetCount(2) legal');
    }
}
