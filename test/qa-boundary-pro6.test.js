// =============================================================================
// qa-boundary-pro6.test.js -- QA-authored coverage closing gaps found while
// independently verifying PRO6's assertions 1-12 (v2.0.0, the subsystem
// detach). Traceability check (done before writing a single test here): NO
// existing suite constructs an UNATTACHED camera and calls createSequence,
// addParallaxLayer, removeParallaxLayer, applyParallax, debug, or debugHUD --
// test/helpers.mjs's `makeCam`/`attachAll` attach all three subsystems at
// construction and every behavioral suite (CinematicCameraPro.test.js,
// boundary.test.js, regressions.test.js, Subsystems.test.js, qa-boundary-pro3,
// the torture tiers) builds cameras through it. Nor does any suite grep for
// ERR_PARALLAX_NOT_ATTACHED / ERR_SEQUENCE_NOT_ATTACHED / ERR_DEBUG_NOT_ATTACHED
// / ERR_ALREADY_ATTACHED anywhere (checked: zero hits across test/*.test.js).
// Assertion 6 -- the fail-closed contract for all six stubs plus double-attach
// -- is therefore UNPROVEN by the coder/reviewer suites; this file's Section D
// and E close that gap. Sections A/B/C/F/G/H/I/J close the remaining boundary
// matrix the planner's own suites do not literally pin, per the qa VERIFY
// checklist (see PRO6-PLAN.md). Not a duplicate of any existing test -- checked
// against every test/*.test.js file before writing.
//
// Every assertion here is PROBED FIRST (see the accompanying qa report for the
// node -e transcripts) so it pins MEASURED behavior. Two probes surfaced
// defects; those tests pin the CURRENT (surprising) behavior with a FINDING
// comment and report it -- src/ is never touched by this file.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CinematicCameraPro } from '../src/index.js';
import { withParallax } from '../src/ParallaxManager.js';
import { withSequences, createCameraSequence } from '../src/CameraSequence.js';
import { withDebug } from '../src/DebugHUD.js';
import { getPreset } from '../src/ShakePresets.js';
import { pumpRaf, makeCtx } from './helpers.mjs';

function freshCam() {
    return new CinematicCameraPro(800, 600, 3200, 2400, 7);
}

function pumpToCompletion(seq, guard = 20000) {
    while (seq.playing && guard-- > 0) pumpRaf();
    return seq.playing === false;
}

const STUBS = [
    ['createSequence', [], 'ERR_SEQUENCE_NOT_ATTACHED', '@zakkster/lite-camera-pro/sequence', 'withSequences('],
    ['addParallaxLayer', ['sky', 0.5], 'ERR_PARALLAX_NOT_ATTACHED', '@zakkster/lite-camera-pro/parallax', 'withParallax('],
    ['removeParallaxLayer', ['sky'], 'ERR_PARALLAX_NOT_ATTACHED', '@zakkster/lite-camera-pro/parallax', 'withParallax('],
    ['applyParallax', ['sky', makeCtx()], 'ERR_PARALLAX_NOT_ATTACHED', '@zakkster/lite-camera-pro/parallax', 'withParallax('],
    ['debug', [makeCtx()], 'ERR_DEBUG_NOT_ATTACHED', '@zakkster/lite-camera-pro/debug', 'withDebug('],
    ['debugHUD', [makeCtx()], 'ERR_DEBUG_NOT_ATTACHED', '@zakkster/lite-camera-pro/debug', 'withDebug('],
];

