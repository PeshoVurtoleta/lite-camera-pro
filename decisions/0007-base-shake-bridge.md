# 0007 -- the base shake bridge: prototype accessors onto the default slot

Status: accepted (v2.1.0, PRO4). Fixes CP-9.

## Problem

CinematicCameraPro replaced the base RNG shake with the noise engine but left the
base's public shake fields inert. A base-style caller writing
`pro.shakeTrauma = 1; pro.shakeMaxOffset = 60` got nothing: apply()'s first
translate stayed [0, 0], `_shakeX` 0. The "drop-in superset of lite-camera"
migration promise was false for the single most common shake idiom.

## Base contract (LiteCamera llms.txt, 1.2.2), pinned here

- shakeTrauma: current trauma in [0, 1].
- shakeMaxOffset = 15: max shake translation at full trauma, px.
- shakeMaxAngle = 0.05: max shake rotation at full trauma, rad.
- Notes: decay is welded to 1.0 trauma/second; independent decay control is Pro's.

The bridge is free because Pro's default omni slot already carries exactly those
base numbers (ShakeEngine.js default slot: decay 1.0, freq 15, maxOffset 15,
maxAngle 0.05). The bridge routes through the identical slot `addTraumaSimple`
uses -- no second path, H-A untouched.

## Decision -- prototype accessors, all cold

- `get shakeTrauma` -> the active default slot's trauma, else 0.
- `set shakeTrauma(v)`: non-finite throws code "ERR_CAMERA_SHAKE"; v <= 0
  deactivates the default slot (base: 0 = no shake); v > 0 finds-or-creates the
  default slot and ASSIGNS min(1, v). Assignment, not accumulation -- addTrauma
  accumulates, the field assigns; the base's documented difference. Then it
  stamps the remembered max fields onto the slot.
- `get/set shakeMaxOffset`, `get/set shakeMaxAngle`: backed by cold instance
  fields `_baseMaxOffset = 15` / `_baseMaxAngle = 0.05`, so a read returns what
  was written even before any trauma exists (order-independent, base style). The
  setters write through to a live default slot; non-finite throws
  "ERR_CAMERA_SHAKE"; writing a max field alone fires NO shake.
- `addTrauma()` and the trauma setter stamp `_baseMaxOffset`/`_baseMaxAngle` onto
  the slot AFTER `addTraumaSimple` -- in the CLASS. ShakeEngine.js gains zero
  instructions (H-B). The two instance fields are declared in the constructor for
  hidden-class stability, and `_baseSlot()` treats a null/undefined `_shake` as
  "no slot" so the base ctor's super() writes through these accessors (before Pro
  allocates `_shake`) and a post-destroy read are both safe.

## H-G: the accessors never tax the hot path

1. Source gate (regressions.test.js "D3 H-G"): the strings
   `shakeTrauma|shakeMaxOffset|shakeMaxAngle|_baseMax` appear NOWHERE inside the
   method bodies of update()/apply() (class) and updateShake()/computeShake()
   (engine), sliced by brace-matching -- the fast path cannot read them.
2. T6 alloc figures stay within noise of the 2.0.0 baseline (torture "ok").
3. A/B ns/op (`test/perf/pro4-guards.mjs`, 200k update()+apply() on a live
   shaking camera): 102.4 ns/op steady state with the accessors present. The
   accessors live on the prototype, so the instance shape is unchanged and the
   hot-path throughput does not move.

## Rejected / fallback

Recorded fallback if any measured hot cost had appeared: loud deprecation
(@deprecated d.ts, README migration row, fields throw "ERR_CAMERA_SHAKE" under a
new `checked:true` construction option). Silence is the one outcome that does not
survive. No hot cost was measured, so the bridge ships live.
