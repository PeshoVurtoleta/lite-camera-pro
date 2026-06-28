/**
 * @zakkster/lite-camera-pro — Noise-Based Shake Engine
 *
 * Replaces RNG trauma shake with simplex noise for smooth, organic screen shake.
 * Supports layered shakes: multiple simultaneous shake sources sum together.
 *
 * Zero-GC: Pre-allocated shake slot pool. No allocations in update/compute.
 *
 * Depends on: @zakkster/lite-noise (simplex2)
 */

import {simplex2} from '@zakkster/lite-noise';

// ── Maximum simultaneous shake layers ──
const MAX_SHAKE_SLOTS = 8;

// ── Unique noise offsets so each slot/axis samples different noise ──
// Slot i, axis j → noise offset = NOISE_SEED_OFFSET * (i * 3 + j)
const NOISE_SEED_OFFSET = 1000;

/**
 * A single shake slot. Pre-allocated, reused via pool.
 * All fields are primitives — zero GC.
 */
function createShakeSlot() {
    return {
        active: false,

        // True when slot was created by addTraumaSimple (generic omni shake).
        // addTrauma only stacks onto isDefault slots — preset/profile slots
        // have their own freq/decay/maxOffset and shouldn't be polluted with
        // generic trauma added on top.
        isDefault: false,

        // ── Trauma model ──
        trauma: 0,      // Current trauma [0, 1] — decays over time
        decay: 1.0,    // Trauma units lost per second

        // ── Noise parameters ──
        freq: 15,     // Noise sample frequency (higher = more jittery)
        time: 0,      // Accumulated time for noise sampling

        // ── Output amplitude ──
        maxOffset: 15,     // Maximum pixel offset at trauma=1
        maxAngle: 0.05,   // Maximum rotation (radians) at trauma=1

        // ── Direction constraint ──
        // If dirX/dirY are non-zero, shake is constrained to that axis.
        // (0,0) = omnidirectional, (1,0) = horizontal only, (0,1) = vertical only
        dirX: 0,
        dirY: 0,
        isDirectional: false,
    };
}

/**
 * Shake engine state. Allocated once per camera.
 * Contains a pool of shake slots and the computed output.
 *
 * @param {number} [seedOffset=0]  Per-camera offset added to every noise
 *                                 sample base. Lets two cameras with different
 *                                 seeds produce distinct, deterministic shake
 *                                 patterns without touching the global perm table.
 */
export function createShakeState(seedOffset = 0) {
    const slots = new Array(MAX_SHAKE_SLOTS);
    for (let i = 0; i < MAX_SHAKE_SLOTS; i++) {
        slots[i] = createShakeSlot();
    }

    return {
        slots,
        slotCount: MAX_SHAKE_SLOTS,

        // Multiply by a prime so adjacent seeds land far apart in noise space.
        seedOffset: (seedOffset | 0) * 7919,

        // ── Computed output (read by apply()) ──
        offsetX: 0,
        offsetY: 0,
        angle: 0,

        // ── Global shake scale (0 = no shake, 1 = normal) ──
        globalScale: 1.0,

        // ── Whether any slot is active (quick check in apply) ──
        active: false,
    };
}

/**
 * Find the first inactive slot, or the slot with lowest trauma to steal.
 *
 * @param {Object} state  ShakeState
 * @returns {Object} A shake slot
 */
function acquireSlot(state) {
    let minTrauma = Infinity;
    let minIdx = 0;

    for (let i = 0; i < state.slotCount; i++) {
        if (!state.slots[i].active) return state.slots[i];
        if (state.slots[i].trauma < minTrauma) {
            minTrauma = state.slots[i].trauma;
            minIdx = i;
        }
    }

    // All slots full — steal the weakest
    return state.slots[minIdx];
}

// ─────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────

/**
 * Add a shake impulse. Acquires a slot from the pool and configures it.
 *
 * @param {Object} state   ShakeState (cam._shake)
 * @param {Object} profile Shake profile (from presets or custom)
 * @param {number} profile.trauma     Initial trauma [0, 1]
 * @param {number} [profile.freq=15]  Noise frequency
 * @param {number} [profile.decay=1]  Trauma decay per second
 * @param {number} [profile.maxOffset=15] Max pixel offset
 * @param {number} [profile.maxAngle=0.05] Max rotation (radians)
 * @param {number} [profile.dirX=0]   Directional X component
 * @param {number} [profile.dirY=0]   Directional Y component
 * @param {number} [profile.intensity=1] Scale multiplier for the profile
 */
