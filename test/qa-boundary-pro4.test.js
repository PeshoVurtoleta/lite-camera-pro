// =============================================================================
// qa-boundary-pro4.test.js -- QA-authored coverage closing gaps found while
// independently verifying PRO4's assertions (v2.1.0, "subsystem truth": CP-6
// SOFT bounds, CP-7 zoom-aware resize, CP-9 base-shake bridge, CP-10a parallax
// wrap, CP-20 re-entrant destroy, CP-24 completion release, CP-25 shake(null)
// door, CP-26 bounds-type doors). Traceability check (done before writing a
// single test here): the coder/reviewer suites (t1/t3/t4/t5/t6/t7/t8/t9,
// regressions.test.js, Subsystems.test.js) pin the ten planner assertions at
// the subsystem level with the exact P4/P8/P10/wrap numbers; this file closes
// the boundary matrix the planner's own suites do not literally pin -- two
// owner-suspicion probes, SOFT-zone overlap geometry, degenerate softZone,
// bridge order-independence, wrap exactness at k*tile, resize seams (mid-anim,
// identical dims, mid-sequence-play, custom-rect+zoom4), CP-20 breadth beyond
// the zoom-ease site, the completion-release+blend handshake end to end, and
// the door boundary table. Not a duplicate of any existing test -- checked
// against test/regressions.test.js, test/Subsystems.test.js, and every
// test/torture/t*.mjs file before writing.
//
// Every assertion here is PROBED FIRST (see the qa report for the node -e
// transcripts) so it pins MEASURED behavior. One probe surfaced a real defect
// (Section A, OWNER SUSPICION 1); that test pins the CURRENT (surprising)
// behavior with a FINDING comment and reports it -- src/ is never touched by
// this file. Section B confirms OWNER SUSPICION 2 did NOT reproduce (no
// spurious blend), pinned as a confirmed-clean regression guard.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CinematicCameraPro, FollowMode, BoundsType } from '../src/index.js';
import {
    createBoundsState, setBoundsAll, setSoftZone, applyBounds,
} from '../src/BoundsSystem.js';
import {
    createParallaxState, addParallaxLayer, updateParallax, WrapMode,
} from '../src/ParallaxManager.js';
import { withSequences, createCameraSequence } from '../src/CameraSequence.js';
import { pumpRaf, rafCount, makeCam } from './helpers.mjs';

function pumpToCompletion(seq, guard = 20000) {
    while (seq.playing && guard-- > 0) pumpRaf();
    return seq.playing === false;
}

// =============================================================================
// Section A -- OWNER SUSPICION 1 (probe-first): accessor destroy-safety.
//
// FINDING QA-3 (severity: S2, contract violation, not a crash). destroy()
// rebinds a curated list of METHODS as own-property `_dead` sentinels
// (CinematicCameraPro.js ~:1354-1361), documented as "EVERY public method
// throws ERR_CAMERA_DESTROYED". shakeTrauma/shakeMaxOffset/shakeMaxAngle are
// prototype ACCESSORS, not in that list, and cannot be rebound the same way
// (an own-property assignment on a prototype-accessor-backed name goes through
// the SETTER, not a plain field write). MEASURED: post-destroy,
//   - reading cam.shakeTrauma does NOT throw -- it silently returns 0 (the
//     getter's `_baseSlot()` helper treats `shake == null` as "no active
//     default slot", which is indistinguishable from "no shake firing").
//   - reading cam.shakeMaxOffset / cam.shakeMaxAngle does NOT throw -- it
//     silently returns the STALE last-written value (backed by cold instance
//     fields that destroy() never nulls), e.g. 15 (the constructor default) on
//     a camera that was never shaken.
//   - WRITING any of the three DOES throw ERR_CAMERA_SHAKE... via the wrong
//     code: `set shakeTrauma`/`shakeMaxOffset`/`shakeMaxAngle` each guard with
//     `if (this._shake === null) _dead();` BEFORE the finiteness check, so the
//     write correctly throws ERR_CAMERA_DESTROYED (not a raw TypeError) --
//     writes are safe. Only READS silently lie.
// Net effect: a destroyed camera's shake accessors are read-safe-but-wrong
// (stale/zero) and write-safe-and-honest (ERR_CAMERA_DESTROYED) -- an
// asymmetry that contradicts the destroy() JSDoc's "EVERY public method"
// claim for exactly these three names. Reported as a ledger finding; NOT
// patched here (src/ is out of scope for qa).
// =============================================================================

