/**
 * @zakkster/lite-camera-pro — Cinematic Camera System
 *
 * Day 1: Pro scaffold + zoom system
 *
 * Extends CinematicCamera with:
 *  - Smooth zoom transitions (duration + easing)
 *  - Zoom-at-point (anchor zoom)
 *  - Zoom-aware world bounds
 *  - Screen ↔ world coordinate conversion
 *  - Visible-area–corrected follow centering
 *
 * Depends on: @zakkster/lite-camera, @zakkster/lite-lerp, @zakkster/lite-ease
 * Zero external deps. Pure math. Canvas2D only.
 */

import {CinematicCamera} from '@zakkster/lite-camera';
import {lerp, clamp} from '@zakkster/lite-lerp';
import {FollowMode, FOLLOW_STRATEGIES} from './FollowMode.js';
import {updateMultiTarget, createMultiTargetState} from './MultiTarget.js';
import {
    createShakeState,
    addShake,
    addTraumaSimple,
    updateShake,
    computeShake,
    clearShakes as clearShakeState
} from './ShakeEngine.js';
import {
    createBoundsState,
    setBoundsAll,
    setBoundsEdges,
    setBoundsRect,
    clearBoundsRect,
    applyBounds,
    BoundsType
} from './BoundsSystem.js';

// CP-21/CP-22/CP-23 (v2.0.0 detach): ShakePresets, CameraSequence,
// ParallaxManager and DebugHUD (and thus @zakkster/lite-timeline) are severed --
// a bundler cannot drop a reachable class method, so a class-only consumer must
// not reach them by import. They return per-instance via withParallax/
// withSequences/withDebug on their subpaths; presets drop to ./shake. See
// decisions/0004-detach.md.

// Cold-path sentinel: after destroy() every method that reads nulled internal
// state is rebound to this so a use-after-destroy fails closed with a named
// error instead of a raw null deref. Rebinding (not an in-body guard) keeps
// update()/apply() at zero per-frame cost. Matches base CinematicCamera (CP-8).
const _dead = () => {
    const e = new Error("CinematicCameraPro: use after destroy()");
    e.code = "ERR_CAMERA_DESTROYED";
    throw e;
};

// Fail-closed stubs for the three detached subsystems (D3). A subsystem method
// called before its withX() attach throws a named error whose message names the
// exact import + call that fixes it -- never a raw TypeError, never a silent
// no-op. withX() installs the real bound methods as own-properties that shadow
// these prototype stubs; destroy() rebinds those own-properties to _dead first,
// so a post-destroy call reports ERR_CAMERA_DESTROYED, not a not-attached code.
// One thrower per subsystem so each .code is a literal (the ERR-drift guard
// scans for `.code = "ERR_..."`).
const _parallaxNotAttached = () => {
    const e = new Error("CinematicCameraPro: parallax not attached. import { withParallax } " +
        "from '@zakkster/lite-camera-pro/parallax'; withParallax(camera);");
    e.code = "ERR_PARALLAX_NOT_ATTACHED";
    throw e;
};
const _sequenceNotAttached = () => {
    const e = new Error("CinematicCameraPro: sequence not attached. import { withSequences } " +
        "from '@zakkster/lite-camera-pro/sequence'; withSequences(camera);");
    e.code = "ERR_SEQUENCE_NOT_ATTACHED";
    throw e;
};
const _debugNotAttached = () => {
    const e = new Error("CinematicCameraPro: debug not attached. import { withDebug } " +
        "from '@zakkster/lite-camera-pro/debug'; withDebug(camera);");
    e.code = "ERR_DEBUG_NOT_ATTACHED";
    throw e;
};

export class CinematicCameraPro extends CinematicCamera {

    /**
     * @param {number} viewW   Viewport width  (pixels)
     * @param {number} viewH   Viewport height (pixels)
     * @param {number} worldW  World width  (pixels)
     * @param {number} worldH  World height (pixels)
     * @param {number} [seed=42] RNG seed for shake
     */
    constructor(viewW, viewH, worldW, worldH, seed = 42) {
        super(viewW, viewH, worldW, worldH, seed);

        // ── Zoom state ──
        this.zoom = 1.0;
        this.minZoom = 0.25;
        this.maxZoom = 4.0;

        // ── Zoom animation ──
        this._zoomFrom = 1.0;
        this._zoomTo = 1.0;
        this._zoomDur = 0;   // seconds
        this._zoomElapsed = 0;
        this._zoomEase = null;

        // ── Zoom anchor (for zoomAt) ──
        // Static anchor coords (for zoomAt with raw coordinates)
        this._zoomAnchorX = 0;
        this._zoomAnchorY = 0;
        // Dynamic anchor target (for zoomAt with a moving object)
        this._zoomTarget = null;
        this._hasAnchor = false;

        // ── Cached visible dimensions (zero-alloc frustum culling) ──
        this.visibleW = viewW;
        this.visibleH = viewH;

        // ── Follow mode ──
        this.mode = FollowMode.SMOOTH;

        // ── Predictive mode config ──
        this.predictTime = 0.3; // seconds of velocity extrapolation

        // ── Hybrid mode config ──
        this.hybridVerticalSnap = true; // true = instant, false = fast lerp

        // -- dt policy tunable (see decisions/0002-dt-policy.md) --
        // update() clamps a finite dt above this ceiling before integrating, so
        // a frame-time spike cannot diverge the position lerp (CP-4). Plain knob,
        // not a per-frame-validated input -- writing garbage here is out of
        // contract (D-f). A dt exactly == maxDt passes unclamped (H-D).
        this.maxDt = 0.1; // seconds

        // ── Multi-target framing ──
        this._mt = createMultiTargetState();

        // ── Advanced shake engine (replaces base RNG shake) ──
        this._shake = createShakeState(seed);

        // ── Active sequence (null when no sequence is playing) ──
        this._seq = null;

        // ── Blend-back-to-follow remaining time, SECONDS (0 = inactive) ──
        // Armed when a sequence COMPLETES (from seq._state.blend, the seconds
        // blendOutTime); update() step 6 glides pos to the follow target over
        // this window, then lands exactly. stop()/destroy() and a new/stopped
        // cinematic zero it -- only a natural completion blends. See
        // decisions/0003-blend-out.md.
        this._blendRemain = 0;

        // -- Parallax layer manager (null until withParallax attaches, CP-22) --
        // A class-only consumer no longer pays for a ParallaxState build it never
        // uses. update() step 7 tolerates null (see the guard there). The per-
        // frame tick fn is carried here, not statically imported, so
        // ParallaxManager.js stays out of the "." import graph (G1); withParallax
        // sets it. Declared here so every camera shares one hidden class.
        this._parallax = null;
        this._parallaxTick = null;

        // ── Smart bounds system ──
        this._bounds = createBoundsState();

        // -- Debug HUD configuration (null until withDebug attaches, CP-22) --
        this.debugConfig = null;
    }

