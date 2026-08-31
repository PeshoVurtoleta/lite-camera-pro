/**
 * T8 -- cross-package surface guard + runtime no-fork proof (H-B).
 *
 * v1.1.0 adds the subpath exports map. This tier freezes the main-entry export
 * NAME surface (charter: NO new names at the main entry -- only the VERSION
 * *value* moves to "1.1.0") and proves at runtime that the ./shake subpath and
 * the main entry share ONE engine: the same createShakeState identity, and a
 * cam._shake whose shape is exactly what the exported createShakeState produces.
 * There is no forked module and no forked state shape.
 */

import { check } from './harness.mjs';
import * as mainEntry from '../../src/index.js';
import { CinematicCameraPro, createShakeState } from '../../src/index.js';

// v2.0.0 detach (D5): the "." export-name surface is exactly the 20 names the
// class reaches. Kept in sync with subpaths.test.js's ROOT_2_0_0 snapshot; if one
// drifts without the other, this tier or that test catches it.
const ROOT_2_0_0 = [
    'BoundsType', 'CinematicCameraPro', 'FOLLOW_STRATEGIES', 'FollowMode',
    'VERSION', 'addShake', 'addTraumaSimple', 'applyBounds', 'clearBoundsRect',
    'clearShakes', 'computeShake', 'createBoundsState', 'createMultiTargetState',
    'createShakeState', 'default', 'setBoundsAll', 'setBoundsEdges',
    'setBoundsRect', 'updateMultiTarget', 'updateShake',
];

function sameSet(a, b) {
    return a.length === b.length && a.every((n, i) => n === b[i]);
}

export async function run() {
    // 1) Main-entry export-name set is exactly D5's 20-name detach surface.
    const now = Object.keys(mainEntry).sort();
    check(now.length === 20 && sameSet(now, [...ROOT_2_0_0].sort()),
        () => 'T8: main-entry export set drifted from the 2.0.0 D5 surface -> ' + JSON.stringify(now));

    // 2) Runtime no-fork: the ./shake subpath (self-reference) and the main
    //    entry expose the SAME createShakeState identity. Shake.js re-exports the
    //    one ShakeEngine.js module the camera class also imports.
    const shakeSubpath = await import('@zakkster/lite-camera-pro/shake');
    check(Object.is(mainEntry.createShakeState, shakeSubpath.createShakeState),
        () => 'T8: main-entry and ./shake createShakeState are not the same function');
    // v2.0.0: getPreset left "." for ./shake -- the no-fork property now lives on
    // the subpath alone (getPreset is one module, one identity, no root copy).
    check(!('getPreset' in mainEntry) && typeof shakeSubpath.getPreset === 'function',
        () => 'T8: getPreset must leave "." and resolve on ./shake');

    // 3) cam._shake is produced by the exported createShakeState: structurally
    //    identical to a fresh state (same top-level keys, same slot pool size,
    //    same slot shape) -- one engine, no forked state shape.
    const cam = new CinematicCameraPro(800, 600, 3200, 2400, 7);
    const ref = createShakeState(7);

    const camKeys = Object.keys(cam._shake).sort();
    const refKeys = Object.keys(ref).sort();
    check(sameSet(camKeys, refKeys),
        () => 'T8: cam._shake top-level shape diverges from createShakeState output');
    check(cam._shake.slotCount === ref.slotCount && cam._shake.slots.length === ref.slots.length,
        () => 'T8: cam._shake slot pool diverges from createShakeState output');

    const camSlotKeys = Object.keys(cam._shake.slots[0]).sort();
    const refSlotKeys = Object.keys(ref.slots[0]).sort();
    check(sameSet(camSlotKeys, refSlotKeys),
        () => 'T8: cam._shake slot shape diverges from createShakeState output');

    cam.destroy();
}