// =============================================================================
// Section A -- withX(cam) on a DESTROYED camera (probe-first).
//
// FINDING QA-1 (severity: S2, fail-open). destroy() rebinds SOME state to a
// tell (own-property _dead functions for every method, per CP-8) but resets
// the two attach GUARDS themselves (_parallax, debugConfig) to a plain `null`
// at :1099/:1101 -- structurally indistinguishable from "never attached".
// withParallax/withDebug gate re-attach purely on `cam._parallax !== null` /
// `cam.debugConfig !== null`; a destroyed camera reads as UNATTACHED to both
// checks, so withParallax(deadCam)/withDebug(deadCam) SILENTLY SUCCEED: they
// build a fresh ParallaxState/DebugHUDConfig and install real, WORKING
// addParallaxLayer/removeParallaxLayer/applyParallax own-properties that
// OVERWRITE the _dead sentinels destroy() had just installed there. The camera
// is now a zombie: cam.addParallaxLayer(...) mutates real state and returns
// successfully while cam.update()/cam.apply() (never touched by withParallax)
// still correctly throw ERR_CAMERA_DESTROYED. This directly contradicts the
// owner addenda's "destroyed beats unattached/attached holds structurally"
// claim -- it holds for update/apply/etc. (the rebound own-properties) but NOT
// for the two subsystems whose re-attach guard is a bare null check.
//
// withSequences uses a DIFFERENT guard shape --
// `Object.prototype.hasOwnProperty.call(cam, 'createSequence')` -- and
// destroy()'s rebind ALWAYS installs an own `createSequence` property (the
// _dead sentinel), whether or not sequences were ever attached. So
// withSequences(deadCam) DOES throw -- but with code ERR_ALREADY_ATTACHED and
// a "sequences already attached" message, which is FALSE (this camera was
// never attached) and misleading (it names the wrong reason -- the camera is
// destroyed, not double-attached). The three subsystems are inconsistent with
// each other on the exact same input shape.
// =============================================================================

// FIXED same-session (QA-1): withParallax now detects a destroyed camera FIRST
// (Object.hasOwn(cam,'update')) and throws ERR_CAMERA_DESTROYED -- no zombie.
test('QA-1a FIXED: withParallax(destroyedCam) throws ERR_CAMERA_DESTROYED (no zombie re-attach)', () => {
    const cam = freshCam();
    cam.destroy();
    assert.equal(cam._parallax, null, 'destroy() nulled the attach guard');

    assert.throws(() => withParallax(cam), { code: 'ERR_CAMERA_DESTROYED' },
        'attach-on-a-corpse must fail closed, not silently build live state');
    assert.equal(cam._parallax, null, 'no ParallaxState was built for a destroyed camera');
    // The corpse stays fully dead -- destroyed beats unattached, structurally.
    assert.throws(() => cam.update(1 / 60, 0, 0, 0, 0), { code: 'ERR_CAMERA_DESTROYED' });
    assert.throws(() => cam.setZoom(2), { code: 'ERR_CAMERA_DESTROYED' });
});

// FIXED same-session (QA-1): withDebug on a corpse throws ERR_CAMERA_DESTROYED
// before installing anything, so no raw-TypeError resurrection path exists.
test('QA-1b FIXED: withDebug(destroyedCam) throws ERR_CAMERA_DESTROYED (no zombie, no raw TypeError)', () => {
    const cam = freshCam();
    cam.destroy();
    assert.equal(cam.debugConfig, null);

    assert.throws(() => withDebug(cam), { code: 'ERR_CAMERA_DESTROYED' },
        'withDebug on a corpse must fail closed with the named code');
    assert.equal(cam.debugConfig, null, 'no DebugHUDConfig was built for a destroyed camera');
    // cam.debugHUD stays the _dead sentinel -- still the named error, never a raw deref.
    assert.throws(() => cam.debugHUD(makeCtx()), { code: 'ERR_CAMERA_DESTROYED' });
});

// FIXED same-session (QA-1): withSequences now detects destroyed BEFORE its
// already-attached check, so a never-attached corpse reports the honest code.
test('QA-1c FIXED: withSequences(destroyedCam) throws ERR_CAMERA_DESTROYED (not the misleading ERR_ALREADY_ATTACHED)', () => {
    const cam = freshCam(); // never attached
    cam.destroy();

    let threw = null;
    try {
        withSequences(cam);
    } catch (e) {
        threw = e;
    }
    assert.ok(threw, 'withSequences on a corpse must throw');
    assert.equal(threw.code, 'ERR_CAMERA_DESTROYED', 'the honest destroyed code, consistent with the other two withX');
    assert.match(threw.message, /use after destroy/, 'message names the real reason (destroyed, not already-attached)');
});

