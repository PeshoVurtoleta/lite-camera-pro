// =============================================================================
// metadata.test.js -- version law + packaging + the CP-1 export guard.
//   Version lives in three places (package.json, the VERSION const, llms.txt);
//   they are bumped together or not at all. files[] must not ship tests/demos.
//   CP-1 guard: every standalone export llms.txt documents must exist on the
//   entry (documented -> exists). The reverse direction (every entry export is
//   documented) is a PRO5 llms.txt-rewrite concern and is not asserted here.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as api from '../src/index.js';
import { VERSION } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('VERSION const === package.json version', () => {
    assert.equal(VERSION, pkg.version);
});

test('llms.txt header states the same version', () => {
    const llms = readFileSync(join(root, 'llms.txt'), 'utf8');
    const m = llms.match(/^Version:\s*(\S+)/m);
    assert.ok(m, 'llms.txt must carry a "Version: <x>" header line');
    assert.equal(m[1], VERSION);
});

test('files[] ships CHANGELOG.md + llms.txt and excludes test/demo/examples/Cookbook', () => {
    const files = pkg.files;
    assert.ok(files.includes('CHANGELOG.md'), 'CHANGELOG.md must ship');
    assert.ok(files.includes('llms.txt'), 'llms.txt must ship');
    for (const bad of ['test/', 'demo/', 'examples/', 'Cookbook.md']) {
        assert.ok(!files.includes(bad), bad + ' must not be in files[]');
    }
});

// CP-1 guard (documented -> exists). v2.0.0 detach (D5): the standalone API is
// now split. The ROOT_STANDALONE names still resolve on the "." entry; the four
// detached subsystems document their standalone API on their subpaths, so each
// SUBPATH_STANDALONE name must resolve THERE (documented -> exists, at its new
// home). Both are asserted so a doc that promises a name at the wrong location
// fails closed.
const ROOT_STANDALONE = [
    // Shake engine (stays at ".")
    'createShakeState', 'addShake', 'addTraumaSimple', 'updateShake', 'computeShake', 'clearShakes',
    // Bounds (stays at ".")
    'createBoundsState', 'setBoundsAll', 'setBoundsEdges', 'setBoundsRect', 'clearBoundsRect', 'applyBounds',
    // Multi (stays at ".")
    'createMultiTargetState', 'updateMultiTarget',
    // Enums that stay at "."
    'FollowMode', 'FOLLOW_STRATEGIES', 'BoundsType',
];

// Detached standalone APIs, each at its subpath (v2.0.0).
const SUBPATH_STANDALONE = {
    '/shake': ['getPreset', 'registerPreset', 'listPresets'],
    '/parallax': ['WrapMode', 'createParallaxState', 'addParallaxLayer', 'removeParallaxLayer',
        'updateParallax', 'getLayerScroll', 'applyParallaxLayer', 'withParallax'],
    '/sequence': ['createCameraSequence', 'panTo', 'dramaticZoom', 'bossReveal', 'timedShake', 'withSequences'],
    '/debug': ['createDebugHUDConfig', 'drawDebugHUD', 'drawDebugWorld', 'withDebug'],
};

test('CP-1: every llms.txt-documented ROOT standalone export exists on the entry', () => {
    for (const name of ROOT_STANDALONE) {
        assert.ok(name in api, 'entry is missing documented export: ' + name);
    }
    // The two the BRIEF flagged, specifically, as functions.
    assert.equal(typeof api.createShakeState, 'function');
    assert.equal(typeof api.createMultiTargetState, 'function');
});

test('CP-1 (v2.0.0): every documented DETACHED standalone export exists on its subpath', async () => {
    for (const [sub, names] of Object.entries(SUBPATH_STANDALONE)) {
        const mod = await import('@zakkster/lite-camera-pro' + sub);
        for (const name of names) {
            assert.ok(name in mod, 'subpath ' + sub + ' is missing documented export: ' + name);
        }
    }
});

// -- CP-16a / CP-17: subpath exports-map invariants (v1.1.0) -------------------
// The "." entry keeps its exact 1.0.1 shape; every subpath's runtime target
// (import/default/node) AND its types target resolve to a real file on disk;
// the "./package.json" convenience subpath is present.

