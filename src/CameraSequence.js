/**
 * @zakkster/lite-camera-pro — Camera Sequence System
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
 * Create a new camera sequence.
 *
 * The sequence does NOT play automatically — call .play() on the camera
 * or let playSequence() handle it.
 *
 * @param {CinematicCameraPro} cam  The camera to control
 * @param {Object} [options]
 * @param {boolean} [options.loop=false]       Loop the sequence
 * @param {Function} [options.onComplete]      Called when sequence finishes
 * @param {number} [options.blendOutTime=0.3]  Seconds to blend back to follow after sequence ends
 * @returns {CameraSequence}
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

    // ── Snapshot: captured when play() is called ──
    let snapX = 0;
    let snapY = 0;
    let snapZoom = 1;

    // ── Step queue (built during chaining, consumed when play() builds timeline) ──
    const steps = [];

    // ── The underlying timeline (created lazily on play) ──
    let timeline = null;
    let isPlaying = false;
    let isDestroyed = false;

    // ── Internal: the "current" animated state that steps write to ──
    // These are read by updateSequence() to drive the camera.
    const state = {
        x: 0,
        y: 0,
        zoom: 1,
        active: false,
    };

    // ─────────────────────────────────────────────────────
    //  STEP TYPES
    // ─────────────────────────────────────────────────────

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
     * repeatedly — each (re)build re-snaps the current camera state.
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
                if (onComplete) onComplete();
            },
        });

        // Track the "from" values as we chain — each step's start
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
                        duration: 0, // instant — fires once
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

    // ─────────────────────────────────────────────────────
    //  PUBLIC: Fluent builder API
    // ─────────────────────────────────────────────────────

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
            const at = opts && opts.at || undefined;
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
            const at = opts && opts.at || undefined;
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
            const at = opts && opts.at || undefined;
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

            // Resolve `at`: prefer opts.at, then fall back to intensity.at if the
            // caller used the 2-arg form `shake(name, { at: ... })`. Guard
            // against `typeof null === 'object'` and treat `at: 0` as valid.
            let at;
            if (opts && opts.at !== undefined) {
                at = opts.at;
            } else if (intensity !== null && typeof intensity === 'object' && intensity.at !== undefined) {
                at = intensity.at;
            }

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
            const at = opts && opts.at || undefined;
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
         */
        call(fn, opts) {
            const at = opts && opts.at || undefined;
            pushStep('callback', {fn}, at);
            return seq;
        },

        // ─────────────────────────────────────────────────
        //  PLAYBACK CONTROL
        // ─────────────────────────────────────────────────

        /** Build and start the sequence. Usually called via camera.playSequence(). */
        play() {
            if (isDestroyed) return seq;
            // Always rebuild — each play() captures the current camera state.
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

        /** Resume after pause. */
        resume() {
            if (timeline) timeline.play();
            return seq;
        },

        /** Stop the sequence and return camera to follow mode. */
        stop() {
            if (timeline) timeline.reset();
            isPlaying = false;
            state.active = false;
            return seq;
        },

        /** Jump to a specific time (ms). */
        seek(timeMs) {
            if (!timeline) buildTimeline();
            if (timeline) timeline.seek(timeMs);
            return seq;
        },

        /**
         * Total sequence duration in ms. Computed from queued steps —
         * does NOT build the timeline or take a camera snapshot.
         * Caveat: `at`-positioned overlaps are not accounted for.
         */
        get duration() {
            if (timeline) return timeline.duration;
            let total = 0;

            for (let i = 0; i < steps.length; i++) {
                total += (steps[i].params && steps[i].params.duration) || 0;
            }

            return total;
        },

        /** Current progress (0–1). */
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
            steps.length = 0;
        },

        // ─────────────────────────────────────────────────
        //  INTERNAL: accessed by camera.update()
        // ─────────────────────────────────────────────────

        /** @internal */
        _state: state,

        /** @internal */
        _blendOutTime: blendOutTime,
    };

    return seq;
}

// ─────────────────────────────────────────────────────
//  SEQUENCE PRESETS (Day 9)
// ─────────────────────────────────────────────────────

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
 * @param {number} [totalMs=3000]  Total sequence duration
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

export default createCameraSequence;
