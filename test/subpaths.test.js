// =============================================================================
// subpaths.test.js -- QA-added boundary coverage for the PRO1 (v1.1.0) subpath
// exports map. metadata.test.js already pins the exports-map SHAPE (targets
// exist on disk, "." unchanged, "./package.json" present). This file pins the
// exports map's RUNTIME BEHAVIOR: every subpath resolves and works standalone
// (A1), the main entry and ./shake share ONE engine (H-B, A7 -- independently
// of t8-cross.mjs, which only runs under torture), the ./shake bundle's static
// input-file set is exactly its four source files (the isolation contract),
// and the exports map is CLOSED (deep imports outside the map fail-closed).
//
// ASCII-only. node:test + node:assert/strict only. No dependency outside this
// package + its declared peers (esbuild is an existing devDependency, already
// used by test/size.mjs with the identical recipe).
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { build } from 'esbuild';

import * as mainEntry from '../src/index.js';
import { CinematicCameraPro, VERSION as MAIN_VERSION } from '../src/index.js';
import './helpers.mjs'; // RAF polyfill (playSequence() starts lite-timeline's ticker)

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// -----------------------------------------------------------------------------
// 2a -- every JS subpath dynamically imports and exposes its expected keys.
// The '.' entry's export-name set is included here too (independent, node:test
// -side re-proof of t8-cross.mjs's torture-only snapshot -- see also 2d below).
// -----------------------------------------------------------------------------
const EXPECTED_KEYS = {
    './shake': [
        'createShakeState', 'addShake', 'addTraumaSimple', 'updateShake',
        'computeShake', 'clearShakes', 'getPreset', 'registerPreset', 'listPresets',
        'EXPLOSION', 'EARTHQUAKE', 'RECOIL', 'IMPACT', 'LANDING', 'DAMAGE',
        'RUMBLE', 'HEAVY_IMPACT',
    ],
    './parallax': [
        'WrapMode', 'createParallaxState', 'addParallaxLayer', 'removeParallaxLayer',
        'updateParallax', 'getLayerScroll', 'applyParallaxLayer',
        'withParallax', // v2.0.0 detach: the per-instance attach lives here
    ],
    './bounds': [
        'BoundsType', 'createBoundsState', 'setBoundsAll', 'setBoundsEdges',
        'setBoundsRect', 'clearBoundsRect', 'applyBounds',
    ],
    './multi': ['createMultiTargetState', 'updateMultiTarget'],
    './follow': ['FollowMode', 'FOLLOW_STRATEGIES'],
    './sequence': [
        'createCameraSequence', 'panTo', 'dramaticZoom', 'bossReveal', 'timedShake',
        'withSequences', // v2.0.0 detach: the per-instance attach lives here
    ],
    // v2.0.0 detach: the new ./debug subpath (DebugHUD.js), no longer a "." facade.
    './debug': ['createDebugHUDConfig', 'drawDebugHUD', 'drawDebugWorld', 'withDebug'],
};

for (const [sub, keys] of Object.entries(EXPECTED_KEYS)) {
    test('subpath ' + sub + ' exposes every expected export', async () => {
        // sub is './shake' etc. -- strip the leading '.' so the specifier
        // reads '@zakkster/lite-camera-pro/shake', not '...-pro./shake'.
        const mod = await import('@zakkster/lite-camera-pro' + sub.slice(1));
        for (const k of keys) {
            assert.ok(k in mod, sub + ' is missing expected export: ' + k);
        }
    });
}

test("'.' entry export-name set is exactly D5's 20-name detach surface (+ VERSION value)", () => {
    // v2.0.0 detach (D5): the "." surface is trimmed to exactly the 20 names the
    // class itself reaches -- the four subsystems (presets/sequence/parallax/
    // debug) left the barrel for their subpaths. Kept in sync with t8-cross.mjs's
    // ROOT_2_0_0 snapshot; if one drifts without the other, THIS test or the
    // torture tier catches it. They must never both be edited blind.
    const ROOT_2_0_0 = [
        'VERSION', 'CinematicCameraPro', 'default',
        'FollowMode', 'FOLLOW_STRATEGIES',
        'createMultiTargetState', 'updateMultiTarget',
        'createShakeState', 'addShake', 'addTraumaSimple', 'updateShake',
        'computeShake', 'clearShakes',
        'BoundsType', 'createBoundsState', 'setBoundsAll', 'setBoundsEdges',
        'setBoundsRect', 'clearBoundsRect', 'applyBounds',
    ];
    assert.equal(ROOT_2_0_0.length, 20);
    assert.deepEqual(Object.keys(mainEntry).sort(), [...ROOT_2_0_0].sort());
    assert.equal(MAIN_VERSION, '2.0.0');
});