// fixed same-session, QA-3
test('QA-3 (fixed same-session): post-destroy, shakeTrauma/shakeMaxOffset/shakeMaxAngle READS throw ERR_CAMERA_DESTROYED, symmetric with the setters', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.shakeMaxOffset = 42;
    cam.destroy();

    // FIXED (QA-3): each getter now opens with `if (this._shake === null) _dead();`
    // just like its setter, so a destroyed camera fails closed on reads too.
    assert.throws(() => cam.shakeTrauma, { code: 'ERR_CAMERA_DESTROYED' }, 'reading shakeTrauma post-destroy throws ERR_CAMERA_DESTROYED');
    assert.throws(() => cam.shakeMaxOffset, { code: 'ERR_CAMERA_DESTROYED' }, 'reading shakeMaxOffset post-destroy throws ERR_CAMERA_DESTROYED');
    assert.throws(() => cam.shakeMaxAngle, { code: 'ERR_CAMERA_DESTROYED' }, 'reading shakeMaxAngle post-destroy throws ERR_CAMERA_DESTROYED');

    // Writes remain safe and honest -- the setters already guarded.
    assert.throws(() => { cam.shakeTrauma = 0.5; }, { code: 'ERR_CAMERA_DESTROYED' }, 'writing shakeTrauma post-destroy throws');
    assert.throws(() => { cam.shakeMaxOffset = 99; }, { code: 'ERR_CAMERA_DESTROYED' }, 'writing shakeMaxOffset post-destroy throws');
    assert.throws(() => { cam.shakeMaxAngle = 0.9; }, { code: 'ERR_CAMERA_DESTROYED' }, 'writing shakeMaxAngle post-destroy throws');
});

// =============================================================================
// Section B -- OWNER SUSPICION 2 (probe-first, CONFIRMED NOT A DEFECT):
// inert zero-step sequence never arms a spurious blend. Because CP-24/D4 fixed
// play() at the source (zero steps -> documented no-op, seq.playing stays
// false, seq._state.active stays false, seq._state.blend stays 0), the
// completion-cleanup branch's discriminator `seq && !seq.playing` is true on
// the VERY FIRST post-playSequence() update -- but it reads seq._state.blend,
// which was NEVER armed (only the timeline's onComplete wrapper arms it, and
// an inert sequence never builds a timeline). _blendRemain stays exactly 0;
// no glide occurs. Pinned as a regression guard, not a finding.
// =============================================================================

test('confirmed clean: zero-step createCameraSequence + playSequence() arms NO spurious blend', () => {
    const cam = makeCam(800, 600, 3200, 2400, 7);
    cam.setMode(FollowMode.PREDICTIVE);
    const seq = createCameraSequence(cam, { blendOutTime: 0.3 }); // zero steps
    assert.equal(seq.playing, false, 'zero-step sequence never plays');

    cam.playSequence(seq);
    assert.equal(cam._blendRemain, 0, 'playSequence() itself must not arm a blend');

    const before = { x: cam.pos[0], y: cam.pos[1] };
    cam.update(1 / 60, 400, 300, 0, 0);
    assert.equal(cam._blendRemain, 0, 'MEASURED: no spurious blend arms from an inert zero-step sequence');
    assert.equal(cam.pos[0], before.x, 'pos unaffected on the frame after an inert playSequence()');
    assert.equal(cam.pos[1], before.y, 'pos unaffected on the frame after an inert playSequence()');
    cam.destroy();
});

// =============================================================================
// Section C -- SOFT overlap geometry: a bounds box narrower than 2*softZone
// (opposing soft zones overlap). MEASURED (subsystem level, applyBounds
// direct, box [0, 100], softZone 80 -- left and right SOFT edges overlap by
// 60 px): _applyEdge processes left THEN right, and because both mutate the
// SAME target[axis] in sequence, the right edge's compression operates on the
// LEFT edge's already-adjusted value when both zones are entered -- a
// compounding effect unique to the overlap case. Monotone across the full
// sweep and every grant stays strictly inside [0, 100].
// =============================================================================

