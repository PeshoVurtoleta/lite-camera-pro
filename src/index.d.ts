/**
 * @zakkster/lite-camera-pro -- TypeScript declarations (main entry).
 *
 * The full functional layer is re-exported from the per-subsystem sibling
 * declarations (one declaration per type -- no duplicates). This file adds the
 * CinematicCameraPro class, the debug-HUD facade, and the VERSION const.
 */

// -- Functional layer (mirrors the ./shake, ./parallax, ./bounds, ./multi,
//    ./follow, ./sequence subpaths; same runtime identities) --
export * from './Shake.js';
export * from './ParallaxManager.js';
export * from './BoundsSystem.js';
export * from './MultiTarget.js';
export * from './FollowMode.js';
export * from './CameraSequence.js';

// -- Types needed locally by the class declaration --
import type { ShakeProfile } from './Shake.js';
import type { Vec2, MultiTargetOptions } from './MultiTarget.js';
import type { BoundsEdgesConfig } from './BoundsSystem.js';
import type { CameraSequence, CameraSequenceOptions } from './CameraSequence.js';

// -- Debug HUD (DebugHUD.js) -- facade only, no dedicated subpath --
export interface DebugHUDConfig {
    show: {
        position: boolean;
        zoom: boolean;
        mode: boolean;
        shake: boolean;
        sequence: boolean;
        parallax: boolean;
        bounds: boolean;
        deadzone: boolean;
        lookahead: boolean;
    };
    x: number;
    y: number;
}

export declare function createDebugHUDConfig(): DebugHUDConfig;
export declare function drawDebugHUD(cam: CinematicCameraPro, ctx: CanvasRenderingContext2D, config?: DebugHUDConfig): void;
export declare function drawDebugWorld(cam: CinematicCameraPro, ctx: CanvasRenderingContext2D, config?: DebugHUDConfig): void;

// -- Package version (bumped in lockstep with package.json + llms.txt) --
export declare const VERSION: string;

// -- Main camera class --
export declare class CinematicCameraPro {
    constructor(viewW: number, viewH: number, worldW: number, worldH: number, seed?: number);

    // Public state
    readonly pos: Float32Array;
    readonly target: Float32Array;
    readonly look: Float32Array;

    viewW: number;
    viewH: number;
    worldW: number;
    worldH: number;

    zoom: number;
    minZoom: number;
    maxZoom: number;
    visibleW: number;
    visibleH: number;

    deadzoneX: number;
    deadzoneY: number;
    lookaheadDist: number;
    lookaheadSpeed: number;
    lerpSpeed: number;

    mode: number;
    predictTime: number;
    hybridVerticalSnap: boolean;

    debugConfig: DebugHUDConfig;

    // Follow mode
    setMode(mode: number): this;

    // Multi-target
    trackMultiple(targets: Vec2[], options?: MultiTargetOptions): this;
    trackSingle(): this;
    setTargetCount(count: number): this;

    // Shake
    addTrauma(amount: number): this;
    shake(profile: ShakeProfile, intensity?: number): this;
    shakePreset(name: string, intensity?: number): this;
    clearShakes(): this;

    // Sequences
    createSequence(options?: CameraSequenceOptions): CameraSequence;
    playSequence(seq: CameraSequence): this;
    stopSequence(): this;
    readonly sequencePlaying: boolean;

    // Zoom
    setZoom(level: number, duration?: number, ease?: (t: number) => number): this;
    zoomAt(targetOrX: number | Vec2, yOrLevel: number, levelOrDur?: number, duration?: number, ease?: (t: number) => number): this;

    // Coordinate conversion
    screenToWorld(sx: number, sy: number, out: Vec2): Vec2;
    worldToScreen(wx: number, wy: number, out: Vec2): Vec2;

    // Parallax
    addParallaxLayer(id: string, speedX: number, speedY?: number, opts?: { offsetX?: number; offsetY?: number; wrap?: number }): this;
    removeParallaxLayer(id: string): this;
    applyParallax(id: string, ctx: CanvasRenderingContext2D): boolean;

    // Bounds
    setBoundsType(type: number): this;
    setBoundsEdges(config: BoundsEdgesConfig): this;
    setBoundsRect(x: number, y: number, w: number, h: number): this;
    clearBoundsRect(): this;

    // Core
    update(dt: number, px: number, py: number, pvx?: number, pvy?: number): void;
    apply(ctx: CanvasRenderingContext2D): void;

    // Debug
    debug(ctx: CanvasRenderingContext2D): void;
    debugHUD(ctx: CanvasRenderingContext2D): void;

    // Save / load
    getState(): { posX: number; posY: number; targetX: number; targetY: number; zoom: number; mode: number };
    setState(snapshot: { posX?: number; posY?: number; targetX?: number; targetY?: number; zoom?: number; mode?: number }): this;

    // Lifecycle
    destroy(): void;
}

export default CinematicCameraPro;
