// =============================================================================
// import-graph.test.js -- G1, the v2.0.0 detach proof (CP-21/CP-22/CP-23).
//   A bundler cannot drop a reachable class method, so absence must be proven at
//   the SOURCE-GRAPH level, not inferred from a bundle. This walks the static
//   `from '...'` specifiers transitively from src/index.js (pure fs + regex, no
//   bundler, no dynamic import in src/) and asserts the four detached modules
//   and @zakkster/lite-timeline are UNREACHABLE. Positive control: the same walk
//   seeded at src/CameraSequence.js DOES reach lite-timeline, so the walker is
//   not vacuously passing. ASCII-only. node:test + node:assert/strict only.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');

// Static import/export-from specifier. Matches `import ... from '<spec>'` and
// `export ... from '<spec>'`; ignores bare `import x` (no from) and comments are
// not stripped, but a `from '...'` inside a line comment would be a false edge --
// none exist in src/ (asserted implicitly by the severance passing).
const FROM_RE = /(?:^|[^.\w])(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;

// Walk the transitive relative-import graph from an entry file. Returns a Set of
// resolved local file paths visited plus 'pkg:<specifier>' markers for every
// bare (node_modules) specifier encountered anywhere in the graph.
function reachable(entryAbs) {
    const seen = new Set();
    const pkgs = new Set();
    const stack = [entryAbs];
    while (stack.length) {
        const file = stack.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        let src;
        try {
            src = readFileSync(file, 'utf8');
        } catch {
            continue; // a resolved path that is not a real file: ignore
        }
        FROM_RE.lastIndex = 0;
        let m;
        while ((m = FROM_RE.exec(src)) !== null) {
            const spec = m[1];
            if (spec.startsWith('.')) {
                stack.push(resolve(dirname(file), spec));
            } else {
                pkgs.add('pkg:' + spec);
            }
        }
    }
    return { files: seen, pkgs };
}

const DETACHED = ['ShakePresets.js', 'CameraSequence.js', 'ParallaxManager.js', 'DebugHUD.js'];
const TIMELINE = 'pkg:@zakkster/lite-timeline';

test('G1: src/index.js reaches none of the four detached modules', () => {
    const { files } = reachable(join(srcDir, 'index.js'));
    // Anti-vacuity FIRST: src/index.js is composed entirely of `export { x }
    // from '...'` lines, so if FROM_RE's export-from branch ever regresses the
    // walk would visit only index.js itself and the four absence checks below
    // would pass VACUOUSLY while green. Prove the traversal actually crossed an
    // export-from edge and reached the real graph before trusting any absence.
    assert.ok(
        [...files].some((f) => f.endsWith('/CinematicCameraPro.js') || f.endsWith('\\CinematicCameraPro.js')),
        'src/index.js walk visited nothing beyond itself -- export-from not traversed, the gate is vacuous');
    assert.ok(files.size >= 6,
        'src/index.js reachable set is ' + files.size + ' files (< 6) -- the core graph shrank or the walk stalled');

    for (const name of DETACHED) {
        const hit = [...files].some((f) => f.endsWith('/' + name) || f.endsWith('\\' + name));
        assert.equal(hit, false,
            'src/index.js still reaches ' + name + ' -- the detach import edge is not severed');
    }
});

test('G1: src/index.js does not pull @zakkster/lite-timeline', () => {
    const { pkgs } = reachable(join(srcDir, 'index.js'));
    assert.equal(pkgs.has(TIMELINE), false,
        'src/index.js reaches @zakkster/lite-timeline -- a class-only consumer would ship it');
});

test('G1 positive control: src/CameraSequence.js DOES reach @zakkster/lite-timeline', () => {
    // If this fails, the walker is broken (blind to real edges) and every
    // absence assertion above is worthless.
    const { pkgs } = reachable(join(srcDir, 'CameraSequence.js'));
    assert.equal(pkgs.has(TIMELINE), true,
        'walker did not find the KNOWN lite-timeline edge from CameraSequence.js');
});

test('G1: src/ contains zero dynamic import() (the static walk is total)', () => {
    // A dynamic import would hide an edge from the static walk and let a detached
    // module sneak back into the "." graph unseen.
    const dynImport = /\bimport\s*\(/;
    for (const f of readdirSync(srcDir)) {
        if (!f.endsWith('.js')) continue;
        const text = readFileSync(join(srcDir, f), 'utf8');
        assert.equal(dynImport.test(text), false,
            'src/' + f + ' uses a dynamic import() -- the static import-graph walk cannot see it');
    }
});
