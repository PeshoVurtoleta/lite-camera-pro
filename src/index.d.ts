/**
 * @zakkster/lite-camera-pro — TypeScript Declarations
 */

// ── Follow Modes ──
export declare const FollowMode: {
    readonly SMOOTH: 0;
    readonly LOCK: 1;
    readonly PREDICTIVE: 2;
    readonly CUT: 3;
    readonly HYBRID: 4;
};

export declare const FOLLOW_STRATEGIES: ReadonlyArray<
    (cam: CinematicCameraPro, dt: number, px: number, py: number, pvx: number, pvy: number) => void
>;

// ── Wrap Modes ──
export declare const WrapMode: {
    readonly NONE: 0;
    readonly REPEAT_X: 1;
    readonly REPEAT_Y: 2;
    readonly REPEAT_BOTH: 3;
};

// ── Bounds Types ──
export declare const BoundsType: {
    readonly HARD: 0;
    readonly SOFT: 1;
    readonly ELASTIC: 2;
    readonly NONE: 3;
};

// ── Shake Profile ──
export interface ShakeProfile {
    trauma?: number;
    freq?: number;
    decay?: number;
    maxOffset?: number;
    maxAngle?: number;
    dirX?: number;
    dirY?: number;
}

// ── Shake Presets ──
export declare const EXPLOSION: Readonly<ShakeProfile>;
export declare const EARTHQUAKE: Readonly<ShakeProfile>;
export declare const RECOIL: Readonly<ShakeProfile>;
export declare const IMPACT: Readonly<ShakeProfile>;
export declare const LANDING: Readonly<ShakeProfile>;
export declare const DAMAGE: Readonly<ShakeProfile>;
export declare const RUMBLE: Readonly<ShakeProfile>;
export declare const HEAVY_IMPACT: Readonly<ShakeProfile>;

export declare function getPreset(name: string): ShakeProfile | null;
export declare function registerPreset(name: string, profile: ShakeProfile): void;
export declare function listPresets(): string[];

// ── Vec2 ──
export interface Vec2 {
    x: number;
    y: number;
}

// ── Debug HUD Config ──
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

// ── Camera Sequence ──
export interface CameraSequenceOptions {
    loop?: boolean;
    onComplete?: () => void;
    blendOutTime?: number;
}

export interface StepOptions {
    ease?: (t: number) => number;
    at?: string | number;
}

export interface CameraSequence {
    moveTo(x: number, y: number, duration: number, opts?: StepOptions): CameraSequence;
    zoomTo(level: number, duration: number, opts?: StepOptions): CameraSequence;
    moveAndZoom(x: number, y: number, level: number, duration: number, opts?: StepOptions): CameraSequence;
    shake(profileOrName: string | ShakeProfile, intensity?: number, opts?: StepOptions): CameraSequence;
    wait(duration: number, opts?: StepOptions): CameraSequence;
    call(fn: () => void, opts?: StepOptions): CameraSequence;
    play(): CameraSequence;
    pause(): CameraSequence;
    resume(): CameraSequence;
    stop(): CameraSequence;
    seek(timeMs: number): CameraSequence;
    destroy(): void;
    readonly duration: number;
    readonly progress: number;
    readonly playing: boolean;
}

export declare function createCameraSequence(cam: CinematicCameraPro, options?: CameraSequenceOptions): CameraSequence;
export declare function panTo(cam: CinematicCameraPro, x: number, y: number, duration: number, opts?: CameraSequenceOptions & StepOptions): CameraSequence;
export declare function dramaticZoom(cam: CinematicCameraPro, x: number, y: number, zoom: number, duration: number, opts?: CameraSequenceOptions & StepOptions): CameraSequence;
export declare function bossReveal(cam: CinematicCameraPro, x: number, y: number, totalMs?: number, opts?: CameraSequenceOptions): CameraSequence;
export declare function timedShake(cam: CinematicCameraPro, presetOrProfile: string | ShakeProfile, holdMs?: number, opts?: CameraSequenceOptions): CameraSequence;

// ── Multi-Target Options ──
export interface MultiTargetOptions {
    paddingX?: number;
    paddingY?: number;
    padding?: number;
    minZoom?: number;
    maxZoom?: number;
    zoomSpeed?: number;
    followSpeed?: number;
}

// ── Bounds Config ──
export interface BoundsEdgesConfig {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
}

// ── Main Camera Class ──
export declare class CinematicCameraPro {
    constructor(viewW: number, viewH: number, worldW: number, worldH: number, seed?: number);

    // ── Public state ──
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

    // ── Follow Mode ──
    setMode(mode: number): this;

    // ── Multi-Target ──
    trackMultiple(targets: Vec2[], options?: MultiTargetOptions): this;
    trackSingle(): this;
    setTargetCount(count: number): this;

    // ── Shake ──
    addTrauma(amount: number): this;
    shake(profile: ShakeProfile, intensity?: number): this;
    shakePreset(name: string, intensity?: number): this;
    clearShakes(): this;

    // ── Sequences ──
    createSequence(options?: CameraSequenceOptions): CameraSequence;
    playSequence(seq: CameraSequence): this;
    stopSequence(): this;
    readonly sequencePlaying: boolean;

    // ── Zoom ──
    setZoom(level: number, duration?: number, ease?: (t: number) => number): this;
    zoomAt(targetOrX: number | Vec2, yOrLevel: number, levelOrDur?: number, duration?: number, ease?: (t: number) => number): this;

    // ── Coordinate Conversion ──
    screenToWorld(sx: number, sy: number, out: Vec2): Vec2;
    worldToScreen(wx: number, wy: number, out: Vec2): Vec2;

    // ── Parallax ──
    addParallaxLayer(id: string, speedX: number, speedY?: number, opts?: { offsetX?: number; offsetY?: number; wrap?: number }): this;
    removeParallaxLayer(id: string): this;
    applyParallax(id: string, ctx: CanvasRenderingContext2D): boolean;

    // ── Bounds ──
    setBoundsType(type: number): this;
    setBoundsEdges(config: BoundsEdgesConfig): this;
    setBoundsRect(x: number, y: number, w: number, h: number): this;
    clearBoundsRect(): this;

    // ── Core ──
    update(dt: number, px: number, py: number, pvx?: number, pvy?: number): void;
    apply(ctx: CanvasRenderingContext2D): void;

    // ── Debug ──
    debug(ctx: CanvasRenderingContext2D): void;
    debugHUD(ctx: CanvasRenderingContext2D): void;

    // ── Save / Load ──
    getState(): { posX: number; posY: number; targetX: number; targetY: number; zoom: number; mode: number };
    setState(snapshot: { posX?: number; posY?: number; targetX?: number; targetY?: number; zoom?: number; mode?: number }): this;

    // ── Lifecycle ──
    destroy(): void;
}

export default CinematicCameraPro;