test('SOFT overlap geometry (box narrower than 2*softZone): monotone, in-box, exact numbers for dead-center and off-center targets', () => {
    const state = createBoundsState();
    setBoundsAll(state, BoundsType.SOFT);
    state.softZone = 80;
    const maxX = 100;

    function grant(val) {
        const target = new Float32Array([val, 0]);
        const pos = new Float32Array([val, 0]);
        applyBounds(state, target, pos, maxX, 1000, 50, 50, 1 / 60);
        return target[0];
    }

    const sweep = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(grant);
    // Monotone non-decreasing across the whole sweep.
    for (let i = 1; i < sweep.length; i++) {
        assert.ok(sweep[i] >= sweep[i - 1], 'overlap grant must stay monotone: ' + sweep[i - 1] + ' -> ' + sweep[i]);
    }
    // Every grant lands strictly inside the legal [0, 100] box.
    for (const g of sweep) {
        assert.ok(g >= 0 && g <= 100, 'overlap grant ' + g + ' must stay inside [0, 100]');
    }

    // Exact pinned numbers: val=0 (extreme low, left-then-right compounding),
    // val=50 (dead-center), val=100 (extreme high).
    assert.equal(grant(0), 37.5, 'MEASURED: overlap grant at val=0 (left edge, compounded by the right edge pass)');
    assert.equal(grant(50), 47.69287109375, 'MEASURED: overlap grant at val=50 (dead-center)');
    assert.equal(grant(100), 60, 'MEASURED: overlap grant at val=100 (right edge, compounded by the left edge pass)');
});

// =============================================================================
// Section D -- softZone = 0 degenerates to HARD exactly (D1's for-free claim,
// executable); setSoftZone doors (NaN/-1/Infinity/-Infinity -> ERR_CAMERA_BOUNDS,
// state unchanged); setSoftZone(0) accepted.
// =============================================================================

test('softZone = 0 degenerates to HARD exactly, at the extreme, inside, and outside the box', () => {
    const soft = createBoundsState();
    setBoundsAll(soft, BoundsType.SOFT);
    setSoftZone(soft, 0);
    const hard = createBoundsState(); // default HARD on all edges

    function grant(state, val, maxX) {
        const target = new Float32Array([val, 0]);
        const pos = new Float32Array([val, 0]);
        applyBounds(state, target, pos, maxX, 1000, 50, 50, 1 / 60);
        return target[0];
    }

    for (const val of [-5, 5, 1005]) {
        assert.equal(grant(soft, val, 1000), grant(hard, val, 1000),
            'softZone=0 must degenerate to byte-identical HARD grants at val=' + val);
    }
    assert.equal(grant(soft, -5, 1000), 0, 'softZone=0, val below min -> clamps exactly to the edge (0)');
    assert.equal(grant(soft, 1005, 1000), 1000, 'softZone=0, val above max -> clamps exactly to the edge (1000)');
});

test('setSoftZone doors: NaN/-1/Infinity/-Infinity throw ERR_CAMERA_BOUNDS with state unchanged; 0 is accepted', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    const before = cam._bounds.softZone;
    for (const bad of [NaN, -1, Infinity, -Infinity]) {
        assert.throws(() => cam.setSoftZone(bad), { code: 'ERR_CAMERA_BOUNDS' }, 'setSoftZone(' + bad + ') must throw ERR_CAMERA_BOUNDS');
        assert.equal(cam._bounds.softZone, before, 'a rejected setSoftZone(' + bad + ') must leave softZone unchanged');
    }
    assert.doesNotThrow(() => cam.setSoftZone(0), 'setSoftZone(0) must be legal');
    assert.equal(cam._bounds.softZone, 0);
    cam.destroy();
});

// =============================================================================
// Section E -- Bridge order-independence (D3). Setting shakeMaxOffset then
// shakeTrauma, or the reverse, must produce IDENTICAL first-frame offsets;
// writing a max field alone must fire nothing; addTrauma interplay (accumulate);
// shakeTrauma reads 0 while only a non-default profile shake is active.
// =============================================================================

function mkCtx() {
    const calls = [];
    return {
        calls,
        translate(x, y) { calls.push(['t', x, y]); },
        rotate(a) { calls.push(['r', a]); },
        scale(x, y) { calls.push(['s', x, y]); },
    };
}

test('bridge order-independence: shakeMaxOffset then shakeTrauma vs the reverse produce identical first-frame offsets', () => {
    const camA = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    camA.shakeMaxOffset = 60;
    camA.shakeTrauma = 1;
    const ctxA = mkCtx();
    camA.apply(ctxA);

    const camB = new CinematicCameraPro(800, 600, 3200, 2400, 7); // same seed -> same noise
    camB.shakeTrauma = 1;
    camB.shakeMaxOffset = 60;
    const ctxB = mkCtx();
    camB.apply(ctxB);

    assert.deepEqual(ctxA.calls[0], ctxB.calls[0], 'first translate() must be identical regardless of write order');
    camA.destroy();
    camB.destroy();
});

