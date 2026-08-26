// =============================================================================
// Subsystems -- direct standalone-surface coverage (ported vitest -> node:test).
//
// The facade suite (CinematicCameraPro.test.js) drives these subsystems through
// the class. This suite imports the standalone functional API directly from the
// PACKAGE ENTRY (../src/index.js) and calls it: the DebugHUD draws, the
// shake/parallax/bounds functions, the multi-target updater, the preset
// registry, and the sequence helpers.
//
// CP-1: createShakeState and createMultiTargetState are imported from the entry
// here, NOT from their module files. Before this release the entry did not
// re-export them (BRIEF CP-1), so every state-taking function in the documented
// tree-shakeable API took a state no consumer could construct. These imports
// resolving from ../src/index.js is the executable proof of that fix.
// =============================================================================
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    CinematicCameraPro,
    createDebugHUDConfig, drawDebugHUD, drawDebugWorld,
    EXPLOSION, EARTHQUAKE, RECOIL, IMPACT, LANDING, DAMAGE, RUMBLE, HEAVY_IMPACT,
    getPreset, registerPreset, listPresets,
    createShakeState, computeShake, addShake, addTraumaSimple, updateShake, clearShakes,
    createParallaxState, addParallaxLayer, removeParallaxLayer, updateParallax,
    getLayerScroll, applyParallaxLayer,
    BoundsType, createBoundsState, setBoundsAll, setBoundsEdges, setBoundsRect, clearBoundsRect,
    createMultiTargetState, updateMultiTarget,
    createCameraSequence, panTo, dramaticZoom, bossReveal, timedShake,
} from '../src/index.js';
import { makeCtx } from './helpers.mjs';

/** vitest's toBeCloseTo(y, digits): |actual - expected| < 10^-digits / 2. */
function close(actual, expected, digits = 2) {
    return Math.abs(actual - expected) < Math.pow(10, -digits) / 2;
}

describe('DebugHUD', () => {
    let cam;
    beforeEach(() => { cam = new CinematicCameraPro(800, 600, 3200, 2400); });

    it('createDebugHUDConfig returns a toggleable panel config', () => {
        const cfg = createDebugHUDConfig();
        assert.equal(cfg.x, 4);
        assert.equal(cfg.y, 4);
        assert.equal(cfg.show.shake, true);
        assert.equal(cfg.show.parallax, true);
        assert.equal(cfg.show.bounds, true);
        assert.equal(cfg.show.deadzone, true);
    });

    it('drawDebugHUD draws screen-space text with balanced save/restore', () => {
        const ctx = makeCtx();
        assert.doesNotThrow(() => drawDebugHUD(cam, ctx, createDebugHUDConfig()));
        assert.ok(ctx.count('fillText') > 0);
        assert.equal(ctx.count('save'), ctx.count('restore'));
    });

    it('drawDebugHUD works with no config argument (internal defaults)', () => {
        const ctx = makeCtx();
        assert.doesNotThrow(() => drawDebugHUD(cam, ctx));
        assert.ok(ctx.count('fillText') > 0);
    });

    it('drawDebugHUD with every panel disabled does not throw', () => {
        const cfg = createDebugHUDConfig();
        for (const k of Object.keys(cfg.show)) cfg.show[k] = false;
        const ctx = makeCtx();
        assert.doesNotThrow(() => drawDebugHUD(cam, ctx, cfg));
    });

    it('drawDebugWorld draws world-space strokes with balanced save/restore', () => {
        const ctx = makeCtx();
        assert.doesNotThrow(() => drawDebugWorld(cam, ctx, createDebugHUDConfig()));
        assert.ok(ctx.count('stroke') > 0);
        assert.equal(ctx.count('save'), ctx.count('restore'));
    });

    it('cam.debug() and cam.debugHUD() facades route to the draws without throwing', () => {
        const ctx = makeCtx();
        assert.doesNotThrow(() => { cam.debug(ctx); cam.debugHUD(ctx); });
    });

    it('HUD renders while a shake is active', () => {
        cam.shakePreset('explosion');
        cam.update(0.016, 400, 300, 0, 0);
        const ctx = makeCtx();
        assert.doesNotThrow(() => cam.debugHUD(ctx));
        assert.ok(ctx.count('fillText') > 0);
    });
});

