/**
 * @zakkster/lite-camera-pro -- Camera Sequence System
 *
 * Fluent builder for scripted camera cinematics.
 * Powered by @zakkster/lite-timeline under the hood.
 *
 * Each sequence step becomes a timeline track that writes directly
 * to the camera's position/zoom state. While a sequence is playing,
 * normal follow mode is paused.
 *
 * Zero external deps beyond the lite-* ecosystem.
 *
 * Depends on: @zakkster/lite-timeline, @zakkster/lite-lerp, @zakkster/lite-ease
 */

import {createTimeline} from '@zakkster/lite-timeline';
import {lerp, clamp} from '@zakkster/lite-lerp';
import {easeInOutCubic, easeOutExpo} from '@zakkster/lite-ease';
import {addShake} from './ShakeEngine.js';
import {getPreset} from './ShakePresets.js';

/**
 * Resolve a lite-timeline `at` position from a step's options.
 *
 * Prefers `opts.at`; falls back to `alt.at` so the 2-arg `shake(name, {at})`
 * form still works (there `alt` is the intensity argument). Guards against
 * `typeof null === 'object'` and treats `at: 0` as a valid absolute position --
 * `opts && opts.at || undefined` (the old five-builder form) dropped `at: 0`
 * to append (CP-11). `at: undefined` behaves as omitted; `at: null` is passed
 * through and ignored by lite-timeline (append), documented as such.
 *
 * Build-time only -- never called on the frame hot path.
 *
 * @param {Object|undefined} opts   Step options bag
 * @param {*} [alt]                 Fallback carrier (shake's intensity arg)
 * @returns {string|number|undefined}
 */
function resolveAt(opts, alt) {
    if (opts !== null && typeof opts === 'object' && opts.at !== undefined) return opts.at;
    if (alt !== null && typeof alt === 'object' && alt.at !== undefined) return alt.at;
    return undefined;
}

/**
 * Create a new camera sequence.
 *
 * The sequence does NOT play automatically -- call .play() on the camera
 * or let playSequence() handle it.
 *
 * Units: step durations (moveTo/zoomTo/wait/...) are MILLISECONDS (timeline
 * units). blendOutTime is SECONDS (class-API units) -- it integrates against
 * update(dt) seconds. Do not mix them.
 *
 * On completion the camera blends its position back to the follow target over
 * blendOutTime seconds (0 = a hard handoff, identical to 1.2.0). Zoom is NOT
 * blended -- there is no follow-side zoom target to return to, so the
 * sequence's final zoom persists. A blend is only visible in follow modes that
 * lerp position (SMOOTH, PREDICTIVE); LOCK, CUT, and HYBRID with a locked
 * vertical write pos directly, so the glide is invisible in those modes (F17).
 * stop()/stopSequence() never blend (hard handoff). Looping sequences never
 * complete, so they never blend.
 *
 * @param {CinematicCameraPro} cam  The camera to control
 * @param {Object} [options]
 * @param {boolean} [options.loop=false]       Loop the sequence
 * @param {Function} [options.onComplete]      Called when sequence finishes
 * @param {number} [options.blendOutTime=0.3]  SECONDS to blend camera position
 *   back to follow after the sequence completes (0 = hard handoff). Step
 *   durations on this same builder are MILLISECONDS -- different units.
 * @returns {CameraSequence}
 * @throws {Error} code "ERR_SEQUENCE_OPTIONS" if blendOutTime is non-finite or
 *   negative (validated once at construction, a cold setup-time door).
 *
 * @example
 * const seq = createCameraSequence(camera)
 *   .moveTo(400, 200, 1200)
 *   .zoomTo(1.5, 800)
 *   .shake('explosion')
 *   .wait(500)
 *   .moveTo(800, 300, 1000);
 *
 * camera.playSequence(seq);
 */
