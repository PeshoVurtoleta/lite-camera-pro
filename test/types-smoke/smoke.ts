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
    setSoftZone,
    applyBounds,
    clampToBounds,
    BoundsType,
    type BoundsState,
} from '@zakkster/lite-camera-pro/bounds';

const bounds: BoundsState = createBoundsState();
setBoundsAll(bounds, BoundsType.SOFT);
setSoftZone(bounds, 120, 40, 8);
const target = new Float32Array([0, 0]);
const pos = new Float32Array([0, 0]);
applyBounds(bounds, target, pos, 1000, 800, 800, 600, 1 / 60);
clampToBounds(bounds, target, pos, 1000, 800, 800, 600);
const custom: boolean = bounds.customBounds;
void custom;

// PRO4 tile opts on parallax layers.
addParallaxLayer(px, 'fg', 1.2, 1.2, { wrap: WrapMode.REPEAT_BOTH, tileW: 256, tileH: 256 });

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

// -- main entry: class + VERSION + the 22-name functional layer (D5) ---------
// v2.0.0 detach: createCameraSequence is NO LONGER at "." -- it comes from the
// ./sequence subpath; presets come from ./shake; withX from the subpaths.
import CinematicCameraPro, {
    VERSION,
    FollowMode,
    type CameraAttachErrorCode,
    type CameraDoorErrorCode,
    type CameraProSink,
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

// -- PRO4 surface: resize, the three base-shake bridge accessors, the four new
//    door codes, and the readonly-dims trap. -------------------------------
cam.resize(1600, 1200, 3200, 2400);
cam.setSoftZone(80);
cam.shakeMaxOffset = 60;
cam.shakeMaxAngle = 0.08;
cam.shakeTrauma = 0.5;
const trauma: number = cam.shakeTrauma;
const visW: number = cam.visibleW;
// Each of the four new codes is assignable to the door-code union.
const c1: CameraDoorErrorCode = 'ERR_CAMERA_BOUNDS';
const c2: CameraDoorErrorCode = 'ERR_PARALLAX_TILE';
const c3: CameraDoorErrorCode = 'ERR_SHAKE_PROFILE';
const c4: CameraDoorErrorCode = 'ERR_CAMERA_SHAKE';
// Dims are readonly (match the base): resize() is the only blessed write path.
// @ts-expect-error viewW is readonly -- write it only through resize().
cam.viewW = 100;

// -- apply(ctx: CameraProSink): the sink contract (note B) -------------------
// (a) A CanvasRenderingContext2D structurally satisfies CameraProSink.
declare const canvasCtx: CanvasRenderingContext2D;
cam.apply(canvasCtx);
// (b) So does any three-method recorder object (translate + rotate + scale).
const recorder: CameraProSink = {
    translate(x: number, y: number): void { void x; void y; },
    rotate(a: number): void { void a; },
    scale(x: number, y: number): void { void x; void y; },
};
cam.apply(recorder);
// (c) NEGATIVE CASE (documented, kept commented): a two-method sink missing
// scale() is NOT a CameraProSink and must fail to compile. Verified once by
// uncommenting -- tsc errors on the absent scale property -- then re-commented.
// cam.apply({
//     translate(x: number, y: number): void { void x; void y; },
//     rotate(a: number): void { void a; },
// });

void version; void dur; void zoom; void cfg; void errCode;
void trauma; void visW; void c1; void c2; void c3; void c4;