test('writing shakeMaxOffset alone fires nothing; a max field read-before-any-trauma returns what was written', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.shakeMaxOffset = 60;
    assert.equal(cam._shake.active, false, 'writing a max field alone must not activate the shake state');
    assert.equal(cam._shake.slots.filter((s) => s.active).length, 0, 'writing a max field alone must acquire no slot');
    assert.equal(cam.shakeMaxOffset, 60, 'a max field read-before-any-trauma must return exactly what was written');
    cam.destroy();
});

test('addTrauma() interplay: shakeTrauma reads the accumulated total, not an assignment', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.addTrauma(0.4);
    assert.equal(cam.shakeTrauma, 0.4, 'first addTrauma(0.4) -> shakeTrauma reads 0.4');
    cam.addTrauma(0.4);
    assert.equal(cam.shakeTrauma, 0.8, 'second addTrauma(0.4) accumulates -> shakeTrauma reads 0.8 (not reset to 0.4)');
    cam.destroy();
});

test('shakeTrauma reads 0 while only a NON-default profile shake is active (the bridge only sees the default omni slot)', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.shake({ trauma: 0.9, maxOffset: 20 });
    assert.equal(cam._shake.active, true, 'a profile shake must be active at the engine level');
    assert.equal(cam.shakeTrauma, 0, 'MEASURED: the base-style accessor reads 0 -- it only bridges the DEFAULT slot, never a profile slot');
    cam.destroy();
});

// =============================================================================
// Section F -- Wrap exactness (D2). scroll exactly k*tile reads 0 (never -0,
// checked via Object.is); negative scroll wraps positive; update-existing-
// layer to REPEAT without tile -> ERR_PARALLAX_TILE, previous config intact;
// tile on a NONE layer is stored but inert.
// =============================================================================

test('wrap exactness: scroll exactly k*tile reads 0 (Object.is-checked, never -0) for k in {-2,-1,0,1,2,3}', () => {
    const st = createParallaxState();
    addParallaxLayer(st, 'bg', 1, 1, { wrap: WrapMode.REPEAT_X, tileW: 256 });
    const layer = st.layers.find((l) => l.id === 'bg');

    for (const k of [-2, -1, 0, 1, 2, 3]) {
        updateParallax(st, k * 256, 0, 1); // speed 1, zoom 1, offsetX 0 -> scrollX = camX
        assert.equal(layer.scrollX, 0, 'k*tile (k=' + k + ') must wrap to exactly 0');
        assert.equal(Object.is(layer.scrollX, -0), false, 'k*tile (k=' + k + ') must never read -0');
    }

    updateParallax(st, 3 * 256 + 7, 0, 1);
    assert.equal(layer.scrollX, 7, '3*tileW+7 must wrap to exactly 7');

    updateParallax(st, -9, 0, 1);
    assert.equal(layer.scrollX, 247, 'negative scroll -9 must wrap positive to exactly 247 (256-9)');
});

test('update-existing-layer to REPEAT without a tile size throws ERR_PARALLAX_TILE and leaves the layer config intact', () => {
    const st = createParallaxState();
    addParallaxLayer(st, 'sky', 0.5, 0.5, {});
    const before = JSON.stringify(st.layers.find((l) => l.id === 'sky'));

    assert.throws(() => addParallaxLayer(st, 'sky', 0.7, 0.7, { wrap: WrapMode.REPEAT_X }),
        { code: 'ERR_PARALLAX_TILE' }, 'update-existing to REPEAT_X without tileW must throw ERR_PARALLAX_TILE');

    const after = JSON.stringify(st.layers.find((l) => l.id === 'sky'));
    assert.equal(before, after, 'a rejected update-existing must leave the layer byte-identical (speedX/speedY untouched too)');
});

test('a tile size on a NONE-wrap layer is stored but inert (no wrapping applied)', () => {
    const st = createParallaxState();
    addParallaxLayer(st, 'fg', 1, 1, { tileW: 100, tileH: 50 }); // wrap defaults to NONE
    const layer = st.layers.find((l) => l.id === 'fg');
    assert.equal(layer.tileW, 100, 'tileW is stored even though wrap is NONE');
    assert.equal(layer.tileH, 50, 'tileH is stored even though wrap is NONE');
    assert.equal(layer.wrap, WrapMode.NONE);

    updateParallax(st, 999999, 999999, 1);
    assert.equal(layer.scrollX, 999999, 'NONE layer scrollX is NOT wrapped despite a stored tileW');
    assert.equal(layer.scrollY, 999999, 'NONE layer scrollY is NOT wrapped despite a stored tileH');
});