// v2.0.0 detach: ./debug is the new subpath (DebugHUD.js, no longer a "." facade).
const EXPECTED_SUBPATHS = [
    '.', './shake', './parallax', './bounds', './multi', './follow',
    './sequence', './debug', './package.json',
];

test('exports map lists exactly the expected subpaths', () => {
    const keys = Object.keys(pkg.exports).sort();
    assert.deepEqual(keys, [...EXPECTED_SUBPATHS].sort());
});

test('"." entry is unchanged from the 1.0.1 shape', () => {
    assert.deepEqual(pkg.exports['.'], {
        types: './src/index.d.ts',
        node: './src/index.js',
        import: './src/index.js',
        default: './src/index.js',
    });
});

test('every subpath runtime + types target exists on disk; types is declared first', () => {
    for (const key of Object.keys(pkg.exports)) {
        const entry = pkg.exports[key];
        if (typeof entry === 'string') {
            // "./package.json" is a bare string target.
            assert.ok(existsSync(join(root, entry)), key + ' target missing: ' + entry);
            continue;
        }
        // "types" condition must be declared FIRST (TypeScript requirement).
        assert.equal(Object.keys(entry)[0], 'types', key + ' must list "types" first');
        for (const cond of ['types', 'node', 'import', 'default']) {
            const target = entry[cond];
            assert.ok(target, key + ' is missing the "' + cond + '" condition');
            assert.ok(existsSync(join(root, target)), key + ' ' + cond + ' target missing: ' + target);
        }
    }
});

test('"./package.json" subpath is present and self-referential', () => {
    assert.equal(pkg.exports['./package.json'], './package.json');
});

// -- D-j: ERR-code drift guard (v1.2.0) ---------------------------------------
// Every error code assigned in src/ (e.code = "ERR_...") must be documented in
// llms.txt, and every ERR_ token documented in llms.txt must be assigned in
// src/. Both directions fail closed: a new code with no doc, or a doc for a code
// that was renamed/removed, breaks this test.
test('D-j: ERR_ codes in src/ and llms.txt agree in both directions', () => {
    const srcDir = join(root, 'src');
    const codeAssign = /\.code\s*=\s*["'](ERR_[A-Z_]+)["']/g;
    const srcCodes = new Set();
    for (const f of readdirSync(srcDir)) {
        if (!f.endsWith('.js')) continue;
        const text = readFileSync(join(srcDir, f), 'utf8');
        let m;
        while ((m = codeAssign.exec(text)) !== null) srcCodes.add(m[1]);
    }
    assert.ok(srcCodes.size > 0, 'expected at least one ERR_ code assigned in src/');

    const llms = readFileSync(join(root, 'llms.txt'), 'utf8');
    const llmsCodes = new Set(llms.match(/ERR_[A-Z_]+/g) || []);

    for (const code of srcCodes) {
        assert.ok(llmsCodes.has(code), 'src assigns ' + code + ' but llms.txt does not document it');
    }
    for (const code of llmsCodes) {
        assert.ok(srcCodes.has(code), 'llms.txt documents ' + code + ' but src/ never assigns it');
    }
});

// -- Gate A: ASCII on the shipped set + repo docs (PRO5, v2.1.1) ---------------
// Every gated file carries zero codepoints > 0x7F, with the two source-law
// exemptions (U+00D7 multiplication sign, U+00B5 micro). The gated set is the
// SHIPPED bytes plus the tracked repo docs that feed this gate's own
// credibility (decisions/ + test/), per D-sweep -- an explicit directory list,
// never a glob negation. demo/ is unshipped + entity-clean; the working notes
// (BRIEF/ROADMAP/TRIPPLE_BRIEF) are untracked quoted material -- both OUT.
const EXEMPT_CP = new Set([0xD7, 0xB5]);

// Files knowingly carrying a documented non-ASCII byte (H-A: a src string
// literal that cannot change without moving shake output). Empty is the
// contract; each entry is {file, cp, count, reason} and the count is exact.
const EXEMPT_FILES = [];

function u(cp) {
    return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

// Scan a raw string; return every offending position as {line, col, cp}.
function scanText(text) {
    const out = [];
    let line = 1;
    let col = 1;
    for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (ch === '\n') {
            line++;
            col = 1;
            continue;
        }
        if (cp > 0x7F && !EXEMPT_CP.has(cp)) out.push({ line, col, cp });
        col++;
    }
    return out;
}

function walkTest(dir, out) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walkTest(p, out);
        else if (/\.(js|mjs|ts)$/.test(e.name)) out.push(p);
    }
}

