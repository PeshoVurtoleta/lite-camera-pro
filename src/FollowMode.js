/**
 * @zakkster/lite-camera-pro — Follow Mode Strategies
 *
 * Each mode is a pure function:
 *   (camera, dt, px, py, pvx, pvy) => void
 *
 * Mutates camera.target[] directly. No allocations.
 * The camera's update() dispatches to the active strategy.
 *
 * Modes:
 *   SMOOTH      — lerp + deadzone + lookahead (default, same as lite-camera)
 *   LOCK        — snap to target, no interpolation
 *   PREDICTIVE  — heavy velocity extrapolation, aggressive lookahead
 *   CUT         — instant jump (for cutscene hard cuts)
 *   HYBRID      — smooth horizontal, locked vertical (platformer standard)
 */

/** @enum {number} */
export const FollowMode = {
    SMOOTH:     0,
    LOCK:       1,
    PREDICTIVE: 2,
    CUT:        3,
    HYBRID:     4,
};

/**
 * SMOOTH — Default. Deadzone + lookahead + lerp.
 * This is the same behavior as lite-camera base.
 */
function smooth(cam, dt, px, py, pvx, pvy) {
    const len = Math.sqrt(pvx * pvx + pvy * pvy);
    const targetLx = len > 0 ? (pvx / len) * cam.lookaheadDist : 0;
    const targetLy = len > 0 ? (pvy / len) * cam.lookaheadDist : 0;

    cam.look[0] += (targetLx - cam.look[0]) * cam.lookaheadSpeed * dt;
    cam.look[1] += (targetLy - cam.look[1]) * cam.lookaheadSpeed * dt;

    const halfVisW = cam.visibleW * 0.5;
    const halfVisH = cam.visibleH * 0.5;

    const desiredX = px + cam.look[0] - halfVisW;
    const desiredY = py + cam.look[1] - halfVisH;

    if (desiredX < cam.target[0] - cam.deadzoneX)
        cam.target[0] = desiredX + cam.deadzoneX;
    else if (desiredX > cam.target[0] + cam.deadzoneX)
        cam.target[0] = desiredX - cam.deadzoneX;

    if (desiredY < cam.target[1] - cam.deadzoneY)
        cam.target[1] = desiredY + cam.deadzoneY;
    else if (desiredY > cam.target[1] + cam.deadzoneY)
        cam.target[1] = desiredY - cam.deadzoneY;
}

/**
 * LOCK — Camera snaps instantly to center on target.
 * No deadzone, no lookahead, no lerp.
 * Useful for: top-down shooters, fixed-camera moments.
 */
function lock(cam, dt, px, py, pvx, pvy) {
    const halfVisW = cam.visibleW * 0.5;
    const halfVisH = cam.visibleH * 0.5;

    cam.target[0] = px - halfVisW;
    cam.target[1] = py - halfVisH;

    // Bypass lerp by also setting pos directly
    cam.pos[0] = cam.target[0];
    cam.pos[1] = cam.target[1];

    // Zero out lookahead so switching modes doesn't jerk
    cam.look[0] = 0;
    cam.look[1] = 0;
}

/**
 * PREDICTIVE — Aggressive lookahead using raw velocity extrapolation.
 * Looks further ahead than SMOOTH, and scales with speed (not just direction).
 * No deadzone — the camera actively chases the predicted position.
 * Useful for: racing games, fast runners, bullet-hell dodge patterns.
 *
 * Uses cam.predictTime (seconds of extrapolation, default 0.3).
 */
function predictive(cam, dt, px, py, pvx, pvy) {
    const predictTime = cam.predictTime || 0.3;

    // Predicted position: where the player will be in `predictTime` seconds
    const predX = px + pvx * predictTime;
    const predY = py + pvy * predictTime;

    const halfVisW = cam.visibleW * 0.5;
    const halfVisH = cam.visibleH * 0.5;

    // Lerp lookahead toward predicted offset (not normalized — scales with speed)
    const targetLx = predX - px;
    const targetLy = predY - py;
    cam.look[0] += (targetLx - cam.look[0]) * cam.lookaheadSpeed * dt;
    cam.look[1] += (targetLy - cam.look[1]) * cam.lookaheadSpeed * dt;

    // No deadzone: camera directly tracks predicted center
    cam.target[0] = px + cam.look[0] - halfVisW;
    cam.target[1] = py + cam.look[1] - halfVisH;
}

/**
 * CUT — Hard cut to center on target. Identical to LOCK but designed
 * to be used as a one-frame mode switch for cutscene transitions.
 * After the cut, you'd typically switch to SMOOTH or LOCK.
 *
 * Zero lerp, zero lookahead. Resets look vector.
 */
function cut(cam, dt, px, py, pvx, pvy) {
    const halfVisW = cam.visibleW * 0.5;
    const halfVisH = cam.visibleH * 0.5;

    cam.target[0] = px - halfVisW;
    cam.target[1] = py - halfVisH;
    cam.pos[0]    = cam.target[0];
    cam.pos[1]    = cam.target[1];

    cam.look[0] = 0;
    cam.look[1] = 0;
}

/**
 * HYBRID — Smooth horizontal (with deadzone + lookahead), locked vertical.
 * The platformer standard: horizontal feels cinematic, vertical is
 * pixel-precise so platforms don't jitter.
 *
 * Uses cam.hybridVerticalSnap (default true) to control whether
 * vertical uses instant snap or fast lerp.
 */
function hybrid(cam, dt, px, py, pvx, pvy) {
    // ── Horizontal: full smooth behavior ──
    const len = Math.sqrt(pvx * pvx + pvy * pvy);
    const targetLx = len > 0 ? (pvx / len) * cam.lookaheadDist : 0;
    cam.look[0] += (targetLx - cam.look[0]) * cam.lookaheadSpeed * dt;

    const halfVisW = cam.visibleW * 0.5;
    const halfVisH = cam.visibleH * 0.5;

    const desiredX = px + cam.look[0] - halfVisW;

    if (desiredX < cam.target[0] - cam.deadzoneX)
        cam.target[0] = desiredX + cam.deadzoneX;
    else if (desiredX > cam.target[0] + cam.deadzoneX)
        cam.target[0] = desiredX - cam.deadzoneX;

    // ── Vertical: locked (snap or fast lerp) ──
    const desiredY = py - halfVisH;

    if (cam.hybridVerticalSnap !== false) {
        // Instant snap
        cam.target[1] = desiredY;
        cam.pos[1]    = desiredY;
    } else {
        // Fast lerp (3× normal speed)
        cam.target[1] = desiredY;
        cam.pos[1] += (cam.target[1] - cam.pos[1]) * cam.lerpSpeed * 3 * dt;
    }

    // Zero out vertical lookahead
    cam.look[1] = 0;
}

/**
 * Strategy lookup table. Indexed by FollowMode enum.
 * @type {Function[]}
 */
export const FOLLOW_STRATEGIES = [
    smooth,      // 0: SMOOTH
    lock,        // 1: LOCK
    predictive,  // 2: PREDICTIVE
    cut,         // 3: CUT
    hybrid,      // 4: HYBRID
];

export default FollowMode;