// =============================================================================
// Section G -- Resize seams (D6/CP-7).
// =============================================================================

test('resize mid-zoom-animation: the animation CONTINUES across the resize, no yank, no reset', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.setZoom(2, 1.0); // 1-second animation
    cam.update(0.3, 400, 300, 0, 0);
    const zoomBefore = cam.zoom;
    const durBefore = cam._zoomDur;
    assert.ok(zoomBefore > 1 && zoomBefore < 2, 'must be mid-zoom-animation before the resize');

    cam.resize(1000, 700, 3200, 2400);
    assert.equal(cam.zoom, zoomBefore, 'resize() must not perturb the in-flight zoom value');
    assert.equal(cam._zoomDur, durBefore, 'resize() must not reset the zoom-animation duration/elapsed state');

    cam.update(0.1, 400, 300, 0, 0);
    assert.ok(cam.zoom > zoomBefore, 'the zoom animation must keep advancing on the next frame after a mid-anim resize');
    cam.destroy();
});

test('resize to identical dims is a byte-clean no-op (pos, target, visibleW/H, _maxX/_maxY all unchanged)', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.update(1 / 60, 400, 300, 0, 0);
    const before = JSON.stringify({ pos: [...cam.pos], target: [...cam.target], visibleW: cam.visibleW, visibleH: cam.visibleH, maxX: cam._maxX, maxY: cam._maxY });

    cam.resize(800, 600, 3200, 2400);
    const after = JSON.stringify({ pos: [...cam.pos], target: [...cam.target], visibleW: cam.visibleW, visibleH: cam.visibleH, maxX: cam._maxX, maxY: cam._maxY });

    assert.equal(before, after, 'an identical-dims resize must be a byte-clean no-op');
    cam.destroy();
});

test('resize while a sequence PLAYS: pos is owned by the timeline -- resize re-clamps the pre-frame pos, but the NEXT update overwrites it from seq._state (resize does not perturb the sequence itself)', () => {
    const cam = withSequences(new CinematicCameraPro(800, 600, 3200, 2400, 7));
    const seq = cam.createSequence({ blendOutTime: 0 }).moveTo(2000, 1500, 10000);
    cam.playSequence(seq);
    for (let i = 0; i < 20; i++) pumpRaf();
    cam.update(1 / 60, 0, 0, 0, 0); // drive pos/target from the mid-play seq state

    const preX = cam.pos[0], preY = cam.pos[1];
    const seqX = seq._state.x, seqY = seq._state.y;
    assert.ok(seq.playing, 'sequence must still be mid-play before the resize');

    cam.resize(400, 300, 3200, 2400); // shrink viewport mid-play
    assert.equal(cam.pos[0], preX, 'MEASURED: resize leaves an in-box pos numerically unchanged (clampToBounds is a no-op here)');
    assert.equal(cam.pos[1], preY);
    assert.equal(seq._state.x, seqX, 'resize() must never touch the sequence timeline\'s own world-space state');
    assert.equal(seq._state.y, seqY);

    cam.update(1 / 60, 0, 0, 0, 0); // the very next seq-path update is authoritative
    // cam.pos/target are Float32Array -- every write through them rounds to
    // float32, so the expected side must go through the same Math.fround
    // rounding (a raw float64 comparison is a TEST bug, not a src defect).
    assert.equal(cam.pos[0], Math.fround(seq._state.x - cam.visibleW * 0.5), 'the sequence path overwrites pos from its own state using the NEW post-resize visibleW');
    assert.equal(cam.pos[1], Math.fround(seq._state.y - cam.visibleH * 0.5));
    assert.equal(cam.pos[0], cam.target[0], 'the sequence path always sets pos === target exactly (same Float32Array bit pattern)');
    assert.equal(cam.pos[1], cam.target[1]);
    cam.destroy();
});