test('boundary null/undefined: withParallax(null|undefined) raw-TypeErrors -- cam is an unvalidated internal argument, consistent across both', () => {
    for (const v of [null, undefined]) {
        assert.throws(() => withParallax(v), TypeError, 'withParallax(' + String(v) + ') must raw-throw (cam is not a validated door)');
    }
});

test('re-entrant write: withParallax(withParallax(cam)) -- the inner call attaches once, the outer (re-entrant) call throws ERR_ALREADY_ATTACHED, state stays consistent', () => {
    const cam = freshCam();
    assert.throws(() => withParallax(withParallax(cam)), { code: 'ERR_ALREADY_ATTACHED' });
    // Exactly one attach happened (the inner call); the camera is left usable,
    // not double-installed, not corrupted by the nested call.
    assert.equal(cam._parallax.activeCount, 0);
    assert.doesNotThrow(() => cam.addParallaxLayer('x', 1));
    assert.equal(cam._parallax.activeCount, 1);
    cam.destroy();
});

test('dispose-during-iteration: destroying camera[2] mid-batch-attach leaves camera[0,1,3,4] fully independent and functional', () => {
    const N = 5;
    const cams = [];
    for (let i = 0; i < N; i++) {
        const c = freshCam();
        withParallax(c);
        withSequences(c);
        withDebug(c);
        cams.push(c);
        if (i === 2) c.destroy(); // dispose mid-iteration of the batch-attach loop
    }
    for (let i = 0; i < N; i++) {
        if (i === 2) {
            assert.throws(() => cams[i].update(1 / 60, 0, 0, 0, 0), { code: 'ERR_CAMERA_DESTROYED' });
            continue;
        }
        assert.doesNotThrow(() => cams[i].addParallaxLayer('layer' + i, 1), 'camera ' + i + ' must be unaffected by camera 2 destroy');
        assert.doesNotThrow(() => cams[i].update(1 / 60, 100, 100, 0, 0));
        assert.equal(cams[i]._parallax.activeCount, 1);
    }
    for (const c of cams) if (!c.update.toString || true) { try { c.destroy(); } catch (_e) { /* cam2 already dead */ } }
});

// =============================================================================
// Section B -- cross-instance independence.
// =============================================================================

test('cross-instance: attach to A only; B keeps throwing NOT_ATTACHED on every subsystem, unaffected by A', () => {
    const camA = freshCam();
    const camB = freshCam();
    withParallax(camA);
    withSequences(camA);
    withDebug(camA);

    camA.addParallaxLayer('sky', 0.2);

    for (const [method, args, code] of STUBS) {
        assert.throws(() => camB[method](...args), { code }, 'B.' + method + ' must still be unattached');
    }
    // Mutating A's layers must not affect B (which has no _parallax at all).
    assert.equal(camB._parallax, null);
    assert.equal(camA._parallax.activeCount, 1);

    camA.destroy();
    // destroy(A) must leave B fully functional and still independently unattached.
    assert.throws(() => camB.addParallaxLayer('x', 1), { code: 'ERR_PARALLAX_NOT_ATTACHED' });
    assert.doesNotThrow(() => camB.update(1 / 60, 0, 0, 0, 0));
    assert.doesNotThrow(() => camB.setZoom(1.5));
});

test('cross-instance: two independently-attached cameras never share parallax state', () => {
    const camA = freshCam();
    const camB = freshCam();
    withParallax(camA);
    withParallax(camB);
    assert.notEqual(camA._parallax, camB._parallax, 'each attach must build its own ParallaxState');
    camA.addParallaxLayer('bg', 0.1);
    camB.addParallaxLayer('bg', 0.1);
    camB.addParallaxLayer('fg', 1.5);
    assert.equal(camA._parallax.activeCount, 1);
    assert.equal(camB._parallax.activeCount, 2, 'B must be unaffected by A only having one layer');
    camA.destroy();
    camB.destroy();
});

