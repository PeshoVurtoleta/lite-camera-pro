// =============================================================================
// bundle-literals.test.js -- G2, the CP-23 literal probe.
//   CP-23 doctrine: prove a bundle's contents with LITERALS a bundler cannot
//   rename, never with identifiers a minifier would mangle. esbuild-bundles the
//   root entry into the SESSION SCRATCHPAD (never the repo) and asserts the
//   bundle TEXT lacks three fingerprints unique to the detached subsystems:
//     '#fbbf24'      -- DebugHUD.js palette (COL_YELLOW)
//     'heavy_impact' -- ShakePresets.js registry key
//     'moveAndZoom'  -- CameraSequence.js builder step kind
//   Positive control: a fixture entry that attaches all three withX CONTAINS all
//   three, so the probe is not vacuously passing. An identifier assertion in
//   this file would be a review rejection. ASCII-only.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcIndex = join(root, 'src', 'index.js');

// Session scratchpad -- bundle artifacts NEVER land in the repo (CP-23 / owner
// addenda). Falls back to an OS tmp dir if the pinned scratchpad is absent.
const SCRATCH = process.env.CAMPRO_SCRATCH ||
    '/private/tmp/claude-502/-Users-zakkster-Work-Portfolio-LiteLibrariesSuite-LiteCameraPro/' +
    'b6477edb-0fb0-4865-80a8-3038fe3e0e51/scratchpad';

const PROBES = ['#fbbf24', 'heavy_impact', 'moveAndZoom'];

function scratchDir() {
    try {
        return mkdtempSync(join(SCRATCH, 'g2-'));
    } catch {
        return mkdtempSync(join(tmpdir(), 'campro-g2-'));
    }
}

async function bundleText(entryFile, outName) {
    const outfile = join(scratchDir(), outName);
    await build({
        entryPoints: [entryFile],
        bundle: true,
        format: 'esm',
        minify: false,
        outfile,
        logLevel: 'silent',
    });
    return readFileSync(outfile, 'utf8');
}

test('G2: the "." bundle contains NONE of the detached-subsystem literals', async () => {
    const text = await bundleText(srcIndex, 'root.bundle.js');
    for (const p of PROBES) {
        assert.equal(text.includes(p), false,
            'root bundle still contains ' + JSON.stringify(p) +
            ' -- a detached subsystem is reachable from "."');
    }
});

test('G2 positive control: an all-attached fixture bundle contains ALL three literals', async () => {
    // Reference each detached module through its withX attach + one real call,
    // so a working walker keeps their code (and the fingerprints) in the bundle.
    const fixtureSrc =
        "import CinematicCameraPro from " + JSON.stringify(join(root, 'src', 'index.js')) + ";\n" +
        "import { withParallax } from " + JSON.stringify(join(root, 'src', 'ParallaxManager.js')) + ";\n" +
        "import { withSequences } from " + JSON.stringify(join(root, 'src', 'CameraSequence.js')) + ";\n" +
        "import { withDebug } from " + JSON.stringify(join(root, 'src', 'DebugHUD.js')) + ";\n" +
        "import { getPreset } from " + JSON.stringify(join(root, 'src', 'ShakePresets.js')) + ";\n" +
        "const cam = withDebug(withSequences(withParallax(new CinematicCameraPro(1, 1, 1, 1))));\n" +
        "const seq = cam.createSequence();\n" +
        "seq.moveAndZoom(0, 0, 1, 100);\n" +
        "const p = getPreset('heavy_impact');\n" +
        "globalThis.__sink = [cam, seq, p];\n";
    const fixtureFile = join(scratchDir(), 'attached-fixture.js');
    writeFileSync(fixtureFile, fixtureSrc);
    const text = await bundleText(fixtureFile, 'attached.bundle.js');
    for (const p of PROBES) {
        assert.equal(text.includes(p), true,
            'attached control bundle is MISSING ' + JSON.stringify(p) +
            ' -- the probe would pass vacuously');
    }
    // Anti-vacuity for the control itself: two of the PROBES ('heavy_impact',
    // 'moveAndZoom') are also TYPED in the fixture source above, so they would
    // survive even if the subsystem bodies were tree-shaken away. These extra
    // literals live ONLY in the module bodies and are never typed by the
    // fixture, so their presence proves the bodies are genuinely retained:
    //   'earthquake' -- a ShakePresets.js registry entry (kept via getPreset)
    //   'blendOutTime must be a finite number' -- the CameraSequence.js
    //     options-door message (kept via createCameraSequence). NOT the
    //     'ERR_SEQUENCE_OPTIONS' code string: that also survives in a JSDoc
    //     comment of the always-bundled class file, so it cannot prove the
    //     sequence body shipped (reviewer finding, PRO6).
    const BODY_ONLY = ['earthquake', 'blendOutTime must be a finite number'];
    // A valid body-only probe must clear the ROOT bundle too -- a probe that
    // rides along in "." (e.g. inside a comment) proves nothing about the
    // attached control. This assertion is what catches such contamination.
    const rootText = await bundleText(srcIndex, 'root-for-control.bundle.js');
    for (const p of BODY_ONLY) {
        assert.equal(fixtureSrc.includes(p), false,
            'fixture must not type body-only probe ' + JSON.stringify(p));
        assert.equal(rootText.includes(p), false,
            'body-only probe ' + JSON.stringify(p) +
            ' leaks into the "." bundle -- pick a literal unique to the subsystem body');
        assert.equal(text.includes(p), true,
            'attached control bundle is MISSING body-only literal ' + JSON.stringify(p) +
            ' -- the subsystem body was tree-shaken, so the control is vacuous');
    }
});