test('resize + custom rect + zoom 4: HARD-clamps target and pos into the zoom-aware custom-rect box', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.setBoundsRect(500, 500, 1000, 800);
    cam.setZoom(4);
    cam.update(1 / 60, 700, 700, 0, 0);

    cam.resize(400, 300, 3200, 2400);
    // visW = viewW/zoom = 400/4 = 100; maxBX = boundsX(500) + boundsW(1000) - visW(100) = 1400.
    assert.equal(cam.visibleW, 100, 'zoom-aware visibleW must be viewW/zoom on return');
    assert.equal(cam.visibleH, 75, 'zoom-aware visibleH must be viewH/zoom on return');
    assert.ok(cam.pos[0] >= 500 && cam.pos[0] <= 1400, 'pos.x must land inside the custom-rect zoom-aware box [500, 1400]');
    assert.ok(cam.target[0] >= 500 && cam.target[0] <= 1400, 'target.x must land inside the custom-rect zoom-aware box [500, 1400]');
    cam.destroy();
});

// =============================================================================
// Section H -- CP-20 breadth: destroy from the ease (clean abort, next update
// throws ERR_CAMERA_DESTROYED), destroy from a sequence .call(fn) step, and
// destroy from a sequence onComplete callback (named error or clean no-op,
// never raw, in all three sites).
// =============================================================================

test('CP-20: destroy() from the zoom-ease callback -- the SAME frame aborts cleanly, the NEXT update() throws the named error', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.setZoom(2, 0.5, (t) => { cam.destroy(); return t; });

    assert.doesNotThrow(() => cam.update(0.1, 0, 0, 0, 0), 'the frame that re-entrantly destroys must abort cleanly, not raw-crash');
    assert.throws(() => cam.update(0.1, 0, 0, 0, 0), { code: 'ERR_CAMERA_DESTROYED' }, 'the NEXT update() after a re-entrant destroy must throw the named error');
});

test('CP-20 breadth: destroy() from inside a sequence .call(fn) step never raw-crashes the driving pump', () => {
    const cam = withSequences(new CinematicCameraPro(800, 600, 3200, 2400, 7));
    let destroyed = false;
    const seq = cam.createSequence().moveTo(100, 100, 10).call(() => { cam.destroy(); destroyed = true; }, { at: 0 });
    cam.playSequence(seq);

    assert.doesNotThrow(() => pumpRaf(), 'a pump that runs a destroy()-ing .call(fn) step must not raw-crash');
    assert.equal(destroyed, true, 'the re-entrant destroy() must actually have run synchronously');
    assert.throws(() => cam.update(1 / 60, 0, 0, 0, 0), { code: 'ERR_CAMERA_DESTROYED' }, 'the camera must be fully, honestly destroyed afterward');
});

test('CP-20 breadth: destroy() from a sequence onComplete callback never raw-crashes the pump-to-completion loop', () => {
    const cam = withSequences(new CinematicCameraPro(800, 600, 3200, 2400, 7));
    let completeCalls = 0;
    const seq = cam.createSequence({ blendOutTime: 0.2, onComplete: () => { completeCalls++; cam.destroy(); } }).moveTo(100, 100, 10);
    cam.playSequence(seq);

    assert.doesNotThrow(() => { pumpToCompletion(seq); }, 'pumping a sequence whose onComplete destroys the owning camera must not raw-crash');
    assert.equal(completeCalls, 1, 'onComplete must have fired exactly once');
    assert.equal(seq.playing, false, 'the sequence itself must be fully complete');
    assert.throws(() => cam.update(1 / 60, 0, 0, 0, 0), { code: 'ERR_CAMERA_DESTROYED' }, 'the camera must be honestly destroyed after onComplete destroyed it');
});

// =============================================================================
// Section I -- Completion-release + blend end to end: 1-step seq with
// blendOutTime 0.3 -> pump to completion -> release happens (RAF quiet) AND
// the blend still glides to rest over exactly 0.3s, landing exactly on the
// follow target (read-before-stop preserved end to end).
// =============================================================================

test('completion-release + blend end to end: RAF goes quiet AND the blend still glides to an exact landing over 0.3s', () => {
    const DT = 1 / 60;
    const cam = makeCam(800, 600, 3200, 2400, 9);
    cam.setMode(FollowMode.PREDICTIVE);
    const seq = cam.createSequence({ blendOutTime: 0.3 }).moveTo(500, 400, 100);
    cam.playSequence(seq);
    assert.ok(pumpToCompletion(seq), 'sequence must complete under the pump');

    cam.update(DT, 100, 100, 0, 0); // the release-cleanup frame
    assert.equal(cam._seq, null, 'the completed sequence ref must be released on the first post-completion update');
    assert.ok(cam._blendRemain > 0.28 && cam._blendRemain <= 0.3,
        'blend must be armed from the FULL 0.3 budget, read before the duck-typed stop() zeroed state.blend');

    // RAF quiet in the settle window: the ticker was already released.
    let quiet = true;
    for (let i = 0; i < 5; i++) {
        const before = rafCount();
        pumpRaf();
        if (rafCount() > before) quiet = false;
    }
    assert.equal(quiet, true, 'RAF must stay quiet in the settle window after the completion-cleanup release');

    // The blend still glides to rest over exactly 0.3s (18 frames at 1/60) and
    // lands EXACTLY on the follow target.
    let frames = 0;
    while (cam._blendRemain > 0 && frames < 100) { cam.update(DT, 100, 100, 0, 0); frames++; }
    assert.equal(frames, Math.round(0.3 / DT), 'the blend must take exactly 0.3s worth of frames to land');
    assert.ok(Object.is(cam.pos[0], cam.target[0]) && Object.is(cam.pos[1], cam.target[1]),
        'the blend must land EXACTLY on the follow target (read-before-stop preserved end to end)');
    seq.destroy();
    cam.destroy();
});

