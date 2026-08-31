// test/torture/public-surface.mjs -- the enumerated public method surface of
// CinematicCameraPro, shared by the CP-8 fail-closed coverage (t4-handles tier
// and regressions.test.js). Enumerating the whole surface here (rather than a
// hand-picked few at each call site) means the destroy() fail-closed guarantee
// is checked against the ENTIRE API: add a method and forget to rebind it in
// destroy(), and every CP-8 gate that loops this list flags the gap.
//
// callByName invokes each method with plausible LIVE-camera arguments -- args
// chosen so that WITHOUT the destroy() rebind the call reaches nulled state and
// throws a raw TypeError (the anti-vacuity direction), and WITH the rebind it
// throws ERR_CAMERA_DESTROYED regardless of args.

/** Every public method of CinematicCameraPro (getters excluded -- null-safe). */
export const PUBLIC_METHODS = [
    // v2.0.0 detach: shakePreset() was dropped at the major (removed from the
    // prototype, no tombstone). The six detached-subsystem stubs (debug/debugHUD/
    // createSequence/addParallaxLayer/removeParallaxLayer/applyParallax) STAY --
    // destroy() rebinds them to its sentinel, so CP-8 still covers them.
    'update', 'apply', 'debug', 'debugHUD',
    'addTrauma', 'shake', 'clearShakes',
    'setMode', 'trackMultiple', 'trackSingle', 'setTargetCount',
    'createSequence', 'playSequence', 'stopSequence',
    'addParallaxLayer', 'removeParallaxLayer', 'applyParallax',
    'setBoundsType', 'setBoundsEdges', 'setBoundsRect', 'clearBoundsRect',
    'setZoom', 'zoomAt', 'screenToWorld', 'worldToScreen',
    'getState', 'setState', 'resize', 'destroy',
];

const DUMMY_SEQ = { play() {}, stop() {}, destroy() {}, playing: false };

/** Call `cam[name](...)` with representative arguments. */
export function callByName(cam, name, sink) {
    const out = { x: 0, y: 0 };
    switch (name) {
        case 'update': return cam.update(1 / 60, 100, 100);
        case 'apply': return cam.apply(sink);
        case 'debug': return cam.debug(sink);
        case 'debugHUD': return cam.debugHUD(sink);
        case 'addTrauma': return cam.addTrauma(0.5);
        case 'shake': return cam.shake({ trauma: 0.5 });
        case 'clearShakes': return cam.clearShakes();
        case 'setMode': return cam.setMode(0);
        case 'trackMultiple': return cam.trackMultiple([{ x: 0, y: 0 }], {});
        case 'trackSingle': return cam.trackSingle();
        case 'setTargetCount': return cam.setTargetCount(1);
        case 'createSequence': return cam.createSequence();
        case 'playSequence': return cam.playSequence(DUMMY_SEQ);
        case 'stopSequence': return cam.stopSequence();
        case 'addParallaxLayer': return cam.addParallaxLayer('x', 0.5);
        case 'removeParallaxLayer': return cam.removeParallaxLayer('x');
        case 'applyParallax': return cam.applyParallax('x', sink);
        case 'setBoundsType': return cam.setBoundsType(0);
        case 'setBoundsEdges': return cam.setBoundsEdges({ left: 0 });
        case 'setBoundsRect': return cam.setBoundsRect(0, 0, 100, 100);
        case 'clearBoundsRect': return cam.clearBoundsRect();
        case 'setZoom': return cam.setZoom(1.5);
        case 'zoomAt': return cam.zoomAt(500, 300, 2.0, 0); // dur 0 -> reads pos
        case 'screenToWorld': return cam.screenToWorld(0, 0, out);
        case 'worldToScreen': return cam.worldToScreen(0, 0, out);
        case 'getState': return cam.getState();
        case 'setState': return cam.setState({ posX: 1, posY: 2, zoom: 1 });
        case 'resize': return cam.resize(800, 600, 3200, 2400);
        case 'destroy': return cam.destroy();
        default: throw new Error('public-surface: unknown method ' + name);
    }
}
