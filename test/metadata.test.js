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
import { readFileSync } from 'node:fs';
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

// CP-1 guard (documented -> exists). The standalone functional API llms.txt documents
// (lines under "## Standalone functional API") must all be reachable from the
// entry -- this is the finding that shipped one file too low.
const DOCUMENTED_STANDALONE = [
    // Shake
    'createShakeState', 'addShake', 'addTraumaSimple', 'updateShake', 'computeShake', 'clearShakes',
    // Parallax
    'createParallaxState', 'addParallaxLayer', 'removeParallaxLayer', 'updateParallax', 'getLayerScroll', 'applyParallaxLayer',
    // Bounds
    'createBoundsState', 'setBoundsAll', 'setBoundsEdges', 'setBoundsRect', 'clearBoundsRect', 'applyBounds',
    // Multi
    'createMultiTargetState', 'updateMultiTarget',
    // Sequence
    'createCameraSequence', 'panTo', 'dramaticZoom', 'bossReveal', 'timedShake',
    // Enums
    'FollowMode', 'FOLLOW_STRATEGIES', 'BoundsType', 'WrapMode',
];

test('CP-1: every llms.txt-documented standalone export exists on the entry', () => {
    for (const name of DOCUMENTED_STANDALONE) {
        assert.ok(name in api, 'entry is missing documented export: ' + name);
    }
    // The two the BRIEF flagged, specifically, as functions.
    assert.equal(typeof api.createShakeState, 'function');
    assert.equal(typeof api.createMultiTargetState, 'function');
});