// =============================================================================
// Section C -- all 3! = 6 orderings of the withX chain.
// =============================================================================

const WITH_FNS = { withParallax, withSequences, withDebug };
function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        for (const p of permutations(rest)) out.push([arr[i], ...p]);
    }
    return out;
}

for (const order of permutations(['withParallax', 'withSequences', 'withDebug'])) {
    test('chain order [' + order.join(',') + ']: each withX returns the same camera identity and the surface is fully functional', () => {
        const cam = freshCam();
        let ref = cam;
        for (const name of order) {
            const next = WITH_FNS[name](ref);
            assert.equal(Object.is(next, cam), true, name + ' must return the SAME camera identity');
            ref = next;
        }
        // Regardless of order, all three subsystems are live afterward.
        assert.doesNotThrow(() => cam.addParallaxLayer('sky', 0.2));
        const seq = cam.createSequence().moveTo(100, 100, 10);
        cam.playSequence(seq);
        assert.ok(pumpToCompletion(seq));
        assert.doesNotThrow(() => cam.debugHUD(makeCtx()));
        assert.doesNotThrow(() => cam.debug(makeCtx()));
        cam.destroy();
    });
}

// =============================================================================
// Section D -- the six stubs: .code, .message contains both the subpath
// specifier and the withX( call text; throws before any state mutation;
// camera stays usable and attachable afterward (not poisoned by the throw).
// =============================================================================

for (const [method, args, code, specifier, callText] of STUBS) {
    test('stub ' + method + '(): .code === ' + code + '; message names both the subpath and the withX( call; no mutation; camera stays attachable', () => {
        const cam = freshCam();
        let threw = null;
        try {
            cam[method](...args);
        } catch (e) {
            threw = e;
        }
        assert.ok(threw, method + ' must throw');
        assert.equal(threw.code, code);
        assert.ok(threw.message.includes(specifier), method + ' message must name the subpath specifier ' + specifier);
        assert.ok(threw.message.includes(callText), method + ' message must name the withX( call text ' + callText);
        assert.ok(!(threw instanceof TypeError) || threw.code !== undefined, method + ' must be a named error, not a raw TypeError');

        // No partial mutation: the relevant attach guard is still at its
        // never-attached value after the throw.
        assert.equal(cam._parallax, null);
        assert.equal(cam.debugConfig, null);
        assert.equal(Object.prototype.hasOwnProperty.call(cam, 'createSequence'), false);

        // The camera is not poisoned: core paths still work, and the throwing
        // subsystem is still attachable afterward.
        assert.doesNotThrow(() => cam.update(1 / 60, 100, 100, 0, 0));
        assert.doesNotThrow(() => cam.setZoom(1.2));
        assert.doesNotThrow(() => withParallax(cam));
        assert.doesNotThrow(() => withSequences(cam));
        assert.doesNotThrow(() => withDebug(cam));
        cam.destroy();
    });
}

// =============================================================================
// Section E -- re-attach -> ERR_ALREADY_ATTACHED; original attachment survives
// the failed re-attach (layers/bound methods are untouched by the throw).
// =============================================================================

test('re-attach parallax: ERR_ALREADY_ATTACHED; layer survives; installed methods are the SAME function identity after the throw', () => {
    const cam = freshCam();
    withParallax(cam);
    cam.addParallaxLayer('sky', 0.2);
    const addRef = cam.addParallaxLayer;
    const removeRef = cam.removeParallaxLayer;
    const applyRef = cam.applyParallax;
    const stateRef = cam._parallax;

    assert.throws(() => withParallax(cam), { code: 'ERR_ALREADY_ATTACHED' });

    assert.equal(cam._parallax, stateRef, 'a failed re-attach must not replace the ParallaxState');
    assert.equal(cam._parallax.activeCount, 1, 'the existing layer must survive a failed re-attach');
    assert.equal(cam.addParallaxLayer, addRef, 'a failed re-attach must not reinstall addParallaxLayer');
    assert.equal(cam.removeParallaxLayer, removeRef);
    assert.equal(cam.applyParallax, applyRef);
    cam.destroy();
});