    // ─────────────────────────────────────────────────────
    //  FOLLOW MODE API
    // ─────────────────────────────────────────────────────

    /**
     * Set the follow mode. Switch mid-gameplay without position jumps
     * (except CUT, which jumps by design).
     *
     * @param {number} mode  FollowMode enum value
     * @returns {CinematicCameraPro} this
     *
     * @example
     * import { FollowMode } from '@zakkster/lite-camera-pro';
     * camera.setMode(FollowMode.PREDICTIVE);
     */
    setMode(mode) {
        // Fail-closed door (CP-12): an out-of-range mode makes the update()
        // strategy lookup undefined and crashes at frame N+1 with a raw
        // TypeError. Reject at the setter with a named error instead.
        if (!Number.isInteger(mode) || mode < 0 || mode >= FOLLOW_STRATEGIES.length) {
            const e = new Error("CinematicCameraPro: setMode(mode) requires an integer FollowMode in [0, " + (FOLLOW_STRATEGIES.length - 1) + "]");
            e.code = "ERR_CAMERA_MODE";
            throw e;
        }
        this.mode = mode;
        return this;
    }

    // ─────────────────────────────────────────────────────
    //  MULTI-TARGET FRAMING API
    // ─────────────────────────────────────────────────────

    /**
     * Track multiple targets. Camera auto-zooms and centers to keep
     * all targets visible within the viewport.
     *
     * While active, the normal follow mode and manual zoom animations
     * are paused — the multi-target system controls position and zoom.
     *
     * @param {{x:number,y:number}[]} targets  Array of objects with .x/.y
     * @param {Object} [options]
     * @param {number} [options.paddingX=80]     Horizontal padding (world px)
     * @param {number} [options.paddingY=80]     Vertical padding (world px)
     * @param {number} [options.minZoom=0.3]     Minimum zoom for framing
     * @param {number} [options.maxZoom=2.0]     Maximum zoom for framing
     * @param {number} [options.zoomSpeed=4.0]   Zoom smoothing (higher = snappier)
     * @param {number} [options.followSpeed=5.0] Position smoothing
     * @returns {CinematicCameraPro} this
     *
     * @example
     * camera.trackMultiple([player1, player2], { paddingX: 100 });
     * // Later, when boss dies:
     * camera.trackSingle();
     */
    trackMultiple(targets, options) {
        // Fail-closed door (CP-19). Validate the array and every entry at CALL
        // time -- a garbage target would otherwise crash updateMultiTarget at
        // frame N+1 reading .x on undefined. Live mutation of the array/entries
        // after this call is out of contract (no per-frame validation, H-C).
        // An empty array is legal (count 0; update skips).
        if (!Array.isArray(targets)) {
            const e = new Error("CinematicCameraPro: trackMultiple(targets) requires an array");
            e.code = "ERR_CAMERA_TARGETS";
            throw e;
        }
        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            if (t === null || typeof t !== 'object' || !Number.isFinite(t.x) || !Number.isFinite(t.y)) {
                const e = new Error("CinematicCameraPro: trackMultiple targets[" + i + "] must be an object with finite x and y");
                e.code = "ERR_CAMERA_TARGETS";
                throw e;
            }
        }

        const mt = this._mt;
        mt.active = true;
        mt.targets = targets;
        mt.count = targets.length;

        if (options) {
            if (options.paddingX !== undefined) mt.paddingX = options.paddingX;
            if (options.paddingY !== undefined) mt.paddingY = options.paddingY;
            if (options.padding !== undefined) {
                mt.paddingX = mt.paddingY = options.padding;
            }
            if (options.minZoom !== undefined) mt.minZoom = options.minZoom;
            if (options.maxZoom !== undefined) mt.maxZoom = options.maxZoom;
            if (options.zoomSpeed !== undefined) mt.zoomSpeed = options.zoomSpeed;
            if (options.followSpeed !== undefined) mt.followSpeed = options.followSpeed;
        }

