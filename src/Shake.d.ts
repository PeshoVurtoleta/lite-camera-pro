/**
 * @zakkster/lite-camera-pro/shake -- TypeScript declarations.
 *
 * The ./shake subpath barrel: the noise-based shake engine (ShakeEngine.js)
 * plus the built-in presets and registry (ShakePresets.js). Complete runtime
 * surface, no `any`.
 */

// -- Shake profile (input) --
export interface ShakeProfile {
    /** Initial trauma [0, 1]. Undefined defaults to 0.5 in addShake. */
    trauma?: number;
    /** Noise sample frequency (higher = more jittery). Default 15. */
    freq?: number;
    /** Trauma units lost per second. Default 1. */
    decay?: number;
    /** Maximum pixel offset at trauma=1. Default 15. */
    maxOffset?: number;
    /** Maximum rotation (radians) at trauma=1. Default 0.05. */
    maxAngle?: number;
    /** Directional X component; (0,0) = omnidirectional. Default 0. */
    dirX?: number;
    /** Directional Y component. Default 0. */
    dirY?: number;
    /** Per-profile intensity multiplier used by addShake. Default 1. */
    intensity?: number;
}

// -- A single pre-allocated shake slot --
export interface ShakeSlot {
    active: boolean;
    isDefault: boolean;
    trauma: number;
    decay: number;
    freq: number;
    time: number;
    maxOffset: number;
    maxAngle: number;
    dirX: number;
    dirY: number;
    isDirectional: boolean;
}

// -- Shake engine state (one per camera) --
export interface ShakeState {
    slots: ShakeSlot[];
    slotCount: number;
    seedOffset: number;
    /** Computed X offset in pixels (read by apply()). */
    offsetX: number;
    /** Computed Y offset in pixels. */
    offsetY: number;
    /** Computed rotation in radians. */
    angle: number;
    /** Global shake scale (0 = no shake, 1 = normal). */
    globalScale: number;
    /** True when any slot is active. */
    active: boolean;
}

// -- Shake engine functions (ShakeEngine.js) --
export declare function createShakeState(seedOffset?: number): ShakeState;
export declare function addShake(state: ShakeState, profile: ShakeProfile, intensity?: number): void;
export declare function addTraumaSimple(state: ShakeState, amount: number): void;
export declare function updateShake(state: ShakeState, dt: number): void;
export declare function computeShake(state: ShakeState): void;
export declare function clearShakes(state: ShakeState): void;

// -- Built-in presets (ShakePresets.js) --
export declare const EXPLOSION: Readonly<ShakeProfile>;
export declare const EARTHQUAKE: Readonly<ShakeProfile>;
export declare const RECOIL: Readonly<ShakeProfile>;
export declare const IMPACT: Readonly<ShakeProfile>;
export declare const LANDING: Readonly<ShakeProfile>;
export declare const DAMAGE: Readonly<ShakeProfile>;
export declare const RUMBLE: Readonly<ShakeProfile>;
export declare const HEAVY_IMPACT: Readonly<ShakeProfile>;

// -- Preset registry (ShakePresets.js) --
export declare function getPreset(name: string): Readonly<ShakeProfile> | null;
export declare function registerPreset(name: string, profile: ShakeProfile): void;
export declare function listPresets(): string[];
