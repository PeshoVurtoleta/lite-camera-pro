/**
 * @zakkster/lite-camera-pro -- Debug HUD
 *
 * Full screen-space debug overlay with toggleable panels.
 * Renders directly to canvas -- no DOM, no HTML.
 *
 * Panels: position, zoom, follow mode, shake, sequence, parallax, bounds.
 * Each panel can be toggled on/off individually.
 *
 * Zero dependencies beyond the camera instance.
 */
import {BoundsType} from './BoundsSystem.js';

const LINE_H = 13;
const PAD = 8;
const FONT = '10px monospace';
const FONT_BOLD = 'bold 10px monospace';
const BG = 'rgba(0,0,0,0.6)';
const COL_YELLOW = '#fbbf24';
const COL_RED = '#ef4444';
const COL_PURPLE = '#a78bfa';
const COL_CYAN = '#22d3ee';
const COL_GREEN = '#34d399';
const COL_DIM = '#6b7280';
const COL_WHITE = '#e5e5e5';

const MODE_NAMES = ['SMOOTH', 'LOCK', 'PREDICTIVE', 'CUT', 'HYBRID'];
const BOUNDS_NAMES = ['HARD', 'SOFT', 'ELASTIC', 'NONE'];

/**
 * Create debug HUD configuration.
 * @returns {Object} HUD config -- mutate .show to toggle panels
 */
export function createDebugHUDConfig() {
    return {
        show: {
            position: true,
            zoom: true,
            mode: true,
            shake: true,
            sequence: true,
            parallax: true,
            bounds: true,
            deadzone: true,   // world-space deadzone rect
            lookahead: true,   // world-space lookahead vector
        },
        x: 4,
        y: 4,
    };
}

/**
 * Draw the full debug HUD. Screen-space (call AFTER ctx.restore()).
 *
 * @param {CinematicCameraPro} cam
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} [config]  HUD config from createDebugHUDConfig()
 */