// =============================================================================
// Section J -- Doors: shake(null)/shake(undefined) no-op returns this;
// shake('boom')/shake(7)/shake([]) -> ERR_SHAKE_PROFILE; setBoundsEdges({left:1,
// right:999}) leaves left unchanged (validate-before-mutate); setBoundsType(999)
// leaves state unchanged; the getPreset guarded idiom stays valid on Pro.
// =============================================================================

test('shake(null)/shake(undefined) are a documented no-op that returns `this`; garbage profiles throw ERR_SHAKE_PROFILE', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    assert.equal(cam.shake(null), cam, 'shake(null) must return `this`');
    assert.equal(cam.shake(undefined), cam, 'shake(undefined) must return `this`');
    assert.equal(cam._shake.active, false, 'neither null nor undefined must fire anything');

    for (const v of ['boom', 7, []]) {
        assert.throws(() => cam.shake(v), { code: 'ERR_SHAKE_PROFILE' }, 'shake(' + JSON.stringify(v) + ') must throw ERR_SHAKE_PROFILE');
    }
    cam.destroy();
});

test('setBoundsEdges({left:1, right:999}) is validate-before-mutate: rejects the whole call, left stays unchanged', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    const before = { left: cam._bounds.left, right: cam._bounds.right };
    assert.throws(() => cam.setBoundsEdges({ left: 1, right: 999 }), { code: 'ERR_CAMERA_BOUNDS' });
    assert.equal(cam._bounds.left, before.left, 'left must be UNCHANGED even though 1 alone is a valid BoundsType -- the whole call is rejected first');
    assert.equal(cam._bounds.right, before.right, 'right must also be unchanged (nothing was mutated)');
    cam.destroy();
});

test('setBoundsType(999) throws ERR_CAMERA_BOUNDS and leaves all four edges unchanged', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    const before = { l: cam._bounds.left, r: cam._bounds.right, t: cam._bounds.top, b: cam._bounds.bottom };
    assert.throws(() => cam.setBoundsType(999), { code: 'ERR_CAMERA_BOUNDS' });
    assert.equal(cam._bounds.left, before.l);
    assert.equal(cam._bounds.right, before.r);
    assert.equal(cam._bounds.top, before.t);
    assert.equal(cam._bounds.bottom, before.b);
    cam.destroy();
});

test('D4 migration idiom stays valid alongside the CP-25 door: getPreset guard is optional now, never wrong', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    // Old guarded idiom (still correct, guard now optional):
    const p = null; // simulates getPreset() returning null for an unknown name
    assert.doesNotThrow(() => { if (p) cam.shake(p, 1); }, 'the guarded idiom must still be a documented no-op path');
    assert.equal(cam._shake.active, false);
    // New unguarded idiom (now also legal, per the CP-25 door):
    assert.doesNotThrow(() => cam.shake(p, 1), 'calling shake(null, intensity) directly (no guard) must also be a documented no-op now');
    cam.destroy();
});

// =============================================================================
// Section K -- boundary matrix: parallax layer count 0 / 1 / N-1 / N / N+1
// (MAX_LAYERS = 16, a genuinely new entry point via tileW/tileH/wrap opts).
// =============================================================================