// -----------------------------------------------------------------------------
// 2b -- a minimal working call per subsystem, through ITS subpath import only
// (state factory + one update/apply tick), proving each subsystem works
// standalone with zero help from the main entry or sibling subsystems. Where a
// realistic boundary exists in the entry point's own contract (array length,
// enum-table index), it is exercised at N-1 / N / N+1.
// -----------------------------------------------------------------------------

test('./shake standalone tick: createShakeState -> addShake -> updateShake -> computeShake', async () => {
    const { createShakeState, addShake, updateShake, computeShake, getPreset } =
        await import('@zakkster/lite-camera-pro/shake');
    const s = createShakeState(1);
    addShake(s, getPreset('impact'), 0.8);
    updateShake(s, 1 / 60);
    computeShake(s);
    assert.ok(Number.isFinite(s.offsetX));
    assert.ok(Number.isFinite(s.offsetY));
    assert.ok(Number.isFinite(s.angle));
});

test('./parallax standalone tick: createParallaxState -> addParallaxLayer -> updateParallax -> applyParallaxLayer', async () => {
    const { createParallaxState, addParallaxLayer, updateParallax, applyParallaxLayer } =
        await import('@zakkster/lite-camera-pro/parallax');
    const p = createParallaxState();
    addParallaxLayer(p, 'bg', 0.5);
    updateParallax(p, 100, 100, 1);
    let translated = null;
    const ctx = { translate: (x, y) => { translated = [x, y]; } };
    const applied = applyParallaxLayer(p, 'bg', ctx);
    assert.equal(applied, true);
    assert.deepEqual(translated, [-50, -50]);
});

test('./bounds standalone tick: createBoundsState -> applyBounds', async () => {
    const { createBoundsState, applyBounds } = await import('@zakkster/lite-camera-pro/bounds');
    const b = createBoundsState();
    const target = new Float32Array([-50, -50]);
    const pos = new Float32Array([-50, -50]);
    applyBounds(b, target, pos, 1000, 800, 800, 600, 1 / 60);
    // HARD bounds (default): target must be clamped to >= 0 on both axes.
    assert.ok(target[0] >= 0);
    assert.ok(target[1] >= 0);
});

test('./multi standalone tick + array-length boundary (N-1 / N / N+1)', async () => {
    const { createMultiTargetState, updateMultiTarget } = await import('@zakkster/lite-camera-pro/multi');
    const targets = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 50 }]; // N = 3
    const makeCam = () => ({
        viewW: 800, viewH: 600, minZoom: 0.1, maxZoom: 5, zoom: 1,
        visibleW: 800, visibleH: 600, worldW: 3200, worldH: 2400,
        _maxX: 0, _maxY: 0,
        target: new Float32Array(2), look: new Float32Array(2),
        _mt: createMultiTargetState(),
    });

    // count = 0: documented no-op.
    let cam = makeCam();
    const z0 = cam.zoom, t0 = cam.target[0];
    assert.doesNotThrow(() => updateMultiTarget(cam, 1 / 60, [], 0));
    assert.equal(cam.zoom, z0);
    assert.equal(cam.target[0], t0);

    // count = 1: single-target frame, must stay finite.
    cam = makeCam();
    assert.doesNotThrow(() => updateMultiTarget(cam, 1 / 60, targets, 1));
    assert.ok(Number.isFinite(cam.zoom));
    assert.ok(Number.isFinite(cam.target[0]));

    // count = N-1 = 2.
    cam = makeCam();
    assert.doesNotThrow(() => updateMultiTarget(cam, 1 / 60, targets, targets.length - 1));
    assert.ok(Number.isFinite(cam.zoom));

    // count = N = 3 (every target).
    cam = makeCam();
    assert.doesNotThrow(() => updateMultiTarget(cam, 1 / 60, targets, targets.length));
    assert.ok(Number.isFinite(cam.zoom));

    // count = N+1 = 4: reads one slot past the caller-provided array. The
    // function trusts `count` and does not bounds-check `targets` itself, so
    // this is an OVER-READ, not a defended input -- it throws (TypeError on
    // undefined.x), which is fail-CLOSED (a hard crash, not silent NaN/Inf
    // corruption of camera state). Pinned here as documented behavior of
    // pre-existing, byte-identical MultiTarget.js (unmodified this session --
    // this subpath only makes the module newly REACHABLE standalone, it does
    // not change its contract). Not a defect in this diff; recorded so a
    // future session cannot silently "fix" it into a different failure mode
    // without a test noticing.
    cam = makeCam();
    assert.throws(
        () => updateMultiTarget(cam, 1 / 60, targets, targets.length + 1),
        TypeError,
        './multi: count = N+1 (over-read past targets[]) must fail closed, not silently corrupt state');
});

