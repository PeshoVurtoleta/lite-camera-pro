// Polyfill requestAnimationFrame for Node.js test environment
if (typeof globalThis.requestAnimationFrame === 'undefined') {
    let id = 0;
    globalThis.requestAnimationFrame = (cb) => { id++; setTimeout(cb, 0); return id; };
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