export function createCameraSequence(cam, options = {}) {

    const {
        loop = false,
        onComplete = null,
        blendOutTime = 0.3,
    } = options;

    // -- Fail-closed door (cold, setup-time): blendOutTime is SECONDS
    // (class-API units) -- it integrates against update(dt) seconds. Step
    // durations on this same builder are MILLISECONDS (timeline units).
    // 0 is legal (a hard handoff to follow, the 1.2.0 behavior exactly);
    // a non-finite or negative window is rejected loud, never silently
    // clamped (PRO2 doctrine).
    if (!Number.isFinite(blendOutTime) || blendOutTime < 0) {
        const e = new Error(
            'blendOutTime must be a finite number >= 0 seconds (got ' +
            String(blendOutTime) + ')');
        e.code = 'ERR_SEQUENCE_OPTIONS';
        throw e;
    }

    // -- Snapshot: captured when play() is called --
    let snapX = 0;
    let snapY = 0;
    let snapZoom = 1;

    // -- Step queue (built during chaining, consumed when play() builds timeline) --
    const steps = [];

    // -- The underlying timeline (created lazily on play) --
    let timeline = null;
    let isPlaying = false;
    let isDestroyed = false;

    // -- Internal: the "current" animated state that steps write to --
    // These are read by updateSequence() to drive the camera.
    const state = {
        x: 0,
        y: 0,
        zoom: 1,
        active: false,
        // Blend-out budget in SECONDS (0 = hard handoff). update() reads this
        // as the completion-vs-stop discriminator: the onComplete wrapper arms
        // it to blendOutTime; stop() and destroy() zero it. See
        // decisions/0003-blend-out.md.
        blend: 0,
    };

    // -----------------------------------------------------
    //  STEP TYPES
    // -----------------------------------------------------

    /**
     * Internal: Add a step to the queue.
     * @param {string} type
     * @param {Object} params
     * @param {string|number} [position]  lite-timeline position syntax
     */
    function pushStep(type, params, position) {
        steps.push({type, params, position});
    }

    /**
     * Snapshot current camera state and build a fresh timeline.
     * Always destroys any prior timeline so play()/seek() are safe to call
     * repeatedly -- each (re)build re-snaps the current camera state.
     */

    function buildTimeline() {
        if (timeline) timeline.destroy();

        // Snapshot current camera state as the starting point
        snapX = cam.pos[0] + cam.visibleW * 0.5;  // center X in world
        snapY = cam.pos[1] + cam.visibleH * 0.5;  // center Y in world
        snapZoom = cam.zoom;

        state.x = snapX;
        state.y = snapY;
        state.zoom = snapZoom;

        timeline = createTimeline({
            loop,
            onComplete: () => {
                isPlaying = false;
                state.active = false;
                // Arm the blend-back-to-follow window (SECONDS). update()'s
                // cleanup branch copies this into the camera's _blendRemain,
                // then nulls _seq -- so completion glides back to follow while
                // stop()/destroy() (which zero state.blend) hand off hard.
                state.blend = blendOutTime;
                if (onComplete) onComplete();
            },
        });

        // Track the "from" values as we chain -- each step's start
        // is the previous step's end target.
        let curX = snapX;
        let curY = snapY;
        let curZoom = snapZoom;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const pos = step.position; // lite-timeline position string

            switch (step.type) {

                case 'moveTo': {
                    const {x, y, duration, ease} = step.params;
                    const fromX = curX, fromY = curY;
                    curX = x;
                    curY = y;

                    timeline.add({
                        duration,
                        ease: ease || easeInOutCubic,
                        onUpdate: (t) => {
                            state.x = lerp(fromX, x, t);
                            state.y = lerp(fromY, y, t);
                        },
                    }, pos);
                    break;
                }

                case 'zoomTo': {
                    const {level, duration, ease} = step.params;
                    const fromZ = curZoom;
                    curZoom = level;

                    timeline.add({
                        duration,
                        ease: ease || easeOutExpo,
                        onUpdate: (t) => {
                            state.zoom = lerp(fromZ, level, t);
                        },
                    }, pos);
                    break;
                }

                case 'shake': {
                    const {profile, intensity} = step.params;
                    timeline.add({
                        duration: 0, // instant -- fires once
                        onComplete: () => {
                            addShake(cam._shake, profile, intensity);
                        },
                    }, pos);
                    break;
                }

                case 'wait': {
                    const {duration} = step.params;
                    timeline.add({duration}, pos);
                    break;
                }

                case 'callback': {
                    const {fn} = step.params;
                    timeline.add({
                        duration: 0,
                        onComplete: fn,
                    }, pos);
                    break;
                }

                case 'moveAndZoom': {
                    const {x, y, level, duration, ease} = step.params;
                    const fromX = curX, fromY = curY, fromZ = curZoom;
                    curX = x;
                    curY = y;
                    curZoom = level;

                    timeline.add({
                        duration,
                        ease: ease || easeInOutCubic,
                        onUpdate: (t) => {
                            state.x = lerp(fromX, x, t);
                            state.y = lerp(fromY, y, t);
                            state.zoom = lerp(fromZ, level, t);
                        },
                    }, pos);
                    break;
                }
            }
        }
    }

    // -----------------------------------------------------
    //  PUBLIC: Fluent builder API
    // -----------------------------------------------------

    const seq = {

        /**
         * Move camera center to world coordinates.
         *
         * @param {number} x         World X
         * @param {number} y         World Y
         * @param {number} duration  Duration in ms
         * @param {Object} [opts]
         * @param {Function} [opts.ease]   Easing function
         * @param {string|number} [opts.at]  Timeline position
         * @returns {CameraSequence} this
         *
         * @example
         * seq.moveTo(400, 200, 1200)
         *    .moveTo(800, 300, 1000);
         */
        moveTo(x, y, duration, opts) {
            const ease = opts && opts.ease || null;
            const at = resolveAt(opts);
            pushStep('moveTo', {x, y, duration, ease}, at);
            return seq;
        },

        /**
         * Smoothly zoom to a level.
         *
         * @param {number} level     Target zoom
         * @param {number} duration  Duration in ms
         * @param {Object} [opts]
         * @param {Function} [opts.ease]
         * @param {string|number} [opts.at]  Timeline position
         * @returns {CameraSequence} this
         */
        zoomTo(level, duration, opts) {
            const ease = opts && opts.ease || null;
            const at = resolveAt(opts);
            pushStep('zoomTo', {level, duration, ease}, at);
            return seq;
        },

        /**
         * Simultaneously move and zoom. Single track, perfectly synchronized.
         *
         * @param {number} x World X
         * @param {number} y World Y
         * @param {number} level Target zoom
         * @param {number} duration Duration in ms
         * @param {Object} [opts]
         * @returns {CameraSequence} this
         *
         * @example
         * seq.moveAndZoom(boss.x, boss.y, 1.8, 1500, { ease: easeOutExpo });
         */
        moveAndZoom(x, y, level, duration, opts) {
            const ease = opts && opts.ease || null;
            const at = resolveAt(opts);
            pushStep('moveAndZoom', {x, y, level, duration, ease}, at);
            return seq;
        },

        /**
         * Trigger a shake. Fires instantly at current timeline position.
         *
         * @param {string|Object} profileOrName  Preset name or profile object
         * @param {number} [intensity=1]
         * @param {Object} [opts]
         * @param {string|number} [opts.at]  Timeline position
         * @returns {CameraSequence} this
         *
         * @example
         * seq.shake('explosion')
         *    .shake({ trauma: 0.3, freq: 20, decay: 2, maxOffset: 10 });
         */
        shake(profileOrName, intensity, opts) {
            let profile;
            if (typeof profileOrName === 'string') {
                profile = getPreset(profileOrName);
                if (!profile) profile = {trauma: 0.5, freq: 15, decay: 1, maxOffset: 15, maxAngle: 0.05};
            } else {
                profile = profileOrName;
            }

            const int = (typeof intensity === 'number') ? intensity : 1;

            // Resolve `at`: prefer opts.at, else fall back to intensity.at for the
            // 2-arg form `shake(name, { at: ... })`. resolveAt guards null and
            // honors `at: 0` (CP-11).
            const at = resolveAt(opts, intensity);

            pushStep('shake', {profile, intensity: int}, at);
            return seq;
        },

        /**
         * Pause the sequence for a duration.
         *
         * @param {number} duration  Wait time in ms
         * @param {Object} [opts]
         * @param {string|number} [opts.at]  Timeline position
         * @returns {CameraSequence} this
         */
        wait(duration, opts) {
            const at = resolveAt(opts);
            pushStep('wait', {duration}, at);
            return seq;
        },

        /**
         * Execute an arbitrary callback at this point in the sequence.
         * Great for triggering game events, spawning particles, etc.
         *
         * @param {Function} fn  Callback function
         * @param {Object} [opts]
         * @param {string|number} [opts.at]  Timeline position
         * @returns {CameraSequence} this
         *
         * @example
         * seq.moveTo(boss.x, boss.y, 1000)
         *    .call(() => boss.startPhase2())
         *    .shake('heavy_impact');
         *
         * NOTE (CP-20, unguarded -- routed to PRO4): .call(fn), shake steps, the
         * onComplete callback, and seek() all run user code SYNCHRONOUSLY from
         * inside the timeline tick. Calling cam.destroy(), seq.destroy(), or
         * seq.stop() re-entrantly from one of those callbacks is not guarded in
         * 1.3.0 -- it can null the timeline mid-iteration. Defer such teardown to
         * the next frame until PRO4 lands the re-entrancy guard.
         */
        call(fn, opts) {
            const at = resolveAt(opts);
            pushStep('callback', {fn}, at);
            return seq;
        },

        // -------------------------------------------------
        //  PLAYBACK CONTROL
        // -------------------------------------------------

        /** Build and start the sequence. Usually called via camera.playSequence(). */
        play() {
            if (isDestroyed) return seq;
            // CP-24 (D4): a zero-step sequence has nothing to animate, and
            // lite-timeline gates completion on tracks.length > 0 -- so a
            // built-but-empty timeline would acquire the shared ticker and
            // NEVER self-complete, pinning the RAF loop forever. Documented
            // no-op: acquire no timeline, stay inert (playing false, active
            // false). play() with steps queued replays normally.
            if (steps.length === 0) {
                isPlaying = false;
                state.active = false;
                return seq;
            }
            // Always rebuild -- each play() captures the current camera state.
            buildTimeline();
            state.active = true;
            isPlaying = true;
            timeline.play();
            return seq;
        },

        /** Pause the sequence. */
        pause() {
            if (timeline) timeline.pause();
            return seq;
        },

        /**
         * Resume after pause. Guarded to the PAUSED state only: pause() leaves
         * isPlaying true, while stop() and completion clear it, so the predicate
         * `timeline && isPlaying` is exactly "paused". Resuming a stopped or
         * completed sequence is a no-op -- otherwise a completed timeline would
         * auto-seek(0) and REPLAY the whole cinematic, re-firing every .call(fn)
         * and shake step on the live camera (a real mutation, not cosmetics).
         * Use play() to deliberately replay from a fresh snapshot.
         */
        resume() {
            if (timeline && isPlaying) timeline.play();
            return seq;
        },

        /**
         * Stop the sequence and return camera to follow mode. Destroys the
         * timeline (releasing the shared ticker refcount -- CP-5; reset() alone
         * detached the update callback but pinned the RAF loop forever) and
         * cancels any pending blend-out (a hard handoff, no glide). play()
         * rebuilds from a fresh snapshot, so a stopped sequence is replayable.
         *
         * NOTE (CP-24): natural COMPLETION does not release the ticker -- a
         * completed sequence keeps its built timeline (and the shared-ticker
         * refcount) until you call stop(), destroy(), or play() again. Release
         * long-lived completed sequences explicitly.
         */
        stop() {
            if (timeline) {
                timeline.destroy();
                timeline = null;
            }
            isPlaying = false;
            state.active = false;
            state.blend = 0;
            return seq;
        },

        /**
         * Jump to a specific time (ms). If the timeline was destroyed (after
         * stop() or before the first play()), this rebuilds it from a FRESH
         * camera snapshot, then seeks. NOTE: lite-timeline's seek() fires the
         * onUpdate/onComplete of every track it crosses -- including duration-0
         * shake and .call(fn) steps -- so seeking runs user code synchronously.
         */
        seek(timeMs) {
            if (!timeline) buildTimeline();
            if (timeline) timeline.seek(timeMs);
            return seq;
        },

        /**
         * Total sequence duration in ms. Computed from queued steps --
         * does NOT build the timeline or take a camera snapshot.
         * Caveat: `at`-positioned overlaps are not accounted for -- while a
         * timeline is live this returns its at-aware duration, but after stop()
         * (timeline destroyed) it falls back to the naive step-sum, so an
         * `at:'+=100'` build reads 1600 while playing and 1500 after stop().
         */
        get duration() {
            if (timeline) return timeline.duration;
            let total = 0;

            for (let i = 0; i < steps.length; i++) {
                total += (steps[i].params && steps[i].params.duration) || 0;
            }

            return total;
        },

        /** Current progress (0--1). */
        get progress() {
            return timeline ? timeline.progress : 0;
        },

        /** Whether the sequence is currently playing. */
        get playing() {
            return isPlaying;
        },

        /** Destroy the sequence and release timeline resources. */
        destroy() {
            if (isDestroyed) return;
            isDestroyed = true;
            if (timeline) timeline.destroy();
            timeline = null;
            state.active = false;
            isPlaying = false;
            state.blend = 0;
            steps.length = 0;
        },

        // -------------------------------------------------
        //  INTERNAL: accessed by camera.update()
        // -------------------------------------------------

        /** @internal */
        _state: state,
    };

    return seq;
}

