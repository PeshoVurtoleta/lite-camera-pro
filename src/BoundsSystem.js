/**
 * @zakkster/lite-camera-pro -- Smart Bounds System
 *
 * Replaces hard edge clamping with configurable per-edge behavior.
 *
 * Boundary types:
 *   HARD    -- stops at edge (default, same as lite-camera base)
 *   SOFT    -- decelerates as it nears the edge, holding a half-zone back
 *   ELASTIC -- allows slight overshoot, springs back
 *   NONE    -- no boundary enforcement
 *
 * Zero allocations. All state is pre-allocated on the camera.
 *
 * Depends on: nothing (pure math -- clamp is inline, no Math.* on the hot path).
 */

/** @enum {number} */
export const BoundsType = {
    HARD:    0,
    SOFT:    1,
    ELASTIC: 2,
    NONE:    3,
};

// CP-26 (fail closed): a bounds edge type must be an integer BoundsType 0..3.
// A garbage type stored silently falls through the applyBounds switch to
// no-enforcement (CP-12 shape). All bounds doors are cold (setup-time setters,
// never the per-frame applyBounds body). ERR_CAMERA_* is the facade grammar.
function _throwBounds(msg) {
    const e = new Error("BoundsSystem: " + msg);
    e.code = "ERR_CAMERA_BOUNDS";
    throw e;
}
function _validType(v) {
    return Number.isInteger(v) && v >= 0 && v <= 3;
}

/**
 * Create the bounds system state. Allocated once per camera.
 * @returns {Object}
 */
export function createBoundsState() {
    return {
        // Per-edge boundary type
        left:   BoundsType.HARD,
        right:  BoundsType.HARD,
        top:    BoundsType.HARD,
        bottom: BoundsType.HARD,

        // Soft zone width: how far from edge deceleration starts (pixels)
        softZone: 80,

        // Elastic overshoot: max pixels past the boundary
        elasticMax: 30,

        // Elastic spring-back strength (higher = snappier return)
        elasticStrength: 8.0,

        // Custom world bounds (null = use camera worldW/worldH)
        boundsX: 0,
        boundsY: 0,
        boundsW: 0,
        boundsH: 0,
        customBounds: false,
    };
}

/**
 * Set the boundary type for all edges at once.
 *
 * @param {Object} state  BoundsState (cam._bounds)
 * @param {number} type   BoundsType enum
 */
export function setBoundsAll(state, type) {
    // CP-26 door (cold): reject a non-integer or out-of-range type before it is
    // stored, so applyBounds's per-frame switch never sees a garbage edge.
    if (!_validType(type)) {
        _throwBounds("setBoundsAll(type) requires an integer BoundsType in [0, 3]");
    }
    state.left = state.right = state.top = state.bottom = type;
}

/**
 * Set boundary types per edge.
 *
 * @param {Object} state   BoundsState
 * @param {Object} config
 * @param {number} [config.left]
 * @param {number} [config.right]
 * @param {number} [config.top]
 * @param {number} [config.bottom]
 */
export function setBoundsEdges(state, config) {
    // CP-26 door (cold): validate EVERY provided edge BEFORE mutating ANY, the
    // house validate-before-mutate pattern -- a rejected call leaves the bounds
    // state byte-identical.
    if (config.left   !== undefined && !_validType(config.left))   _throwBounds("setBoundsEdges: left must be an integer BoundsType in [0, 3]");
    if (config.right  !== undefined && !_validType(config.right))  _throwBounds("setBoundsEdges: right must be an integer BoundsType in [0, 3]");
    if (config.top    !== undefined && !_validType(config.top))    _throwBounds("setBoundsEdges: top must be an integer BoundsType in [0, 3]");
    if (config.bottom !== undefined && !_validType(config.bottom)) _throwBounds("setBoundsEdges: bottom must be an integer BoundsType in [0, 3]");

    if (config.left   !== undefined) state.left   = config.left;
    if (config.right  !== undefined) state.right  = config.right;
    if (config.top    !== undefined) state.top    = config.top;
    if (config.bottom !== undefined) state.bottom = config.bottom;
}