test('cam.applyParallax(id, ctx) (the installed instance method) delegates correctly on a healthy attached camera: true + floored translate for a found layer, false + no call for an unknown id', () => {
    const cam = freshCam();
    withParallax(cam);
    cam.addParallaxLayer('mid', 1, 1, { offsetX: 0.4, offsetY: 0.4 });
    cam.update(1 / 60, 100, 100, 0, 0); // drives updateParallax so scrollX/Y are non-trivial

    const ctx = makeCtx();
    const found = cam.applyParallax('mid', ctx);
    assert.equal(found, true, 'applyParallax must return true for a layer that exists');
    assert.equal(ctx.count('translate'), 1, 'applyParallax must issue exactly one translate for a found layer');
    const layer = cam._parallax.layers.find((l) => l.id === 'mid');
    assert.deepEqual(ctx.calls[0].args, [-Math.floor(layer.scrollX), -Math.floor(layer.scrollY)],
        'applyParallax must translate by the floored, negated scroll (int-snap, matches apply()\'s own convention)');

    const ctx2 = makeCtx();
    const notFound = cam.applyParallax('ghost-layer', ctx2);
    assert.equal(notFound, false, 'applyParallax must return false for an unknown id');
    assert.equal(ctx2.count('translate'), 0, 'applyParallax must not touch ctx at all for an unknown id');
    cam.destroy();
});

test('re-attach sequence: ERR_ALREADY_ATTACHED; createSequence stays bound and functional after the throw', () => {
    const cam = freshCam();
    withSequences(cam);
    const createRef = cam.createSequence;
    const seq0 = cam.createSequence().moveTo(1, 1, 1);
    seq0.destroy();

    assert.throws(() => withSequences(cam), { code: 'ERR_ALREADY_ATTACHED' });

    assert.equal(cam.createSequence, createRef, 'a failed re-attach must not reinstall createSequence');
    const seq1 = cam.createSequence().moveTo(50, 50, 10);
    cam.playSequence(seq1);
    assert.ok(pumpToCompletion(seq1), 'createSequence must still fully work after a failed re-attach');
    cam.destroy();
});

test('re-attach debug: ERR_ALREADY_ATTACHED; debugConfig/debug/debugHUD identities stay bound after the throw (debug() world overlay still works)', () => {
    const cam = freshCam();
    withDebug(cam); // debug attached ALONE -- a legal, documented independent attach per D1
    const debugRef = cam.debug;
    const hudRef = cam.debugHUD;
    const cfgRef = cam.debugConfig;

    assert.throws(() => withDebug(cam), { code: 'ERR_ALREADY_ATTACHED' });

    assert.equal(cam.debugConfig, cfgRef);
    assert.equal(cam.debug, debugRef);
    assert.equal(cam.debugHUD, hudRef);
    // debug() (world-space overlay) never reads cam._parallax -- it works fine
    // with debug attached alone.
    assert.doesNotThrow(() => cam.debug(makeCtx()));
    // debugHUD() does NOT work standalone -- see the dedicated FINDING test
    // below; asserted there, not duplicated here.
    cam.destroy();
});

