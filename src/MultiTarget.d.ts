/**
 * @zakkster/lite-camera-pro/multi -- TypeScript declarations.
 *
 * Multi-target framing: fit several targets in view. Pure math, no
 * dependencies. Complete runtime surface, no `any`.
 */

import type { CinematicCameraPro } from './index.js';

// -- A 2D point (target position) --
export interface Vec2 {
    x: number;
    y: number;
}

// -- Multi-target config/state (one per camera) --
export interface MultiTargetState {
    active: boolean;
    targets: Vec2[] | null;
    count: number;
    paddingX: number;
    paddingY: number;
    minZoom: number;
    maxZoom: number;
    zoomSpeed: number;
    followSpeed: number;
}

// -- Options accepted by CinematicCameraPro.trackMultiple --
export interface MultiTargetOptions {
    paddingX?: number;
    paddingY?: number;
    padding?: number;
    minZoom?: number;
    maxZoom?: number;
    zoomSpeed?: number;
    followSpeed?: number;
}

export declare function updateMultiTarget(
    cam: CinematicCameraPro,
    dt: number,
    targets: Vec2[],
    count: number,
): void;
export declare function createMultiTargetState(): MultiTargetState;

declare const _default: typeof updateMultiTarget;
export default _default;