test('./follow standalone tick + FOLLOW_STRATEGIES index boundary (0 / 1 / N-1 / N / N+1 / -1)', async () => {
    const { FollowMode, FOLLOW_STRATEGIES } = await import('@zakkster/lite-camera-pro/follow');
    const N = FOLLOW_STRATEGIES.length;
    assert.equal(N, 5, 'five follow strategies expected (SMOOTH..HYBRID)');

    const makeCam = () => ({
        target: new Float32Array(2), look: new Float32Array(2), pos: new Float32Array(2),
        visibleW: 800, visibleH: 600, deadzoneX: 20, deadzoneY: 20,
        lookaheadDist: 40, lookaheadSpeed: 4, predictTime: 0.3,
        hybridVerticalSnap: true, lerpSpeed: 5,
    });

    // Index 0 (first, SMOOTH) and FollowMode.SMOOTH agree.
    assert.equal(FollowMode.SMOOTH, 0);
    let cam = makeCam();
    assert.doesNotThrow(() => FOLLOW_STRATEGIES[0](cam, 1 / 60, 400, 300, 10, 0));
    assert.ok(Number.isFinite(cam.target[0]));

    // Index 1 (LOCK).
    cam = makeCam();
    assert.doesNotThrow(() => FOLLOW_STRATEGIES[1](cam, 1 / 60, 400, 300, 0, 0));
    assert.ok(Number.isFinite(cam.target[0]));

    // Index N-1 = 4 (last, HYBRID).
    cam = makeCam();
    assert.doesNotThrow(() => FOLLOW_STRATEGIES[N - 1](cam, 1 / 60, 400, 300, 5, 5));
    assert.ok(Number.isFinite(cam.target[0]));
    assert.ok(Number.isFinite(cam.target[1]));

    // Index N = 5 (one past the table): undefined entry, calling it throws --
    // fail-closed, not a silent no-op.
    assert.equal(FOLLOW_STRATEGIES[N], undefined);
    assert.throws(() => FOLLOW_STRATEGIES[N](makeCam(), 1 / 60, 0, 0, 0, 0), TypeError);

    // Index N+1 = 6: same fail-closed shape.
    assert.equal(FOLLOW_STRATEGIES[N + 1], undefined);
    assert.throws(() => FOLLOW_STRATEGIES[N + 1](makeCam(), 1 / 60, 0, 0, 0, 0), TypeError);

    // Index -1: also undefined (no negative-index magic on a plain array).
    assert.equal(FOLLOW_STRATEGIES[-1], undefined);
    assert.throws(() => FOLLOW_STRATEGIES[-1](makeCam(), 1 / 60, 0, 0, 0, 0), TypeError);
});

test('./sequence standalone tick: createCameraSequence -> moveTo -> play -> camera.update', async () => {
    const { createCameraSequence } = await import('@zakkster/lite-camera-pro/sequence');
    // ./sequence documents that it drags lite-timeline + lite-ease by design;
    // it still needs a real camera-shaped target to write to. Using the main
    // entry's class here is legitimate (only ./shake claims subsystem
    // isolation -- see 2c) and matches how Subsystems.test.js already exercises
    // sequence helpers.
    const cam = new CinematicCameraPro(800, 600, 3200, 2400);
    const seq = createCameraSequence(cam).moveTo(100, 100, 100);
    cam.playSequence(seq);
    assert.equal(cam.sequencePlaying, true);
    cam.update(1 / 60, 400, 300, 0, 0);
    assert.ok(Number.isFinite(cam.target[0]));
    cam.destroy();
});

