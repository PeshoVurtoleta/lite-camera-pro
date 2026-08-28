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
export declare function setBoundsAll(state: BoundsState, type: number): void;
export declare function setBoundsEdges(state: BoundsState, config: BoundsEdgesConfig): void;
export declare function setBoundsRect(state: BoundsState, x: number, y: number, w: number, h: number): void;
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
