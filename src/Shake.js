// @zakkster/lite-camera-pro -- the ./shake subpath barrel.
// Re-export only; never a copy. The camera class and this subpath import the
// SAME module files, so createShakeState et al. have one runtime identity.
// ShakePresets is folded in so a shake-only consumer gets presets + getPreset
// from a single import.
export * from './ShakeEngine.js';
export * from './ShakePresets.js';