// The explicit GATED list (D-sweep).
function gatedFiles() {
    const files = [];
    for (const f of readdirSync(join(root, 'src'))) {
        if (f.endsWith('.js') || f.endsWith('.d.ts')) files.push(join(root, 'src', f));
    }
    for (const f of ['README.md', 'CHANGELOG.md', 'llms.txt', 'LICENSE']) {
        files.push(join(root, f));
    }
    for (const f of readdirSync(join(root, 'decisions'))) {
        if (f.endsWith('.md')) files.push(join(root, 'decisions', f));
    }
    walkTest(join(root, 'test'), files);
    return files;
}

// Non-vacuity: an in-file positive control (the em-dash is a JS \u escape, so
// THIS test file stays ASCII) must be seen; the exemption control must not.
test('Gate A control: scanner flags a non-ASCII codepoint (positive control)', () => {
    // The em-dash is a JS \u escape so this file itself stays ASCII.
    const hits = scanText('a\u2014b');
    assert.equal(hits.length, 1, 'positive control must produce exactly one offender');
    assert.equal(hits[0].cp, 0x2014, 'positive control offender must be the em-dash');
});

test('Gate A control: scanner ignores the two exempt codepoints', () => {
    const hits = scanText('a×bµc');
    assert.equal(hits.length, 0, 'U+00D7 and U+00B5 are source-law exempt');
});

test('Gate A coverage: the GATED set is real (>= 17 files, all present)', () => {
    const files = gatedFiles();
    assert.ok(files.length >= 17, 'expected >= 17 gated files, got ' + files.length);
    for (const f of files) assert.ok(existsSync(f), 'gated file missing: ' + f);
});

test('Gate A: the EXEMPT_FILES ledger is empty (no unresolved non-ASCII)', () => {
    // If H-A ever forces an entry, its count is asserted exact against a fresh
    // scan so the ledger cannot drift silently.
    assert.deepEqual(EXEMPT_FILES, [], 'EXEMPT_FILES ledger must be empty');
    for (const e of EXEMPT_FILES) {
        const text = readFileSync(e.file, 'utf8');
        const n = scanText(text).filter((h) => h.cp === e.cp).length;
        assert.equal(n, e.count, e.file + ' ' + u(e.cp) + ' count drift');
    }
});

test('Gate A: every gated file is ASCII (exempt U+00D7, U+00B5)', () => {
    const exemptPaths = new Set(EXEMPT_FILES.map((e) => e.file));
    const offenders = [];
    for (const f of gatedFiles()) {
        const text = readFileSync(f, 'utf8');
        for (const h of scanText(text)) {
            if (exemptPaths.has(f)) {
                const e = EXEMPT_FILES.find((x) => x.file === f);
                if (e && e.cp === h.cp) continue;
            }
            offenders.push({ file: f, line: h.line, col: h.col, cp: h.cp });
        }
    }
    const first = offenders[0];
    const msg = offenders.length
        ? 'ASCII gate: ' + offenders.length + ' offender(s); first ' +
          first.file + ':' + first.line + ':' + first.col + ' cp=' + u(first.cp)
        : '';
    assert.deepEqual(offenders, [], msg);
});

// -- Gate B: docs-drift guard (PRO5, v2.1.1) ----------------------------------
// Three clauses, each with an in-test control so the gate is non-vacuous even
// when the corpus happens to be clean (same pattern Gate A uses):
//   (a) exists -> documented: every export of "." AND each subpath module
//       appears in llms.txt as a whole word. Root count is exactly 22 (the
//       frozen surface); the flat check-count floors at 60; a bogus name is
//       NOT documented (negative probe).
//   (b) links resolve: every ](target) in README.md + llms.txt that is not
//       http(s)/mailto/#anchor resolves on disk (strip #frag). Floor: >= 8.
//   (c) TOC <-> headings: every "## Table of contents" entry slug matches a
//       real heading slug, and every H2 (bar the TOC itself) has a TOC entry.
//       Floor: >= 12 entries.