        return this;
    }

    /**
     * Stop multi-target tracking. Returns to normal follow mode.
     * The camera smoothly transitions back because the lerp is
     * still running — no jarring cut.
     *
     * @returns {CinematicCameraPro} this
     */
    trackSingle() {
        this._mt.active = false;
        this._mt.targets = null;
        this._mt.count = 0;
        return this;
    }

    /**
     * Update the number of active targets without re-calling trackMultiple.
     * Useful when targets are added/removed from a fixed-size array.
     *
     * @param {number} count  Number of active targets in the array
     * @returns {CinematicCameraPro} this
     */
    setTargetCount(count) {
        // Fail-closed door (CP-19). count must be an integer in [0, targets
        // length]; an over-count would make updateMultiTarget read past the
        // array end and crash at frame N+1. n=0 with null targets is legal.
        const mt = this._mt;
        const max = mt.targets ? mt.targets.length : 0;
        if (!Number.isInteger(count) || count < 0 || count > max) {
            const e = new Error("CinematicCameraPro: setTargetCount(count) must be an integer in [0, " + max + "]");
            e.code = "ERR_CAMERA_TARGETS";
            throw e;
        }
        mt.count = count;
        return this;
    }

    // ─────────────────────────────────────────────────────
    //  SHAKE API (Pro — noise-based, layered)
    // ─────────────────────────────────────────────────────

    /**
     * Add simple trauma. Backward-compatible with lite-camera.
     * Stacks onto the first active omnidirectional shake slot,
     * or creates a new one with default profile values.
     *
     * @param {number} amount  Trauma to add [0, 1]
     * @returns {CinematicCameraPro} this
     *
     * @example
     * camera.addTrauma(0.4);
     */
    addTrauma(amount) {
        addTraumaSimple(this._shake, amount);
        return this;
    }

    /**
     * Fire a shake impulse with a full profile. Multiple shakes
     * can run simultaneously — they layer (sum) together.
     *
     * @param {Object} profile  Shake profile
     * @param {number} profile.trauma      Initial trauma [0, 1]
     * @param {number} [profile.freq=15]   Noise frequency
     * @param {number} [profile.decay=1]   Trauma units lost per second
     * @param {number} [profile.maxOffset=15] Maximum pixel offset
     * @param {number} [profile.maxAngle=0.05] Maximum rotation (radians)
     * @param {number} [profile.dirX=0]    Directional X (0 = omni)
     * @param {number} [profile.dirY=0]    Directional Y (0 = omni)
     * @param {number} [intensity=1]       Scale multiplier
     * @returns {CinematicCameraPro} this
     *
     * @example
     * camera.shake({ trauma: 0.6, freq: 18, maxOffset: 20 });
     */
    shake(profile, intensity = 1) {
        addShake(this._shake, profile, intensity);
        return this;
    }

    /**
     * Stop all active shakes immediately.
     * @returns {CinematicCameraPro} this
     */
    clearShakes() {
        clearShakeState(this._shake);
        return this;
    }

    // ─────────────────────────────────────────────────────
    //  SEQUENCE API (Pro — cinematic timeline control)
    // ─────────────────────────────────────────────────────

    /**
     * Create a new camera sequence bound to this camera.
     *
     * @param {Object} [options]
     * @param {boolean} [options.loop=false]
     * @param {Function} [options.onComplete]
     * @param {number} [options.blendOutTime=0.3]  SECONDS to blend position back
     *   to follow on completion (0 = hard handoff). Step durations are in
     *   MILLISECONDS -- different units. Zoom is not blended.
     * @returns {CameraSequence} A fluent sequence builder
     * @throws {Error} "ERR_SEQUENCE_NOT_ATTACHED" until withSequences() installs
     *   the real method (v2.0.0 detach); then "ERR_SEQUENCE_OPTIONS" on bad opts.
     *
     * @example
     * import { withSequences } from '@zakkster/lite-camera-pro/sequence';
     * withSequences(camera);                  // once, after construction
     * const seq = camera.createSequence().moveTo(boss.x, boss.y, 1200);
     * camera.playSequence(seq);
     */
    createSequence() { _sequenceNotAttached(); }

    /**
     * Play a camera sequence. While playing, the sequence takes
     * full control of camera position and zoom. Normal follow
     * mode is paused.
     *
     * The camera takes ownership of the sequence. If another sequence is
     * currently attached, it is destroyed (its timeline releases the shared
     * ticker reference) before the new one starts. Do NOT pass a sequence
     * to playSequence again after it has been replaced — call stopSequence()
     * first if you want to re-use it later.

     * @param {CameraSequence} seq
     * @returns {CinematicCameraPro} this
     *
     * @example
     * camera.playSequence(seq);
     */
    playSequence(seq) {
        // Ownership transfer: the previous sequence is destroyed so its
        // timeline releases the shared ticker. See JSDoc above.
        if (this._seq && this._seq !== seq) {
            this._seq.destroy();
        }

        this._seq = seq;
        // A new cinematic cancels any pending blend-out from a prior completion.
        this._blendRemain = 0;
        seq.play();
        return this;
    }

    /**
     * Stop the current sequence and return to follow mode. This is a HARD
     * handoff -- it destroys the sequence timeline (releasing the shared ticker,
     * CP-5) and cancels any pending blend-out; the follow lerp continues from
     * the current pos with no glide. A blend only happens when a sequence
     * COMPLETES naturally (see createSequence blendOutTime).
     *
     * @returns {CinematicCameraPro} this
     */
    stopSequence() {
        if (this._seq) {
            this._seq.stop();
            this._seq = null;
        }
        // An explicit stop is a hard handoff -- cancel any pending blend-out.
        this._blendRemain = 0;
        return this;
    }

    /**
     * Whether a sequence is currently playing.
     * @returns {boolean}
     */
    get sequencePlaying() {
        return this._seq !== null && this._seq.playing;
    }

    // ─────────────────────────────────────────────────────
    //  PARALLAX API
    // ─────────────────────────────────────────────────────

    /**
     * Add a parallax layer. Speed 1.0 = normal, 0.5 = background, 1.5 = foreground.
     *
     * @param {string} id        Unique layer name
     * @param {number} speedX    Horizontal scroll multiplier
     * @param {number} [speedY]  Vertical (defaults to speedX)
     * @param {Object} [opts]    { offsetX, offsetY, wrap }
     * @returns {CinematicCameraPro} this
     * @throws {Error} "ERR_PARALLAX_NOT_ATTACHED" until withParallax() installs
     *   the real method (v2.0.0 detach).
     *
     * @example
     * import { withParallax } from '@zakkster/lite-camera-pro/parallax';
     * withParallax(camera);                   // once, after construction
     * camera.addParallaxLayer('sky', 0.1);
     */
    addParallaxLayer() { _parallaxNotAttached(); }

    /**
     * Remove a parallax layer.
     * @param {string} id  Layer name
     * @returns {CinematicCameraPro} this
     * @throws {Error} "ERR_PARALLAX_NOT_ATTACHED" until withParallax() attaches.
     */
    removeParallaxLayer() { _parallaxNotAttached(); }

    /**
     * Apply a parallax layer's transform to a canvas context.
     * Use between ctx.save()/ctx.restore() when drawing that layer.
     *
     * @param {string} id   Layer name
     * @param {CanvasRenderingContext2D} ctx
     * @returns {boolean} true if layer was found
     * @throws {Error} "ERR_PARALLAX_NOT_ATTACHED" until withParallax() attaches.
     *
     * @example
     * ctx.save();
     * camera.applyParallax('clouds', ctx);   // after withParallax(camera)
     * drawClouds(ctx);
     * ctx.restore();
     */
    applyParallax() { _parallaxNotAttached(); }

    // ─────────────────────────────────────────────────────
    //  BOUNDS API
    // ─────────────────────────────────────────────────────

    /**
     * Set boundary behavior for all edges.
     *
     * @param {number} type  BoundsType enum (HARD, SOFT, ELASTIC, NONE)
     * @returns {CinematicCameraPro} this
     *
     * @example
     * import { BoundsType } from '@zakkster/lite-camera-pro';
     * camera.setBoundsType(BoundsType.SOFT);
     */
    setBoundsType(type) {
        setBoundsAll(this._bounds, type);
        return this;
    }

    /**
     * Set boundary behavior per-edge.
     *
     * @param {Object} config  { left, right, top, bottom } — BoundsType values
     * @returns {CinematicCameraPro} this
     *
     * @example
     * camera.setBoundsEdges({
     *   left: BoundsType.HARD,
     *   right: BoundsType.SOFT,
     *   top: BoundsType.ELASTIC,
     *   bottom: BoundsType.HARD,
     * });
     */
    setBoundsEdges(config) {
        setBoundsEdges(this._bounds, config);
        return this;
    }

    /**
     * Set a custom bounds rectangle (for room transitions, arenas, etc).
     *
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @returns {CinematicCameraPro} this
     */
    setBoundsRect(x, y, w, h) {
        setBoundsRect(this._bounds, x, y, w, h);
        return this;
    }

    /**
     * Clear custom bounds, reverting to full world.
     * @returns {CinematicCameraPro} this
     */
    clearBoundsRect() {
        clearBoundsRect(this._bounds);
        return this;
    }

    // ─────────────────────────────────────────────────────
    //  ZOOM API
    // ─────────────────────────────────────────────────────

    /**
     * Smoothly transition to a zoom level.
     *
     * @param {number}   level     Target zoom (clamped to minZoom..maxZoom)
     * @param {number}   [duration=0]  Transition time in seconds (0 = instant)
     * @param {Function} [ease]    Easing function from lite-ease (t => t)
     * @returns {CinematicCameraPro} this
     *
     * @example
     * camera.setZoom(2.0, 0.5, easeOutExpo);
     */
    setZoom(level, duration = 0, ease = null) {
        // Fail-closed door (CP-12). Finiteness precedes the clamp: clamp(NaN)
        // returns NaN, so a NaN level would sail past the clamp and poison the
        // zoom (F5). A non-finite or negative duration is defective input --
        // duration 0 stays instant.
        if (!Number.isFinite(level)) {
            const e = new Error("CinematicCameraPro: setZoom(level) requires a finite number");
            e.code = "ERR_CAMERA_ZOOM";
            throw e;
        }
        if (!Number.isFinite(duration) || duration < 0) {
            const e = new Error("CinematicCameraPro: setZoom duration must be a finite number >= 0");
            e.code = "ERR_CAMERA_ZOOM";
            throw e;
        }
        level = clamp(level, this.minZoom, this.maxZoom);

        if (duration <= 0) {
            this.zoom = level;
            this._zoomDur = 0;
            this._hasAnchor = false;
            this._updateBoundsForZoom();
            return this;
        }

        this._zoomFrom = this.zoom;
        this._zoomTo = level;
        this._zoomDur = duration;
        this._zoomElapsed = 0;
        this._zoomEase = ease;
        this._hasAnchor = false;
        return this;
    }

    /**
     * Zoom toward a world point or a moving target. When a target object
     * is provided, the anchor updates every frame so the zoom tracks it.
     *
     * * Animated form (duration > 0): the follow strategy is paused for the
     * duration of the transition and the camera centers on the anchor.
     * Instant form (duration = 0): the anchor is held at its current screen
     * position before/after the zoom (mouse-wheel-style zoom).
     *
     * @param {number|{x:number,y:number}} targetOrX  World X, or object with .x/.y
     * @param {number}   yOrLevel    World Y (if coordinates) or target zoom (if object)
     * @param {number}   [levelOrDur]  Target zoom (if coordinates) or duration (if object)
     * @param {number}   [duration=0]  Transition time in seconds
     * @param {Function} [ease]    Easing function
     * @returns {CinematicCameraPro} this
     *
     * @example
     * // Static point
     * camera.zoomAt(400, 300, 1.8, 0.8, easeOutExpo);
     * // Moving target — anchor follows the object each frame
     * camera.zoomAt(boss, 1.8, 0.8, easeOutExpo);
     */
    zoomAt(targetOrX, yOrLevel, levelOrDur, duration = 0, ease = null) {
        // Fail-closed door (CP-12/CP-19). Resolve BOTH call forms into locals,
        // validate them, and ONLY THEN write any this._ state -- a rejected call
        // must mutate nothing. .x/.y are read and validated at CALL time only
        // (live anchor mutation afterwards is out of contract). Finiteness
        // precedes the clamp (F5). A non-function ease normalizes to null in
        // both forms -- the static form gains it, closing a frame-N+1
        // "this._zoomEase is not a function" crash.
        let target, anchorX, anchorY, level, dur, easeFn;

        if (typeof targetOrX === 'object' && targetOrX !== null) {
            // zoomAt(target, level, duration, ease)
            target = targetOrX;
            anchorX = targetOrX.x;
            anchorY = targetOrX.y;
            level = yOrLevel;
            dur = levelOrDur !== undefined ? levelOrDur : 0;
            easeFn = duration; // shifted arg position — duration slot holds ease
        } else {
            // zoomAt(x, y, level, duration, ease)
            target = null;
            anchorX = targetOrX;
            anchorY = yOrLevel;
            level = levelOrDur;
            dur = duration;
            easeFn = ease;
        }
        if (typeof easeFn !== 'function') easeFn = null;

        if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY) ||
            !Number.isFinite(level) || !Number.isFinite(dur) || dur < 0) {
            const e = new Error("CinematicCameraPro: zoomAt requires finite anchor x/y, a finite level, and a finite duration >= 0");
            e.code = "ERR_CAMERA_ZOOM";
            throw e;
        }

        this._zoomTarget = target;
        this._zoomAnchorX = anchorX;
        this._zoomAnchorY = anchorY;
        this._hasAnchor = true;
        level = clamp(level, this.minZoom, this.maxZoom);

        if (dur <= 0) {
            const prevZoom = this.zoom;
            this.zoom = level;
            this._zoomDur = 0;
            this._adjustForAnchor(prevZoom, this.zoom);
            this._hasAnchor = false;
            this._zoomTarget = null;
            this._updateBoundsForZoom();
            return this;
        }

        this._zoomFrom = this.zoom;
        this._zoomTo = level;
        this._zoomDur = dur;
        this._zoomElapsed = 0;
        this._zoomEase = easeFn;
        return this;
    }

    // ─────────────────────────────────────────────────────
    //  COORDINATE CONVERSION (zero-alloc: caller provides out)
    // ─────────────────────────────────────────────────────

    /**
     * Convert screen pixel to world coordinate. Zero-alloc.
     *
     * @param {number} sx  Screen X
     * @param {number} sy  Screen Y
     * @param {{x:number,y:number}} out  Pre-allocated output target (mutated)
     * @returns {{x:number,y:number}} The mutated out target
     *
     * @example
     * const pt = { x: 0, y: 0 }; // allocate once
     * camera.screenToWorld(mouseX, mouseY, pt);
     */
    screenToWorld(sx, sy, out) {
        out.x = this.pos[0] + sx / this.zoom;
        out.y = this.pos[1] + sy / this.zoom;
        return out;
    }

    /**
     * Convert world coordinate to screen pixel. Zero-alloc.
     *
     * @param {number} wx  World X
     * @param {number} wy  World Y
     * @param {{x:number,y:number}} out  Pre-allocated output target (mutated)
     * @returns {{x:number,y:number}} The mutated out target
     */
    worldToScreen(wx, wy, out) {
        out.x = (wx - this.pos[0]) * this.zoom;
        out.y = (wy - this.pos[1]) * this.zoom;
        return out;
    }

    // ─────────────────────────────────────────────────────
    //  INTERNAL: Zoom helpers
    // ─────────────────────────────────────────────────────

    /** Recalculate world-edge clamp bounds and cached visible dimensions for current zoom. */
    _updateBoundsForZoom() {
        this.visibleW = this.viewW / this.zoom;
        this.visibleH = this.viewH / this.zoom;
        this._maxX = this.worldW - this.visibleW;
        this._maxY = this.worldH - this.visibleH;
        if (this._maxX < 0) this._maxX = 0;
        if (this._maxY < 0) this._maxY = 0;
    }

    /**
     * Adjust camera position so the anchor point stays at the same
     * screen location after a zoom change.
     *
     * Math: screenPos = (worldPos - camPos) * zoom
     * We want screenPos_old === screenPos_new
     *   (wx - oldCam) * oldZ = (wx - newCam) * newZ
     *   newCam = wx - (wx - oldCam) * oldZ / newZ
     */
    _adjustForAnchor(oldZoom, newZoom) {
        if (!this._hasAnchor || newZoom === 0) return;

        const wx = this._zoomAnchorX;
        const wy = this._zoomAnchorY;
        const ratio = oldZoom / newZoom;

        const newX = wx - (wx - this.pos[0]) * ratio;
        const newY = wy - (wy - this.pos[1]) * ratio;

        this.pos[0] = newX;
        this.pos[1] = newY;
        this.target[0] = newX;
        this.target[1] = newY;
    }

    // ─────────────────────────────────────────────────────
    //  UPDATE  (overrides base — adds zoom + corrected centering)
    // ─────────────────────────────────────────────────────

    /**
     * Advance the camera by one frame.
     *
     * dt policy (fail closed -- see decisions/0002-dt-policy.md):
     *   - Non-finite (NaN/+-Infinity/null) or negative dt is REJECTED: the call
     *     is a documented no-op, nothing is mutated, and it returns. A poisoned
     *     frame is invisible (CP-3/CP-4).
     *   - dt === 0 and -0 are legal no-advance frames (zero deltas everywhere).
     *   - A finite dt above this.maxDt (default 0.1) is clamped to this.maxDt so
     *     a frame-time spike cannot diverge the position lerp; a dt exactly ==
     *     maxDt passes untouched.
     *
     * @param {number} dt   Delta time in seconds
     * @param {number} px   Player world X
     * @param {number} py   Player world Y
     * @param {number} [pvx=0] Player velocity X (for lookahead)
     * @param {number} [pvy=0] Player velocity Y (for lookahead)
     */
    update(dt, px, py, pvx = 0, pvy = 0) {
        // Fail-closed dt door (CP-3/CP-4, D-k). Two comparisons at the very top;
        // the whole body below is byte-identical to 1.1.0 (H-C: zero new
        // branches on the hot path). A rejected frame mutates nothing.
        if (!Number.isFinite(dt) || dt < 0) return;
        if (dt > this.maxDt) dt = this.maxDt;

        const mt = this._mt;
        const seq = this._seq;

        if (seq && seq._state.active) {
            // ── SEQUENCE PATH ──
            // Sequence controls position and zoom via timeline.
            // Timeline advances itself via its own ticker (RAF).
            // We just read the animated state and apply it.
            const st = seq._state;

            this.zoom = clamp(st.zoom, this.minZoom, this.maxZoom);
            this._updateBoundsForZoom();

            // Sequence stores world CENTER — convert to top-left for camera
            this.target[0] = st.x - this.visibleW * 0.5;
            this.target[1] = st.y - this.visibleH * 0.5;

            // Zero out lookahead so returning to follow doesn't jerk
            this.look[0] = 0;
            this.look[1] = 0;

        } else if (mt.active && mt.targets && mt.count > 0) {
            // ── MULTI-TARGET PATH ──
            updateMultiTarget(this, dt, mt.targets, mt.count);

            // Clean up finished sequence ref; adopt its blend-out budget (D-b)
            // so step 6 glides back to follow. seq._state.blend is armed by a
            // natural completion and zeroed by stop()/destroy() -- a hard
            // handoff writes 0, no glide.
            if (seq && !seq.playing) { this._blendRemain = seq._state.blend; this._seq = null; }

        } else {
            // ── SINGLE-TARGET PATH ──

            // Clean up finished sequence ref; adopt its blend-out budget (D-b)
            // so step 6 glides back to follow. seq._state.blend is armed by a
            // natural completion and zeroed by stop()/destroy() -- a hard
            // handoff writes 0, no glide.
            if (seq && !seq.playing) { this._blendRemain = seq._state.blend; this._seq = null; }

            // ── 1. Advance zoom animation ──
            const prevZoom = this.zoom;

            if (this._zoomDur > 0) {
                this._zoomElapsed += dt;

                let t = clamp(this._zoomElapsed / this._zoomDur, 0, 1);
                if (this._zoomEase) t = this._zoomEase(t);

                this.zoom = lerp(this._zoomFrom, this._zoomTo, t);

                if (this._zoomElapsed >= this._zoomDur) {
                    this.zoom = this._zoomTo;
                    this._zoomDur = 0;
                }
            }

            // ── 2. Recalculate bounds for current zoom ──
            this._updateBoundsForZoom();

            // ── 3–4. Anchored zoom OR follow strategy (mutually exclusive) ──
            if (this._hasAnchor) {
                // Track moving anchor each frame
                if (this._zoomTarget) {
                    this._zoomAnchorX = this._zoomTarget.x;
                    this._zoomAnchorY = this._zoomTarget.y;
                }
                // Center on the anchor — strategy is paused during the transition.
                // pos lerps toward this in step 6, giving a smooth pan-and-zoom.
                this.target[0] = this._zoomAnchorX - this.visibleW * 0.5;
                this.target[1] = this._zoomAnchorY - this.visibleH * 0.5;

                if (this._zoomDur <= 0) {
                    this._hasAnchor = false;
                    this._zoomTarget = null;
                }
            } else {
                const strategy = FOLLOW_STRATEGIES[this.mode];
                strategy(this, dt, px, py, pvx, pvy);
            }
        }

        // ── 5. Apply boundary enforcement (all paths) ──
        applyBounds(
            this._bounds, this.target, this.pos,
            this._maxX, this._maxY,
            this.visibleW, this.visibleH, dt
        );

        // ── 6. Position update ──
        // Sequences and multi-target each manage their own smoothing:
        //   - Sequence: timeline is authoritative — pos must land exactly on
        //     scripted beats (e.g. bossReveal must frame the boss precisely).
        //   - Multi-target: updateMultiTarget already lerps target by mt.followSpeed;
        //     a second lerp here would compound damping unpredictably.
        if ((seq && seq._state.active) || (mt.active && mt.targets && mt.count > 0)) {
            this.pos[0] = this.target[0];
            this.pos[1] = this.target[1];
        } else if (this._blendRemain > 0) {
            // Blend-back-to-follow after a sequence completed (D-a). Linear
            // deadline convergence to a MOVING target that lands exactly at the
            // window end; with a static target the per-frame step is constant
            // (a smooth glide). Only pos is blended -- zoom is not (no
            // follow-side zoom target exists; the sequence's final zoom
            // persists). dt=0 -> k=0, no decrement -> the blend freezes with
            // the camera (PRO2 dt policy). See decisions/0003-blend-out.md.
            const r = this._blendRemain - dt;
            if (r <= 0) {
                this._blendRemain = 0;
                this.pos[0] = this.target[0];
                this.pos[1] = this.target[1];
            } else {
                const k = dt / this._blendRemain; // k < 1 (dt < old remaining)
                this._blendRemain = r;
                this.pos[0] += (this.target[0] - this.pos[0]) * k;
                this.pos[1] += (this.target[1] - this.pos[1]) * k;
            }
        } else {
            this.pos[0] += (this.target[0] - this.pos[0]) * this.lerpSpeed * dt;
            this.pos[1] += (this.target[1] - this.pos[1]) * this.lerpSpeed * dt;
        }
        // ── 7. Parallax layer update (all paths) ──
        // _parallax is null until withParallax() attaches (CP-22); the null
        // compare guards it (D2: measured delta 2.070 ns/op, shipped over a
        // state-forking sentinel -- decisions/0004). The tick fn is on the instance,
        // not imported, so ParallaxManager stays out of the "." graph (G1).
        if (this._parallax !== null && this._parallax.activeCount > 0) {
            this._parallaxTick(this._parallax, this.pos[0], this.pos[1], this.zoom);
        }

        // ── 8. Shake update (all paths) ──
        updateShake(this._shake, dt);
    }

    // ─────────────────────────────────────────────────────
    //  APPLY  (overrides base — adds zoom transform)
    // ─────────────────────────────────────────────────────

    /**
     * Apply camera transform to a canvas 2D context.
     * IMPORTANT: Caller must ctx.save() before and ctx.restore() after.
     *
     * Transform order:
     *   1. Screen-space shake offset
     *   2. Move origin to screen center
     *   3. Shake rotation
     *   4. Scale by zoom
     *   5. Move origin back (adjusted for zoom)
     *   6. Translate by camera position
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    apply(ctx) {
        let offsetX = 0, offsetY = 0, angle = 0;

        if (this._shake.active) {
            computeShake(this._shake);
            offsetX = this._shake.offsetX;
            offsetY = this._shake.offsetY;
            angle = this._shake.angle;
        }

        // 1. Shake offset (screen-space, unaffected by zoom)
        ctx.translate(offsetX, offsetY);

        // 2–5. Zoom + rotation from screen center
        ctx.translate(this._halfW, this._halfH);
        ctx.rotate(angle);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this._halfW / this.zoom, -this._halfH / this.zoom);

        // 6. Scroll to camera world position.
        // int snap is deliberate: kills texture shimmer. floor (not | 0) so the
        // snap is uniform about the origin -- | 0 truncates toward zero (CP-13).
        ctx.translate(-Math.floor(this.pos[0]), -Math.floor(this.pos[1]));
    }

    // ─────────────────────────────────────────────────────
    //  DEBUG  (overrides base — adds zoom readout)
    // ─────────────────────────────────────────────────────

    /**
     * Draw world-space debug overlay (deadzone, lookahead, world bounds).
     * Call AFTER apply() so it renders in camera-transformed space.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @throws {Error} "ERR_DEBUG_NOT_ATTACHED" until withDebug() attaches from
     *   '@zakkster/lite-camera-pro/debug' (v2.0.0 detach).
     */
    debug() { _debugNotAttached(); }

    /**
     * Draw screen-space HUD (all camera state).
     * Call OUTSIDE of save/apply/restore, directly on raw canvas.
     *
     * Toggle panels: camera.debugConfig.show.shake = false;
     *
     * @param {CanvasRenderingContext2D} ctx
     * @throws {Error} "ERR_DEBUG_NOT_ATTACHED" until withDebug() attaches from
     *   '@zakkster/lite-camera-pro/debug' (v2.0.0 detach).
     */
    debugHUD() { _debugNotAttached(); }

    // ─────────────────────────────────────────────────────
    //  SAVE / LOAD
    // ─────────────────────────────────────────────────────

    /**
     * Get a serializable snapshot of camera state for save/load.
     * @returns {Object}
     */
    getState() {
        return {
            posX: this.pos[0],
            posY: this.pos[1],
            targetX: this.target[0],
            targetY: this.target[1],
            zoom: this.zoom,
            mode: this.mode,
        };
    }

    /**
     * Restore camera state from a snapshot.
     *
     * Fail-closed contract (CP-12/CP-19 -- see decisions/0002-dt-policy.md
     * siblings): the snapshot is validated in full BEFORE any field is written,
     * so a rejected snapshot mutates nothing.
     *   - snapshot must be a non-null object.
     *   - posX/posY are both-or-neither; targetX/targetY are both-or-neither.
     *   - every present numeric must be finite (the error names the field).
     *   - zoom is finite-checked then clamped to minZoom..maxZoom exactly as
     *     setZoom does -- zoom 0 clamps to minZoom (0.25), not an error.
     *   - mode, if present, must be an integer FollowMode in range.
     * The snapshot is pose-only (pos/target/zoom/mode); shake, sequences, and
     * zoom animations are deliberately not serialized. Any violation throws
     * ERR_CAMERA_STATE.
     *
     * @param {Object} snapshot
     * @returns {CinematicCameraPro} this
     */
    setState(snapshot) {
        if (typeof snapshot !== 'object' || snapshot === null) {
            const e = new Error("CinematicCameraPro: setState requires a snapshot object");
            e.code = "ERR_CAMERA_STATE";
            throw e;
        }

        const hasPosX = snapshot.posX !== undefined;
        const hasPosY = snapshot.posY !== undefined;
        const hasTargetX = snapshot.targetX !== undefined;
        const hasTargetY = snapshot.targetY !== undefined;
        const hasZoom = snapshot.zoom !== undefined;
        const hasMode = snapshot.mode !== undefined;

        // Pairing rule: a lone posX would write pos[1] = undefined -> NaN (F9).
        if (hasPosX !== hasPosY) {
            const e = new Error("CinematicCameraPro: setState posX and posY must be provided together");
            e.code = "ERR_CAMERA_STATE";
            throw e;
        }
        if (hasTargetX !== hasTargetY) {
            const e = new Error("CinematicCameraPro: setState targetX and targetY must be provided together");
            e.code = "ERR_CAMERA_STATE";
            throw e;
        }

        // Finiteness of every present numeric (validate ALL before mutating ANY).
        if (hasPosX && (!Number.isFinite(snapshot.posX) || !Number.isFinite(snapshot.posY))) {
            const e = new Error("CinematicCameraPro: setState posX/posY must be finite numbers");
            e.code = "ERR_CAMERA_STATE";
            throw e;
        }
        if (hasTargetX && (!Number.isFinite(snapshot.targetX) || !Number.isFinite(snapshot.targetY))) {
            const e = new Error("CinematicCameraPro: setState targetX/targetY must be finite numbers");
            e.code = "ERR_CAMERA_STATE";
            throw e;
        }
        if (hasZoom && !Number.isFinite(snapshot.zoom)) {
            const e = new Error("CinematicCameraPro: setState zoom must be a finite number");
            e.code = "ERR_CAMERA_STATE";
            throw e;
        }
        if (hasMode && (!Number.isInteger(snapshot.mode) || snapshot.mode < 0 || snapshot.mode >= FOLLOW_STRATEGIES.length)) {
            const e = new Error("CinematicCameraPro: setState mode must be an integer FollowMode in [0, " + (FOLLOW_STRATEGIES.length - 1) + "]");
            e.code = "ERR_CAMERA_STATE";
            throw e;
        }

        // All validated -> apply. zoom takes the same clamp as setZoom.
        if (hasPosX) {
            this.pos[0] = snapshot.posX;
            this.pos[1] = snapshot.posY;
        }
        if (hasTargetX) {
            this.target[0] = snapshot.targetX;
            this.target[1] = snapshot.targetY;
        }
        if (hasZoom) this.zoom = clamp(snapshot.zoom, this.minZoom, this.maxZoom);
        if (hasMode) this.mode = snapshot.mode;
        this._updateBoundsForZoom();
        return this;
    }

    /**
     * Destroy the camera. Releases sequences, clears shake state, and nulls all
     * nested allocations so the GC can reclaim them. After destroy() the camera
     * is unusable: EVERY public method throws an Error with code
     * "ERR_CAMERA_DESTROYED" (fail closed) rather than a raw null deref.
     */
    destroy() {
        if (this._seq) {
            this._seq.destroy();
            this._seq = null;
        }

        // clearShakeState needs _shake still live -- run it before the null.
        clearShakeState(this._shake);

        // Release nested Pro state so the slot pools / layer arrays can be GC'd.
        this._shake = null;
        this._mt = null;
        this._parallax = null;
        this._bounds = null;
        this.debugConfig = null;

        // Null the base typed arrays + rng and rebind the base methods
        // (update/apply/debug/addTrauma/resize/destroy) to the base sentinel.
        // Ordered after the Pro teardown so nothing above reads a nulled base
        // field. T8 asserts parity with the base's destroy contract.
        super.destroy();

        // CP-8: a destroyed camera fails closed on EVERY public method. Any call
        // throws ERR_CAMERA_DESTROYED (Pro's sentinel -- consistent message)
        // instead of a raw null deref. Rebinding the WHOLE public surface, not a
        // curated subset, means the guarantee cannot silently drift as methods
        // are added -- and re-stamps the base rebinds from super.destroy() with
        // Pro's message for parity. Getters (sequencePlaying) are already
        // null-safe. A double destroy() throws the same named error.
        this.update = this.apply = this.debug = this.debugHUD =
            this.addTrauma = this.shake = this.clearShakes =
            this.setMode = this.trackMultiple = this.trackSingle = this.setTargetCount =
            this.createSequence = this.playSequence = this.stopSequence =
            this.addParallaxLayer = this.removeParallaxLayer = this.applyParallax =
            this.setBoundsType = this.setBoundsEdges = this.setBoundsRect = this.clearBoundsRect =
            this.setZoom = this.zoomAt = this.screenToWorld = this.worldToScreen =
            this.getState = this.setState = this.resize = this.destroy = _dead;
    }
}

export default CinematicCameraPro;
