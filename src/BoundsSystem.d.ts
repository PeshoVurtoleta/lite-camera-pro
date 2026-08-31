/**
 * @zakkster/lite-camera-pro/bounds -- TypeScript declarations.
 *
 * Configurable per-edge boundary behavior. Pure math, no dependencies.
 * Complete runtime surface, no `any`.
 */

// -- Boundary types --
export declare const BoundsType: {
    readonly HARD: 0;
    readonly SOFT: 1;
    readonly ELASTIC: 2;
    readonly NONE: 3;
};

// -- Bounds system state (one per camera) --
export interface BoundsState {
    left: number;
    right: number;
    top: number;
    bottom: number;
    softZone: number;
    elasticMax: number;
    elasticStrength: number;
    boundsX: number;
    boundsY: number;
    boundsW: number;
    boundsH: number;
    customBounds: boolean;
}

// -- Per-edge config for setBoundsEdges --
export interface BoundsEdgesConfig {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
}

export declare function createBoundsState(): BoundsState;
/** @throws Error `code = "ERR_CAMERA_BOUNDS"` if type is not an integer BoundsType in [0, 3]. */
export declare function setBoundsAll(state: BoundsState, type: number): void;
/** @throws Error `code = "ERR_CAMERA_BOUNDS"` if any provided edge is not an integer BoundsType in [0, 3]. */
export declare function setBoundsEdges(state: BoundsState, config: BoundsEdgesConfig): void;
/** @throws Error `code = "ERR_CAMERA_BOUNDS"` if any of x/y/w/h is non-finite. */
export declare function setBoundsRect(state: BoundsState, x: number, y: number, w: number, h: number): void;
/** @throws Error `code = "ERR_CAMERA_BOUNDS"` if softZone is non-finite or < 0, or elasticMax/elasticStrength non-finite. */
export declare function setSoftZone(state: BoundsState, softZone: number, elasticMax?: number, elasticStrength?: number): void;
export declare function clearBoundsRect(state: BoundsState): void;
export declare function applyBounds(
    state: BoundsState,
    target: Float32Array,
    pos: Float32Array,
    maxX: number,
    maxY: number,
    visW: number,
    visH: number,
    dt: number,
): void;
/**
 * HARD-clamp target AND pos into the effective bounds box (the resize re-clamp,
 * D6). Always plain HARD -- a discontinuity correction, never SOFT/ELASTIC.
 */
export declare function clampToBounds(
    state: BoundsState,
    target: Float32Array,
    pos: Float32Array,
    maxX: number,
    maxY: number,
    visW: number,
    visH: number,
): void;
