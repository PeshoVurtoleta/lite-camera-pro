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

// Frozen 1.0.1 main-entry export-name surface. Captured (VERSION still 1.0.1)
// with:
//   node -e "import('./src/index.js').then(m => \
//     console.log(JSON.stringify(Object.keys(m).sort())))"
const FROZEN_1_0_1 = [
    'BoundsType', 'CinematicCameraPro', 'DAMAGE', 'EARTHQUAKE', 'EXPLOSION',
    'FOLLOW_STRATEGIES', 'FollowMode', 'HEAVY_IMPACT', 'IMPACT', 'LANDING',
    'RECOIL', 'RUMBLE', 'VERSION', 'WrapMode', 'addParallaxLayer', 'addShake',
    'addTraumaSimple', 'applyBounds', 'applyParallaxLayer', 'bossReveal',
    'clearBoundsRect', 'clearShakes', 'computeShake', 'createBoundsState',
    'createCameraSequence', 'createDebugHUDConfig', 'createMultiTargetState',
    'createParallaxState', 'createShakeState', 'default', 'dramaticZoom',
    'drawDebugHUD', 'drawDebugWorld', 'getLayerScroll', 'getPreset',
    'listPresets', 'panTo', 'registerPreset', 'removeParallaxLayer',
    'setBoundsAll', 'setBoundsEdges', 'setBoundsRect', 'timedShake',
    'updateMultiTarget', 'updateParallax', 'updateShake',
];

function sameSet(a, b) {
    return a.length === b.length && a.every((n, i) => n === b[i]);
}

export async function run() {
    // 1) Main-entry export-name set is identical to 1.0.1 (VERSION value aside).
    const now = Object.keys(mainEntry).sort();
    check(sameSet(now, FROZEN_1_0_1),
        () => 'T8: main-entry export set drifted from 1.0.1 -> ' + JSON.stringify(now));

    // 2) Runtime no-fork: the ./shake subpath (self-reference) and the main
    //    entry expose the SAME createShakeState identity. Shake.js re-exports the
    //    one ShakeEngine.js module the camera class also imports.
    const shakeSubpath = await import('@zakkster/lite-camera-pro/shake');
    check(Object.is(mainEntry.createShakeState, shakeSubpath.createShakeState),
        () => 'T8: main-entry and ./shake createShakeState are not the same function');
    check(Object.is(mainEntry.getPreset, shakeSubpath.getPreset),
        () => 'T8: main-entry and ./shake getPreset are not the same function');

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