// -----------------------------------------------------------------------------
// 2c -- isolation contract at the STATIC GRAPH level (charter: "zero other
// subsystems loaded"). esbuild's metafile over src/Shake.js -- same recipe as
// test/size.mjs -- must report EXACTLY four input files (by basename): the
// barrel itself, its two direct source deps, and lite-noise's sampler. Nothing
// else -- no CinematicCameraPro.js, no CameraSequence.js, no lite-timeline,
// no lite-ease, no lite-camera, no lite-lerp. Pins the isolation contract so a
// future accidental import into ShakeEngine.js/ShakePresets.js trips a named
// test instead of silently ballooning the ./shake bundle.
// -----------------------------------------------------------------------------
test('./shake bundle input-file set is EXACTLY the shake barrel + lite-noise (isolation contract)', async () => {
    const result = await build({
        entryPoints: [join(root, 'src/Shake.js')],
        bundle: true,
        format: 'esm',
        minify: false,
        metafile: true,
        write: false,
        outfile: 'out.js',
        logLevel: 'silent',
    });

    const allInputs = new Set();
    for (const outKey of Object.keys(result.metafile.outputs)) {
        for (const ipath of Object.keys(result.metafile.outputs[outKey].inputs)) {
            allInputs.add(basename(ipath));
        }
    }

    const EXPECTED = new Set(['Shake.js', 'ShakeEngine.js', 'ShakePresets.js', 'Noise.js']);
    assert.deepEqual(
        [...allInputs].sort(), [...EXPECTED].sort(),
        './shake bundle input set drifted from the isolation contract: ' + [...allInputs].sort().join(', '));

    // Named negative pins (belt-and-suspenders on top of the exact-set assert
    // above): a future accidental import cannot sneak these in unnoticed.
    const FORBIDDEN = [
        'CinematicCameraPro.js', 'CameraSequence.js', 'ParallaxManager.js',
        'BoundsSystem.js', 'MultiTarget.js', 'FollowMode.js', 'DebugHUD.js',
        'Timeline.js', 'LiteEase.js', 'CinematicCamera.js', 'Lerp.js',
    ];
    for (const f of FORBIDDEN) {
        assert.ok(!allInputs.has(f), './shake bundle must not draw in ' + f);
    }
});

// -----------------------------------------------------------------------------
// 2d -- subpath/main identity (H-B), from the TEST-SUITE side (t8-cross.mjs
// proves this too, but only under `node --expose-gc test/torture.mjs`; this is
// the independent `node --test` -side proof so the no-fork guarantee is not
// gated behind opting into the torture run).
// -----------------------------------------------------------------------------
test('H-B no-fork: main entry and ./shake expose the SAME createShakeState identity', async () => {
    const shakeSubpath = await import('@zakkster/lite-camera-pro/shake');
    assert.equal(Object.is(mainEntry.createShakeState, shakeSubpath.createShakeState), true);
});

// v2.0.0 detach (CP-22): getPreset/createParallaxState/createCameraSequence left
// the "." barrel, so the old root-vs-subpath identity check no longer applies to
// them. The no-fork law (H-B) is preserved in a stronger form: the attach fn is
// COLOCATED in the same module as the subsystem's factory, so the class cannot
// build a second, forked state shape -- an attached camera's state is byte-shape
// identical to what the subpath factory produces.
test('H-B no-fork (CP-22): the "." barrel no longer re-exports the detached factories', async () => {
    assert.equal('getPreset' in mainEntry, false, 'getPreset must leave "." for ./shake');
    assert.equal('createParallaxState' in mainEntry, false, 'createParallaxState must leave "." for ./parallax');
    assert.equal('createCameraSequence' in mainEntry, false, 'createCameraSequence must leave "." for ./sequence');
});

