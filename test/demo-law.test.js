// =============================================================================
// demo-law.test.js -- PRO-D permanent regression fence (DM-1/DM-2/DM-3).
//   Repo-only demo refresh session. Both demo/*.html pages are read as TEXT
//   (node:fs) and asserted against the shipped law: no legacy pointer events,
//   :hover only inside @media (hover: hover), an exact 7-entry local
//   importmap (no esm.sh except the guarded #profile hook, no lite-signal/
//   lite-gc-profiler), no v1.0.0 stamps, ASCII-only bytes (U+00D7/U+00B5
//   exempt), and the hot-path guards (no setInterval, ring buffer via
//   bitmask, pointercancel present, no innerHTML/.onclick).
//   Regex/string scans only -- zero new deps, no DOM parsing.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const demoDir = join(root, 'demo');

const MODULE_FILE = join(demoDir, 'CameraProModule.html');
const QUICKSTART_FILE = join(demoDir, 'QuickStart.html');

const moduleSrc = readFileSync(MODULE_FILE, 'utf8');
const quickstartSrc = readFileSync(QUICKSTART_FILE, 'utf8');

const FILES = [
    { name: 'CameraProModule.html', path: MODULE_FILE, src: moduleSrc },
    { name: 'QuickStart.html', path: QUICKSTART_FILE, src: quickstartSrc },
];

// -----------------------------------------------------------------------
// 1. Pointer law -- legacy mouse/touch event names are banned in both pages.
// -----------------------------------------------------------------------
test('PRO-D DM-1: pointer law -- zero legacy mouse/touch event names', () => {
    const banned = /mousedown|mousemove|mouseup|touchstart|touchmove|touchend/;
    for (const f of FILES) {
        const m = f.src.match(banned);
        assert.equal(
            m, null,
            `${f.name}: found banned legacy pointer token "${m && m[0]}" -- ` +
            'pointer events must use pointerdown/pointermove/pointerup'
        );
    }
});

// -----------------------------------------------------------------------
// 2. Hover law -- every :hover rule must sit inside an
//    @media (hover: hover) block. Counts: 6 (Module) + 2 (QuickStart).
// -----------------------------------------------------------------------
function hoverRulesOutsideMediaHover(src) {
    // Walk the <style> text char-by-char, tracking @media (hover: hover) { ... }
    // block depth via brace counting, and flag any ":hover" token found while
    // depth is 0 (i.e. not inside such a block).
    const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
    assert.ok(styleMatch, 'expected a <style> block');
    const css = styleMatch[1];

    let i = 0;
    let hoverMediaDepth = 0; // > 0 means we are inside an @media (hover: hover) block
    let genericDepth = 0; // brace depth for non-hover-media blocks we are inside
    let outsideCount = 0;
    let insideCount = 0;

    while (i < css.length) {
        if (css.startsWith('@media', i) && css.slice(i, i + 40).includes('hover: hover')) {
            // Find the opening brace for this @media block.
            const braceIdx = css.indexOf('{', i);
            i = braceIdx + 1;
            hoverMediaDepth++;
            let depth = 1;
            const start = i;
            while (i < css.length && depth > 0) {
                if (css[i] === '{') depth++;
                else if (css[i] === '}') depth--;
                i++;
            }
            const block = css.slice(start, i - 1);
            const hovers = block.match(/:hover/g) || [];
            insideCount += hovers.length;
            hoverMediaDepth--;
            continue;
        }
        if (css.startsWith(':hover', i)) {
            outsideCount++;
        }
        i++;
    }
    return { insideCount, outsideCount };
}

test('PRO-D DM-1/DM-3: hover law -- every :hover lives inside @media (hover: hover)', () => {
    const moduleResult = hoverRulesOutsideMediaHover(moduleSrc);
    assert.equal(
        moduleResult.outsideCount, 0,
        `CameraProModule.html: ${moduleResult.outsideCount} :hover rule(s) found outside @media (hover: hover)`
    );
    assert.equal(
        moduleResult.insideCount, 6,
        `CameraProModule.html: expected 6 wrapped :hover rules, found ${moduleResult.insideCount}`
    );

    const quickstartResult = hoverRulesOutsideMediaHover(quickstartSrc);
    assert.equal(
        quickstartResult.outsideCount, 0,
        `QuickStart.html: ${quickstartResult.outsideCount} :hover rule(s) found outside @media (hover: hover)`
    );
    assert.equal(
        quickstartResult.insideCount, 2,
        `QuickStart.html: expected 2 wrapped :hover rules, found ${quickstartResult.insideCount}`
    );
});

// -----------------------------------------------------------------------
// 3. Importmap law -- exactly 7 local @zakkster entries, deep-equal between
//    pages, every target exists on disk, no lite-signal/lite-gc-profiler.
// -----------------------------------------------------------------------
function extractImportMap(src, label) {
    const m = src.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    assert.ok(m, `${label}: expected a <script type="importmap"> block`);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(m[1]); }, `${label}: importmap JSON must parse`);
    assert.ok(parsed.imports && typeof parsed.imports === 'object', `${label}: importmap must have an "imports" object`);
    return parsed.imports;
}

