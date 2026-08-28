/**
 * @zakkster/lite-camera-pro/parallax -- TypeScript declarations.
 *
 * Multi-layer scroll manager. Pure math, no dependencies. Complete runtime
 * surface, no `any`.
 */

// -- Wrap modes for layer tiling --
export declare const WrapMode: {
    readonly NONE: 0;
    readonly REPEAT_X: 1;
    readonly REPEAT_Y: 2;
    readonly REPEAT_BOTH: 3;
};

// -- A single pre-allocated parallax layer --
export interface ParallaxLayer {
    active: boolean;
    id: string;
    speedX: number;
    speedY: number;
    offsetX: number;
    offsetY: number;
    wrap: number;
    scrollX: number;
    scrollY: number;
}

// -- Parallax manager state (one per camera) --
export interface ParallaxState {
    layers: ParallaxLayer[];
    layerCount: number;
    activeCount: number;
}

// -- Options accepted by addParallaxLayer --
export interface ParallaxLayerOptions {
    offsetX?: number;
    offsetY?: number;
    wrap?: number;
}

// -- Output shape for getLayerScroll --
export interface ScrollOut {
    x: number;
    y: number;
}

export declare function createParallaxState(): ParallaxState;
export declare function addParallaxLayer(
    state: ParallaxState,
    id: string,
    speedX: number,
    speedY?: number,
    opts?: ParallaxLayerOptions,
): ParallaxLayer | null;
export declare function removeParallaxLayer(state: ParallaxState, id: string): void;
export declare function updateParallax(state: ParallaxState, camX: number, camY: number, zoom: number): void;
export declare function getLayerScroll(state: ParallaxState, id: string, out: ScrollOut): ScrollOut | null;
export declare function applyParallaxLayer(state: ParallaxState, id: string, ctx: CanvasRenderingContext2D): boolean;
