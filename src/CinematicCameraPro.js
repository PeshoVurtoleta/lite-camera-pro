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
import {getPreset} from './ShakePresets.js';
import {createCameraSequence} from './CameraSequence.js';
import {
    createParallaxState,
    addParallaxLayer,
    removeParallaxLayer,
    updateParallax,
    applyParallaxLayer
} from './ParallaxManager.js';
import {
    createBoundsState,
    setBoundsAll,
    setBoundsEdges,
    setBoundsRect,
    clearBoundsRect,
    applyBounds,
    BoundsType
} from './BoundsSystem.js';
import {createDebugHUDConfig, drawDebugHUD, drawDebugWorld} from './DebugHUD.js';

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

        // ── Multi-target framing ──
        this._mt = createMultiTargetState();

        // ── Advanced shake engine (replaces base RNG shake) ──
        this._shake = createShakeState(seed);

        // ── Active sequence (null when no sequence is playing) ──
        this._seq = null;

        // ── Parallax layer manager ──
        this._parallax = createParallaxState();

        // ── Smart bounds system ──
        this._bounds = createBoundsState();

        // ── Debug HUD configuration ──
        this.debugConfig = createDebugHUDConfig();
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
        this._mt.count = count;
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
     * Fire a named shake preset.
     *
     * Built-in presets: explosion, earthquake, recoil, impact,
     * landing, damage, rumble, heavy_impact.
     *
     * @param {string} name       Preset name (case-insensitive)
     * @param {number} [intensity=1] Scale multiplier
     * @returns {CinematicCameraPro} this
     *
     * @example
     * camera.shakePreset('explosion');
     * camera.shakePreset('recoil', 0.5); // half intensity
     */
    shakePreset(name, intensity = 1) {
        const preset = getPreset(name);
        if (preset) addShake(this._shake, preset, intensity);
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
     * @param {number} [options.blendOutTime=0.3]
     * @returns {CameraSequence} A fluent sequence builder
     *
     * @example
     * const seq = camera.createSequence()
     *   .moveTo(boss.x, boss.y, 1200)
     *   .zoomTo(1.8, 800)
     *   .shake('explosion')
     *   .wait(500)
     *   .moveTo(player.x, player.y, 1000);
     *
     * camera.playSequence(seq);
     */
    createSequence(options) {
        return createCameraSequence(this, options);
    }

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
        seq.play();
        return this;
    }

    /**
     * Stop the current sequence and return to follow mode.
     * The transition back is smooth (lerp continues from current pos).
     *
     * @returns {CinematicCameraPro} this
     */
    stopSequence() {
        if (this._seq) {
            this._seq.stop();
            this._seq = null;
        }
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
     *
     * @example
     * camera.addParallaxLayer('sky',    0.1);
     * camera.addParallaxLayer('clouds', 0.3);
     * camera.addParallaxLayer('trees',  0.7, 0.7, { wrap: WrapMode.REPEAT_X });
     */
    addParallaxLayer(id, speedX, speedY, opts) {
        addParallaxLayer(this._parallax, id, speedX, speedY, opts);
        return this;
    }

    /**
     * Remove a parallax layer.
     * @param {string} id  Layer name
     * @returns {CinematicCameraPro} this
     */
    removeParallaxLayer(id) {
        removeParallaxLayer(this._parallax, id);
        return this;
    }

    /**
     * Apply a parallax layer's transform to a canvas context.
     * Use between ctx.save()/ctx.restore() when drawing that layer.
     *
     * @param {string} id   Layer name
     * @param {CanvasRenderingContext2D} ctx
     * @returns {boolean} true if layer was found
     *
     * @example
     * ctx.save();
     * camera.applyParallax('clouds', ctx);
     * drawClouds(ctx);
     * ctx.restore();
     */
    applyParallax(id, ctx) {
        return applyParallaxLayer(this._parallax, id, ctx);
    }

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
        let level, dur, easeFn;

        if (typeof targetOrX === 'object' && targetOrX !== null) {
            // zoomAt(target, level, duration, ease)
            this._zoomTarget = targetOrX;
            this._zoomAnchorX = targetOrX.x;
            this._zoomAnchorY = targetOrX.y;
            level = yOrLevel;
            dur = levelOrDur || 0;
            easeFn = duration; // shifted arg position — duration slot holds ease
            if (typeof easeFn !== 'function') easeFn = null;
        } else {
            // zoomAt(x, y, level, duration, ease)
            this._zoomTarget = null;
            this._zoomAnchorX = targetOrX;
            this._zoomAnchorY = yOrLevel;
            level = levelOrDur;
            dur = duration;
            easeFn = ease;
        }

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
     * @param {number} dt   Delta time in seconds
     * @param {number} px   Player world X
     * @param {number} py   Player world Y
     * @param {number} [pvx=0] Player velocity X (for lookahead)
     * @param {number} [pvy=0] Player velocity Y (for lookahead)
     */
    update(dt, px, py, pvx = 0, pvy = 0) {

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

            // Clean up finished sequence ref
            if (seq && !seq.playing) this._seq = null;

        } else {
            // ── SINGLE-TARGET PATH ──

            // Clean up finished sequence ref
            if (seq && !seq.playing) this._seq = null;

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
        } else {
            this.pos[0] += (this.target[0] - this.pos[0]) * this.lerpSpeed * dt;
            this.pos[1] += (this.target[1] - this.pos[1]) * this.lerpSpeed * dt;
        }
        // ── 7. Parallax layer update (all paths) ──
        if (this._parallax.activeCount > 0) {
            updateParallax(this._parallax, this.pos[0], this.pos[1], this.zoom);
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

        // 6. Scroll to camera world position
        ctx.translate(-(this.pos[0] | 0), -(this.pos[1] | 0));
    }

    // ─────────────────────────────────────────────────────
    //  DEBUG  (overrides base — adds zoom readout)
    // ─────────────────────────────────────────────────────

    /**
     * Draw world-space debug overlay (deadzone, lookahead, world bounds).
     * Call AFTER apply() so it renders in camera-transformed space.
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    debug(ctx) {
        drawDebugWorld(this, ctx, this.debugConfig);
    }

    /**
     * Draw screen-space HUD (all camera state).
     * Call OUTSIDE of save/apply/restore, directly on raw canvas.
     *
     * Toggle panels: camera.debugConfig.show.shake = false;
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    debugHUD(ctx) {
        drawDebugHUD(this, ctx, this.debugConfig);
    }

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
     * @param {Object} snapshot
     * @returns {CinematicCameraPro} this
     */
    setState(snapshot) {
        if (snapshot.posX !== undefined) {
            this.pos[0] = snapshot.posX;
            this.pos[1] = snapshot.posY;
        }
        if (snapshot.targetX !== undefined) {
            this.target[0] = snapshot.targetX;
            this.target[1] = snapshot.targetY;
        }
        if (snapshot.zoom !== undefined) this.zoom = snapshot.zoom;
        if (snapshot.mode !== undefined) this.mode = snapshot.mode;
        this._updateBoundsForZoom();
        return this;
    }

    /**
     * Destroy the camera. Releases sequences, clears shake state, and
     * nulls all nested allocations so the GC can reclaim them. After
     * destroy(), the camera is unusable — do not call any further methods.
     */
    destroy() {
        if (this._seq) {
            this._seq.destroy();
            this._seq = null;
        }

        clearShakeState(this._shake);

        // Release nested state so the slot pools / layer arrays can be GC'd
        this._shake = null;
        this._mt = null;
        this._parallax = null;
        this._bounds = null;
        this.debugConfig = null;
        this.pos = this.target = this.look = null;
        this.rng = null;
    }
}

export default CinematicCameraPro;