// -----------------------------------------------------------------------------
// FINDING QA-2 (severity: S1, regression introduced by this session).
// drawDebugHUD (src/DebugHUD.js, the screen-space pass-1 line-counter AND the
// pass-2 draw) unconditionally dereferences `cam._parallax.activeCount` with
// no null guard -- `if (show.parallax && cam._parallax.activeCount > 0)`. In
// 1.3.0 this was always safe because the constructor unconditionally built
// `this._parallax = createParallaxState()`. CP-22 (T-B, this session) changed
// the constructor to `this._parallax = null` until withParallax() attaches.
// DebugHUD.js was NOT updated to guard the new null case. D1 explicitly
// specifies THREE INDEPENDENT uniform withX() functions ("Attach is
// PER-INSTANCE only" with no stated pairing requirement) -- a consumer who
// wants a debug HUD without parallax layers (a very ordinary combination: most
// games have no parallax background but do want a debug overlay) is a fully
// legal, undocumented-as-forbidden usage that now ALWAYS raw-TypeErrors,
// violating both D3's fail-closed law (no raw TypeErrors) and the NON-GOALS
// line "No behavior change to ANY attached/core path -- packaging, again."
// This is not an unattached-call issue (D3 doesn't apply -- debug IS attached
// here) and not a destroyed-camera issue (QA-1b, above) -- it reproduces on a
// perfectly healthy, freshly-attached, never-destroyed camera. Reported as a
// ledger finding; NOT patched here (src/ is out of scope for qa).
// -----------------------------------------------------------------------------
// FIXED same-session (QA-2): drawDebugHUD now guards both cam._parallax reads
// with `!== null` (CP-22), so withDebug alone no longer crashes the HUD.
test('QA-2 FIXED: withDebug(cam) WITHOUT withParallax -- debugHUD() renders, skips the parallax panel, no throw', () => {
    const cam = freshCam();
    withDebug(cam); // legal, independent, per-instance attach -- no withParallax()
    assert.equal(cam._parallax, null, 'parallax was deliberately left unattached');

    assert.doesNotThrow(() => cam.debugHUD(makeCtx()),
        'debugHUD() must render on a healthy withDebug-only camera (parallax panel skipped)');
    assert.doesNotThrow(() => cam.debug(makeCtx()), 'debug() world overlay never touched _parallax anyway');

    // Attaching parallax too still works -- the guard tolerates both states.
    withParallax(cam);
    assert.doesNotThrow(() => cam.debugHUD(makeCtx()), 'debugHUD still works once parallax is ALSO attached');
    cam.destroy();
});

// =============================================================================
// Section F -- the documented duck-type path: createCameraSequence(cam, opts)
// on a NEVER-attached camera works end to end; stopSequence() on a
// never-attached camera with nothing playing is probed and pinned.
// =============================================================================

test('duck-type path: createCameraSequence(cam, opts) + playSequence + update-to-completion on a NEVER-attached camera', () => {
    const cam = freshCam();
    assert.equal(Object.prototype.hasOwnProperty.call(cam, 'createSequence'), false, 'cam.createSequence must still be the unattached stub');

    const seq = createCameraSequence(cam, { blendOutTime: 0 }).moveTo(500, 400, 50);
    cam.playSequence(seq); // playSequence/stopSequence duck-type -- no attach needed
    assert.ok(pumpToCompletion(seq), 'a factory-built sequence must play to completion on an unattached camera');
    cam.update(1 / 60, 100, 100, 0, 0);
    assert.equal(cam._seq, null, 'completion cleanup must run identically without attach');
    seq.destroy();

    // The class-method surface (createSequence) is still correctly closed.
    assert.throws(() => cam.createSequence(), { code: 'ERR_SEQUENCE_NOT_ATTACHED' });
    cam.destroy();
});

test('probe-pinned: stopSequence() on a never-attached camera with nothing playing is a documented no-op (returns cam, does not throw)', () => {
    const cam = freshCam();
    let result;
    assert.doesNotThrow(() => { result = cam.stopSequence(); }, 'MEASURED: stopSequence duck-types this._seq (null) and no-ops, matching 1.3.0');
    assert.equal(result, cam, 'stopSequence must return cam even on a never-attached, never-played camera');
    assert.equal(cam._blendRemain, 0);
    cam.destroy();
});

// =============================================================================
// Section G -- zero-attach construction: own-key sweep vs the exact 1.3.0-era
// Pro-layer key set (diffed from git tag "1.3.0" src/CinematicCameraPro.js).
// 2.0.0 must add exactly one new own key (_parallaxTick, always null
// pre-attach) and change no other key's NAME; _parallax/debugConfig must hold
// null instead of the two dead constructor builds CP-21/CP-22 removed.
// =============================================================================

