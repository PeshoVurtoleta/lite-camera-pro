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
import { noopSink, check, rafCount, pumpRaf } from './harness.mjs';

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

    // -- CP-5 play/stop/destroy churn + shared-ticker conservation gate -------
    // PRO3 made stop() destroy the timeline (releasing the shared-ticker
    // refcount). Play a sequence, STOP it, and drop the camera, N times: every
    // stop must release the ticker it acquired. The RAF polyfill is store-only,
    // so the timeline never advances on its own -- but pumping the stored
    // callback drives lite-ticker's _tick, which RE-REQUESTS a frame only while
    // the ticker is still running. So after every sequence is stopped and the
    // shared ticker released (destroyed), pumping four times must NOT grow the
    // request count. Pre-fix (stop() == reset()) the ticker stays live and each
    // pump re-requests -- the gate would flag it.
    {
        const churnLeaks = [];
        const ctracker = createLeakTracker({
            name: 'campro-cp5',
            onLeak: (r) => churnLeaks.push(r.kind + ':' + String(r.tag)),
            onWarning: () => {},
        });
        ctracker.registerKernel(createOwnerCascadeOrphanKernel());

        const N = 512;
        for (let i = 0; i < N; i++) {
            const owner = effect(() => {
                const cam = new CinematicCameraPro(800, 600, 3200, 2400, i & 255);
                const seq = cam.createSequence({ blendOutTime: 0.3 })
                    .moveTo(400 + (i & 63), 300, 1000)
                    .zoomTo(1.5, 800)
                    .shake('impact');
                cam.playSequence(seq); // acquires a timeline (ticker ref +1)
                seq.stop();            // MUST destroy the timeline (ref -1, CP-5)
                ctracker.track(cam, releaseNoop, 'cp5-camera', { audit: true });
                cam.destroy();
            });
            dispose(owner);
        }

        globalThis.gc?.();
        await new Promise((r) => setTimeout(r, 50));
        globalThis.gc?.();
        await new Promise((r) => setTimeout(r, 50));

        const clive = ctracker.size();
        const cfindings = ctracker.audit();
        check(clive === 0, () => `T7 CP-5: tracker retained ${clive} camera(s) after ${N} play/stop/destroy cycles` +
            (churnLeaks.length ? ' (onLeak: ' + churnLeaks.slice(0, 3).join(', ') + ')' : ''));
        check(cfindings.length === 0, () => `T7 CP-5: ${cfindings.length} retention finding(s): ` +
            cfindings.map((f) => f.kind + ':' + f.reason).join(', '));

        // Ticker conservation: no live ticker may be left re-requesting frames.
        const c0 = rafCount();
        pumpRaf(); pumpRaf(); pumpRaf(); pumpRaf();
        check(rafCount() === c0, () => `T7 CP-5 conservation: rafCount grew by ${rafCount() - c0} across 4 pumps ` +
            `after stop()+destroy() -- a shared ticker was not released (CP-5 leak)`);
    }
}