export function drawDebugHUD(cam, ctx, config) {
    const show = config ? config.show : {
        position: true,
        zoom: true,
        mode: true,
        shake: true,
        sequence: true,
        parallax: true,
        bounds: true
    };
    const ox = config ? config.x : 4;
    const oy = config ? config.y : 4;
    const panelW = 260;

    ctx.save();
    ctx.font = FONT;

    // -- Pass 1: count lines to size the background --
    let lineCount = 0;

    if (show.position) lineCount += 2;
    if (show.zoom) lineCount += 1;
    if (show.mode) lineCount += 1;

    if (show.shake) {
        const sh = cam._shake;
        if (sh.active) {
            lineCount += 1; // header
            for (let i = 0; i < sh.slotCount; i++) {
                if (sh.slots[i].active) lineCount++;
            }
        }
    }

    if (show.sequence && cam._seq && cam._seq.playing) lineCount += 1;

    // CP-22: _parallax is null until withParallax attaches. withDebug alone must
    // not crash the HUD -- null skips the parallax panel (same as activeCount 0).
    if (show.parallax && cam._parallax !== null && cam._parallax.activeCount > 0) {
        lineCount += 1;
        for (let i = 0; i < cam._parallax.layerCount; i++) {
            if (cam._parallax.layers[i].active) lineCount++;
        }
    }

    if (show.bounds) {
        const b = cam._bounds;

        if (b.left !== BoundsType.HARD ||
            b.right !== BoundsType.HARD ||
            b.top !== BoundsType.HARD ||
            b.bottom !== BoundsType.HARD) {
            lineCount += 1;
        }
    }

    if (lineCount === 0) {
        ctx.restore();
        return;
    }

    // -- Background --
    ctx.fillStyle = BG;
    ctx.fillRect(ox, oy, panelW, lineCount * LINE_H + PAD * 2);

    // -- Pass 2: draw directly, no intermediate objects --
    let row = 0;
    const textX = ox + PAD;
    const baseY = oy + PAD;

    if (show.position) {
        ctx.fillStyle = COL_DIM;
        ctx.fillText(`pos  ${cam.pos[0].toFixed(1)}, ${cam.pos[1].toFixed(1)}`, textX, baseY + row * LINE_H);
        row++;
        ctx.fillText(`tgt  ${cam.target[0].toFixed(1)}, ${cam.target[1].toFixed(1)}`, textX, baseY + row * LINE_H);
        row++;
    }

    if (show.zoom) {
        ctx.fillStyle = COL_YELLOW;
        ctx.fillText(`zoom ${cam.zoom.toFixed(3)}  vis ${cam.visibleW.toFixed(0)}×${cam.visibleH.toFixed(0)}`, textX, baseY + row * LINE_H);
        row++;
    }

    if (show.mode) {
        ctx.fillStyle = COL_CYAN;
        ctx.fillText(`mode ${MODE_NAMES[cam.mode] || '?'}`, textX, baseY + row * LINE_H);
        row++;
    }

    if (show.shake) {
        const sh = cam._shake;
        if (sh.active) {
            let actSlots = 0, mxT = 0;
            for (let i = 0; i < sh.slotCount; i++) {
                if (sh.slots[i].active) {
                    actSlots++;
                    if (sh.slots[i].trauma > mxT) mxT = sh.slots[i].trauma;
                }
            }
            ctx.fillStyle = COL_RED;
            ctx.fillText(`shake ${actSlots} slot${actSlots > 1 ? 's' : ''} trauma=${mxT.toFixed(2)}`, textX, baseY + row * LINE_H);
            row++;

            for (let i = 0; i < sh.slotCount; i++) {
                const s = sh.slots[i];
                if (!s.active) continue;
                const col = s.isDirectional ? COL_PURPLE : COL_RED;
                ctx.fillStyle = col;
                ctx.fillText(`  \u251C t=${s.trauma.toFixed(2)} f=${s.freq} d=${s.decay.toFixed(1)}${s.isDirectional ? ' dir' : ''}`, textX, baseY + row * LINE_H);
                // Trauma bar
                const barX = ox + panelW - 70;
                const barY = baseY + row * LINE_H - 8;
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(barX, barY, 60, 7);
                ctx.fillStyle = col;
                ctx.fillRect(barX, barY, 60 * s.trauma, 7);
                row++;
            }
        }
    }

    if (show.sequence && cam._seq && cam._seq.playing) {
        const progress = cam._seq.progress;
        ctx.fillStyle = COL_PURPLE;
        ctx.fillText(`seq  ${(progress * 100).toFixed(0)}%`, textX, baseY + row * LINE_H);
        const barX = ox + panelW - 70;
        const barY = baseY + row * LINE_H - 8;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(barX, barY, 60, 7);
        ctx.fillStyle = COL_PURPLE;
        ctx.fillRect(barX, barY, 60 * progress, 7);
        row++;
    }

    // CP-22: null _parallax (withDebug without withParallax) skips the panel.
    if (show.parallax && cam._parallax !== null && cam._parallax.activeCount > 0) {
        ctx.fillStyle = COL_GREEN;
        ctx.fillText(`parallax ${cam._parallax.activeCount} layers`, textX, baseY + row * LINE_H);
        row++;
        for (let i = 0; i < cam._parallax.layerCount; i++) {
            const l = cam._parallax.layers[i];
            if (!l.active) continue;
            ctx.fillStyle = COL_DIM;
            ctx.fillText(`  \u251C ${l.id} speed=${l.speedX.toFixed(1)}`, textX, baseY + row * LINE_H);
            row++;
        }
    }

    if (show.bounds) {
        const b = cam._bounds;

        if (b.left !== BoundsType.HARD ||
            b.right !== BoundsType.HARD ||
            b.top !== BoundsType.HARD ||
            b.bottom !== BoundsType.HARD) {
            ctx.fillStyle = COL_CYAN;
            ctx.fillText(`bounds L:${BOUNDS_NAMES[b.left]} R:${BOUNDS_NAMES[b.right]} T:${BOUNDS_NAMES[b.top]} B:${BOUNDS_NAMES[b.bottom]}`, textX, baseY + row * LINE_H);
            row++;
        }
    }

    ctx.restore();
}