/**
 * Set a custom bounds rectangle (for dynamic bounds during gameplay).
 *
 * @param {Object} state  BoundsState
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
export function setBoundsRect(state, x, y, w, h) {
    // CP-26 door (cold): a non-finite rect arg would poison the derived
    // min/max box (NaN propagates through applyBounds/clampToBounds every
    // frame). Validate all four before mutating any (validate-before-mutate).
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        !Number.isFinite(w) || !Number.isFinite(h)) {
        _throwBounds("setBoundsRect(x, y, w, h) requires four finite numbers");
    }
    state.boundsX = x;
    state.boundsY = y;
    state.boundsW = w;
    state.boundsH = h;
    state.customBounds = true;
}

/**
 * Set the soft-zone width (and optionally the elastic tuning) with a
 * finiteness door (CP-26 / D5). The SOFT hot map is NaN-safe by construction
 * (a NaN softZone makes `d < sz` false, so the branch never enters), but the
 * door keeps garbage from arriving via a setter -- fail closed at the entry,
 * validate-before-mutate.
 *
 * @param {Object} state   BoundsState
 * @param {number} softZone           New soft-zone width, finite and >= 0
 * @param {number} [elasticMax]       Optional elastic overshoot, finite
 * @param {number} [elasticStrength]  Optional spring strength, finite
 */
export function setSoftZone(state, softZone, elasticMax, elasticStrength) {
    if (!Number.isFinite(softZone) || softZone < 0) {
        _throwBounds("setSoftZone(softZone) requires a finite number >= 0");
    }
    if (elasticMax !== undefined && !Number.isFinite(elasticMax)) {
        _throwBounds("setSoftZone: elasticMax must be a finite number");
    }
    if (elasticStrength !== undefined && !Number.isFinite(elasticStrength)) {
        _throwBounds("setSoftZone: elasticStrength must be a finite number");
    }
    state.softZone = softZone;
    if (elasticMax !== undefined) state.elasticMax = elasticMax;
    if (elasticStrength !== undefined) state.elasticStrength = elasticStrength;
}

/**
 * Clear custom bounds, reverting to full world size.
 * @param {Object} state  BoundsState
 */
export function clearBoundsRect(state) {
    state.customBounds = false;
}

/**
 * Apply boundary enforcement to camera target position.
 * Replaces the simple clamp in camera.update().
 *
 * @param {Object} state    BoundsState
 * @param {Float32Array} target  cam.target (mutated)
 * @param {Float32Array} pos     cam.pos (mutated for elastic)
 * @param {number} maxX     Default maximum X (worldW - visibleW)
 * @param {number} maxY     Default maximum Y (worldH - visibleH)
 * @param {number} visW     Visible width (viewW / zoom)
 * @param {number} visH     Visible height (viewH / zoom)
 * @param {number} dt       Delta time
 */
export function applyBounds(state, target, pos, maxX, maxY, visW, visH, dt) {
    let minBX = 0, maxBX = maxX;
    let minBY = 0, maxBY = maxY;

    if (state.customBounds) {
        // Custom bounds define a world-space rectangle.
        // Camera target is the top-left of the visible area.
        // Min = bounds origin. Max = bounds origin + bounds size - visible size.
        minBX = state.boundsX;
        minBY = state.boundsY;
        maxBX = state.boundsX + state.boundsW - visW;
        maxBY = state.boundsY + state.boundsH - visH;

        // If visible area exceeds bounds, center the camera within the bounds
        if (maxBX < minBX) { const mid = (minBX + maxBX) * 0.5; minBX = maxBX = mid; }
        if (maxBY < minBY) { const mid = (minBY + maxBY) * 0.5; minBY = maxBY = mid; }
    }

    const sz = state.softZone;
    const eMax = state.elasticMax;
    const eStr = state.elasticStrength;

    _applyEdge(state.left,   target, pos, 0, minBX, true,  sz, eMax, eStr, dt);
    _applyEdge(state.right,  target, pos, 0, maxBX, false, sz, eMax, eStr, dt);
    _applyEdge(state.top,    target, pos, 1, minBY, true,  sz, eMax, eStr, dt);
    _applyEdge(state.bottom, target, pos, 1, maxBY, false, sz, eMax, eStr, dt);
}

/**
 * HARD-clamp target AND pos into the effective bounds box (D6 / CP-7). This is
 * a discontinuity clamp for resize(): a viewport change must land the camera
 * legal IMMEDIATELY, so it is always plain HARD against the effective box
 * (custom rect honored) -- never SOFT/ELASTIC, which are per-frame feel, not a
 * jump correction. Derives the SAME min/max box applyBounds derives (the
 * duplication is deliberate and guarded by a 10k random-state box-agreement
 * sweep in the regressions, not hoisted into the per-frame applyBounds body).
 * Zero allocation.
 *
 * @param {Object} state   BoundsState
 * @param {Float32Array} target  cam.target (mutated)
 * @param {Float32Array} pos     cam.pos (mutated)
 * @param {number} maxX    Default maximum X (worldW - visibleW)
 * @param {number} maxY    Default maximum Y (worldH - visibleH)
 * @param {number} visW    Visible width  (viewW / zoom)
 * @param {number} visH    Visible height (viewH / zoom)
 */