export function addShake(state, profile, intensity = 1) {
    const slot = acquireSlot(state);

    slot.active = true;
    slot.isDefault = false;
    slot.trauma = Math.min(1, (profile.trauma || 0.5) * intensity);
    slot.decay = profile.decay !== undefined ? profile.decay : 1.0;
    slot.freq = profile.freq !== undefined ? profile.freq : 15;
    slot.maxOffset = profile.maxOffset !== undefined ? profile.maxOffset : 15;
    slot.maxAngle = profile.maxAngle !== undefined ? profile.maxAngle : 0.05;
    slot.time = 0; // reset time for fresh noise sampling

    // Directional
    const dx = profile.dirX || 0;
    const dy = profile.dirY || 0;
    slot.isDirectional = (dx !== 0 || dy !== 0);

    if (slot.isDirectional) {
        // Normalize direction
        const len = Math.sqrt(dx * dx + dy * dy);
        slot.dirX = dx / len;
        slot.dirY = dy / len;
    } else {
        slot.dirX = 0;
        slot.dirY = 0;
    }

    state.active = true;
}

/**
 * Add simple trauma to the first active slot, or create one with defaults.
 * Backward-compatible with the original camera.addTrauma(amount) API. Zero-GC.
 *
 * @param {Object} state  ShakeState
 * @param {number} amount Trauma to add [0, 1]
 */
export function addTraumaSimple(state, amount) {
    // Try to find an existing default omni slot to stack onto.
    // Preset/profile slots are NEVER stacked onto — they have parameters
    // (freq, decay, etc.) that addTrauma's generic shake wouldn't match.
    for (let i = 0; i < state.slotCount; i++) {
        const s = state.slots[i];
        if (s.active && s.isDefault) {
            s.trauma = Math.min(1, s.trauma + amount);
            return;
        }
    }

    // No active omni slot — populate one inline. No intermediate object literal
    // (which would otherwise allocate per call and violate the zero-GC contract).
    const slot = acquireSlot(state);
    slot.active = true;
    slot.isDefault = true;   // explicit profile/preset — not a generic trauma slot
    slot.trauma = Math.min(1, amount);
    slot.decay = 1.0;
    slot.freq = 15;
    slot.time = 0;
    slot.maxOffset = 15;
    slot.maxAngle = 0.05;
    slot.dirX = 0;
    slot.dirY = 0;
    slot.isDirectional = false;
    state.active = true;
}

/**
 * Update all active shake slots: advance time, decay trauma.
 * Called once per frame from camera.update().
 *
 * @param {Object} state ShakeState
 * @param {number} dt    Delta time in seconds
 */
export function updateShake(state, dt) {
    let anyActive = false;

    for (let i = 0; i < state.slotCount; i++) {
        const s = state.slots[i];
        if (!s.active) continue;

        s.time += dt;
        s.trauma -= s.decay * dt;

        if (s.trauma <= 0) {
            s.trauma = 0;
            s.active = false;
            continue;
        }

        anyActive = true;
    }

    state.active = anyActive;
}

/**
 * Compute the final shake offset and rotation by summing all active layers.
 * Uses simplex noise for smooth, organic motion. Zero allocation.
 *
 * Called once per frame from camera.apply() AFTER updateShake().
 *
 * @param {Object} state ShakeState
 */
export function computeShake(state) {
    let totalOX = 0;
    let totalOY = 0;
    let totalAngle = 0;

    for (let i = 0; i < state.slotCount; i++) {
        const s = state.slots[i];
        if (!s.active) continue;

        // trauma² for perceptual scaling (small trauma = barely visible)
        const shake = s.trauma * s.trauma;
        const t = s.time * s.freq;

        // Sample noise at 3 different offsets for X, Y, angle
        const noiseBase = NOISE_SEED_OFFSET * (i * 3) + state.seedOffset;
        const nx = simplex2(t, noiseBase);       // [-1, 1]
        const ny = simplex2(t, noiseBase + 1);
        const na = simplex2(t, noiseBase + 2);

        if (s.isDirectional) {
            // Project shake onto the direction vector
            const mag = s.maxOffset * shake * nx;
            totalOX += mag * s.dirX;
            totalOY += mag * s.dirY;
        } else {
            totalOX += s.maxOffset * shake * nx;
            totalOY += s.maxOffset * shake * ny;
        }

        totalAngle += s.maxAngle * shake * na;
    }

    // Apply global scale
    state.offsetX = Math.fround(totalOX * state.globalScale);
    state.offsetY = Math.fround(totalOY * state.globalScale);
    state.angle = Math.fround(totalAngle * state.globalScale);
}

/**
 * Stop all active shakes immediately.
 *
 * @param {Object} state ShakeState
 */
export function clearShakes(state) {
    for (let i = 0; i < state.slotCount; i++) {
        state.slots[i].active = false;
        state.slots[i].trauma = 0;
    }
    state.active = false;
    state.offsetX = 0;
    state.offsetY = 0;
    state.angle = 0;
}
