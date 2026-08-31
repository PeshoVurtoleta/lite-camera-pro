/**
 * @zakkster/lite-camera-pro — Parallax Layer Manager
 *
 * Manages multiple scroll layers at different speeds.
 * Each layer has a scroll multiplier relative to the camera.
 *
 *   speed 1.0 = scrolls with camera (normal game layer)
 *   speed 0.5 = scrolls at half speed (distant background)
 *   speed 1.5 = scrolls faster (foreground)
 *   speed 0.0 = fixed (UI, sky)
 *
 * Zero allocations per frame. All layer state is pre-allocated.
 *
 * Depends on: nothing (pure math)
 */

// ── Maximum layers ──
const MAX_LAYERS = 16;

/** Wrap modes for layer tiling */
export const WrapMode = {
    NONE:       0,  // no wrapping
    REPEAT_X:   1,  // tile horizontally
    REPEAT_Y:   2,  // tile vertically
    REPEAT_BOTH: 3, // tile both axes
};

/**
 * Create a single parallax layer (pre-allocated).
 * @returns {Object}
 */
function createLayer() {
    return {
        active:  false,
        id:      '',

        // Scroll speed multipliers (1.0 = normal camera speed)
        speedX:  1.0,
        speedY:  1.0,

        // Manual offset (for fine-tuning layer position)
        offsetX: 0,
        offsetY: 0,

        // Wrap mode
        wrap:    WrapMode.NONE,

        // Computed scroll position (updated each frame)
        scrollX: 0,
        scrollY: 0,
    };
}

/**
 * Create the parallax manager state. Allocated once per camera.
 *
 * @returns {Object} ParallaxState
 */
export function createParallaxState() {
    const layers = new Array(MAX_LAYERS);
    for (let i = 0; i < MAX_LAYERS; i++) {
        layers[i] = createLayer();
    }

    return {
        layers,
        layerCount: MAX_LAYERS,
        activeCount: 0,
    };
}

/**
 * Add or update a parallax layer.
 *
 * @param {Object} state     ParallaxState (cam._parallax)
 * @param {string} id        Unique layer identifier
 * @param {number} speedX    Horizontal scroll multiplier
 * @param {number} [speedY]  Vertical scroll multiplier (defaults to speedX)
 * @param {Object} [opts]
 * @param {number} [opts.offsetX=0]  Manual X offset
 * @param {number} [opts.offsetY=0]  Manual Y offset
 * @param {number} [opts.wrap=0]     WrapMode enum
 * @returns {Object} The layer object (for direct mutation if needed)
 */
export function addParallaxLayer(state, id, speedX, speedY, opts) {
    if (speedY === undefined) speedY = speedX;

    // Check if layer already exists
    for (let i = 0; i < state.layerCount; i++) {
        if (state.layers[i].active && state.layers[i].id === id) {
            const layer = state.layers[i];
            layer.speedX = speedX;
            layer.speedY = speedY;
            if (opts) {
                if (opts.offsetX !== undefined) layer.offsetX = opts.offsetX;
                if (opts.offsetY !== undefined) layer.offsetY = opts.offsetY;
                if (opts.wrap !== undefined)    layer.wrap    = opts.wrap;
            }
            return layer;
        }
    }

    // Find first inactive slot
    for (let i = 0; i < state.layerCount; i++) {
        if (!state.layers[i].active) {
            const layer = state.layers[i];
            layer.active  = true;
            layer.id      = id;
            layer.speedX  = speedX;
            layer.speedY  = speedY;
            layer.offsetX = (opts && opts.offsetX) || 0;
            layer.offsetY = (opts && opts.offsetY) || 0;
            layer.wrap    = (opts && opts.wrap)    || WrapMode.NONE;
            layer.scrollX = 0;
            layer.scrollY = 0;
            state.activeCount++;
            return layer;
        }
    }

    return null; // all slots full
}

/**
 * Remove a parallax layer by id.
 *
 * @param {Object} state  ParallaxState
 * @param {string} id     Layer id
 */
export function removeParallaxLayer(state, id) {
    for (let i = 0; i < state.layerCount; i++) {
        if (state.layers[i].active && state.layers[i].id === id) {
            state.layers[i].active = false;
            state.layers[i].id = '';
            state.activeCount--;
            return;
        }
    }
}

