/**
 * Direct-surface coverage for the standalone exports that the facade suite
 * (CinematicCameraPro.test.js) only exercises indirectly: the DebugHUD draws,
 * the functional shake/parallax/bounds API, the multi-target updater, the
 * shake-preset registry, and the sequence preset helpers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    CinematicCameraPro,
    createDebugHUDConfig, drawDebugHUD, drawDebugWorld,
    EXPLOSION, EARTHQUAKE, RECOIL, IMPACT, LANDING, DAMAGE, RUMBLE, HEAVY_IMPACT,
    getPreset, registerPreset, listPresets,
    computeShake, addShake, addTraumaSimple, updateShake, clearShakes,
    createParallaxState, addParallaxLayer, removeParallaxLayer, updateParallax,
    getLayerScroll, applyParallaxLayer,
    BoundsType, createBoundsState, setBoundsAll, setBoundsEdges, setBoundsRect, clearBoundsRect,
    updateMultiTarget,
    createCameraSequence, panTo, dramaticZoom, bossReveal, timedShake,
} from '../src/index.js';
// createShakeState is exported by the module but NOT re-exported from index.js.
import { createShakeState } from '../src/ShakeEngine.js';

// Recording mock Canvas2D context: captures every method call, swallows style assignments.
function makeCtx() {
    const calls = [];
    const ctx = {
        calls,
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, textBaseline: '',
        count(name) { return calls.filter((c) => c.name === name).length; },
    };
    const methods = ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath',
        'moveTo', 'lineTo', 'stroke', 'fill', 'fillRect', 'strokeRect', 'fillText',
        'closePath', 'arc', 'rect', 'clip', 'setTransform'];
    for (const name of methods) ctx[name] = (...args) => { calls.push({ name, args }); };
    return ctx;
}

describe('DebugHUD', () => {
    let cam;
    beforeEach(() => { cam = new CinematicCameraPro(800, 600, 3200, 2400); });

    it('createDebugHUDConfig returns a toggleable panel config', () => {
        const cfg = createDebugHUDConfig();
        expect(cfg.x).toBe(4);
        expect(cfg.y).toBe(4);
        expect(cfg.show.shake).toBe(true);
        expect(cfg.show.parallax).toBe(true);
        expect(cfg.show.bounds).toBe(true);
        expect(cfg.show.deadzone).toBe(true);
    });

    it('drawDebugHUD draws screen-space text with balanced save/restore', () => {
        const ctx = makeCtx();
        expect(() => drawDebugHUD(cam, ctx, createDebugHUDConfig())).not.toThrow();
        expect(ctx.count('fillText')).toBeGreaterThan(0);
        expect(ctx.count('save')).toBe(ctx.count('restore'));
    });

    it('drawDebugHUD works with no config argument (internal defaults)', () => {
        const ctx = makeCtx();
        expect(() => drawDebugHUD(cam, ctx)).not.toThrow();
        expect(ctx.count('fillText')).toBeGreaterThan(0);
    });

    it('drawDebugHUD with every panel disabled does not throw', () => {
        const cfg = createDebugHUDConfig();
        for (const k of Object.keys(cfg.show)) cfg.show[k] = false;
        const ctx = makeCtx();
        expect(() => drawDebugHUD(cam, ctx, cfg)).not.toThrow();
    });

    it('drawDebugWorld draws world-space strokes with balanced save/restore', () => {
        const ctx = makeCtx();
        expect(() => drawDebugWorld(cam, ctx, createDebugHUDConfig())).not.toThrow();
        expect(ctx.count('stroke')).toBeGreaterThan(0);
        expect(ctx.count('save')).toBe(ctx.count('restore'));
    });

    it('cam.debug() and cam.debugHUD() facades route to the draws without throwing', () => {
        const ctx = makeCtx();
        expect(() => { cam.debug(ctx); cam.debugHUD(ctx); }).not.toThrow();
    });

    it('HUD renders while a shake is active', () => {
        cam.shakePreset('explosion');
        cam.update(0.016, 400, 300, 0, 0);
        const ctx = makeCtx();
        expect(() => cam.debugHUD(ctx)).not.toThrow();
        expect(ctx.count('fillText')).toBeGreaterThan(0);
    });
});

describe('ShakePresets registry', () => {
    const BUILTINS = ['explosion', 'earthquake', 'recoil', 'impact', 'landing', 'damage', 'rumble', 'heavy_impact'];

    it('exports 8 frozen preset constants with numeric trauma', () => {
        for (const p of [EXPLOSION, EARTHQUAKE, RECOIL, IMPACT, LANDING, DAMAGE, RUMBLE, HEAVY_IMPACT]) {
            expect(Object.isFrozen(p)).toBe(true);
            expect(typeof p.trauma).toBe('number');
        }
    });

    it('listPresets includes every built-in', () => {
        const names = listPresets();
        for (const n of BUILTINS) expect(names).toContain(n);
    });

    it('getPreset is case-insensitive and returns null for unknown names', () => {
        expect(getPreset('explosion')).toBeTruthy();
        expect(getPreset('EXPLOSION')).toBe(getPreset('explosion'));
        expect(getPreset('does_not_exist')).toBeNull();
    });

    it('registerPreset stores a frozen copy retrievable by name', () => {
        const profile = { trauma: 0.3, freq: 28, decay: 3.0, maxOffset: 8, maxAngle: 0.03, dirX: 1, dirY: 0 };
        registerPreset('test_sword_clash', profile);
        const got = getPreset('test_sword_clash');
        expect(got).toBeTruthy();
        expect(got.trauma).toBe(0.3);
        expect(Object.isFrozen(got)).toBe(true);
        expect(got).not.toBe(profile);
        expect(listPresets()).toContain('test_sword_clash');
    });
});

describe('Functional shake API', () => {
    it('createShakeState starts inactive with 8 slots', () => {
        const s = createShakeState();
        expect(s.slotCount).toBe(8);
        expect(s.slots.length).toBe(8);
        expect(s.active).toBe(false);
        expect(s.slots.every((sl) => sl.active === false)).toBe(true);
    });

    it('computeShake outputs exactly zero when no slot is active', () => {
        const s = createShakeState();
        computeShake(s);
        expect(s.offsetX).toBe(0);
        expect(s.offsetY).toBe(0);
        expect(s.angle).toBe(0);
    });

    it('addTraumaSimple activates the state', () => {
        const s = createShakeState();
        addTraumaSimple(s, 0.6);
        expect(s.active).toBe(true);
    });

    it('computeShake yields finite, bounded offsets under trauma', () => {
        const s = createShakeState();
        addTraumaSimple(s, 0.8);
        updateShake(s, 0.05);
        computeShake(s);
        expect(Number.isFinite(s.offsetX)).toBe(true);
        expect(Number.isFinite(s.offsetY)).toBe(true);
        // |offset| <= maxOffset(15) * trauma^2 * |noise<=1| <= 15
        expect(Math.abs(s.offsetX)).toBeLessThanOrEqual(16);
        expect(Math.abs(s.offsetY)).toBeLessThanOrEqual(16);
    });

    it('updateShake decays trauma to zero over time', () => {
        const s = createShakeState();
        addTraumaSimple(s, 1.0);
        for (let i = 0; i < 200; i++) updateShake(s, 0.05); // 10s at decay 1.0/s
        expect(s.active).toBe(false);
    });

    it('clearShakes deactivates every slot', () => {
        const s = createShakeState();
        addShake(s, EXPLOSION);
        clearShakes(s);
        expect(s.active).toBe(false);
        expect(s.slots.every((sl) => sl.active === false)).toBe(true);
    });
});

describe('Functional parallax API', () => {
    it('createParallaxState starts empty', () => {
        expect(createParallaxState().activeCount).toBe(0);
    });

    it('addParallaxLayer registers a layer and defaults speedY to speedX', () => {
        const p = createParallaxState();
        const layer = addParallaxLayer(p, 'sky', 0.5);
        expect(p.activeCount).toBe(1);
        expect(layer.speedX).toBe(0.5);
        expect(layer.speedY).toBe(0.5);
    });

    it('updateParallax computes scroll = cam * speed * zoom', () => {
        const p = createParallaxState();
        addParallaxLayer(p, 'bg', 0.5, 0.25);
        updateParallax(p, 100, 80, 1);
        const out = { x: 0, y: 0 };
        expect(getLayerScroll(p, 'bg', out)).toBe(out);
        expect(out.x).toBeCloseTo(50, 5);
        expect(out.y).toBeCloseTo(20, 5);
    });

    it('getLayerScroll returns null for an unknown layer', () => {
        expect(getLayerScroll(createParallaxState(), 'nope', { x: 0, y: 0 })).toBeNull();
    });

    it('applyParallaxLayer translates by negative integer scroll and returns true', () => {
        const p = createParallaxState();
        addParallaxLayer(p, 'mid', 0.5);
        updateParallax(p, 100, 100, 1); // scroll = 50, 50
        const ctx = makeCtx();
        expect(applyParallaxLayer(p, 'mid', ctx)).toBe(true);
        const tr = ctx.calls.find((c) => c.name === 'translate');
        expect(tr.args).toEqual([-50, -50]);
    });

    it('applyParallaxLayer returns false (and does not translate) for unknown layer', () => {
        const ctx = makeCtx();
        expect(applyParallaxLayer(createParallaxState(), 'ghost', ctx)).toBe(false);
        expect(ctx.count('translate')).toBe(0);
    });

    it('removeParallaxLayer decrements activeCount', () => {
        const p = createParallaxState();
        addParallaxLayer(p, 'a', 0.3);
        addParallaxLayer(p, 'b', 0.6);
        removeParallaxLayer(p, 'a');
        expect(p.activeCount).toBe(1);
    });
});

describe('Functional bounds API', () => {
    it('createBoundsState defaults every edge to HARD with no custom rect', () => {
        const b = createBoundsState();
        expect(b.left).toBe(BoundsType.HARD);
        expect(b.right).toBe(BoundsType.HARD);
        expect(b.top).toBe(BoundsType.HARD);
        expect(b.bottom).toBe(BoundsType.HARD);
        expect(b.customBounds).toBe(false);
    });

    it('setBoundsAll sets every edge', () => {
        const b = createBoundsState();
        setBoundsAll(b, BoundsType.SOFT);
        expect(b.left).toBe(BoundsType.SOFT);
        expect(b.bottom).toBe(BoundsType.SOFT);
    });

    it('setBoundsEdges updates only the specified edges', () => {
        const b = createBoundsState();
        setBoundsEdges(b, { left: BoundsType.ELASTIC, top: BoundsType.NONE });
        expect(b.left).toBe(BoundsType.ELASTIC);
        expect(b.top).toBe(BoundsType.NONE);
        expect(b.right).toBe(BoundsType.HARD); // untouched
    });

    it('setBoundsRect / clearBoundsRect toggle customBounds and store the rect', () => {
        const b = createBoundsState();
        setBoundsRect(b, 200, 200, 1200, 800);
        expect(b.customBounds).toBe(true);
        expect(b.boundsX).toBe(200);
        expect(b.boundsW).toBe(1200);
        clearBoundsRect(b);
        expect(b.customBounds).toBe(false);
    });

    it('BoundsType enum values are stable', () => {
        expect(BoundsType.HARD).toBe(0);
        expect(BoundsType.SOFT).toBe(1);
        expect(BoundsType.ELASTIC).toBe(2);
        expect(BoundsType.NONE).toBe(3);
    });
});

describe('Sequence preset helpers', () => {
    let cam;
    beforeEach(() => { cam = new CinematicCameraPro(800, 600, 3200, 2400); });

    it('panTo returns a playable sequence', () => {
        const seq = panTo(cam, 400, 300, 800);
        expect(seq).toBeTruthy();
        expect(typeof seq.moveTo).toBe('function');
        cam.playSequence(seq);
        expect(cam.sequencePlaying).toBe(true);
        cam.stopSequence();
        expect(cam.sequencePlaying).toBe(false);
    });

    it('dramaticZoom builds and plays without throwing', () => {
        const seq = dramaticZoom(cam, 500, 400, 2.0, 1000);
        expect(seq).toBeTruthy();
        expect(() => { cam.playSequence(seq); cam.update(0.1, 500, 400, 0, 0); }).not.toThrow();
    });

    it('bossReveal builds a multi-step sequence that plays', () => {
        const seq = bossReveal(cam, 600, 300, 3000);
        expect(seq).toBeTruthy();
        cam.playSequence(seq);
        expect(cam.sequencePlaying).toBe(true);
    });

    it('timedShake builds a shake+wait sequence that plays without throwing', () => {
        const seq = timedShake(cam, 'impact', 500);
        expect(seq).toBeTruthy();
        expect(() => { cam.playSequence(seq); cam.update(0.1, 0, 0, 0, 0); }).not.toThrow();
    });

    it('createCameraSequence is fluent (each step returns the sequence)', () => {
        const seq = createCameraSequence(cam);
        expect(seq.moveTo(100, 100, 500)).toBe(seq);
        expect(seq.zoomTo(2.0, 300)).toBe(seq);
        expect(seq.wait(200)).toBe(seq);
    });
});

describe('updateMultiTarget (direct)', () => {
    let cam;
    beforeEach(() => { cam = new CinematicCameraPro(800, 600, 3200, 2400); });

    it('count of 0 is a no-op', () => {
        const z = cam.zoom;
        const tx = cam.target[0];
        expect(() => updateMultiTarget(cam, 0.016, [], 0)).not.toThrow();
        expect(cam.zoom).toBe(z);
        expect(cam.target[0]).toBe(tx);
    });

    it('framing two targets keeps target and zoom finite and positive', () => {
        const targets = [{ x: 200, y: 200 }, { x: 1400, y: 1000 }];
        for (let i = 0; i < 30; i++) updateMultiTarget(cam, 0.05, targets, 2);
        expect(Number.isFinite(cam.target[0])).toBe(true);
        expect(Number.isFinite(cam.target[1])).toBe(true);
        expect(Number.isFinite(cam.zoom)).toBe(true);
        expect(cam.zoom).toBeGreaterThan(0);
    });
});