// -----------------------------------------------------
//  SEQUENCE PRESETS (Day 9)
// -----------------------------------------------------

/**
 * Simple pan from current position to a world point.
 *
 * @param {CinematicCameraPro} cam
 * @param {number} x         Target world X
 * @param {number} y         Target world Y
 * @param {number} duration  Duration in ms
 * @param {Object} [opts]
 * @returns {CameraSequence}
 */
export function panTo(cam, x, y, duration, opts) {
    return createCameraSequence(cam, opts).moveTo(x, y, duration, opts);
}

/**
 * Dramatic zoom: move + zoom simultaneously, great for boss reveals.
 *
 * @param {CinematicCameraPro} cam
 * @param {number} x      World X to focus on
 * @param {number} y      World Y to focus on
 * @param {number} zoom   Target zoom level
 * @param {number} duration Duration in ms
 * @param {Object} [opts]
 * @returns {CameraSequence}
 */
export function dramaticZoom(cam, x, y, zoom, duration, opts) {
    return createCameraSequence(cam, opts).moveAndZoom(x, y, zoom, duration, opts);
}

/**
 * Boss reveal: pan to target, zoom in, shake, hold, then return.
 *
 * @param {CinematicCameraPro} cam
 * @param {number} x           Boss world X
 * @param {number} y           Boss world Y
 * Caveat: the return pose (startX/startY) is captured at BUILD time from the
 * camera's current center, NOT at play time. If the camera has moved between
 * building and playing this sequence, the final leg returns to the old center.
 * Build it immediately before playSequence() for a correct return.
 *
 * @param {number} [totalMs=3000]  Total sequence duration in ms
 * @param {Object} [opts]
 * @returns {CameraSequence}
 */
