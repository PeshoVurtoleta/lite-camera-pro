// test/size.mjs -- subpath weight gate.
//
// Bundles every JS subpath entry with the esbuild JS API (format=esm,
// minify=false, tree-shaken), gzips at level 9, and prints raw + gz KB per
// subpath. The charter budget is ./shake gz <= 16384 bytes -- FIXED, never
// widened. For ./shake it also reports the byte share the bundle draws from
// lite-noise's Noise.js (the tree-shaking proof). Exit 1 on any breach.
//
// Upstream trigger: if Noise.js contributes >= 50% of its 39,613 B source to
// the ./shake bundle, tree-shaking through lite-noise has regressed -- file
// ../LiteNoise/BRIEF-shake-subpath.md with the numbers (record, do not build).

import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// The 7 JS subpath entries (package.json "exports" targets; not package.json).
const ENTRIES = [
    ['.',          'src/index.js'],
    ['./shake',    'src/Shake.js'],
    ['./parallax', 'src/ParallaxManager.js'],
    ['./bounds',   'src/BoundsSystem.js'],
    ['./multi',    'src/MultiTarget.js'],
    ['./follow',   'src/FollowMode.js'],
    ['./sequence', 'src/CameraSequence.js'],
];

const SHAKE_GZ_BUDGET = 16384;      // bytes -- charter number, fixed.
const NOISE_SOURCE_BYTES = 39613;   // Noise.js source size.
const NOISE_SHARE_TRIGGER = 0.5;    // >= 50% -> upstream regression.

const kb = (n) => (n / 1024).toFixed(2) + ' KB';

let breached = false;

async function measure(name, rel) {
    const result = await build({
        entryPoints: [join(root, rel)],
        bundle: true,
        format: 'esm',
        minify: false,
        metafile: true,
        write: false,
        outfile: 'out.js',
        logLevel: 'silent',
    });

    const out = result.outputFiles[0];
    const raw = out.contents.length;
    const gz = gzipSync(Buffer.from(out.contents), { level: 9 }).length;

    // Noise.js contribution (bytesInOutput, post tree-shaking).
    let noiseBytes = 0;
    const outputs = result.metafile.outputs;
    for (const key of Object.keys(outputs)) {
        const inputs = outputs[key].inputs;
        for (const ipath of Object.keys(inputs)) {
            // Match the lite-noise sampler whether resolved through a real
            // node_modules install (.../lite-noise/Noise.js) or a dev symlink
            // to the sibling working tree (../LiteNoise/Noise.js).
            if (/(^|\/)Noise\.js$/.test(ipath) && /lite-noise|LiteNoise/.test(ipath)) {
                noiseBytes += inputs[ipath].bytesInOutput || 0;
            }
        }
    }

    return { name, raw, gz, noiseBytes };
}

const rows = [];
for (const [name, rel] of ENTRIES) {
    rows.push(await measure(name, rel));
}

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
process.stdout.write('subpath weights (esbuild esm, minify=false, gzip -9):\n');
for (const r of rows) {
    let line = '  ' + pad(r.name, 11) + ' raw ' + pad(kb(r.raw), 9) + ' gz ' + kb(r.gz);
    if (r.name === './shake') {
        const share = ((r.noiseBytes / NOISE_SOURCE_BYTES) * 100).toFixed(1);
        line += '   [Noise.js in bundle: ' + r.noiseBytes + ' B, ' + share +
            '% of ' + NOISE_SOURCE_BYTES + ' B source]';
    }
    process.stdout.write(line + '\n');
}

const shake = rows.find((r) => r.name === './shake');

if (shake.gz > SHAKE_GZ_BUDGET) {
    process.stderr.write(
        'size: FAIL -- ./shake gz ' + shake.gz + ' B exceeds budget ' +
        SHAKE_GZ_BUDGET + ' B\n');
    breached = true;
}

if (shake.noiseBytes >= NOISE_SOURCE_BYTES * NOISE_SHARE_TRIGGER) {
    process.stderr.write(
        'size: UPSTREAM -- Noise.js contributes ' + shake.noiseBytes +
        ' B (>= 50% of ' + NOISE_SOURCE_BYTES + ' B). File ' +
        '../LiteNoise/BRIEF-shake-subpath.md.\n');
    breached = true;
}

if (breached) {
    process.exit(1);
}

process.stdout.write(
    'size: ok -- ./shake gz ' + shake.gz + ' B <= ' + SHAKE_GZ_BUDGET + ' B\n');
process.exit(0);