/**
 * Draw world-space debug overlay (deadzone rect, lookahead vector, world bounds).
 * Call INSIDE ctx.save()/apply()/restore(), in camera-transformed space.
 *
 * @param {CinematicCameraPro} cam
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} [config]  HUD config
 */
export function drawDebugWorld(cam, ctx, config) {
    const show = config ? config.show : {deadzone: true, lookahead: true};

    ctx.save();

    const cx = cam.target[0] - cam.pos[0] + cam.visibleW * 0.5;
    const cy = cam.target[1] - cam.pos[1] + cam.visibleH * 0.5;

    // -- Deadzone rectangle --
    if (show.deadzone !== false) {
        ctx.strokeStyle = 'rgba(251,191,36,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            cx - cam.deadzoneX,
            cy - cam.deadzoneY,
            cam.deadzoneX * 2,
            cam.deadzoneY * 2
        );

        // Center crosshair
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx + 6, cy);
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx, cy + 6);
        ctx.stroke();
    }

    // -- Lookahead vector --
    if (show.lookahead !== false) {
        const lx = cam.look[0];
        const ly = cam.look[1];
        const len = Math.sqrt(lx * lx + ly * ly);
        if (len > 1) {
            ctx.strokeStyle = COL_CYAN;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + lx, cy + ly);
            ctx.stroke();

            // Arrowhead
            const angle = Math.atan2(ly, lx);
            const aLen = 6;
            ctx.beginPath();
            ctx.moveTo(cx + lx, cy + ly);
            ctx.lineTo(cx + lx - aLen * Math.cos(angle - 0.4), cy + ly - aLen * Math.sin(angle - 0.4));
            ctx.moveTo(cx + lx, cy + ly);
            ctx.lineTo(cx + lx - aLen * Math.cos(angle + 0.4), cy + ly - aLen * Math.sin(angle + 0.4));
            ctx.stroke();
        }
    }

    // -- World bounds outline --
    ctx.strokeStyle = 'rgba(239,68,68,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, cam.worldW, cam.worldH);

    ctx.restore();
}

/**
 * Attach the debug subsystem to one camera (v2.0.0 detach, CP-22/D1).
 * The class ships debug()/debugHUD() as fail-closed stubs; this restores the
 * real behavior per-instance -- own-property install only, never prototype
 * mutation -- and builds the DebugHUDConfig the constructor no longer
 * allocates. Single-shot: a second attach throws ERR_ALREADY_ATTACHED.
 * destroy() is the only exit (it rebinds these to its sentinel).
 *
 * @param {Object} cam  A CinematicCameraPro instance
 * @returns {Object} cam, for chaining
 * @throws {Error} code "ERR_ALREADY_ATTACHED" if debug is already attached
 */
export function withDebug(cam) {
    // Destroyed beats unattached (QA-1): a corpse is Object.hasOwn(cam, 'update')
    // (destroy() rebinds update as an own-property). Fail closed before attaching.
    if (Object.hasOwn(cam, 'update')) {
        const e = new Error("CinematicCameraPro: use after destroy()");
        e.code = "ERR_CAMERA_DESTROYED";
        throw e;
    }
    if (cam.debugConfig !== null) {
        const e = new Error("CinematicCameraPro: debug already attached. " +
            "withDebug(camera) is per-instance and single-shot.");
        e.code = "ERR_ALREADY_ATTACHED";
        throw e;
    }
    cam.debugConfig = createDebugHUDConfig();
    cam.debug = function (ctx) {
        drawDebugWorld(this, ctx, this.debugConfig);
    };
    cam.debugHUD = function (ctx) {
        drawDebugHUD(this, ctx, this.debugConfig);
    };
    return cam;
}

export default drawDebugHUD;
