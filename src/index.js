/**
 * @zakkster/lite-camera-pro
 * Commercial cinematic camera system for Canvas2D games.
 *
 * Built on: lite-camera, lite-lerp, lite-ease, lite-noise, lite-timeline
 * Zero external dependencies outside the @zakkster ecosystem.
 */

export const VERSION = "2.1.0";

// v2.0.0 detach (CP-21/CP-22/CP-23): the root barrel exports exactly the 22
// names the class itself reaches (D5; clampToBounds + setSoftZone joined at
// 2.1.0 when the class started reaching them). The four detached subsystems --
// ShakePresets, CameraSequence, ParallaxManager, DebugHUD -- are NOT re-exported
// here; a root barrel line would keep them in the "." import graph and defeat
// the sever (G1). Reach them on their subpaths: ./shake (presets), ./sequence,
// ./parallax, ./debug. See decisions/0004-detach.md.

// -- Core --
export { CinematicCameraPro } from './CinematicCameraPro.js';
export { default } from './CinematicCameraPro.js';

// -- Follow Modes --
export { FollowMode, FOLLOW_STRATEGIES } from './FollowMode.js';

// -- Multi-Target --
export { createMultiTargetState, updateMultiTarget } from './MultiTarget.js';

// -- Shake Engine --
export { createShakeState, addShake, addTraumaSimple, updateShake, computeShake, clearShakes } from './ShakeEngine.js';

// -- Bounds --
export { BoundsType, createBoundsState, setBoundsAll, setBoundsEdges, setBoundsRect, setSoftZone, clearBoundsRect, applyBounds, clampToBounds } from './BoundsSystem.js';
