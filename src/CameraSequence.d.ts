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

declare const _default: typeof createCameraSequence;
export default _default;