test('PRO-D DM-1: importmap law -- exactly 7 local @zakkster entries per page', () => {
    for (const f of FILES) {
        const imports = extractImportMap(f.src, f.name);
        const keys = Object.keys(imports);
        assert.equal(keys.length, 7, `${f.name}: importmap must have EXACTLY 7 entries, found ${keys.length} (${keys.join(', ')})`);
        for (const k of keys) {
            assert.match(k, /^@zakkster\//, `${f.name}: importmap key "${k}" must be a @zakkster/* specifier`);
        }
        assert.equal(
            keys.indexOf('@zakkster/lite-signal'), -1,
            `${f.name}: importmap must NOT map @zakkster/lite-signal (not in the dependency graph, F9)`
        );
        assert.equal(
            keys.indexOf('@zakkster/lite-gc-profiler'), -1,
            `${f.name}: importmap must NOT map @zakkster/lite-gc-profiler (not in the dependency graph, F9)`
        );
    }
});

test('PRO-D DM-1: importmap law -- every value starts with ../node_modules/@zakkster/', () => {
    for (const f of FILES) {
        const imports = extractImportMap(f.src, f.name);
        for (const [k, v] of Object.entries(imports)) {
            assert.ok(
                v.startsWith('../node_modules/@zakkster/'),
                `${f.name}: importmap value for "${k}" ("${v}") must start with "../node_modules/@zakkster/"`
            );
        }
    }
});

test('PRO-D DM-1/DM-2: importmap law -- the two pages\' maps are deep-equal', () => {
    const moduleMap = extractImportMap(moduleSrc, 'CameraProModule.html');
    const quickstartMap = extractImportMap(quickstartSrc, 'QuickStart.html');
    assert.deepEqual(
        quickstartMap, moduleMap,
        'QuickStart.html importmap must be byte-for-byte identical (as parsed JSON) to CameraProModule.html\'s'
    );
});

test('PRO-D DM-1: importmap law -- every mapped target file exists on disk', () => {
    for (const f of FILES) {
        const imports = extractImportMap(f.src, f.name);
        for (const [k, v] of Object.entries(imports)) {
            const resolved = resolve(demoDir, v);
            assert.ok(
                existsSync(resolved),
                `${f.name}: importmap target for "${k}" does not exist on disk: ${resolved}`
            );
        }
    }
});

// -----------------------------------------------------------------------
// 4. Offline law -- esm.sh appears exactly once per file, guarded by the
//    #profile hash check; no font/CSS-import network egress.
// -----------------------------------------------------------------------
test('PRO-D DM-1/DM-2: offline law -- esm.sh appears exactly once per file, inside the #profile guard', () => {
    for (const f of FILES) {
        const matches = f.src.match(/esm\.sh/g) || [];
        assert.equal(matches.length, 1, `${f.name}: expected exactly 1 "esm.sh" occurrence, found ${matches.length}`);

        const idx = f.src.indexOf('esm.sh');
        // Look backward a bounded window for the #profile hash guard and an
        // opening "if (" -- and forward a bounded window for a .catch handler
        // that keeps the demo alive with exactly one console.warn.
        const before = f.src.slice(Math.max(0, idx - 400), idx);
        const after = f.src.slice(idx, idx + 800);

        assert.match(
            before, /if\s*\(\s*location\.hash\s*===\s*'#profile'\s*\)/,
            `${f.name}: the esm.sh dynamic import must be inside "if (location.hash === '#profile')"`
        );
        assert.match(
            after, /\.catch\s*\(/,
            `${f.name}: the esm.sh dynamic import must have a .catch handler so offline load keeps running`
        );
        assert.match(
            after, /console\.warn\(/,
            `${f.name}: the esm.sh .catch handler must console.warn exactly once, not throw`
        );
    }
});

test('PRO-D DM-1/DM-2: offline law -- zero font/CSS-import network references', () => {
    const banned = /fonts\.googleapis|fonts\.gstatic|@import url/;
    for (const f of FILES) {
        const m = f.src.match(banned);
        assert.equal(
            m, null,
            `${f.name}: found banned network font/CSS-import token "${m && m[0]}"`
        );
    }
});

// -----------------------------------------------------------------------
// 5. Truth stamps -- no stale v1.0.0, VERSION imported from ../src/index.js,
//    at:0 exactly once (Module), blendOutTime: blendOutSec exactly 4x (Module).
// -----------------------------------------------------------------------
test('PRO-D DM-1/DM-2: truth stamps -- zero stale v1.0.0 references', () => {
    const banned = /v1\.0\.0/;
    for (const f of FILES) {
        const m = f.src.match(banned);
        assert.equal(m, null, `${f.name}: found stale "v1.0.0" stamp`);
    }
});

test('PRO-D DM-1/DM-2: truth stamps -- both pages import VERSION from ../src/index.js', () => {
    for (const f of FILES) {
        const importLine = f.src.match(/import\s*\{[^}]*\bVERSION\b[^}]*\}\s*from\s*'\.\.\/src\/index\.js'/);
        assert.ok(
            importLine,
            `${f.name}: expected an "import { ..., VERSION, ... } from '../src/index.js'" statement`
        );
    }
});

test('PRO-D DM-1: truth stamps -- Module contains "at: 0" exactly once', () => {
    const matches = moduleSrc.match(/at: 0/g) || [];
    assert.equal(matches.length, 1, `CameraProModule.html: expected exactly 1 "at: 0" occurrence, found ${matches.length}`);
});

test('PRO-D DM-1: truth stamps -- Module contains "blendOutTime: blendOutSec" exactly 4 times', () => {
    const matches = moduleSrc.match(/blendOutTime: blendOutSec/g) || [];
    assert.equal(
        matches.length, 4,
        `CameraProModule.html: expected exactly 4 "blendOutTime: blendOutSec" occurrences (one per createSequence call site), found ${matches.length}`
    );
});

// -----------------------------------------------------------------------
// 6. ASCII bytes -- every byte < 0x80, OR one of the two exempt code points
//    U+00D7 (0xC3 0x97) / U+00B5 (0xC2 0xB5) in UTF-8 form.
// -----------------------------------------------------------------------
function findNonAsciiBytes(buf) {
    const bad = [];
    let i = 0;
    const n = buf.length;
    while (i < n) {
        const b = buf[i];
        if (b < 0x80) { i++; continue; }
        if (i + 1 < n) {
            const b2 = buf[i + 1];
            if ((b === 0xC3 && b2 === 0x97) || (b === 0xC2 && b2 === 0xB5)) {
                // U+00D7 (multiplication sign) or U+00B5 (micro sign) -- exempt.
                i += 2;
                continue;
            }
        }
        bad.push({ offset: i, byte: b });
        i++;
        if (bad.length >= 5) break; // enough to prove non-empty; keep message short
    }
    return bad;
}

test('PRO-D DM-1/DM-2: ASCII law -- every byte < 0x80 except U+00D7/U+00B5 UTF-8 pairs', () => {
    for (const f of FILES) {
        const buf = readFileSync(f.path);
        const bad = findNonAsciiBytes(buf);
        assert.equal(
            bad.length, 0,
            `${f.name}: found ${bad.length ? bad.length + '+' : 0} non-ASCII byte(s) not matching the U+00D7/U+00B5 exemption, ` +
            `first at offset ${bad[0] && bad[0].offset} (byte 0x${bad[0] && bad[0].byte.toString(16)})`
        );
    }
});

// -----------------------------------------------------------------------
// 7. Hot-path guards -- no setInterval in Module, ring buffer via bitmask,
//    pointercancel present (owner's fix stays).
// -----------------------------------------------------------------------
test('PRO-D DM-1: hot-path guard -- zero setInterval( in Module', () => {
    const matches = moduleSrc.match(/setInterval\(/g) || [];
    assert.equal(matches.length, 0, `CameraProModule.html: expected 0 "setInterval(" occurrences, found ${matches.length}`);
});

test('PRO-D DM-1: hot-path guard -- zero "% TRAIL_LEN" (modulo ring-buffer index)', () => {
    const matches = moduleSrc.match(/% TRAIL_LEN/g) || [];
    assert.equal(matches.length, 0, `CameraProModule.html: expected 0 "% TRAIL_LEN" occurrences, found ${matches.length}`);
});

test('PRO-D DM-1: hot-path guard -- "& (TRAIL_LEN - 1)" bitmask ring-buffer index is present', () => {
    const matches = moduleSrc.match(/& \(TRAIL_LEN - 1\)/g) || [];
    assert.ok(matches.length > 0, `CameraProModule.html: expected at least 1 "& (TRAIL_LEN - 1)" occurrence, found ${matches.length}`);
});

test('PRO-D DM-1: hot-path guard -- pointercancel handler is present', () => {
    assert.match(moduleSrc, /pointercancel/, 'CameraProModule.html: expected a "pointercancel" listener (drag-cancel fix)');
});

// -----------------------------------------------------------------------
// 8. innerHTML / .onclick law -- zero matches in both files.
// -----------------------------------------------------------------------
test('PRO-D DM-1/DM-2: zero innerHTML / .onclick assignments in both pages', () => {
    const banned = /innerHTML|\.onclick/;
    for (const f of FILES) {
        const m = f.src.match(banned);
        assert.equal(m, null, `${f.name}: found banned token "${m && m[0]}" (innerHTML/.onclick law)`);
    }
});