describe('ShakePresets registry', () => {
    const BUILTINS = ['explosion', 'earthquake', 'recoil', 'impact', 'landing', 'damage', 'rumble', 'heavy_impact'];

    it('exports 8 frozen preset constants with numeric trauma', () => {
        for (const p of [EXPLOSION, EARTHQUAKE, RECOIL, IMPACT, LANDING, DAMAGE, RUMBLE, HEAVY_IMPACT]) {
            assert.equal(Object.isFrozen(p), true);
            assert.equal(typeof p.trauma, 'number');
        }
    });

    it('listPresets includes every built-in', () => {
        const names = listPresets();
        for (const n of BUILTINS) assert.ok(names.includes(n));
    });

    it('getPreset is case-insensitive and returns null for unknown names', () => {
        assert.ok(getPreset('explosion'));
        assert.equal(getPreset('EXPLOSION'), getPreset('explosion'));
        assert.equal(getPreset('does_not_exist'), null);
    });

    it('registerPreset stores a frozen copy retrievable by name', () => {
        const profile = { trauma: 0.3, freq: 28, decay: 3.0, maxOffset: 8, maxAngle: 0.03, dirX: 1, dirY: 0 };
        registerPreset('test_sword_clash', profile);
        const got = getPreset('test_sword_clash');
        assert.ok(got);
        assert.equal(got.trauma, 0.3);
        assert.equal(Object.isFrozen(got), true);
        assert.notEqual(got, profile);
        assert.ok(listPresets().includes('test_sword_clash'));
    });
});

describe('Functional shake API', () => {
    it('createShakeState starts inactive with 8 slots', () => {
        const s = createShakeState();
        assert.equal(s.slotCount, 8);
        assert.equal(s.slots.length, 8);
        assert.equal(s.active, false);
        assert.ok(s.slots.every((sl) => sl.active === false));
    });

    it('computeShake outputs exactly zero when no slot is active', () => {
        const s = createShakeState();
        computeShake(s);
        assert.equal(s.offsetX, 0);
        assert.equal(s.offsetY, 0);
        assert.equal(s.angle, 0);
    });

    it('addTraumaSimple activates the state', () => {
        const s = createShakeState();
        addTraumaSimple(s, 0.6);
        assert.equal(s.active, true);
    });

    it('computeShake yields finite, bounded offsets under trauma', () => {
        const s = createShakeState();
        addTraumaSimple(s, 0.8);
        updateShake(s, 0.05);
        computeShake(s);
        assert.ok(Number.isFinite(s.offsetX));
        assert.ok(Number.isFinite(s.offsetY));
        // |offset| <= maxOffset(15) * trauma^2 * |noise<=1| <= 15
        assert.ok(Math.abs(s.offsetX) <= 16);
        assert.ok(Math.abs(s.offsetY) <= 16);
    });

    it('updateShake decays trauma to zero over time', () => {
        const s = createShakeState();
        addTraumaSimple(s, 1.0);
        for (let i = 0; i < 200; i++) updateShake(s, 0.05); // 10s at decay 1.0/s
        assert.equal(s.active, false);
    });

    it('clearShakes deactivates every slot', () => {
        const s = createShakeState();
        addShake(s, EXPLOSION);
        clearShakes(s);
        assert.equal(s.active, false);
        assert.ok(s.slots.every((sl) => sl.active === false));
    });
});

describe('Functional parallax API', () => {
    it('createParallaxState starts empty', () => {
        assert.equal(createParallaxState().activeCount, 0);
    });

    it('addParallaxLayer registers a layer and defaults speedY to speedX', () => {
        const p = createParallaxState();
        const layer = addParallaxLayer(p, 'sky', 0.5);
        assert.equal(p.activeCount, 1);
        assert.equal(layer.speedX, 0.5);
        assert.equal(layer.speedY, 0.5);
    });

    it('updateParallax computes scroll = cam * speed * zoom', () => {
        const p = createParallaxState();
        addParallaxLayer(p, 'bg', 0.5, 0.25);
        updateParallax(p, 100, 80, 1);
        const out = { x: 0, y: 0 };
        assert.equal(getLayerScroll(p, 'bg', out), out);
        assert.ok(close(out.x, 50, 5));
        assert.ok(close(out.y, 20, 5));
    });

    it('getLayerScroll returns null for an unknown layer', () => {
        assert.equal(getLayerScroll(createParallaxState(), 'nope', { x: 0, y: 0 }), null);
    });

    it('applyParallaxLayer translates by negative integer scroll and returns true', () => {
        const p = createParallaxState();
        addParallaxLayer(p, 'mid', 0.5);
        updateParallax(p, 100, 100, 1); // scroll = 50, 50
        const ctx = makeCtx();
        assert.equal(applyParallaxLayer(p, 'mid', ctx), true);
        const tr = ctx.calls.find((c) => c.name === 'translate');
        assert.deepEqual(tr.args, [-50, -50]);
    });

    it('applyParallaxLayer returns false (and does not translate) for unknown layer', () => {
        const ctx = makeCtx();
        assert.equal(applyParallaxLayer(createParallaxState(), 'ghost', ctx), false);
        assert.equal(ctx.count('translate'), 0);
    });

    it('removeParallaxLayer decrements activeCount', () => {
        const p = createParallaxState();
        addParallaxLayer(p, 'a', 0.3);
        addParallaxLayer(p, 'b', 0.6);
        removeParallaxLayer(p, 'a');
        assert.equal(p.activeCount, 1);
    });
});

