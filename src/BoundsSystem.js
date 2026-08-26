/**
 * @zakkster/lite-camera-pro — Smart Bounds System
 *
 * Replaces hard edge clamping with configurable per-edge behavior.
 *
 * Boundary types:
 *   HARD    — stops at edge (default, same as lite-camera base)
 *   SOFT    — decelerates smoothly near edge using smoothstep
 *   ELASTIC — allows slight overshoot, springs back
 *   NONE    — no boundary enforcement
 *
 * Zero allocations. All state is pre-allocated on the camera.
 *
 * Depends on: nothing (pure math -- clamp/smoothstep are inline).
 */

/** @enum {number} */
export const BoundsType = {
    HARD:    0,
    SOFT:    1,
    ELASTIC: 2,
    NONE:    3,
};

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
    state.boundsX = x;
    state.boundsY = y;
    state.boundsW = w;
    state.boundsH = h;
    state.customBounds = true;
}

/**
 * Clear custom bounds, reverting to full world size.
 * @param {Object} state  BoundsState
 */
export function clearBoundsRect(state) {
    state.customBounds = false;
}

// ── Smoothstep (inlined to avoid import for single use) ──
function smoothstep(edge0, edge1, x) {
    const t = x < edge0 ? 0 : (x > edge1 ? 1 : (x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
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
            // Decelerate smoothly as we approach the edge
            if (isMin && val < edge + sz) {
                // How deep into the soft zone (0 = at edge, 1 = at zone boundary)
                const t = smoothstep(edge, edge + sz, val);
                // Blend target toward the edge
                target[axis] = edge + (val - edge) * t;
                if (target[axis] < edge) target[axis] = edge;
            }
            if (!isMin && val > edge - sz) {
                const t = smoothstep(edge, edge - sz, val);
                target[axis] = edge + (val - edge) * t;
                if (target[axis] > edge) target[axis] = edge;
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