/**
 * Update all layer scroll positions based on camera position and zoom.
 * Called once per frame from camera.update().
 *
 * @param {Object} state  ParallaxState
 * @param {number} camX   Camera top-left X (cam.pos[0])
 * @param {number} camY   Camera top-left Y (cam.pos[1])
 * @param {number} zoom   Camera zoom level
 */
export function updateParallax(state, camX, camY, zoom) {
    for (let i = 0; i < state.layerCount; i++) {
        const layer = state.layers[i];
        if (!layer.active) continue;

        // Parallax scroll = camera position × speed multiplier
        // Zoom scaling: faster layers should scale more with zoom
        layer.scrollX = camX * layer.speedX * zoom + layer.offsetX;
        layer.scrollY = camY * layer.speedY * zoom + layer.offsetY;
    }
}

/**
 * Get a layer's scroll offset by id. Zero-alloc via out parameter.
 *
 * @param {Object} state  ParallaxState
 * @param {string} id     Layer id
 * @param {{x:number,y:number}} out  Pre-allocated output
 * @returns {{x:number,y:number}|null} out or null if not found
 */
export function getLayerScroll(state, id, out) {
    for (let i = 0; i < state.layerCount; i++) {
        if (state.layers[i].active && state.layers[i].id === id) {
            out.x = state.layers[i].scrollX;
            out.y = state.layers[i].scrollY;
            return out;
        }
    }
    return null;
}

/**
 * Apply a parallax layer's transform to a canvas context.
 * Call between ctx.save() and ctx.restore() per layer.
 *
 * @param {Object} state  ParallaxState
 * @param {string} id     Layer id
 * @param {CanvasRenderingContext2D} ctx
 * @returns {boolean} true if layer was found and applied
 */
export function applyParallaxLayer(state, id, ctx) {
    for (let i = 0; i < state.layerCount; i++) {
        const layer = state.layers[i];
        if (layer.active && layer.id === id) {
            // int snap is deliberate: kills texture shimmer. floor (not | 0) so
            // the snap is uniform about the origin -- | 0 truncates toward zero
            // (CP-13), matching the base camera and CinematicCameraPro.apply().
            ctx.translate(-Math.floor(layer.scrollX), -Math.floor(layer.scrollY));
            return true;
        }
    }
    return false;
}

/**
 * Attach the parallax subsystem to one camera (v2.0.0 detach, CP-22/D1).
 * The class ships parallax methods as fail-closed stubs; this restores the
 * real behavior per-instance -- own-property install only, never prototype
 * mutation, so two cameras in a page attach independently. It builds the
 * ParallaxState the constructor no longer allocates and wires the per-frame
 * tick fn the class's update() step 7 calls (carried on the instance so
 * ParallaxManager stays out of the class import graph, G1). Single-shot:
 * a second attach throws ERR_ALREADY_ATTACHED rather than silently discarding
 * live layers. destroy() is the only exit (it rebinds these to its sentinel).
 *
 * @param {Object} cam  A CinematicCameraPro instance
 * @returns {Object} cam, for chaining
 * @throws {Error} code "ERR_ALREADY_ATTACHED" if parallax is already attached
 */
export function withParallax(cam) {
    // Destroyed beats unattached (QA-1): destroy() rebinds update as an
    // own-property, so a corpse is Object.hasOwn(cam, 'update'). Attaching over
    // the _dead sentinels would install live zombie methods -- fail closed first.
    if (Object.hasOwn(cam, 'update')) {
        const e = new Error("CinematicCameraPro: use after destroy()");
        e.code = "ERR_CAMERA_DESTROYED";
        throw e;
    }
    if (cam._parallax !== null) {
        const e = new Error("CinematicCameraPro: parallax already attached. " +
            "withParallax(camera) is per-instance and single-shot.");
        e.code = "ERR_ALREADY_ATTACHED";
        throw e;
    }
    cam._parallax = createParallaxState();
    cam._parallaxTick = updateParallax;
    cam.addParallaxLayer = function (id, speedX, speedY, opts) {
        addParallaxLayer(this._parallax, id, speedX, speedY, opts);
        return this;
    };
    cam.removeParallaxLayer = function (id) {
        removeParallaxLayer(this._parallax, id);
        return this;
    };
    cam.applyParallax = function (id, ctx) {
        return applyParallaxLayer(this._parallax, id, ctx);
    };
    return cam;
}