test('H-B no-fork (CP-22): withParallax colocates with createParallaxState; attached state matches the subpath shape', async () => {
    const parallax = await import('@zakkster/lite-camera-pro/parallax');
    assert.equal(typeof parallax.withParallax, 'function', 'withParallax ships FROM the ParallaxManager module');
    const cam = parallax.withParallax(new CinematicCameraPro(800, 600, 3200, 2400));
    const reference = parallax.createParallaxState();
    // Same own-key set + same layerCount -> one state shape, no fork.
    assert.deepEqual(Object.keys(cam._parallax).sort(), Object.keys(reference).sort());
    assert.equal(cam._parallax.layerCount, reference.layerCount);
});

test('H-B no-fork (CP-22): withSequences colocates with createCameraSequence; the built sequence matches the factory shape', async () => {
    const sequence = await import('@zakkster/lite-camera-pro/sequence');
    assert.equal(typeof sequence.withSequences, 'function', 'withSequences ships FROM the CameraSequence module');
    const cam = sequence.withSequences(new CinematicCameraPro(800, 600, 3200, 2400));
    const viaAttach = cam.createSequence();
    const viaFactory = sequence.createCameraSequence(cam);
    // Same own-key surface -> the attach path builds the SAME sequence object.
    assert.deepEqual(Object.keys(viaAttach).sort(), Object.keys(viaFactory).sort());
    viaAttach.destroy();
    viaFactory.destroy();
});

// The subpaths whose primary factory STILL lives at "." keep the exact identity
// proof (same runtime function object, root vs subpath).
const IDENTITY_CHECKS = [
    ['./bounds', 'createBoundsState'],
    ['./multi', 'createMultiTargetState'],
    ['./follow', 'FollowMode'],
];
for (const [sub, name] of IDENTITY_CHECKS) {
    test('H-B no-fork: main entry and ' + sub + ' expose the SAME ' + name + ' identity', async () => {
        const mod = await import('@zakkster/lite-camera-pro' + sub.slice(1));
        assert.equal(Object.is(mainEntry[name], mod[name]), true);
    });
}

// -----------------------------------------------------------------------------
// 2e -- './package.json' subpath resolves. Uses createRequire(...).resolve(),
// which honors the package "exports" map under ESM (stable since early Node
// 12.x require-in-ESM support) and reads the file with plain fs -- deliberately
// NOT `import(..., { with: { type: 'json' } })`: the import-attributes syntax
// (`assert` vs `with` keyword, and whether it is required at all) differs
// across the Node 18/20/22 range this package's engines field (">=18") spans,
// so it is not a portable choice here. require.resolve + readFileSync is.
// -----------------------------------------------------------------------------
test("'./package.json' subpath resolves via require.resolve and matches package.json on disk", () => {
    const require = createRequire(import.meta.url);
    const resolved = require.resolve('@zakkster/lite-camera-pro/package.json');
    const viaSubpath = JSON.parse(readFileSync(resolved, 'utf8'));
    assert.equal(viaSubpath.name, pkg.name);
    assert.equal(viaSubpath.version, pkg.version);
    assert.equal(resolved, join(root, 'package.json'));
});

// -----------------------------------------------------------------------------
// Adversarial case the planner did not think of: the exports map must be
// CLOSED. Node enforces "exports" exclusivity once present -- any path not
// listed (including a real file that ships in the tarball, since files[] ships
// src/ wholesale) must fail closed with ERR_PACKAGE_PATH_NOT_EXPORTED, not
// silently resolve via the old node_modules deep-import fallback. This is the
// runtime guarantee that backs the whole "a subsystem costs what it weighs"
// charter -- without it, a consumer (or a future test) could bypass the
// subpath map entirely and re-import the world.
// -----------------------------------------------------------------------------
test('exports map is CLOSED: an undeclared subpath fails closed (ERR_PACKAGE_PATH_NOT_EXPORTED)', async () => {
    await assert.rejects(
        () => import('@zakkster/lite-camera-pro/nonexistent'),
        (err) => err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
});

test('exports map is CLOSED: a real shipped file NOT in the exports map fails closed (deep-import escape hatch is shut)', async () => {
    // src/CinematicCameraPro.js exists on disk and ships in the tarball
    // (files[] = ["src/", ...]), but it is not a declared exports-map target.
    await assert.rejects(
        () => import('@zakkster/lite-camera-pro/src/CinematicCameraPro.js'),
        (err) => err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
});
