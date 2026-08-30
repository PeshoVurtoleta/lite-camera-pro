/**
 * PRO3 A6 baseline generator -- run ONCE on the pristine 1.2.0 tree.
 *
 * Captures a 600-frame deterministic no-sequence stream (follow + zoom anim +
 * seeded shake + mode switches) as the byte-equality baseline for hazard H-C:
 * a camera that never touches a sequence must produce this exact stream on
 * every later version. No RAF, no timers, no Date -- fully reproducible.
 *
 * REFUSES to overwrite an existing fixture: regenerating on a changed tree
 * would launder a regression into a new baseline. Delete the .json manually
 * only if the baseline is being retired on purpose (record why in the
 * decision record).
 *
 * Encoding: little-endian Float64 stream, base64. 9 fields per frame:
 *   posX, posY, lookX, lookY, zoom, tx, ty, rot, scaleX
 * (tx/ty/rot/scaleX are what apply() handed the sink that frame).
 */

import {writeFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

import {CinematicCameraPro} from '../../src/index.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'pro3-follow-baseline.json');

if (existsSync(OUT)) {
    console.error('REFUSING to overwrite existing baseline: ' + OUT);
    console.error('The fixture is capture-once (see header comment).');
    process.exit(1);
}

const FRAMES = 600;
const FIELDS = 9;
const DT = 1 / 60;

const cam = new CinematicCameraPro(800, 600, 1600, 1200, 1234);

// Recorder sink: apply() touches exactly translate, rotate, scale in order.
let tx = 0, ty = 0, rot = 0, sx = 0;
const sink = {
    translate(x, y) { tx = x; ty = y; },
    rotate(a) { rot = a; },
    scale(x, _y) { sx = x; },
};

const buf = new ArrayBuffer(FRAMES * FIELDS * 8);
const view = new DataView(buf);
let off = 0;

for (let f = 0; f < FRAMES; f++) {
    // Deterministic op schedule (frame indices, not time)
    if (f === 100) cam.setZoom(1.6, 0.5);
    if (f === 200) cam.shake({trauma: 0.6, freq: 15, decay: 1.2, maxOffset: 12, maxAngle: 0.04}, 1);
    if (f === 300) cam.setMode(2);
    if (f === 400) cam.setMode(0);
    if (f === 450) cam.zoomAt(500, 400, 2.0, 0.5);

    // Deterministic target path + velocity
    const px = 100 + f * 1.5;
    const py = 80 + ((f * 7) % 120);
    const pvx = 90;                       // world units / s, constant
    const pvy = (f & 64) ? -40 : 40;      // deterministic flip

    cam.update(DT, px, py, pvx, pvy);
    cam.apply(sink);

    view.setFloat64(off, cam.pos[0], true); off += 8;
    view.setFloat64(off, cam.pos[1], true); off += 8;
    view.setFloat64(off, cam.look[0], true); off += 8;
    view.setFloat64(off, cam.look[1], true); off += 8;
    view.setFloat64(off, cam.zoom, true); off += 8;
    view.setFloat64(off, tx, true); off += 8;
    view.setFloat64(off, ty, true); off += 8;
    view.setFloat64(off, rot, true); off += 8;
    view.setFloat64(off, sx, true); off += 8;
}

cam.destroy();

const fixture = {
    generated_on: '1.2.0',
    frames: FRAMES,
    fields: ['posX', 'posY', 'lookX', 'lookY', 'zoom', 'tx', 'ty', 'rot', 'scaleX'],
    encoding: 'f64le-base64',
    schedule: 'seed 1234; setZoom(1.6,0.5)@100; shake(hand profile)@200; setMode(2)@300; setMode(0)@400; zoomAt(500,400,2,0.5)@450; px=100+f*1.5 py=80+((f*7)%120) pvx=90 pvy=+/-40',
    data: Buffer.from(buf).toString('base64'),
};

writeFileSync(OUT, JSON.stringify(fixture));
console.log('baseline written: ' + OUT + ' (' + FRAMES + ' frames, ' + fixture.data.length + ' b64 chars)');