export function clampToBounds(state, target, pos, maxX, maxY, visW, visH) {
    let minBX = 0, maxBX = maxX;
    let minBY = 0, maxBY = maxY;

    if (state.customBounds) {
        minBX = state.boundsX;
        minBY = state.boundsY;
        maxBX = state.boundsX + state.boundsW - visW;
        maxBY = state.boundsY + state.boundsH - visH;
        if (maxBX < minBX) { const mid = (minBX + maxBX) * 0.5; minBX = maxBX = mid; }
        if (maxBY < minBY) { const mid = (minBY + maxBY) * 0.5; minBY = maxBY = mid; }
    }

    if (target[0] < minBX) target[0] = minBX; else if (target[0] > maxBX) target[0] = maxBX;
    if (target[1] < minBY) target[1] = minBY; else if (target[1] > maxBY) target[1] = maxBY;
    if (pos[0]    < minBX) pos[0]    = minBX; else if (pos[0]    > maxBX) pos[0]    = maxBX;
    if (pos[1]    < minBY) pos[1]    = minBY; else if (pos[1]    > maxBY) pos[1]    = maxBY;
}

/**
 * Apply a single edge constraint.
 *
 * @param {number} type     BoundsType
 * @param {Float32Array} target
 * @param {Float32Array} pos
 * @param {number} axis     0=X, 1=Y
 * @param {number} edge     The boundary value
 * @param {boolean} isMin   true = left/top (target must be >= edge), false = right/bottom (<=)
 * @param {number} sz       Soft zone width
 * @param {number} eMax     Elastic max overshoot
 * @param {number} eStr     Elastic spring strength
 * @param {number} dt
 */
function _applyEdge(type, target, pos, axis, edge, isMin, sz, eMax, eStr, dt) {
    const val = target[axis];

    switch (type) {
        case BoundsType.HARD:
            if (isMin && val < edge) target[axis] = edge;
            if (!isMin && val > edge) target[axis] = edge;
            break;

        case BoundsType.SOFT: {
            // CP-6 fix -- quadratic half-zone hold-out (decisions/0005). The old
            // smoothstep map compressed the granted position TOWARD the edge (the
            // inverse of "decelerate near the edge"). This grants g(val) that is
            // monotone, never nearer the edge than requested, fixes the zone entry
            // (g = requested there), and whose slope -> 0 at the edge so a SOFT
            // edge asymptotically holds the last half-zone back (the edge itself
            // is reachable only by HARD). Per edge: s = +1 for min, -1 for max;
            // d = s * (val - edge); enter only inside the zone (d < sz); u =
            // clamp(d/sz, 0, 1) (two comparisons, no Math.*); h(u) = (1 + u*u)/2;
            // target = edge + s * sz * 0.5 * (1 + u*u). sz <= 0 degenerates to
            // HARD for free (only d < 0 can enter, u lands 0, grant = edge); a
            // NaN sz cannot enter (d < NaN is false) -- no hot-body guard buys
            // bytes. Four float ops + two comparisons, zero allocation.
            const s = isMin ? 1 : -1;
            const d = s * (val - edge);
            if (d < sz) {
                let u = d / sz;
                if (u < 0) u = 0; else if (u > 1) u = 1;
                target[axis] = edge + s * sz * 0.5 * (1 + u * u);
            }
            break;
        }

        case BoundsType.ELASTIC: {
            // Allow overshoot up to eMax, then spring back
            if (isMin && val < edge) {
                const overshoot = edge - val;
                if (overshoot > eMax) {
                    target[axis] = edge - eMax;
                }
                // Safe, frame-rate independent spring back
                const springLerp = 1 - Math.exp(-eStr * dt);
                pos[axis] += (edge - pos[axis]) * springLerp;
            }
            if (!isMin && val > edge) {
                const overshoot = val - edge;
                if (overshoot > eMax) {
                    target[axis] = edge + eMax;
                }
                const springLerp = 1 - Math.exp(-eStr * dt);
                pos[axis] += (edge - pos[axis]) * springLerp;
            }
            break;
        }

        case BoundsType.NONE:
            // No enforcement
            break;
    }
}
