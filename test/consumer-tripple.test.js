// =============================================================================
// consumer-tripple.test.js -- G4, the 3PPLE class-only replay (v2.0.0 detach).
//   3PPLE ships single-file HTML artifacts that construct CinematicCameraPro and
//   drive it every frame WITHOUT ever attaching parallax/sequence/debug. This
//   replays their exhaustive surface table with ZERO withX calls and pins the
//   five must-not-change behaviors (H-P1..H-P4 + the no-longer-built state):
//     H-P1  apply(ctx) touches exactly translate, rotate, scale, in that order
//     H-P2  zoomAt(obj, ...) re-reads the LIVE anchor every frame
//     H-P3  shake clamp Math.min(1, trauma * intensity) intact
//     H-P4  worldToScreen(x, y, out) returns the caller's out identity
//   Plus: a freshly constructed camera builds NO parallax/debug state --
//   _parallax === null && debugConfig === null (CP-22, the two dead ctor builds
//   are gone). ASCII-only. node:test + node:assert/strict only.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CinematicCameraPro } from '../src/index.js';

// A Canvas2D transform recorder -- records the ORDER of transform ops apply()
// issues. Only the methods apply() is allowed to touch are implemented; any
// other call throws, so "nothing else" is enforced structurally.
function recorder() {
    const calls = [];
    return {
        calls,
        translate() { calls.push('translate'); },
        rotate() { calls.push('rotate'); },
        scale() { calls.push('scale'); },
    };
}

// Distinct method kinds in first-appearance order.
function distinctInOrder(list) {
    const seen = new Set();
    const out = [];
    for (const name of list) {
        if (!seen.has(name)) { seen.add(name); out.push(name); }
    }
    return out;
}

test('G4: a class-only camera constructs with NO parallax/debug state (CP-22)', () => {
    const cam = new CinematicCameraPro(800, 600, 800, 600);
    assert.equal(cam._parallax, null, 'constructor must not build a ParallaxState');
    assert.equal(cam.debugConfig, null, 'constructor must not build a DebugHUDConfig');
    // The two constructor allocations 3PPLE never used are gone, not merely idle.
});

test('G4: constructor(w,h,w,h) + setZoom + minZoom/maxZoom reads', () => {
    const cam = new CinematicCameraPro(800, 600, 800, 600);
    assert.equal(cam.minZoom, 0.25);
    assert.equal(cam.maxZoom, 4.0);
    cam.setZoom(2.0);
    assert.equal(cam.zoom, 2.0);
    // Clamp to maxZoom on an over-range instant set.
    cam.setZoom(99);
    assert.equal(cam.zoom, cam.maxZoom);
});

test('G4: trackSingle / trackMultiple drive with no attach', () => {
    const cam = new CinematicCameraPro(800, 600, 4000, 3000);
    assert.equal(cam.trackSingle(), cam);
    cam.update(1 / 60, 400, 300);
    cam.trackMultiple([{ x: 0, y: 0 }, { x: 400, y: 400 }], { paddingX: 50 });
    cam.update(1 / 60, 400, 300); // multi-target path
    assert.ok(Number.isFinite(cam.pos[0]) && Number.isFinite(cam.pos[1]));
});

test('G4 (H-P4): worldToScreen writes into and returns the caller out identity', () => {
    const cam = new CinematicCameraPro(800, 600, 800, 600);
    const out = { x: -1, y: -1 };
    const res = cam.worldToScreen(100, 50, out);
    assert.equal(res, out, 'worldToScreen must return the SAME out object (zero-alloc)');
    assert.equal(res.x, (100 - cam.pos[0]) * cam.zoom);
    assert.equal(res.y, (50 - cam.pos[1]) * cam.zoom);
});

test('G4 (H-P1): apply(ctx) issues exactly translate, rotate, scale, in that order', () => {
    const cam = new CinematicCameraPro(800, 600, 800, 600);
    cam.update(1 / 60, 100, 100);
    const ctx = recorder();
    cam.apply(ctx); // must not throw -> only translate/rotate/scale are called
    assert.deepEqual(distinctInOrder(ctx.calls), ['translate', 'rotate', 'scale']);
});

test('G4 (H-P2): zoomAt(obj, level, dur) re-reads the LIVE anchor every frame', () => {
    const cam = new CinematicCameraPro(800, 600, 8000, 6000);
    const anchor = { x: 1000, y: 1000 };
    cam.zoomAt(anchor, 2.0, 1.0); // duration > 0 -> the object is tracked
    cam.update(1 / 60, 0, 0);
    const targetXAtFirst = cam.target[0];
    // Move the live anchor; a re-read every frame must shift target with it.
    anchor.x = 4000;
    anchor.y = 4000;
    cam.update(1 / 60, 0, 0);
    assert.notEqual(cam.target[0], targetXAtFirst,
        'target did not follow the mutated anchor -- zoomAt stopped re-reading it');
    // target is anchor-centered: anchorX - visibleW/2, so it tracks anchor.x upward.
    assert.ok(cam.target[0] > targetXAtFirst,
        'target must move toward the new (larger) anchor.x');
});

test('G4 (H-P3): shake clamp Math.min(1, trauma * intensity) holds at trauma 0.8 x 2', () => {
    const cam = new CinematicCameraPro(800, 600, 800, 600);
    cam.shake({ trauma: 0.8, freq: 15, decay: 1, maxOffset: 15, maxAngle: 0.05 }, 2);
    const slot = cam._shake.slots.find((s) => s.active);
    assert.ok(slot, 'a shake slot must have been activated');
    assert.equal(slot.trauma, 1, '0.8 x 2 = 1.6 must clamp to exactly 1');
});

test('G4: zoomAt(x,y,level,ms) coordinate form still works with no attach', () => {
    const cam = new CinematicCameraPro(800, 600, 8000, 6000);
    assert.equal(cam.zoomAt(400, 300, 1.8, 0), cam); // instant form
    assert.equal(cam.zoom, 1.8);
});
