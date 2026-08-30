/**
 * @zakkster/lite-camera-pro — Multi-Target Framing
 *
 * Calculates camera position and zoom to keep multiple targets visible.
 * Zero allocations per frame — all state is pre-allocated on the camera.
 *
 * Used by boss fights, co-op, cutscenes tracking multiple actors.
 *
 * Depends on: nothing (pure math -- zoom/position clamps are inline).
 */

/**
 * Compute the camera target position and zoom level that frames
 * all targets with the specified padding.
 *
 * Mutates cam.target[], cam.zoom directly. Zero allocations.
 *
 * Count contract (caller-owned, standalone ./multi callers included): count
 * must satisfy 0 <= count <= targets.length and every targets[0..count-1] must
 * be an object with finite x/y. This loop reads targets[0..count-1] without
 * per-frame validation (zero-GC hot path) -- an out-of-range count or a garbage
 * entry is undefined behavior here. The CinematicCameraPro facade enforces the
 * contract at its trackMultiple/setTargetCount doors (ERR_CAMERA_TARGETS);
 * direct callers of this function own that guarantee themselves.
 *
 * @param {CinematicCameraPro} cam       The camera instance
 * @param {number}             dt        Delta time in seconds
 * @param {{x:number,y:number}[]} targets  Array of target objects
 * @param {number}             count     Number of active targets
 */
export function updateMultiTarget(cam, dt, targets, count) {
    if (count === 0) return;

    const mt = cam._mt;

    // ── 1. Compute bounding box of all targets ──
    let minX = targets[0].x;
    let maxX = minX;
    let minY = targets[0].y;
    let maxY = minY;

    for (let i = 1; i < count; i++) {
        const tx = targets[i].x;
        const ty = targets[i].y;
        if (tx < minX) minX = tx;
        if (tx > maxX) maxX = tx;
        if (ty < minY) minY = ty;
        if (ty > maxY) maxY = ty;
    }

    // ── 2. Center of the bounding box ──
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;

    // ── 3. Required world-space dimensions (with padding) ──
    // Minimum bbox = viewport at maxZoom, prevents near-zero division
    const minBBox = 100; // minimum world-space pixels to prevent extreme zoom
    const bboxW = Math.max((maxX - minX) + mt.paddingX * 2, minBBox);
    const bboxH = Math.max((maxY - minY) + mt.paddingY * 2, minBBox);

    // ── 4. Compute zoom to fit bbox into viewport ──
    const zoomX = cam.viewW / bboxW;
    const zoomY = cam.viewH / bboxH;
    let desiredZoom = Math.min(zoomX, zoomY);

    // Clamp to camera limits
    if (desiredZoom < cam.minZoom) desiredZoom = cam.minZoom;
    if (desiredZoom > cam.maxZoom) desiredZoom = cam.maxZoom;
    // Multi-target specific clamps (tighter range for framing)
    if (desiredZoom < mt.minZoom) desiredZoom = mt.minZoom;
    if (desiredZoom > mt.maxZoom) desiredZoom = mt.maxZoom;

    // ── 5. Smooth zoom toward desired ──
    // Exponential damping: cam.zoom approaches desiredZoom at mt.zoomSpeed rate
    const zoomLerp = 1 - Math.exp(-mt.zoomSpeed * dt);
    cam.zoom += (desiredZoom - cam.zoom) * zoomLerp;

    // ── 6. Update visible dimensions after zoom change ──
    cam.visibleW = cam.viewW / cam.zoom;
    cam.visibleH = cam.viewH / cam.zoom;
    cam._maxX = cam.worldW - cam.visibleW;
    cam._maxY = cam.worldH - cam.visibleH;
    if (cam._maxX < 0) cam._maxX = 0;
    if (cam._maxY < 0) cam._maxY = 0;

    // ── 7. Camera target = center of bbox, offset by half-visible ──
    const desiredX = centerX - cam.visibleW * 0.5;
    const desiredY = centerY - cam.visibleH * 0.5;

    // Smooth position follow
    const posLerp = 1 - Math.exp(-mt.followSpeed * dt);
    cam.target[0] += (desiredX - cam.target[0]) * posLerp;
    cam.target[1] += (desiredY - cam.target[1]) * posLerp;

    // Zero out lookahead (multi-target doesn't use it)
    cam.look[0] = 0;
    cam.look[1] = 0;
}

/**
 * Default multi-target configuration. Allocated once on the camera.
 * All fields are mutable by the developer.
 *
 * @returns {Object} Config object stored as cam._mt
 */
export function createMultiTargetState() {
    return {
        /** Whether multi-target tracking is active */
        active: false,

        /** Array ref provided by developer (we never allocate a new one) */
        targets: null,

        /** Number of active targets (avoids .length access on sparse arrays) */
        count: 0,

        /** World-space padding around the bounding box (pixels) */
        paddingX: 80,
        paddingY: 80,

        /** Zoom limits specific to multi-target framing */
        minZoom: 0.3,
        maxZoom: 2.0,

        /** Zoom smoothing speed (higher = snappier). Uses exponential damping. */
        zoomSpeed: 4.0,

        /** Position follow speed. Uses exponential damping. */
        followSpeed: 5.0,
    };
}

export default updateMultiTarget;
