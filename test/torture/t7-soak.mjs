/**
 * T7 -- soak + retention.
 *
 * leak_cycles of construct / drive / destroy churn under lite-leak's
 * owner-cascade kernel. After the churn, with every camera dropped and the heap
 * settled, the tracker must return to size 0 and audit() must find nothing:
 * every camera collected, nothing outlived its owner. Only the owner-cascade
 * kernel is registered -- the camera patches no timer / listener / observer /
 * async surface of its own, so the other kernels would only ever flag this
 * harness's setTimeout settle ticks.
 *
 * The gate reads the two RETENTION facts: `size()` (tracked objects still live)
 * and `audit()` (live orphans). It does NOT gate on the onLeak channel -- that
 * fires on EVERY finalization, clean collections included (kind 'unknown'), so
 * its count is a timing artifact of when the FinalizationRegistry drains, not a
 * leak signal. onLeak is captured only to enrich a failure message.
 *
 * lite-leak contract: neither the `cleanup` closure nor the `tag` may close over
 * the tracked camera, or finalization is defeated. `releaseNoop` closes over
 * nothing; the tag is a bare string.
 *
 * NOTE (CP-5, PRO3 -- NOT exercised here): playing a sequence and then
 * stopSequence()'ing it leaks the shared-ticker refcount (lite-timeline releases
 * it only in timeline.destroy()); the retained ticker pins the timeline, whose
 * step closures capture the camera -- a genuine camera-retention leak that keeps
 * size() above 0. This tier deliberately does NOT play sequences, because CP-5 is
 * out of PRO0 scope. When PRO3 makes stopSequence() destroy the timeline, this
 * tier gains a play/stop/destroy variant plus the ticker-refcount conservation
 * gate stubbed below.
 */

import {
    createLeakTracker,
    createOwnerCascadeOrphanKernel,
} from '@zakkster/lite-leak';
import { effect, dispose } from '@zakkster/lite-signal';
import { CinematicCameraPro } from '../../src/index.js';
import { noopSink, check } from './harness.mjs';

const CYCLES = 4096; // leak_cycles

// cleanup + tag must NOT close over the camera (that defeats finalization).
function releaseNoop() { /* cameras own only detached typed arrays + pooled state */ }

export async function run() {
    const leaks = [];
    const tracker = createLeakTracker({
        name: 'campro-soak',
        onLeak: (r) => leaks.push(r.kind + ':' + String(r.tag)),
        onWarning: () => {},
    });
    tracker.registerKernel(createOwnerCascadeOrphanKernel());

    for (let i = 0; i < CYCLES; i++) {
        const owner = effect(() => {
            const cam = new CinematicCameraPro(800, 600, 3200, 2400, i & 255);
            cam.addTrauma(1.0);
            cam.shakePreset('impact', 0.7 + (i & 7) * 0.03);
            cam.addParallaxLayer('bg', 0.4);
            cam.update(1 / 60, 100 + i, 80 + (i & 63));
            cam.apply(noopSink);
            cam.applyParallax('bg', noopSink);
            tracker.track(cam, releaseNoop, 'camera', { audit: true });
            cam.destroy();
        });
        dispose(owner);
    }

    // Two GC + settle passes: the FinalizationRegistry drains best-effort, so a
    // single pass can leave stragglers that are already unreachable.
    globalThis.gc?.();
    await new Promise((r) => setTimeout(r, 50));
    globalThis.gc?.();
    await new Promise((r) => setTimeout(r, 50));

    const live = tracker.size();
    const findings = tracker.audit();

    check(live === 0, () => `T7: tracker retained ${live} camera(s) after ${CYCLES} cycles` +
        (leaks.length ? ' (onLeak samples: ' + leaks.slice(0, 3).join(', ') + ')' : ''));
    check(findings.length === 0, () => `T7: ${findings.length} retention finding(s): ` +
        findings.map((f) => f.kind + ':' + f.reason).join(', '));

    // TODO(PRO3, CP-5): once stopSequence() destroys the timeline, add a
    // play/stop/destroy variant AND assert the shared-ticker refcount returns to
    // zero. Both fail today (stopSequence leaks the ticker, retaining the camera),
    // so neither is asserted in PRO0.
}