export function bossReveal(cam, x, y, totalMs = 3000, opts) {
    const panTime = totalMs * 0.35;
    const holdTime = totalMs * 0.30;
    const backTime = totalMs * 0.35;

    // Capture current center for return
    const startX = cam.pos[0] + cam.visibleW * 0.5;
    const startY = cam.pos[1] + cam.visibleH * 0.5;

    return createCameraSequence(cam, opts)
        .moveAndZoom(x, y, 1.8, panTime)
        .shake('impact')
        .wait(holdTime)
        .moveAndZoom(startX, startY, 1.0, backTime);
}

/**
 * Screen shake sequence with timed duration. Shake fires and
 * the sequence waits for it to naturally decay.
 *
 * @param {CinematicCameraPro} cam
 * @param {string|Object} presetOrProfile
 * @param {number} [holdMs=500]  How long to wait after shake fires
 * @param {Object} [opts]
 * @returns {CameraSequence}
 */
export function timedShake(cam, presetOrProfile, holdMs = 500, opts) {
    return createCameraSequence(cam, opts)
        .shake(presetOrProfile)
        .wait(holdMs);
}

/**
 * Attach the sequence factory to one camera (v2.0.0 detach, CP-21/D1).
 * Only createSequence() was entangled -- every _seq site duck-types and
 * playSequence() already accepts any ./sequence-built sequence. Restores it
 * per-instance (own-property, one cold closure). Single-shot: a second attach
 * throws ERR_ALREADY_ATTACHED. With no attach, call createCameraSequence(cam,
 * opts) directly.
 *
 * @param {Object} cam  A CinematicCameraPro instance
 * @returns {Object} cam, for chaining
 * @throws {Error} code "ERR_ALREADY_ATTACHED" if sequences are already attached
 */
export function withSequences(cam) {
    // Destroyed beats unattached (QA-1): destroy() stamps createSequence = _dead
    // as an own-property too, so the already-attached check below would throw the
    // WRONG code (ERR_ALREADY_ATTACHED) on a corpse. Detect destroyed FIRST via
    // Object.hasOwn(cam, 'update') (destroy() rebinds update as an own-property).
    if (Object.hasOwn(cam, 'update')) {
        const e = new Error("CinematicCameraPro: use after destroy()");
        e.code = "ERR_CAMERA_DESTROYED";
        throw e;
    }
    if (Object.prototype.hasOwnProperty.call(cam, 'createSequence')) {
        const e = new Error("CinematicCameraPro: sequences already attached. " +
            "withSequences(camera) is per-instance and single-shot.");
        e.code = "ERR_ALREADY_ATTACHED";
        throw e;
    }
    cam.createSequence = function (options) {
        return createCameraSequence(this, options);
    };
    return cam;
}

export default createCameraSequence;
