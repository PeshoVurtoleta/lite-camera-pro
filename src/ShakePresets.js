/**
 * @zakkster/lite-camera-pro -- Shake Presets
 *
 * Frozen profile objects for common game shake scenarios.
 * Each preset is a plain object matching the ShakeEngine profile shape.
 * Developers can register custom presets via registerPreset().
 *
 * Zero dependencies. Pure data.
 */

// -----------------------------------------------------
//  BUILT-IN PRESETS
// -----------------------------------------------------

/**
 * EXPLOSION -- Big boom. High trauma, low frequency for heavy sway,
 * large offset, medium rotation. Slow decay for lingering feel.
 */
export const EXPLOSION = Object.freeze({
    trauma:    0.8,
    freq:      12,
    decay:     0.7,
    maxOffset: 25,
    maxAngle:  0.06,
    dirX:      0,
    dirY:      0,
});

/**
 * EARTHQUAKE -- Sustained rumble. Medium trauma, very low frequency
 * for slow, heavy rolling. Large offset, minimal rotation. Slow decay.
 */
export const EARTHQUAKE = Object.freeze({
    trauma:    0.5,
    freq:      6,
    decay:     0.3,
    maxOffset: 30,
    maxAngle:  0.02,
    dirX:      0,
    dirY:      0,
});

/**
 * RECOIL -- Gun/weapon kickback. Directional (upward by default).
 * Short, sharp burst with fast decay.
 */
export const RECOIL = Object.freeze({
    trauma:    0.5,
    freq:      20,
    decay:     2.5,
    maxOffset: 12,
    maxAngle:  0.02,
    dirX:      0,
    dirY:      -1,  // upward kick
});

/**
 * IMPACT -- Something hit the player/world. Sharp trauma spike,
 * high frequency for a snappy jolt, fast decay.
 */
export const IMPACT = Object.freeze({
    trauma:    0.7,
    freq:      25,
    decay:     2.0,
    maxOffset: 18,
    maxAngle:  0.04,
    dirX:      0,
    dirY:      0,
});

/**
 * LANDING -- Player lands from a height. Vertical-only shake.
 * Medium trauma, medium frequency, moderate decay.
 */
export const LANDING = Object.freeze({
    trauma:    0.4,
    freq:      18,
    decay:     1.5,
    maxOffset: 10,
    maxAngle:  0.01,
    dirX:      0,
    dirY:      1,  // downward push
});

/**
 * DAMAGE -- Player takes a hit. Quick pulse, low offset,
 * no rotation. Feels like a screen flash without the flash.
 */
export const DAMAGE = Object.freeze({
    trauma:    0.35,
    freq:      22,
    decay:     3.0,
    maxOffset: 6,
    maxAngle:  0,
    dirX:      0,
    dirY:      0,
});

/**
 * RUMBLE -- Continuous low-level vibration. Low trauma, high frequency
 * for a "motor hum" feel. Very slow decay (lingers).
 * Good for approaching boss, earthquake precursor, engine vibration.
 */
export const RUMBLE = Object.freeze({
    trauma:    0.2,
    freq:      30,
    decay:     0.15,
    maxOffset: 3,
    maxAngle:  0,
    dirX:      0,
    dirY:      0,
});

/**
 * HEAVY_IMPACT -- Boss stomp, meteor hit, critical attack.
 * Maximum everything. The "oh no" shake.
 */
export const HEAVY_IMPACT = Object.freeze({
    trauma:    1.0,
    freq:      10,
    decay:     0.5,
    maxOffset: 35,
    maxAngle:  0.08,
    dirX:      0,
    dirY:      0,
});

// -----------------------------------------------------
//  PRESET REGISTRY
// -----------------------------------------------------

/** @type {Object<string, Object>} */
const _registry = {
    explosion:    EXPLOSION,
    earthquake:   EARTHQUAKE,
    recoil:       RECOIL,
    impact:       IMPACT,
    landing:      LANDING,
    damage:       DAMAGE,
    rumble:        RUMBLE,
    heavy_impact: HEAVY_IMPACT,
};

/**
 * Get a preset by name.
 *
 * Fail-closed (CP-12): a non-string name returns null (the event path -- e.g.
 * cam.shakePreset(undefined) -- must not crash on name.toLowerCase()). An
 * unknown string returns null too. Case-insensitive for valid strings.
 *
 * @param {string} name  Preset name (case-insensitive)
 * @returns {Object|null} Shake profile or null
 */
export function getPreset(name) {
    if (typeof name !== 'string') return null;
    return _registry[name.toLowerCase()] || null;
}

/**
 * Register a custom preset. Overwrites existing presets with the same name.
 *
 * @param {string} name    Preset name
 * @param {Object} profile Shake profile object
 *
 * @example
 * registerPreset('sword_clash', {
 *   trauma: 0.3, freq: 28, decay: 3.0,
 *   maxOffset: 8, maxAngle: 0.03,
 *   dirX: 1, dirY: 0,  // horizontal only
 * });
 */
export function registerPreset(name, profile) {
    // Fail-closed (CP-12, setup path fails loud): a non-string/empty name or a
    // non-object profile is a defective registration -- reject it rather than
    // poison the registry with a key that getPreset can never resolve or a
    // profile addShake would spread into garbage.
    if (typeof name !== 'string' || name === '' ||
        typeof profile !== 'object' || profile === null) {
        const e = new Error("lite-camera-pro: registerPreset(name, profile) requires a non-empty string name and a profile object");
        e.code = "ERR_SHAKE_PRESET";
        throw e;
    }
    _registry[name.toLowerCase()] = Object.freeze({ ...profile });
}

/**
 * List all registered preset names.
 * @returns {string[]}
 */
export function listPresets() {
    return Object.keys(_registry);
}
