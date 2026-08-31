/**
 * @zakkster/lite-camera-pro -- TypeScript declarations (main entry).
 *
 * v2.0.0 detach (CP-21/CP-22/CP-23): the "." surface is exactly the 20 runtime
 * names the class itself reaches (D5). The four detached subsystems -- presets
 * (./shake), sequences (./sequence), parallax (./parallax), debug (./debug) --
 * are NOT re-exported here; reach them on their subpaths. This file adds the
 * CinematicCameraPro class and the VERSION const.
 */

// -- Functional layer at "." (exactly the runtime barrel: shake engine, multi,
//    follow, bounds; NOT presets/sequence/parallax/debug -- those are subpaths) --
export {
    createShakeState, addShake, addTraumaSimple, updateShake, computeShake, clearShakes,
} from './Shake.js';
export * from './BoundsSystem.js';
export * from './MultiTarget.js';
export * from './FollowMode.js';

// -- Types needed locally by the class declaration --
import type { ShakeProfile } from './Shake.js';
import type { Vec2, MultiTargetOptions } from './MultiTarget.js';
import type { BoundsEdgesConfig } from './BoundsSystem.js';
import type { CameraSequence, CameraSequenceOptions } from './CameraSequence.js';
import type { DebugHUDConfig } from './DebugHUD.js';

/**
 * Error codes a class-only camera can throw for the detached subsystems
 * (v2.0.0). A subsystem method called before its withX() attach throws the
 * matching NOT_ATTACHED code; a second withX() throws ERR_ALREADY_ATTACHED.
 * After destroy() every method throws ERR_CAMERA_DESTROYED instead.
 */
export type CameraAttachErrorCode =
    | "ERR_PARALLAX_NOT_ATTACHED"
    | "ERR_SEQUENCE_NOT_ATTACHED"
    | "ERR_DEBUG_NOT_ATTACHED"
    | "ERR_ALREADY_ATTACHED";

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

    /**
     * update() clamps a finite dt above this ceiling before integrating so a
     * frame-time spike cannot diverge the position lerp (default 0.1s). Plain
     * tunable; not validated per frame. See update() for the full dt policy.
     */
    maxDt: number;

    /** null until withDebug() attaches (v2.0.0 detach); the constructor no longer builds it. */
    debugConfig: DebugHUDConfig | null;

    // Follow mode
    /** @throws Error `code = "ERR_CAMERA_MODE"` if mode is not an integer FollowMode in range. */
    setMode(mode: number): this;

    // Multi-target
    /** @throws Error `code = "ERR_CAMERA_TARGETS"` if targets is not an array or any entry lacks finite x/y (validated at call time). */
    trackMultiple(targets: Vec2[], options?: MultiTargetOptions): this;
    trackSingle(): this;
    /** @throws Error `code = "ERR_CAMERA_TARGETS"` if count is not an integer in [0, targets.length]. */
    setTargetCount(count: number): this;

    // Shake
    addTrauma(amount: number): this;
    shake(profile: ShakeProfile, intensity?: number): this;
    clearShakes(): this;

    // Sequences (createSequence is a fail-closed stub until withSequences attaches)
    /**
     * @throws Error `code = "ERR_SEQUENCE_NOT_ATTACHED"` until withSequences()
     *   from '@zakkster/lite-camera-pro/sequence' installs the real method; once
     *   attached, `code = "ERR_SEQUENCE_OPTIONS"` if blendOutTime is invalid.
     */
    createSequence(options?: CameraSequenceOptions): CameraSequence;
    playSequence(seq: CameraSequence): this;
    stopSequence(): this;
    readonly sequencePlaying: boolean;

    // Zoom
    /** @throws Error `code = "ERR_CAMERA_ZOOM"` if level is non-finite or duration is non-finite/negative. */
    setZoom(level: number, duration?: number, ease?: (t: number) => number): this;
    /** @throws Error `code = "ERR_CAMERA_ZOOM"` if anchor x/y, level, or duration is non-finite (or duration negative). A non-function ease normalizes to null. */
    zoomAt(targetOrX: number | Vec2, yOrLevel: number, levelOrDur?: number, duration?: number, ease?: (t: number) => number): this;

    // Coordinate conversion
    screenToWorld(sx: number, sy: number, out: Vec2): Vec2;
    worldToScreen(wx: number, wy: number, out: Vec2): Vec2;

    // Parallax (fail-closed stubs until withParallax from '.../parallax' attaches)
    /** @throws Error `code = "ERR_PARALLAX_NOT_ATTACHED"` until withParallax() attaches. */
    addParallaxLayer(id: string, speedX: number, speedY?: number, opts?: { offsetX?: number; offsetY?: number; wrap?: number }): this;
    /** @throws Error `code = "ERR_PARALLAX_NOT_ATTACHED"` until withParallax() attaches. */
    removeParallaxLayer(id: string): this;
    /** @throws Error `code = "ERR_PARALLAX_NOT_ATTACHED"` until withParallax() attaches. */
    applyParallax(id: string, ctx: CanvasRenderingContext2D): boolean;

    // Bounds
    setBoundsType(type: number): this;
    setBoundsEdges(config: BoundsEdgesConfig): this;
    setBoundsRect(x: number, y: number, w: number, h: number): this;
    clearBoundsRect(): this;

    // Core
    /**
     * Advance the camera one frame. dt policy (fail closed): a non-finite or
     * negative dt is a no-op (nothing mutated); dt 0/-0 is a legal no-advance
     * frame; a finite dt above maxDt is clamped to maxDt (a dt exactly == maxDt
     * passes untouched).
     */
    update(dt: number, px: number, py: number, pvx?: number, pvy?: number): void;
    apply(ctx: CanvasRenderingContext2D): void;

    // Debug (fail-closed stubs until withDebug from '.../debug' attaches)
    /** @throws Error `code = "ERR_DEBUG_NOT_ATTACHED"` until withDebug() attaches. */
    debug(ctx: CanvasRenderingContext2D): void;
    /** @throws Error `code = "ERR_DEBUG_NOT_ATTACHED"` until withDebug() attaches. */
    debugHUD(ctx: CanvasRenderingContext2D): void;

    // Save / load
    getState(): { posX: number; posY: number; targetX: number; targetY: number; zoom: number; mode: number };
    /**
     * Restore a pose-only snapshot (pos/target/zoom/mode). Validated in full
     * before any field is written -- a rejected snapshot mutates nothing.
     * posX/posY and targetX/targetY are both-or-neither; every present numeric
     * must be finite; zoom is clamped to minZoom..maxZoom (zoom 0 -> minZoom);
     * mode must be an integer FollowMode in range. Shake, sequences, and zoom
     * animations are deliberately not serialized.
     * @throws Error `code = "ERR_CAMERA_STATE"` on any violation.
     */
    setState(snapshot: { posX?: number; posY?: number; targetX?: number; targetY?: number; zoom?: number; mode?: number }): this;

    // Lifecycle
    destroy(): void;
}

export default CinematicCameraPro;