// Verbatim from `git show f1ac2f5:src/CinematicCameraPro.js` (the 1.3.0 commit)
// constructor body -- every `this.X =` / `this._X =` assignment, Pro-layer only
// (base CinematicCamera fields are out of scope; diffed out below at runtime).
const PRO_LAYER_KEYS_1_3_0 = [
    'zoom', 'minZoom', 'maxZoom',
    '_zoomFrom', '_zoomTo', '_zoomDur', '_zoomElapsed', '_zoomEase',
    '_zoomAnchorX', '_zoomAnchorY', '_zoomTarget', '_hasAnchor',
    'visibleW', 'visibleH', 'mode', 'predictTime', 'hybridVerticalSnap', 'maxDt',
    '_mt', '_shake', '_seq', '_blendRemain', '_parallax', '_bounds', 'debugConfig',
].sort();

test('own-key sweep: 2.0.0 Pro-layer keys equal the 1.3.0 set plus exactly one new key (_parallaxTick)', async () => {
    const { CinematicCamera } = await import('@zakkster/lite-camera');
    const base = new CinematicCamera(800, 600, 3200, 2400, 7);
    const cam = freshCam();

    const baseKeys = new Set(Object.keys(base));
    const proOnly2_0_0 = Object.keys(cam).filter((k) => !baseKeys.has(k)).sort();

    const added = proOnly2_0_0.filter((k) => !PRO_LAYER_KEYS_1_3_0.includes(k));
    const removed = PRO_LAYER_KEYS_1_3_0.filter((k) => !proOnly2_0_0.includes(k));
    assert.deepEqual(added, ['_parallaxTick'], 'exactly one new Pro-layer own key vs 1.3.0');
    assert.deepEqual(removed, [], 'no 1.3.0 Pro-layer key may be removed by the detach');

    assert.equal(cam._parallax, null, 'the ParallaxState build (CP-22) must be gone');
    assert.equal(cam.debugConfig, null, 'the DebugHUDConfig build (CP-22) must be gone');
    assert.equal(cam._parallaxTick, null, 'the tick fn ref must be null pre-attach');
});

test('no ParallaxState/DebugHUDConfig-shaped object is reachable on any own value of a fresh unattached camera', () => {
    const cam = freshCam();
    for (const key of Object.keys(cam)) {
        const v = cam[key];
        if (v === null || typeof v !== 'object') continue;
        const looksLikeParallaxState = 'layerCount' in v && 'activeCount' in v && 'layers' in v;
        const looksLikeDebugConfig = 'show' in v && 'x' in v && 'y' in v;
        assert.equal(looksLikeParallaxState, false, key + ' must not hold a ParallaxState-shaped object pre-attach');
        assert.equal(looksLikeDebugConfig, false, key + ' must not hold a DebugHUDConfig-shaped object pre-attach');
    }
    cam.destroy();
});

// =============================================================================
// Section H -- getState/setState round-trip: unattached and attached; attach
// state must never leak into the pose-only snapshot (PRO2 contract).
// =============================================================================

test('getState/setState round-trip on an UNATTACHED camera; snapshot has exactly the pose-only keys', () => {
    const cam = freshCam();
    cam.setZoom(1.5);
    const snap = cam.getState();
    assert.deepEqual(Object.keys(snap).sort(), ['mode', 'posX', 'posY', 'targetX', 'targetY', 'zoom'].sort());

    const cam2 = freshCam();
    cam2.setState(snap);
    assert.equal(cam2.zoom, cam.zoom);
    assert.equal(cam2.pos[0], cam.pos[0]);
    cam.destroy();
    cam2.destroy();
});