// Resolve the JS runtime target of each subpath from the exports map.
const SUBPATH_SPECS = Object.keys(pkg.exports)
    .filter((k) => k !== '.' && k !== './package.json')
    .map((k) => '@zakkster/lite-camera-pro' + k.slice(1));

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/ +/g, '-');
}

function wordInText(name, text) {
    // Escape regex metachars (names are identifiers, but stay defensive).
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + esc + '\\b').test(text);
}

test('Gate B control: a bogus export name is NOT documented in llms.txt', () => {
    const llms = readFileSync(join(root, 'llms.txt'), 'utf8');
    assert.equal(/\b__notAnExport__\b/.test(llms), false,
        'negative probe: llms.txt must not document __notAnExport__');
});

test('Gate B (a): every "." + subpath export is documented in llms.txt (exists -> documented)', async () => {
    const llms = readFileSync(join(root, 'llms.txt'), 'utf8');

    // Root: exactly 22 names (the frozen surface), all documented.
    const rootNames = Object.keys(api);
    assert.equal(rootNames.length, 22, 'root "." surface must be exactly 22 names, got ' + rootNames.length);

    let checks = 0;
    const missing = [];
    for (const name of rootNames) {
        checks++;
        if (!wordInText(name, llms)) missing.push('.:' + name);
    }
    for (const spec of SUBPATH_SPECS) {
        const mod = await import(spec);
        for (const name of Object.keys(mod)) {
            checks++;
            if (!wordInText(name, llms)) missing.push(spec + ':' + name);
        }
    }
    assert.deepEqual(missing, [], 'undocumented export(s): ' + missing.join(', '));
    assert.ok(checks >= 60, 'expected >= 60 name-checks, got ' + checks);
});

test('Gate B (b): every relative link in README.md + llms.txt resolves on disk', () => {
    const linkRe = /\]\(([^)]+)\)/g;
    const targets = [];
    for (const file of ['README.md', 'llms.txt']) {
        const text = readFileSync(join(root, file), 'utf8');
        let m;
        while ((m = linkRe.exec(text)) !== null) {
            let target = m[1].trim();
            if (/^(https?:|mailto:|#)/.test(target)) continue;   // external / in-page
            target = target.split('#')[0];                        // strip #frag
            if (target === '') continue;
            targets.push(target);
        }
    }
    const dead = targets.filter((t) => !existsSync(join(root, t)));
    assert.deepEqual(dead, [], 'dead relative link(s): ' + dead.join(', '));
    assert.ok(targets.length >= 8, 'expected >= 8 relative links, got ' + targets.length);
});

test('Gate B (c): README TOC slugs and ## headings agree both ways', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const lines = readme.split('\n');

    // H2 headings -> slugs (skip the TOC heading itself).
    const headingSlugs = new Set();
    for (const line of lines) {
        const m = /^## (.+)$/.exec(line);
        if (!m) continue;
        const slug = slugify(m[1].trim());
        if (slug === 'table-of-contents') continue;
        headingSlugs.add(slug);
    }

    // TOC block: bullet links under "## Table of contents" until the next H2.
    const tocSlugs = new Set();
    let inToc = false;
    for (const line of lines) {
        if (/^## Table of contents\s*$/.test(line)) { inToc = true; continue; }
        if (inToc && /^## /.test(line)) break;
        if (!inToc) continue;
        const m = /^- \[[^\]]+\]\(#([a-z0-9-]+)\)\s*$/.exec(line);
        if (m) tocSlugs.add(m[1]);
    }

    assert.ok(tocSlugs.size >= 12, 'expected >= 12 TOC entries, got ' + tocSlugs.size);

    const tocMissingHeading = [...tocSlugs].filter((s) => !headingSlugs.has(s));
    assert.deepEqual(tocMissingHeading, [], 'TOC entries with no matching H2: ' + tocMissingHeading.join(', '));

    const headingMissingToc = [...headingSlugs].filter((s) => !tocSlugs.has(s));
    assert.deepEqual(headingMissingToc, [], 'H2 headings absent from the TOC: ' + headingMissingToc.join(', '));
});
