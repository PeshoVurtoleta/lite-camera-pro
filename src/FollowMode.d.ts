/**
 * @zakkster/lite-camera-pro/follow -- TypeScript declarations.
 *
 * Follow-mode enum and the strategy dispatch table. Complete runtime surface,
 * no `any`.
 */

import type { CinematicCameraPro } from './index.js';

// -- Follow modes --
export declare const FollowMode: {
    readonly SMOOTH: 0;
    readonly LOCK: 1;
    readonly PREDICTIVE: 2;
    readonly CUT: 3;
    readonly HYBRID: 4;
};

// -- Strategy dispatch table, indexed by FollowMode value --
export declare const FOLLOW_STRATEGIES: ReadonlyArray<
    (cam: CinematicCameraPro, dt: number, px: number, py: number, pvx: number, pvy: number) => void
>;

declare const _default: typeof FollowMode;
export default _default;
