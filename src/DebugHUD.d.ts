/**
 * @zakkster/lite-camera-pro/debug -- TypeScript declarations.
 *
 * Canvas2D debug overlays (screen-space HUD + world-space guides) for a
 * CinematicCameraPro. Detached from the class at v2.0.0 (CP-22): a class-only
 * consumer no longer ships this module. Attach per-instance with withDebug().
 * Complete runtime surface, no `any`.
 */

import type { CinematicCameraPro } from './index.js';

// -- Which HUD panels / world guides are drawn --
export interface DebugHUDShow {
    position: boolean;
    zoom: boolean;
    mode: boolean;
    shake: boolean;
    sequence: boolean;
    parallax: boolean;
    bounds: boolean;
    deadzone: boolean;
    lookahead: boolean;
}

// -- HUD configuration (one per camera; mutate .show to toggle panels) --
export interface DebugHUDConfig {
    show: DebugHUDShow;
    x: number;
    y: number;
}

export declare function createDebugHUDConfig(): DebugHUDConfig;
export declare function drawDebugHUD(
    cam: CinematicCameraPro,
    ctx: CanvasRenderingContext2D,
    config?: DebugHUDConfig,
): void;
export declare function drawDebugWorld(
    cam: CinematicCameraPro,
    ctx: CanvasRenderingContext2D,
    config?: DebugHUDConfig,
): void;

/**
 * Attach the debug subsystem to one camera (v2.0.0 detach). Per-instance
 * own-property install of debug()/debugHUD(); builds the DebugHUDConfig the
 * constructor no longer allocates. Returns the camera for chaining.
 * @throws Error `code = "ERR_ALREADY_ATTACHED"` if debug is already attached.
 */
export declare function withDebug<C>(cam: C): C;

declare const _default: typeof drawDebugHUD;
export default _default;
