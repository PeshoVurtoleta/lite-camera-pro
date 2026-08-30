// =============================================================================
// CinematicCameraPro -- facade suite (ported vitest -> node:test).
//
// Exercises the class surface: init, coordinate conversion, follow modes,
// multi-target framing, zoom, the noise shake engine, bounds, parallax,
// sequences, save/load, and edge cases. Every assertion that held under vitest
// is preserved; the runner and assertion library are the only change.
// =============================================================================
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CinematicCameraPro, FollowMode, BoundsType } from '../src/index.js';
import './helpers.mjs'; // installs the RAF polyfill for the sequence tests

/** vitest's toBeCloseTo(y, digits): |actual - expected| < 10^-digits / 2. */
function close(actual, expected, digits = 2) {
    return Math.abs(actual - expected) < Math.pow(10, -digits) / 2;
}

describe('CinematicCameraPro', () => {
    let cam;
    beforeEach(() => { cam = new CinematicCameraPro(800, 600, 3200, 2400); });

    // ----------------------------------------------------------------------
    describe('Initialization & Core State', () => {
        it('initializes with correct viewport and world bounds', () => {
            assert.equal(cam.viewW, 800);
            assert.equal(cam.viewH, 600);
            assert.equal(cam.worldW, 3200);
            assert.equal(cam.worldH, 2400);
            assert.equal(cam.zoom, 1.0);
            assert.equal(cam.mode, FollowMode.SMOOTH);
        });

        it('pre-allocates internal typed arrays', () => {
            assert.ok(cam.pos instanceof Float32Array);
            assert.ok(cam.target instanceof Float32Array);
            assert.ok(cam.look instanceof Float32Array);
            assert.equal(cam.pos.length, 2);
        });

        it('initializes cached visible dimensions at viewport size', () => {
            assert.equal(cam.visibleW, 800);
            assert.equal(cam.visibleH, 600);
        });

        it('initializes max bounds correctly', () => {
            assert.equal(cam._maxX, 3200 - 800);
            assert.equal(cam._maxY, 2400 - 600);
        });

        it('initializes shake engine with 8 inactive slots', () => {
            assert.equal(cam._shake.slotCount, 8);
            for (let i = 0; i < 8; i++) assert.equal(cam._shake.slots[i].active, false);
        });

        it('initializes parallax with zero active layers', () => {
            assert.equal(cam._parallax.activeCount, 0);
        });

        it('initializes bounds as all HARD', () => {
            assert.equal(cam._bounds.left, BoundsType.HARD);
            assert.equal(cam._bounds.right, BoundsType.HARD);
            assert.equal(cam._bounds.top, BoundsType.HARD);
            assert.equal(cam._bounds.bottom, BoundsType.HARD);
        });
    });

    // ----------------------------------------------------------------------
    describe('Coordinate Conversion (Zero-Alloc)', () => {
        it('converts screen to world accurately with zoom', () => {
            const out = { x: 0, y: 0 };
            cam.pos[0] = 100; cam.pos[1] = 100;
            cam.setZoom(2.0);
            cam.screenToWorld(400, 300, out);
            assert.equal(out.x, 300);
            assert.equal(out.y, 250);
        });

        it('converts world to screen accurately with zoom', () => {
            const out = { x: 0, y: 0 };
            cam.pos[0] = 100; cam.pos[1] = 100;
            cam.setZoom(0.5);
            cam.worldToScreen(300, 200, out);
            assert.equal(out.x, 100);
            assert.equal(out.y, 50);
        });

        it('round-trips screen to world to screen at zoom 2', () => {
            const pt = { x: 0, y: 0 };
            const pt2 = { x: 0, y: 0 };
            cam.pos[0] = 500; cam.pos[1] = 300;
            cam.setZoom(2.0);
            cam.screenToWorld(200, 150, pt);
            cam.worldToScreen(pt.x, pt.y, pt2);
            assert.ok(close(pt2.x, 200, 5));
            assert.ok(close(pt2.y, 150, 5));
        });

        it('mutates the out object without allocating', () => {
            const out = { x: 99, y: 99 };
            const returned = cam.screenToWorld(0, 0, out);
            assert.equal(returned, out);
        });
    });

    // ----------------------------------------------------------------------
    describe('Follow Modes & Target Tracking', () => {
        it('switches follow modes cleanly', () => {
            cam.setMode(FollowMode.CUT);
            assert.equal(cam.mode, FollowMode.CUT);
        });

        it('setMode returns this for chaining', () => {
            assert.equal(cam.setMode(FollowMode.LOCK), cam);
        });

        it('LOCK mode snaps position to target instantly', () => {
            cam.setMode(FollowMode.LOCK);
            cam.update(1 / 60, 500, 400, 0, 0);
            assert.ok(close(cam.pos[0], cam.target[0], 0));
            assert.ok(close(cam.pos[1], cam.target[1], 0));
        });

        it('CUT mode zeroes lookahead', () => {
            cam.setMode(FollowMode.CUT);
            cam.look[0] = 50;
            cam.update(1 / 60, 600, 500, 100, 0);
            assert.equal(cam.look[0], 0);
            assert.equal(cam.look[1], 0);
        });

        it('PREDICTIVE mode uses velocity extrapolation', () => {
            cam.setMode(FollowMode.PREDICTIVE);
            cam.predictTime = 0.5;
            for (let i = 0; i < 30; i++) cam.update(1 / 60, 500 + i * 5, 400, 300, 0);
            assert.ok(cam.look[0] > 0);
        });

        it('HYBRID mode locks vertical and smooths horizontal', () => {
            cam.setMode(FollowMode.HYBRID);
            cam.update(1 / 60, 500, 400, 100, 0);
            assert.equal(cam.look[1], 0);
        });

        it('updates multi-target configuration properly', () => {
            const t1 = { x: 100, y: 100 };
            const t2 = { x: 300, y: 300 };
            cam.trackMultiple([t1, t2], { paddingX: 50 });
            assert.equal(cam._mt.active, true);
            assert.equal(cam._mt.count, 2);
            assert.equal(cam._mt.paddingX, 50);
            cam.trackSingle();
            assert.equal(cam._mt.active, false);
            assert.equal(cam._mt.count, 0);
        });

        it('trackMultiple accepts padding shorthand', () => {
            cam.trackMultiple([{ x: 0, y: 0 }], { padding: 100 });
            assert.equal(cam._mt.paddingX, 100);
            assert.equal(cam._mt.paddingY, 100);
        });
    });

    // ----------------------------------------------------------------------
    describe('Multi-Target Framing', () => {
        it('auto-zooms out when targets are far apart', () => {
            cam.trackMultiple([{ x: 100, y: 100 }, { x: 2000, y: 1800 }], { padding: 80, minZoom: 0.3, maxZoom: 2.0 });
            for (let i = 0; i < 60; i++) cam.update(1 / 60, 100, 100);
            assert.ok(cam.zoom < 1.0);
        });

        it('auto-zooms in when targets are close', () => {
            cam.trackMultiple([{ x: 500, y: 500 }, { x: 520, y: 510 }], { padding: 40, minZoom: 0.3, maxZoom: 2.0 });
            for (let i = 0; i < 60; i++) cam.update(1 / 60, 500, 500);
            assert.ok(cam.zoom > 1.0);
        });

        it('handles overlapping targets safely (no Infinity/NaN)', () => {
            cam.trackMultiple([{ x: 500, y: 500 }, { x: 500, y: 500 }], { padding: 0, maxZoom: 2.0 });
            for (let i = 0; i < 10; i++) cam.update(1 / 60, 500, 500);
            assert.notEqual(cam.zoom, Infinity);
            assert.ok(!Number.isNaN(cam.zoom));
            assert.ok(cam.zoom <= 2.0);
        });

        it('setTargetCount updates without reallocating', () => {
            const targets = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
            cam.trackMultiple(targets);
            cam.setTargetCount(1);
            assert.equal(cam._mt.count, 1);
            assert.equal(cam._mt.targets, targets);
        });
    });

    // ----------------------------------------------------------------------
    describe('Zoom API', () => {
        it('clamps zoom to min/max', () => {
            cam.setZoom(10.0);
            assert.equal(cam.zoom, 4.0);
            cam.setZoom(0.1);
            assert.equal(cam.zoom, 0.25);
        });

        it('sets up zoom interpolation without instant jump', () => {
            cam.setZoom(2.0, 1.0);
            assert.equal(cam.zoom, 1.0);
            assert.equal(cam._zoomTo, 2.0);
            assert.equal(cam._zoomDur, 1.0);
        });

        it('animates zoom partway through duration', () => {
            cam.setZoom(2.0, 1.0);
            cam.update(0.5, 400, 300);
            assert.ok(cam.zoom > 1.0);
            assert.ok(cam.zoom < 2.0);
        });

        it('completes zoom at end of duration', () => {
            cam.setZoom(2.0, 0.5);
            // dt is clamped to maxDt (0.1) by the 1.2.0 dt policy, so a 0.5s zoom
            // completes over several frames rather than one 0.6s spike.
            for (let i = 0; i < 6; i++) cam.update(0.1, 400, 300); // 0.6s total >= 0.5s dur
            assert.equal(cam.zoom, 2.0);
            assert.equal(cam._zoomDur, 0);
        });

        it('updates visibleW/H when zoom changes', () => {
            cam.setZoom(2.0);
            cam.update(1 / 60, 400, 300);
            assert.ok(close(cam.visibleW, 400, 0));
            assert.ok(close(cam.visibleH, 300, 0));
        });

        it('zoomAt static stores anchor', () => {
            cam.zoomAt(500, 300, 2.0, 0.5);
            assert.equal(cam._hasAnchor, true);
            assert.equal(cam._zoomAnchorX, 500);
        });

        it('zoomAt with object stores dynamic target', () => {
            const boss = { x: 500, y: 300 };
            cam.zoomAt(boss, 2.0, 0.5);
            assert.equal(cam._zoomTarget, boss);
        });

        it('setZoom returns this for chaining', () => {
            assert.equal(cam.setZoom(1.5), cam);
        });
    });

    // ----------------------------------------------------------------------
    describe('Advanced Shake Engine', () => {
        it('adds trauma via legacy API', () => {
            cam.addTrauma(0.5);
            assert.equal(cam._shake.active, true);
            assert.equal(cam._shake.slots[0].trauma, 0.5);
        });

        it('stacks trauma onto existing omni slot', () => {
            cam.addTrauma(0.3);
            cam.addTrauma(0.2);
            assert.ok(close(cam._shake.slots[0].trauma, 0.5, 5));
            assert.equal(cam._shake.slots[1].active, false);
        });

        it('stacks preset shakes into separate slots', () => {
            cam.shakePreset('explosion');
            cam.shakePreset('recoil');
            assert.equal(cam._shake.slots[0].active, true);
            assert.equal(cam._shake.slots[1].active, true);
            assert.equal(cam._shake.slots[1].isDirectional, true);
        });

        it('custom profile works', () => {
            cam.shake({ trauma: 0.4, freq: 20, decay: 2.0, maxOffset: 10 });
            assert.equal(cam._shake.slots[0].freq, 20);
        });

        it('directional shake normalizes direction', () => {
            cam.shake({ trauma: 0.5, dirX: 3, dirY: 4 });
            const s = cam._shake.slots[0];
            assert.equal(s.isDirectional, true);
            assert.ok(close(s.dirX, 0.6, 5));
            assert.ok(close(s.dirY, 0.8, 5));
        });

        it('clears all shakes', () => {
            cam.shakePreset('explosion');
            cam.shakePreset('recoil');
            cam.clearShakes();
            assert.equal(cam._shake.active, false);
            assert.equal(cam._shake.slots[0].active, false);
            assert.equal(cam._shake.offsetX, 0);
        });

        it('trauma decays over time', () => {
            cam.addTrauma(0.8);
            cam.update(0.5, 400, 300);
            assert.ok(cam._shake.slots[0].trauma < 0.8);
        });

        it('slot deactivates when trauma reaches zero', () => {
            cam.shake({ trauma: 0.1, decay: 10 });
            cam.update(0.5, 400, 300);
            assert.equal(cam._shake.slots[0].active, false);
        });

        it('steals weakest slot when all 8 are full', () => {
            for (let i = 0; i < 8; i++) cam.shake({ trauma: 0.1 * (i + 1), freq: 15, decay: 0.01 });
            cam.shake({ trauma: 0.9, freq: 25, decay: 0.5 });
            let found = false;
            for (let i = 0; i < 8; i++) if (cam._shake.slots[i].freq === 25) found = true;
            assert.equal(found, true);
        });

        it('unknown preset name is ignored', () => {
            cam.shakePreset('nonexistent');
            assert.equal(cam._shake.active, false);
        });

        it('addTrauma returns this', () => {
            assert.equal(cam.addTrauma(0.1), cam);
        });
    });

    // ----------------------------------------------------------------------
    describe('Bounds System', () => {
        it('updates globally and per-edge', () => {
            cam.setBoundsType(BoundsType.SOFT);
            assert.equal(cam._bounds.left, BoundsType.SOFT);
            assert.equal(cam._bounds.top, BoundsType.SOFT);
            cam.setBoundsEdges({ right: BoundsType.ELASTIC });
            assert.equal(cam._bounds.right, BoundsType.ELASTIC);
            assert.equal(cam._bounds.left, BoundsType.SOFT);
        });

        it('sets and clears custom bounds', () => {
            cam.setBoundsRect(100, 100, 500, 500);
            assert.equal(cam._bounds.customBounds, true);
            assert.equal(cam._bounds.boundsW, 500);
            cam.clearBoundsRect();
            assert.equal(cam._bounds.customBounds, false);
        });

        it('HARD clamps target to 0 at edges', () => {
            cam.setBoundsType(BoundsType.HARD);
            cam.target[0] = -50; cam.target[1] = -30;
            cam.update(1 / 60, 10, 10);
            assert.ok(cam.target[0] >= 0);
            assert.ok(cam.target[1] >= 0);
        });

        it('NONE allows target past world edges', () => {
            cam.setBoundsType(BoundsType.NONE);
            cam.setMode(FollowMode.LOCK);
            cam.update(1 / 60, -500, -500);
            assert.ok(cam.target[0] < 0);
        });

        it('custom bounds constrains camera to rectangle', () => {
            cam.setBoundsRect(200, 200, 1200, 1000);
            cam.setMode(FollowMode.LOCK);
            cam.update(1 / 60, 100, 100);
            assert.ok(cam.target[0] >= 200);
            assert.ok(cam.target[1] >= 200);
        });

        it('setBoundsType returns this', () => {
            assert.equal(cam.setBoundsType(BoundsType.SOFT), cam);
        });

        it('custom bounds clamps to upper edge', () => {
            cam.setBoundsRect(0, 0, 1000, 800);
            cam.setMode(FollowMode.LOCK);
            cam.update(1 / 60, 9999, 9999);
            assert.ok(cam.target[0] <= 200); // 1000 - 800 visible
            assert.ok(cam.target[1] <= 200); //  800 - 600 visible
        });

        it('ELASTIC bounds keeps pos finite', () => {
            cam.setBoundsType(BoundsType.ELASTIC);
            cam.setMode(FollowMode.LOCK);
            cam.update(1 / 60, -500, -500);
            assert.ok(Number.isFinite(cam.pos[0]));
            assert.ok(Number.isFinite(cam.pos[1]));
        });
    });

    // ----------------------------------------------------------------------
    describe('Parallax Management', () => {
        it('adds and removes layers', () => {
            cam.addParallaxLayer('bg1', 0.5);
            assert.equal(cam._parallax.activeCount, 1);
            cam.addParallaxLayer('fg1', 1.5);
            assert.equal(cam._parallax.activeCount, 2);
            cam.removeParallaxLayer('bg1');
            assert.equal(cam._parallax.activeCount, 1);
            assert.equal(cam._parallax.layers[0].active, false);
        });

        it('defaults speedY to speedX', () => {
            cam.addParallaxLayer('bg', 0.3);
            assert.equal(cam._parallax.layers[0].speedY, 0.3);
        });

        it('updates existing layer by id', () => {
            cam.addParallaxLayer('bg', 0.5);
            cam.addParallaxLayer('bg', 0.8);
            assert.equal(cam._parallax.activeCount, 1);
            assert.equal(cam._parallax.layers[0].speedX, 0.8);
        });

        it('scroll updates with camera position', () => {
            cam.addParallaxLayer('bg', 0.5);
            cam.pos[0] = 200; cam.pos[1] = 100;
            cam.update(1 / 60, 600, 400);
            assert.notEqual(cam._parallax.layers[0].scrollX, 0);
        });

        it('returns this for chaining', () => {
            assert.equal(cam.addParallaxLayer('test', 0.5), cam);
        });
    });

    // ----------------------------------------------------------------------
    describe('Sequences', () => {
        it('createSequence returns fluent API', () => {
            const seq = cam.createSequence();
            assert.equal(typeof seq.moveTo, 'function');
            assert.equal(typeof seq.zoomTo, 'function');
            assert.equal(typeof seq.shake, 'function');
            assert.equal(typeof seq.wait, 'function');
            assert.equal(typeof seq.call, 'function');
        });

        it('fluent methods chain', () => {
            const seq = cam.createSequence();
            assert.equal(seq.moveTo(100, 100, 500).zoomTo(2.0, 300).wait(200), seq);
        });

        it('sequencePlaying is false when idle', () => {
            assert.equal(cam.sequencePlaying, false);
        });

        it('stopSequence clears active sequence', () => {
            cam.playSequence(cam.createSequence().wait(99999));
            cam.stopSequence();
            assert.equal(cam._seq, null);
        });
    });

    // ----------------------------------------------------------------------
    describe('Save / Load', () => {
        it('getState captures current state', () => {
            cam.pos[0] = 123; cam.pos[1] = 456;
            cam.zoom = 1.5; cam.mode = FollowMode.PREDICTIVE;
            const s = cam.getState();
            assert.equal(s.posX, 123);
            assert.equal(s.posY, 456);
            assert.equal(s.zoom, 1.5);
            assert.equal(s.mode, FollowMode.PREDICTIVE);
        });

        it('setState restores state', () => {
            cam.setState({ posX: 100, posY: 200, zoom: 2.0, mode: FollowMode.LOCK });
            assert.equal(cam.pos[0], 100);
            assert.equal(cam.zoom, 2.0);
            assert.equal(cam.mode, FollowMode.LOCK);
        });

        it('setState updates visibleW/H', () => {
            cam.setState({ zoom: 2.0 });
            assert.ok(close(cam.visibleW, 400, 0));
        });

        it('round-trips getState to setState', () => {
            cam.pos[0] = 555; cam.zoom = 1.75;
            const snap = cam.getState();
            const cam2 = new CinematicCameraPro(800, 600, 3200, 2400);
            cam2.setState(snap);
            assert.equal(cam2.pos[0], 555);
            assert.equal(cam2.zoom, 1.75);
        });
    });

    // ----------------------------------------------------------------------
    describe('Edge Cases', () => {
        it('update with dt=0 does not crash', () => {
            assert.doesNotThrow(() => cam.update(0, 400, 300));
        });

        it('update with large dt does not crash', () => {
            assert.doesNotThrow(() => cam.update(1.0, 400, 300));
        });

        it('destroy nullifies state and fails closed on further calls', () => {
            cam.destroy();
            assert.equal(cam.pos, null);
            assert.equal(cam.target, null);
            // CP-8: a post-destroy call must throw the named code, not a raw
            // null deref. (Full-surface coverage lives in regressions.test.js.)
            assert.throws(
                () => cam.screenToWorld(0, 0, { x: 0, y: 0 }),
                (e) => e.code === 'ERR_CAMERA_DESTROYED');
        });

        it('multiple setZoom calls -- last wins', () => {
            cam.setZoom(2.0, 1.0);
            cam.setZoom(3.0, 0.5);
            assert.equal(cam._zoomTo, 3.0);
            assert.equal(cam._zoomDur, 0.5);
        });

        it('playSequence replaces existing', () => {
            const seq1 = cam.createSequence().wait(9999);
            const seq2 = cam.createSequence().wait(9999);
            cam.playSequence(seq1);
            cam.playSequence(seq2);
            assert.equal(cam._seq, seq2);
        });

        it('enum values are correct', () => {
            assert.equal(FollowMode.SMOOTH, 0);
            assert.equal(FollowMode.HYBRID, 4);
            assert.equal(BoundsType.HARD, 0);
            assert.equal(BoundsType.NONE, 3);
        });
    });
});
