/**
 * @zakkster/lite-camera-pro
 * Commercial cinematic camera system for Canvas2D games.
 *
 * Built on: lite-camera, lite-lerp, lite-ease, lite-noise, lite-timeline
 * Zero external dependencies outside the @zakkster ecosystem.
 */

export const VERSION = "1.0.1";

// -- Core --
export { CinematicCameraPro } from './CinematicCameraPro.js';
export { default } from './CinematicCameraPro.js';

// -- Follow Modes --
export { FollowMode, FOLLOW_STRATEGIES } from './FollowMode.js';

// -- Multi-Target --
export { createMultiTargetState, updateMultiTarget } from './MultiTarget.js';

// -- Shake Engine --
export { createShakeState, addShake, addTraumaSimple, updateShake, computeShake, clearShakes } from './ShakeEngine.js';
export { EXPLOSION, EARTHQUAKE, RECOIL, IMPACT, LANDING, DAMAGE, RUMBLE, HEAVY_IMPACT, getPreset, registerPreset, listPresets } from './ShakePresets.js';

// -- Sequences --
export { createCameraSequence, panTo, dramaticZoom, bossReveal, timedShake } from './CameraSequence.js';

// -- Parallax --
export { WrapMode, createParallaxState, addParallaxLayer, removeParallaxLayer, updateParallax, getLayerScroll, applyParallaxLayer } from './ParallaxManager.js';

// -- Bounds --
export { BoundsType, createBoundsState, setBoundsAll, setBoundsEdges, setBoundsRect, clearBoundsRect, applyBounds } from './BoundsSystem.js';

// -- Debug HUD --
export { createDebugHUDConfig, drawDebugHUD, drawDebugWorld } from './DebugHUD.js';