describe('Functional bounds API', () => {
    it('createBoundsState defaults every edge to HARD with no custom rect', () => {
        const b = createBoundsState();
        assert.equal(b.left, BoundsType.HARD);
        assert.equal(b.right, BoundsType.HARD);
        assert.equal(b.top, BoundsType.HARD);
        assert.equal(b.bottom, BoundsType.HARD);
        assert.equal(b.customBounds, false);
    });

    it('setBoundsAll sets every edge', () => {
        const b = createBoundsState();
        setBoundsAll(b, BoundsType.SOFT);
        assert.equal(b.left, BoundsType.SOFT);
        assert.equal(b.bottom, BoundsType.SOFT);
    });

    it('setBoundsEdges updates only the specified edges', () => {
        const b = createBoundsState();
        setBoundsEdges(b, { left: BoundsType.ELASTIC, top: BoundsType.NONE });
        assert.equal(b.left, BoundsType.ELASTIC);
        assert.equal(b.top, BoundsType.NONE);
        assert.equal(b.right, BoundsType.HARD); // untouched
    });

    it('setBoundsRect / clearBoundsRect toggle customBounds and store the rect', () => {
        const b = createBoundsState();
        setBoundsRect(b, 200, 200, 1200, 800);
        assert.equal(b.customBounds, true);
        assert.equal(b.boundsX, 200);
        assert.equal(b.boundsW, 1200);
        clearBoundsRect(b);
        assert.equal(b.customBounds, false);
    });

    it('BoundsType enum values are stable', () => {
        assert.equal(BoundsType.HARD, 0);
        assert.equal(BoundsType.SOFT, 1);
        assert.equal(BoundsType.ELASTIC, 2);
        assert.equal(BoundsType.NONE, 3);
    });
});

describe('Sequence preset helpers', () => {
    let cam;
    beforeEach(() => { cam = new CinematicCameraPro(800, 600, 3200, 2400); });

    it('panTo returns a playable sequence', () => {
        const seq = panTo(cam, 400, 300, 800);
        assert.ok(seq);
        assert.equal(typeof seq.moveTo, 'function');
        cam.playSequence(seq);
        assert.equal(cam.sequencePlaying, true);
        cam.stopSequence();
        assert.equal(cam.sequencePlaying, false);
    });

    it('dramaticZoom builds and plays without throwing', () => {
        const seq = dramaticZoom(cam, 500, 400, 2.0, 1000);
        assert.ok(seq);
        assert.doesNotThrow(() => { cam.playSequence(seq); cam.update(0.1, 500, 400, 0, 0); });
    });

    it('bossReveal builds a multi-step sequence that plays', () => {
        const seq = bossReveal(cam, 600, 300, 3000);
        assert.ok(seq);
        cam.playSequence(seq);
        assert.equal(cam.sequencePlaying, true);
    });

    it('timedShake builds a shake+wait sequence that plays without throwing', () => {
        const seq = timedShake(cam, 'impact', 500);
        assert.ok(seq);
        assert.doesNotThrow(() => { cam.playSequence(seq); cam.update(0.1, 0, 0, 0, 0); });
    });

    it('createCameraSequence is fluent (each step returns the sequence)', () => {
        const seq = createCameraSequence(cam);
        assert.equal(seq.moveTo(100, 100, 500), seq);
        assert.equal(seq.zoomTo(2.0, 300), seq);
        assert.equal(seq.wait(200), seq);
    });
});

describe('Multi-target state + updater (direct from entry)', () => {
    let cam;
    beforeEach(() => { cam = new CinematicCameraPro(800, 600, 3200, 2400); });

    it('createMultiTargetState builds an inactive default config (CP-1: now on the entry)', () => {
        const mt = createMultiTargetState();
        assert.equal(mt.active, false);
        assert.equal(mt.count, 0);
        assert.equal(mt.paddingX, 80);
        assert.equal(mt.paddingY, 80);
    });

    it('count of 0 is a no-op', () => {
        const z = cam.zoom;
        const tx = cam.target[0];
        assert.doesNotThrow(() => updateMultiTarget(cam, 0.016, [], 0));
        assert.equal(cam.zoom, z);
        assert.equal(cam.target[0], tx);
    });

    it('framing two targets keeps target and zoom finite and positive', () => {
        const targets = [{ x: 200, y: 200 }, { x: 1400, y: 1000 }];
        for (let i = 0; i < 30; i++) updateMultiTarget(cam, 0.05, targets, 2);
        assert.ok(Number.isFinite(cam.target[0]));
        assert.ok(Number.isFinite(cam.target[1]));
        assert.ok(Number.isFinite(cam.zoom));
        assert.ok(cam.zoom > 0);
    });
});
