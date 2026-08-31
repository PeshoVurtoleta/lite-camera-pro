/**
 * @zakkster/lite-camera-pro/sequence -- TypeScript declarations.
 *
 * Timeline-driven camera choreography. NOTE: this subpath drags
 * @zakkster/lite-timeline and @zakkster/lite-ease by design -- it is the only
 * subpath that does. Complete runtime surface, no `any`.
 */

import type { CinematicCameraPro } from './index.js';
import type { ShakeProfile } from './Shake.js';

// -- Sequence construction options --
export interface CameraSequenceOptions {
    loop?: boolean;
    onComplete?: () => void;
    /**
     * SECONDS to blend camera position back to the follow target after the
     * sequence completes (default 0.3; 0 = hard handoff, identical to 1.2.0).
     * Step durations on the builder are MILLISECONDS -- different units. Zoom
     * is not blended. Validated once at construction: a non-finite or negative
     * value throws an Error with code "ERR_SEQUENCE_OPTIONS".
     */
    blendOutTime?: number;
}

// -- Per-step options --
export interface StepOptions {
    ease?: (t: number) => number;
    at?: string | number;
}

// -- A fluent camera sequence handle --
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

/**
 * @throws Error `code = "ERR_SEQUENCE_OPTIONS"` if options.blendOutTime is
 * non-finite or negative.
 */
export declare function createCameraSequence(cam: CinematicCameraPro, options?: CameraSequenceOptions): CameraSequence;
export declare function panTo(
    cam: CinematicCameraPro,
    x: number,
    y: number,
    duration: number,
    opts?: CameraSequenceOptions & StepOptions,
): CameraSequence;
export declare function dramaticZoom(
    cam: CinematicCameraPro,
    x: number,
    y: number,
    zoom: number,
    duration: number,
    opts?: CameraSequenceOptions & StepOptions,
): CameraSequence;
export declare function bossReveal(
    cam: CinematicCameraPro,
    x: number,
    y: number,
    totalMs?: number,
    opts?: CameraSequenceOptions,
): CameraSequence;
export declare function timedShake(
    cam: CinematicCameraPro,
    presetOrProfile: string | ShakeProfile,
    holdMs?: number,
    opts?: CameraSequenceOptions,
): CameraSequence;

/**
 * Attach the sequence factory to one camera (v2.0.0 detach). Installs a
 * per-instance createSequence(options) that calls createCameraSequence(this,
 * options). Returns the camera for chaining. With no attach, call
 * createCameraSequence(cam, options) directly.
 * @throws Error `code = "ERR_ALREADY_ATTACHED"` if sequences are already attached.
 */
export declare function withSequences<C>(cam: C): C;

declare const _default: typeof createCameraSequence;
export default _default;
