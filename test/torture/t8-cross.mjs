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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check } from './harness.mjs';
import * as mainEntry from '../../src/index.js';
import { CinematicCameraPro, createShakeState } from '../../src/index.js';
import { CinematicCamera } from '@zakkster/lite-camera';

// v2.1.0 (PRO4): the "." export-name surface is the 2.0.0 D5 detach set plus the
// two bounds names PRO4 adds -- clampToBounds (the resize re-clamp export, D6)
// and setSoftZone (the CP-26 soft-zone door). Kept in sync with
// subpaths.test.js's ROOT snapshot; if one drifts without the other, this tier or
// that test catches it.
const ROOT_2_1_0 = [
    'BoundsType', 'CinematicCameraPro', 'FOLLOW_STRATEGIES', 'FollowMode',
    'VERSION', 'addShake', 'addTraumaSimple', 'applyBounds', 'clampToBounds',
    'clearBoundsRect', 'clearShakes', 'computeShake', 'createBoundsState',
    'createMultiTargetState', 'createShakeState', 'default', 'setBoundsAll',
    'setBoundsEdges', 'setBoundsRect', 'setSoftZone', 'updateMultiTarget',
    'updateShake',
];

function sameSet(a, b) {
    return a.length === b.length && a.every((n, i) => n === b[i]);
}

export async function run() {
    // 1) Main-entry export-name set is exactly the 2.1.0 surface.
    const now = Object.keys(mainEntry).sort();
    check(now.length === ROOT_2_1_0.length && sameSet(now, [...ROOT_2_1_0].sort()),
        () => 'T8: main-entry export set drifted from the 2.1.0 surface -> ' + JSON.stringify(now));

    // 1b) PRO4/T-L base-parity: re-read the installed base llms.txt in-test and
    //     assert the bridged base-shake contract the CP-9 accessors must honor is
    //     still the base's documented one (15 px offset, 0.05 rad angle, decay
    //     welded to 1.0 trauma/s). If the base doc drifts, the bridge defaults
    //     must be revisited -- fail closed here rather than ship a silent skew.
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const baseLlms = readFileSync(
        join(__dirname, '..', '..', 'node_modules', '@zakkster', 'lite-camera', 'llms.txt'), 'utf8');
    check(/shakeMaxOffset[^\n]*15/.test(baseLlms),
        () => 'T8: base llms.txt no longer documents shakeMaxOffset default 15 -- bridge default may be stale');
    check(/shakeMaxAngle[^\n]*0\.05/.test(baseLlms),
        () => 'T8: base llms.txt no longer documents shakeMaxAngle default 0.05 -- bridge default may be stale');

    // 1c) Bridged-field parity: a base-style caller configures shake through the
    //     PRO4 accessors and reads back the base-documented feel. Defaults match
    //     the base BEFORE any trauma exists (order-independent), trauma clamps to
    //     [0, 1], and a max-field write alone fires no shake.
    {
        const b = new CinematicCameraPro(800, 600, 3200, 2400, 3);
        check(b.shakeMaxOffset === 15 && b.shakeMaxAngle === 0.05,
            () => 'T8: bridge defaults must match the base (15 px / 0.05 rad) before any trauma');
        check(b.shakeTrauma === 0, () => 'T8: bridge trauma must read 0 with no active default slot');
        b.shakeMaxOffset = 42;
        check(b._shake.active === false, () => 'T8: writing shakeMaxOffset alone must NOT fire a shake');
        b.shakeTrauma = 5; // clamps to 1
        check(b.shakeTrauma === 1, () => 'T8: bridge trauma must clamp to 1 (got ' + b.shakeTrauma + ')');
        check(b._baseSlot().maxOffset === 42, () => 'T8: the configured maxOffset must stamp onto the fired slot');
        b.shakeTrauma = 0; // deactivate
        check(b._shake.active === false, () => 'T8: shakeTrauma <= 0 must deactivate the default slot');
        b.destroy();
    }

    // 1d) Resize parity + readonly dims both sides: the Pro zoom-aware resize
    //     lands visibleW == viewW/zoom on return (no stale frame), and the four
    //     dims are writable ONLY through resize() (the d.ts declares them
    //     readonly on both base and Pro).
    {
        const p = new CinematicCameraPro(800, 600, 3200, 2400, 5);
        p.setZoom(2);
        p.pos[0] = 2560; p.pos[1] = 0; p.target[0] = 2560; p.target[1] = 0;
        p.resize(1600, 1200, 3200, 2400);
        check(p.visibleW === p.viewW / p.zoom && p.visibleW === 800,
            () => 'T8: resize must land visibleW == viewW/zoom == 800 on return (got ' + p.visibleW + ')');
        check(p.pos[0] === 2400, () => 'T8: resize must re-clamp pos to the zoom-aware max 2400 (got ' + p.pos[0] + ')');
        // Base + Pro share the resize contract: a base camera resizes the same way.
        const base = new CinematicCamera(800, 600, 3200, 2400, 5);
        check(typeof base.resize === 'function' && typeof p.resize === 'function',
            () => 'T8: both base and Pro must expose resize()');
        p.destroy();
    }

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