test('boundary matrix: parallax layer count 0 / 1 / N-1(15) / N(16) / N+1(17th silently declines, activeCount caps at 16)', () => {
    const st = createParallaxState();
    assert.equal(st.activeCount, 0, '0: a fresh ParallaxState has zero active layers');

    addParallaxLayer(st, 'L0', 1);
    assert.equal(st.activeCount, 1, '1: one add -> activeCount 1');

    for (let i = 1; i < 15; i++) addParallaxLayer(st, 'L' + i, 1); // fills to 15 total
    assert.equal(st.activeCount, 15, 'N-1: 15 adds -> activeCount 15 (one slot free)');

    addParallaxLayer(st, 'L15', 1);
    assert.equal(st.activeCount, 16, 'N: 16 adds -> activeCount 16 (all slots full)');

    const overflow = addParallaxLayer(st, 'L16', 1); // 17th
    assert.equal(overflow, null, 'N+1: addParallaxLayer returns null when all 16 slots are full');
    assert.equal(st.activeCount, 16, 'N+1: activeCount must stay capped at 16, never grow past MAX_LAYERS');
});

// =============================================================================
// Section L -- duplicate dispose / re-entrant write probe / adversarial case.
// =============================================================================

test('duplicate dispose: a second cam.destroy() throws ERR_CAMERA_DESTROYED, never a raw error', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    cam.destroy();
    assert.throws(() => cam.destroy(), { code: 'ERR_CAMERA_DESTROYED' }, 'a duplicate destroy() must be a named error, never raw');
});

test('re-entrant write probe: an object with a coercing valueOf() passed to shakeTrauma= never reaches valueOf -- Number.isFinite rejects it as non-finite first, no re-entrancy window opens', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    let valueOfCalled = false;
    const evil = { valueOf() { valueOfCalled = true; cam.destroy(); return 0.5; } };
    assert.throws(() => { cam.shakeTrauma = evil; }, { code: 'ERR_CAMERA_SHAKE' },
        'MEASURED: Number.isFinite(object) is false WITHOUT coercion, so the setter rejects before valueOf ever runs');
    assert.equal(valueOfCalled, false, 'MEASURED: the coercing valueOf() is never invoked -- Number.isFinite does not coerce');
    cam.destroy();
});

// -----------------------------------------------------------------------------
// ADVERSARIAL (not one of the planner's enumerated candidates): a shake
// profile whose `trauma` property is a GETTER that re-entrantly destroys the
// owning camera. addShake's cold profile-resolution reads `profile.trauma`
// TWICE for a defined value (once in the `=== undefined` check, once in the
// ternary's value branch: `profile.trauma === undefined ? 0.5 : profile.trauma`).
// MEASURED: the FIRST read's getter fires cam.destroy() successfully (fully
// tears the camera down, including rebinding cam.destroy itself to the _dead
// sentinel); the SECOND read's getter then calls cam.destroy() again, which is
// now the _dead sentinel and THROWS ERR_CAMERA_DESTROYED -- so the entire
// cam.shake(evilProfile) call surfaces that error, even though the actual
// destroy() sequence completed cleanly on its first (successful) invocation.
// This is a genuine surprise for a caller who expects "fire and forget"
// shake() calls to never throw from a getter that merely tears the camera
// down elsewhere -- FINDING QA-4 (severity: S3, informational / documentation
// gap, NOT a raw crash: it fails closed with the correct named code, but the
// double-property-read is an implementation artifact of the `=== undefined ?
// default : value` pattern, not a deliberate re-entrancy contract). Reported
// as a ledger finding; NOT patched here (src/ is out of scope for qa).
// -----------------------------------------------------------------------------

test('ADVERSARIAL / FINDING QA-4: a shake profile with a destroy()-ing trauma GETTER surfaces ERR_CAMERA_DESTROYED from shake() itself (double property read)', () => {
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    let getterCalls = 0;
    const evilProfile = {
        get trauma() { getterCalls++; cam.destroy(); return 0.8; },
    };

    let threw = null;
    try {
        cam.shake(evilProfile);
    } catch (e) {
        threw = e;
    }
    assert.ok(threw, 'MEASURED: cam.shake(evilProfile) throws (not a silent success)');
    assert.equal(threw.code, 'ERR_CAMERA_DESTROYED', 'MEASURED: the surfaced error is the named ERR_CAMERA_DESTROYED, never a raw TypeError');
    assert.equal(getterCalls, 2, 'MEASURED: the trauma getter fires TWICE (the `=== undefined` check, then the ternary value read)');

    // The camera IS honestly, fully destroyed despite the exception bubbling
    // out of shake() -- the first getter call's destroy() completed cleanly.
    assert.throws(() => cam.update(1 / 60, 0, 0, 0, 0), { code: 'ERR_CAMERA_DESTROYED' }, 'the camera must be fully destroyed regardless of the exception site');
});
