// test/types-smoke/smoke.ts -- typed smoke over every subpath + the main entry.
//
// Every result is bound to a typed const so an `any` leak or a missing/wrong
// declaration fails tsc under strict + noImplicitAny + node16 resolution.
// This file is never bundled or shipped -- test/ is outside the tarball.

// -- ./shake: four hot functions + a preset + the ShakeState type ------------
import {
    createShakeState,
    addShake,
    updateShake,
    computeShake,
    getPreset,
    IMPACT,
    type ShakeState,
    type ShakeProfile,
} from '@zakkster/lite-camera-pro/shake';

const shake: ShakeState = createShakeState(42);
const impact: Readonly<ShakeProfile> = IMPACT;
addShake(shake, impact, 0.8);
updateShake(shake, 1 / 60);
computeShake(shake);
const ox: number = shake.offsetX;
const active: boolean = shake.active;
const preset: Readonly<ShakeProfile> | null = getPreset('impact');
const presetName: string = preset === null ? 'none' : String(preset.trauma);
void ox; void active; void presetName;

// -- ./parallax --------------------------------------------------------------
import {
    createParallaxState,
    addParallaxLayer,
    updateParallax,
    getLayerScroll,
    WrapMode,
    type ParallaxState,
    type ScrollOut,
} from '@zakkster/lite-camera-pro/parallax';

const px: ParallaxState = createParallaxState();
addParallaxLayer(px, 'bg', 0.5, 0.5, { wrap: WrapMode.REPEAT_X });
updateParallax(px, 100, 50, 1);
const out: ScrollOut = { x: 0, y: 0 };
const scroll: ScrollOut | null = getLayerScroll(px, 'bg', out);
const scrollX: number = scroll === null ? 0 : scroll.x;
void scrollX;

// -- ./bounds ----------------------------------------------------------------
import {
    createBoundsState,
    setBoundsAll,
    applyBounds,
    BoundsType,
    type BoundsState,
} from '@zakkster/lite-camera-pro/bounds';

const bounds: BoundsState = createBoundsState();
setBoundsAll(bounds, BoundsType.SOFT);
const target = new Float32Array([0, 0]);
const pos = new Float32Array([0, 0]);
applyBounds(bounds, target, pos, 1000, 800, 800, 600, 1 / 60);
const custom: boolean = bounds.customBounds;
void custom;

// -- ./multi -----------------------------------------------------------------
import {
    createMultiTargetState,
    type MultiTargetState,
    type Vec2,
} from '@zakkster/lite-camera-pro/multi';

const mt: MultiTargetState = createMultiTargetState();
const points: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
mt.targets = points;
const mtCount: number = mt.count;
void mtCount;

// -- main entry: class + VERSION + the 20-name functional layer (D5) ---------
// v2.0.0 detach: createCameraSequence is NO LONGER at "." -- it comes from the
// ./sequence subpath; presets come from ./shake; withX from the subpaths.
import CinematicCameraPro, {
    VERSION,
    FollowMode,
    type CameraAttachErrorCode,
} from '@zakkster/lite-camera-pro';
import { withSequences, type CameraSequence } from '@zakkster/lite-camera-pro/sequence';
import { withParallax } from '@zakkster/lite-camera-pro/parallax';
import { withDebug, createDebugHUDConfig, type DebugHUDConfig } from '@zakkster/lite-camera-pro/debug';

const version: string = VERSION;
const cam = new CinematicCameraPro(800, 600, 3200, 2400, 42);
cam.setMode(FollowMode.HYBRID);
// Preset migration idiom (D4): getPreset from ./shake, guarded, then shake().
const p = getPreset('impact');
if (p) cam.shake(p, 0.8);
cam.update(1 / 60, 400, 300);

// Attach idioms return the camera for chaining; each is single-shot.
withDebug(withSequences(withParallax(cam)));
const seq: CameraSequence = cam.createSequence();
seq.moveTo(100, 100, 500).play();
const cfg: DebugHUDConfig = createDebugHUDConfig();
const errCode: CameraAttachErrorCode = 'ERR_ALREADY_ATTACHED';
const dur: number = seq.duration;
const zoom: number = cam.zoom;
void version; void dur; void zoom; void cfg; void errCode;