test('getState on an ATTACHED camera: attach state (layers/debugConfig) does not leak into the snapshot; setState does not touch attach state', () => {
    const cam = freshCam();
    withParallax(cam);
    withDebug(cam);
    cam.addParallaxLayer('sky', 0.5);
    cam.debugConfig.x = 99;

    const snap = cam.getState();
    assert.deepEqual(Object.keys(snap).sort(), ['mode', 'posX', 'posY', 'targetX', 'targetY', 'zoom'].sort(),
        'attached-subsystem state must not appear in the pose snapshot');
    assert.ok(!('_parallax' in snap) && !('debugConfig' in snap) && !('layers' in snap));

    cam.setState({ posX: 10, posY: 20, targetX: 10, targetY: 20, zoom: 1 });
    assert.equal(cam._parallax.activeCount, 1, 'setState must not disturb attached parallax state');
    assert.equal(cam.debugConfig.x, 99, 'setState must not disturb attached debug config');
    cam.destroy();
});

// =============================================================================
// Section I -- update()/apply() on an unattached camera immediately after each
// stub throw: a thrown stub must not poison the frame path (H-P5/H-P1).
// =============================================================================

for (const [method, args] of STUBS) {
    test('frame path stays clean after ' + method + '() throws: update()+apply() immediately after are unaffected', () => {
        const cam = freshCam();
        assert.throws(() => cam[method](...args));

        const rec = { calls: [], translate() { this.calls.push('translate'); }, rotate() { this.calls.push('rotate'); }, scale() { this.calls.push('scale'); } };
        assert.doesNotThrow(() => cam.update(1 / 60, 400, 300, 0, 0));
        assert.doesNotThrow(() => cam.apply(rec));
        // apply()'s exact call sequence (CinematicCameraPro.js apply(), 6 calls):
        // translate(shake offset), translate(to center), rotate(shake angle),
        // scale(zoom), translate(back, zoom-adjusted), translate(-floor(pos)).
        assert.deepEqual(rec.calls, ['translate', 'translate', 'rotate', 'scale', 'translate', 'translate'],
            'apply() must still touch its full translate/rotate/scale sequence, in H-P1 order, after an unrelated stub throw');
        assert.ok(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]), 'pos must stay finite');
        cam.destroy();
    });
}

// =============================================================================
// Section J -- shakePreset absence (instance + prototype); D4 migration idiom
// executed verbatim from ./shake; unknown-name is a no-op.
// =============================================================================

test('shakePreset is absent from BOTH the instance and the prototype (no tombstone, D3)', () => {
    const cam = freshCam();
    assert.equal(typeof cam.shakePreset, 'undefined');
    assert.equal(typeof CinematicCameraPro.prototype.shakePreset, 'undefined');
    assert.equal(Object.prototype.hasOwnProperty.call(CinematicCameraPro.prototype, 'shakePreset'), false);
    cam.destroy();
});

test('D4 migration idiom, verbatim from CHANGELOG, executed exactly as written: known preset activates, unknown name is a no-op', () => {
    const cam = freshCam();

    // Verbatim idiom (CHANGELOG D4):
    //   import { getPreset } from '@zakkster/lite-camera-pro/shake';
    //   const p = getPreset(n); if (p) cam.shake(p, i);
    const n1 = 'explosion';
    const p1 = getPreset(n1);
    if (p1) cam.shake(p1, 1);
    assert.equal(cam._shake.active, true, 'a known preset must activate a shake slot via the verbatim idiom');

    const camB = freshCam();
    const n2 = 'definitely-not-a-real-preset';
    const p2 = getPreset(n2);
    assert.equal(p2, null, 'getPreset must return null for an unknown name');
    if (p2) camB.shake(p2, 1); // guard skips -- MANDATORY per D4, else cam.shake(null) raw-TypeErrors
    assert.equal(camB._shake.active, false, 'an unknown preset name must remain a documented no-op end to end');

    cam.destroy();
    camB.destroy();
});

test('probe-pinned: cam.shake(null) still raw-TypeErrors (CP-25, ledgered to PRO4, NOT fixed this session) -- the D4 guard is mandatory, not stylistic', () => {
    const cam = freshCam();
    let threw = null;
    try {
        cam.shake(null);
    } catch (e) {
        threw = e;
    }
    assert.ok(threw instanceof TypeError, 'MEASURED: cam.shake(null) is still a raw TypeError in 2.0.0 (CP-25 out of scope)');
    assert.equal(threw.code, undefined);
    cam.destroy();
});
