/**
 * @zakkster/lite-camera-pro -- torture gate.
 *
 * The DONE-WHEN of every session is a single command:
 *
 *     node --expose-gc test/torture.mjs        -> prints exactly "ok", exit 0
 *     npm run torture
 *
 * Ten tiers share one shape (roadmap section 3). PRO0 stands up the harness and
 * wires the tiers this session needs:
 *
 *     T0  metamorphic laws            T1  degenerate values (THIN, known-bad pins)
 *     T4  lifecycle / handle abuse    T6  the zero-alloc gate
 *     T7  soak + retention            T9  controls (must be able to fail)
 *
 * T3 (adversarial), T5 (fuzz) and T8 (cross-package) are registered EMPTY --
 * present so the roster is stable and later sessions fill them in place.
 *
 * lite-gc-profiler is one-measurement-at-a-time, so tiers run STRICTLY
 * SEQUENTIALLY -- never nested, never concurrent.
 *
 * Controls: `CAMPRO_TORTURE_BREAK=1 node --expose-gc test/torture.mjs` injects
 * retained allocations into the T6 hot loop and must exit non-zero. A gate that
 * cannot fail is decorative.
 *
 * Peers (lite-gc-profiler, lite-leak, lite-signal) are devDependencies only.
 *
 * @license MIT
 */

import { SEED, BREAK } from './torture/harness.mjs';
import { run as t0 } from './torture/t0-laws.mjs';
import { run as t1 } from './torture/t1-degenerate.mjs';
import { run as t3 } from './torture/t3-adversarial.mjs';
import { run as t4 } from './torture/t4-handles.mjs';
import { run as t5 } from './torture/t5-fuzz.mjs';
import { run as t6 } from './torture/t6-alloc.mjs';
import { run as t7 } from './torture/t7-soak.mjs';
import { run as t8 } from './torture/t8-cross.mjs';
import { run as t9 } from './torture/t9-controls.mjs';

const TIERS = [
    ['T0 laws', t0],
    ['T1 degenerate', t1],
    ['T3 adversarial', t3],
    ['T4 handles', t4],
    ['T5 fuzz', t5],
    ['T6 alloc', t6],
    ['T7 soak', t7],
    ['T8 cross', t8],
    ['T9 controls', t9],
];

async function main() {
    if (typeof globalThis.gc !== 'function') {
        process.stderr.write(
            'torture: FAIL -- run with --expose-gc:  node --expose-gc test/torture.mjs\n');
        process.exit(1);
    }

    for (const [name, run] of TIERS) {
        try {
            await run();
        } catch (err) {
            // Tiers normally fail via die() (which exits). A thrown error is an
            // unexpected fault -- surface it with the replay seed and stop.
            process.stderr.write(
                'torture: FAIL -- ' + name + ' threw: ' + (err && err.stack || err) +
                '\n  replay: TORTURE_SEED=' + SEED + ' node --expose-gc test/torture.mjs\n');
            process.exit(1);
        }
    }

    // Reaching here in BREAK mode means T6's control did not trip -- a fault.
    if (BREAK) {
        process.stderr.write('torture: FAIL -- CAMPRO_TORTURE_BREAK set but the gate still passed\n');
        process.exit(1);
    }

    process.stdout.write('ok\n');
    process.exit(0);
}

main();
