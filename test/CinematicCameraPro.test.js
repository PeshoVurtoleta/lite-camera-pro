import { describe, it, expect, beforeEach } from 'vitest';
import { CinematicCameraPro, FollowMode, BoundsType, WrapMode } from '../src/index.js';

describe('CinematicCameraPro', () => {
    let cam;

    beforeEach(() => {
        cam = new CinematicCameraPro(800, 600, 3200, 2400);
    });

    describe('Initialization & Core State', () => {
        it('initializes with correct viewport and world bounds', () => {
            expect(cam.viewW).toBe(800);
            expect(cam.viewH).toBe(600);
            expect(cam.worldW).toBe(3200);
            expect(cam.worldH).toBe(2400);
            expect(cam.zoom).toBe(1.0);
            expect(cam.mode).toBe(FollowMode.SMOOTH);
        });

        it('pre-allocates internal typed arrays', () => {
            expect(cam.pos).toBeInstanceOf(Float32Array);
            expect(cam.target).toBeInstanceOf(Float32Array);
            expect(cam.look).toBeInstanceOf(Float32Array);
            expect(cam.pos.length).toBe(2);
        });

        it('initializes cached visible dimensions at viewport size', () => {
            expect(cam.visibleW).toBe(800);
            expect(cam.visibleH).toBe(600);
        });

        it('initializes max bounds correctly', () => {
            expect(cam._maxX).toBe(3200 - 800);
            expect(cam._maxY).toBe(2400 - 600);
        });

        it('initializes shake engine with 8 inactive slots', () => {
            expect(cam._shake.slotCount).toBe(8);
            for (let i = 0; i < 8; i++) {
                expect(cam._shake.slots[i].active).toBe(false);
            }
        });

        it('initializes parallax with zero active layers', () => {
            expect(cam._parallax.activeCount).toBe(0);
        });

        it('initializes bounds as all HARD', () => {
            expect(cam._bounds.left).toBe(BoundsType.HARD);
            expect(cam._bounds.right).toBe(BoundsType.HARD);
            expect(cam._bounds.top).toBe(BoundsType.HARD);
            expect(cam._bounds.bottom).toBe(BoundsType.HARD);
        });
    });

    describe('Coordinate Conversion (Zero-Alloc)', () => {
        it('converts screen to world accurately with zoom', () => {
            const out = { x: 0, y: 0 };
            cam.pos[0] = 100; cam.pos[1] = 100;
            cam.setZoom(2.0);
            cam.screenToWorld(400, 300, out);
            expect(out.x).toBe(300);
            expect(out.y).toBe(250);
        });

        it('converts world to screen accurately with zoom', () => {
            const out = { x: 0, y: 0 };
            cam.pos[0] = 100; cam.pos[1] = 100;
            cam.setZoom(0.5);
            cam.worldToScreen(300, 200, out);
            expect(out.x).toBe(100);
            expect(out.y).toBe(50);
        });

        it('round-trips screen to world to screen at zoom 2', () => {
            const pt = { x: 0, y: 0 };
            const pt2 = { x: 0, y: 0 };
            cam.pos[0] = 500; cam.pos[1] = 300;
            cam.setZoom(2.0);
            cam.screenToWorld(200, 150, pt);
            cam.worldToScreen(pt.x, pt.y, pt2);
            expect(pt2.x).toBeCloseTo(200, 5);
            expect(pt2.y).toBeCloseTo(150, 5);
        });

        it('mutates the out object without allocating', () => {
            const out = { x: 99, y: 99 };
            const returned = cam.screenToWorld(0, 0, out);
            expect(returned).toBe(out);
        });
    });

    describe('Follow Modes & Target Tracking', () => {
        it('switches follow modes cleanly', () => {
            cam.setMode(FollowMode.CUT);
            expect(cam.mode).toBe(FollowMode.CUT);
        });

        it('setMode returns this for chaining', () => {
            expect(cam.setMode(FollowMode.LOCK)).toBe(cam);
        });

        it('LOCK mode snaps position to target instantly', () => {
            cam.setMode(FollowMode.LOCK);
            cam.update(1/60, 500, 400, 0, 0);
            expect(cam.pos[0]).toBeCloseTo(cam.target[0], 0);
            expect(cam.pos[1]).toBeCloseTo(cam.target[1], 0);
        });

        it('CUT mode zeroes lookahead', () => {
            cam.setMode(FollowMode.CUT);
            cam.look[0] = 50;
            cam.update(1/60, 600, 500, 100, 0);
            expect(cam.look[0]).toBe(0);
            expect(cam.look[1]).toBe(0);
        });

        it('PREDICTIVE mode uses velocity extrapolation', () => {
            cam.setMode(FollowMode.PREDICTIVE);
            cam.predictTime = 0.5;
            for (let i = 0; i < 30; i++) cam.update(1/60, 500+i*5, 400, 300, 0);
            expect(cam.look[0]).toBeGreaterThan(0);
        });

        it('HYBRID mode locks vertical and smooths horizontal', () => {
            cam.setMode(FollowMode.HYBRID);
            cam.update(1/60, 500, 400, 100, 0);
            expect(cam.look[1]).toBe(0);
        });

        it('updates multi-target configuration properly', () => {
            const t1 = { x: 100, y: 100 };
            const t2 = { x: 300, y: 300 };
            cam.trackMultiple([t1, t2], { paddingX: 50 });
            expect(cam._mt.active).toBe(true);
            expect(cam._mt.count).toBe(2);
            expect(cam._mt.paddingX).toBe(50);
            cam.trackSingle();
            expect(cam._mt.active).toBe(false);
            expect(cam._mt.count).toBe(0);
        });

        it('trackMultiple accepts padding shorthand', () => {
            cam.trackMultiple([{ x: 0, y: 0 }], { padding: 100 });
            expect(cam._mt.paddingX).toBe(100);
            expect(cam._mt.paddingY).toBe(100);
        });
    });

    describe('Multi-Target Framing', () => {
        it('auto-zooms out when targets are far apart', () => {
            cam.trackMultiple([{ x: 100, y: 100 }, { x: 2000, y: 1800 }], { padding: 80, minZoom: 0.3, maxZoom: 2.0 });
            for (let i = 0; i < 60; i++) cam.update(1/60, 100, 100);
            expect(cam.zoom).toBeLessThan(1.0);
        });

        it('auto-zooms in when targets are close', () => {
            cam.trackMultiple([{ x: 500, y: 500 }, { x: 520, y: 510 }], { padding: 40, minZoom: 0.3, maxZoom: 2.0 });
            for (let i = 0; i < 60; i++) cam.update(1/60, 500, 500);
            expect(cam.zoom).toBeGreaterThan(1.0);
        });

        it('handles overlapping targets safely (no Infinity/NaN)', () => {
            cam.trackMultiple([{ x: 500, y: 500 }, { x: 500, y: 500 }], { padding: 0, maxZoom: 2.0 });
            for (let i = 0; i < 10; i++) cam.update(1/60, 500, 500);
            expect(cam.zoom).not.toBe(Infinity);
            expect(cam.zoom).not.toBeNaN();
            expect(cam.zoom).toBeLessThanOrEqual(2.0);
        });

        it('setTargetCount updates without reallocating', () => {
            const targets = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
            cam.trackMultiple(targets);
            cam.setTargetCount(1);
            expect(cam._mt.count).toBe(1);
            expect(cam._mt.targets).toBe(targets);
        });
    });

    describe('Zoom API', () => {
        it('clamps zoom to min/max', () => {
            cam.setZoom(10.0);
            expect(cam.zoom).toBe(4.0);
            cam.setZoom(0.1);
            expect(cam.zoom).toBe(0.25);
        });

        it('sets up zoom interpolation without instant jump', () => {
            cam.setZoom(2.0, 1.0);
            expect(cam.zoom).toBe(1.0);
            expect(cam._zoomTo).toBe(2.0);
            expect(cam._zoomDur).toBe(1.0);
        });

        it('animates zoom partway through duration', () => {
            cam.setZoom(2.0, 1.0);
            cam.update(0.5, 400, 300);
            expect(cam.zoom).toBeGreaterThan(1.0);
            expect(cam.zoom).toBeLessThan(2.0);
        });

        it('completes zoom at end of duration', () => {
            cam.setZoom(2.0, 0.5);
            cam.update(0.6, 400, 300);
            expect(cam.zoom).toBe(2.0);
            expect(cam._zoomDur).toBe(0);
        });

        it('updates visibleW/H when zoom changes', () => {
            cam.setZoom(2.0);
            cam.update(1/60, 400, 300);
            expect(cam.visibleW).toBeCloseTo(400, 0);
            expect(cam.visibleH).toBeCloseTo(300, 0);
        });

        it('zoomAt static stores anchor', () => {
            cam.zoomAt(500, 300, 2.0, 0.5);
            expect(cam._hasAnchor).toBe(true);
            expect(cam._zoomAnchorX).toBe(500);
        });

        it('zoomAt with object stores dynamic target', () => {
            const boss = { x: 500, y: 300 };
            cam.zoomAt(boss, 2.0, 0.5);
            expect(cam._zoomTarget).toBe(boss);
        });

        it('setZoom returns this for chaining', () => {
            expect(cam.setZoom(1.5)).toBe(cam);
        });
    });

    describe('Advanced Shake Engine', () => {
        it('adds trauma via legacy API', () => {
            cam.addTrauma(0.5);
            expect(cam._shake.active).toBe(true);
            expect(cam._shake.slots[0].trauma).toBe(0.5);
        });

        it('stacks trauma onto existing omni slot', () => {
            cam.addTrauma(0.3);
            cam.addTrauma(0.2);
            expect(cam._shake.slots[0].trauma).toBeCloseTo(0.5, 5);
            expect(cam._shake.slots[1].active).toBe(false);
        });

        it('stacks preset shakes into separate slots', () => {
            cam.shakePreset('explosion');
            cam.shakePreset('recoil');
            expect(cam._shake.slots[0].active).toBe(true);
            expect(cam._shake.slots[1].active).toBe(true);
            expect(cam._shake.slots[1].isDirectional).toBe(true);
        });

        it('custom profile works', () => {
            cam.shake({ trauma: 0.4, freq: 20, decay: 2.0, maxOffset: 10 });
            expect(cam._shake.slots[0].freq).toBe(20);
        });

        it('directional shake normalizes direction', () => {
            cam.shake({ trauma: 0.5, dirX: 3, dirY: 4 });
            const s = cam._shake.slots[0];
            expect(s.isDirectional).toBe(true);
            expect(s.dirX).toBeCloseTo(0.6, 5);
            expect(s.dirY).toBeCloseTo(0.8, 5);
        });

        it('clears all shakes', () => {
            cam.shakePreset('explosion');
            cam.shakePreset('recoil');
            cam.clearShakes();
            expect(cam._shake.active).toBe(false);
            expect(cam._shake.slots[0].active).toBe(false);
            expect(cam._shake.offsetX).toBe(0);
        });

        it('trauma decays over time', () => {
            cam.addTrauma(0.8);
            cam.update(0.5, 400, 300);
            expect(cam._shake.slots[0].trauma).toBeLessThan(0.8);
        });

        it('slot deactivates when trauma reaches zero', () => {
            cam.shake({ trauma: 0.1, decay: 10 });
            cam.update(0.5, 400, 300);
            expect(cam._shake.slots[0].active).toBe(false);
        });

        it('steals weakest slot when all 8 are full', () => {
            for (let i = 0; i < 8; i++) cam.shake({ trauma: 0.1*(i+1), freq: 15, decay: 0.01 });
            cam.shake({ trauma: 0.9, freq: 25, decay: 0.5 });
            let found = false;
            for (let i = 0; i < 8; i++) if (cam._shake.slots[i].freq === 25) found = true;
            expect(found).toBe(true);
        });

        it('unknown preset name is ignored', () => {
            cam.shakePreset('nonexistent');
            expect(cam._shake.active).toBe(false);
        });

        it('addTrauma returns this', () => {
            expect(cam.addTrauma(0.1)).toBe(cam);
        });
    });

    describe('Bounds System', () => {
        it('updates globally and per-edge', () => {
            cam.setBoundsType(BoundsType.SOFT);
            expect(cam._bounds.left).toBe(BoundsType.SOFT);
            expect(cam._bounds.top).toBe(BoundsType.SOFT);
            cam.setBoundsEdges({ right: BoundsType.ELASTIC });
            expect(cam._bounds.right).toBe(BoundsType.ELASTIC);
            expect(cam._bounds.left).toBe(BoundsType.SOFT);
        });

        it('sets and clears custom bounds', () => {
            cam.setBoundsRect(100, 100, 500, 500);
            expect(cam._bounds.customBounds).toBe(true);
            expect(cam._bounds.boundsW).toBe(500);
            cam.clearBoundsRect();
            expect(cam._bounds.customBounds).toBe(false);
        });

        it('HARD clamps target to 0 at edges', () => {
            cam.setBoundsType(BoundsType.HARD);
            cam.target[0] = -50; cam.target[1] = -30;
            cam.update(1/60, 10, 10);
            expect(cam.target[0]).toBeGreaterThanOrEqual(0);
            expect(cam.target[1]).toBeGreaterThanOrEqual(0);
        });

        it('NONE allows target past world edges', () => {
            cam.setBoundsType(BoundsType.NONE);
            cam.setMode(FollowMode.LOCK);
            cam.update(1/60, -500, -500);
            expect(cam.target[0]).toBeLessThan(0);
        });

        it('custom bounds constrains camera to rectangle', () => {
            cam.setBoundsRect(200, 200, 1200, 1000);
            cam.setMode(FollowMode.LOCK);
            cam.update(1/60, 100, 100);
            expect(cam.target[0]).toBeGreaterThanOrEqual(200);
            expect(cam.target[1]).toBeGreaterThanOrEqual(200);
        });

        it('setBoundsType returns this', () => {
            expect(cam.setBoundsType(BoundsType.SOFT)).toBe(cam);
        });

        it('custom bounds clamps to upper edge', () => {
            cam.setBoundsRect(0, 0, 1000, 800);
            cam.setMode(FollowMode.LOCK);
            cam.update(1/60, 9999, 9999);
            expect(cam.target[0]).toBeLessThanOrEqual(200); // 1000 - 800 visible
            expect(cam.target[1]).toBeLessThanOrEqual(200); //  800 - 600 visible
        });

        it('ELASTIC bounds keeps pos finite', () => {
            cam.setBoundsType(BoundsType.ELASTIC);
            cam.setMode(FollowMode.LOCK);
            cam.update(1/60, -500, -500);
            expect(Number.isFinite(cam.pos[0])).toBe(true);
            expect(Number.isFinite(cam.pos[1])).toBe(true);
        });
    });

    describe('Parallax Management', () => {
        it('adds and removes layers', () => {
            cam.addParallaxLayer('bg1', 0.5);
            expect(cam._parallax.activeCount).toBe(1);
            cam.addParallaxLayer('fg1', 1.5);
            expect(cam._parallax.activeCount).toBe(2);
            cam.removeParallaxLayer('bg1');
            expect(cam._parallax.activeCount).toBe(1);
            expect(cam._parallax.layers[0].active).toBe(false);
        });

        it('defaults speedY to speedX', () => {
            cam.addParallaxLayer('bg', 0.3);
            expect(cam._parallax.layers[0].speedY).toBe(0.3);
        });

        it('updates existing layer by id', () => {
            cam.addParallaxLayer('bg', 0.5);
            cam.addParallaxLayer('bg', 0.8);
            expect(cam._parallax.activeCount).toBe(1);
            expect(cam._parallax.layers[0].speedX).toBe(0.8);
        });

        it('scroll updates with camera position', () => {
            cam.addParallaxLayer('bg', 0.5);
            cam.pos[0] = 200; cam.pos[1] = 100;
            cam.update(1/60, 600, 400);
            expect(cam._parallax.layers[0].scrollX).not.toBe(0);
        });

        it('returns this for chaining', () => {
            expect(cam.addParallaxLayer('test', 0.5)).toBe(cam);
        });
    });

    describe('Sequences', () => {
        it('createSequence returns fluent API', () => {
            const seq = cam.createSequence();
            expect(seq.moveTo).toBeTypeOf('function');
            expect(seq.zoomTo).toBeTypeOf('function');
            expect(seq.shake).toBeTypeOf('function');
            expect(seq.wait).toBeTypeOf('function');
            expect(seq.call).toBeTypeOf('function');
        });

        it('fluent methods chain', () => {
            const seq = cam.createSequence();
            expect(seq.moveTo(100, 100, 500).zoomTo(2.0, 300).wait(200)).toBe(seq);
        });

        it('sequencePlaying is false when idle', () => {
            expect(cam.sequencePlaying).toBe(false);
        });

        it('stopSequence clears active sequence', () => {
            cam.playSequence(cam.createSequence().wait(99999));
            cam.stopSequence();
            expect(cam._seq).toBeNull();
        });
    });

    describe('Save / Load', () => {
        it('getState captures current state', () => {
            cam.pos[0] = 123; cam.pos[1] = 456;
            cam.zoom = 1.5; cam.mode = FollowMode.PREDICTIVE;
            const s = cam.getState();
            expect(s.posX).toBe(123);
            expect(s.posY).toBe(456);
            expect(s.zoom).toBe(1.5);
            expect(s.mode).toBe(FollowMode.PREDICTIVE);
        });

        it('setState restores state', () => {
            cam.setState({ posX: 100, posY: 200, zoom: 2.0, mode: FollowMode.LOCK });
            expect(cam.pos[0]).toBe(100);
            expect(cam.zoom).toBe(2.0);
            expect(cam.mode).toBe(FollowMode.LOCK);
        });

        it('setState updates visibleW/H', () => {
            cam.setState({ zoom: 2.0 });
            expect(cam.visibleW).toBeCloseTo(400, 0);
        });

        it('round-trips getState to setState', () => {
            cam.pos[0] = 555; cam.zoom = 1.75;
            const snap = cam.getState();
            const cam2 = new CinematicCameraPro(800, 600, 3200, 2400);
            cam2.setState(snap);
            expect(cam2.pos[0]).toBe(555);
            expect(cam2.zoom).toBe(1.75);
        });
    });

    describe('Edge Cases', () => {
        it('update with dt=0 does not crash', () => {
            expect(() => cam.update(0, 400, 300)).not.toThrow();
        });

        it('update with large dt does not crash', () => {
            expect(() => cam.update(1.0, 400, 300)).not.toThrow();
        });

        it('destroy nullifies state', () => {
            cam.destroy();
            expect(cam.pos).toBeNull();
            expect(cam.target).toBeNull();
        });

        it('multiple setZoom calls — last wins', () => {
            cam.setZoom(2.0, 1.0);
            cam.setZoom(3.0, 0.5);
            expect(cam._zoomTo).toBe(3.0);
            expect(cam._zoomDur).toBe(0.5);
        });

        it('playSequence replaces existing', () => {
            const seq1 = cam.createSequence().wait(9999);
            const seq2 = cam.createSequence().wait(9999);
            cam.playSequence(seq1);
            cam.playSequence(seq2);
            expect(cam._seq).toBe(seq2);
        });

        it('enum values are correct', () => {
            expect(FollowMode.SMOOTH).toBe(0);
            expect(FollowMode.HYBRID).toBe(4);
            expect(BoundsType.HARD).toBe(0);
            expect(BoundsType.NONE).toBe(3);
        });
    });
});
