# 0005 -- SOFT bounds: the quadratic half-zone hold-out

Status: accepted (v2.1.0, PRO4). Fixes CP-6.

## Problem

The SOFT edge map shipped through v2.0.0 accelerated the camera INTO the edge it
promised to cushion. With all edges SOFT, softZone 80, edge 0 (measured on the
2.0.0 tree): a requested position of 40 was granted 20.00 (HARD grants 40); 20 ->
3.13; 60 -> 50.63; 79 -> 78.96. The old smoothstep map at BoundsSystem.js
compressed the granted position TOWARD the edge -- monotone, but always NEARER
the edge than requested, the exact inverse of "decelerates near the edge".

## Decision -- quadratic half-zone hold-out

Requirements, per edge: g monotone; g(zone entry) = zone entry; g between the
requested value and the zone entry everywhere (NEVER nearer the edge than
requested); slope -> 0 at the edge (the edge is reachable only by HARD).

Math, per edge, in the hot body of `_applyEdge`:

    s = isMin ? +1 : -1
    d = s * (val - edge)          // signed distance into the zone
    if (d < sz) {                 // unchanged entry condition
        u = clamp(d / sz, 0, 1)   // two comparisons, no Math.* call
        target[axis] = edge + s * sz * 0.5 * (1 + u*u)
    }

Name: quadratic half-zone hold-out, h(u) = (1 + u^2) / 2.

This is not a taste choice. It is the UNIQUE quadratic satisfying the four
requirements: h(1) = 1 (zone entry fixed), h'(0) = 0 (slope -> 0 at the edge),
and h(u) >= u on [0, 1] with equality only at u = 1. Writing h(u) = u + c(1-u)^2
forces c = 1/2 from h'(0) = 0, and c = 1/2 is exactly the value at which
h(u) - u = c(1-u)^2 >= 0 is tangent, not crossing. The hold-out floor is sz/2: a
SOFT edge asymptotically refuses the last half-zone; HARD reaches the edge.

P4 inverts (sz 80, edge 0): val 40 -> u 0.5 -> 50.00 (was 20); 20 -> 42.50 (was
3.13); 79 -> 79.01 (was 78.96); val <= edge -> 40.00 (sz/2, the floor). At class
geometry (view 800x600, world 3200x2400, zoom 1, setBoundsRect(600, 400, 1600,
1200) -> minBX 600, maxBX 1400): requested 640 -> granted 650.00 (old map: 620);
mirror at 1360 -> 1350. Every soft zone here sits strictly inside the base box,
so nothing the base [0, maxX] clamp does can produce the observed number -- a
naive follow probe masks CP-6 behind that clamp, so the regression pins the fix
at the applyBounds level AND at the class level.

## Zero-alloc and NaN safety

Four float ops + two comparisons, no allocation, no `Math.*` call, no new branch
versus the old smoothstep call. sz <= 0 is safe for free: only d < 0 can enter
(val already past the edge), d/0 = -Infinity, the clamp lands u = 0, grant =
edge -- SOFT degenerates to HARD. The only NaN route (d = 0, sz = 0) cannot enter
the branch (0 < 0 is false). That is why no `sz > 0` guard buys bytes in the hot
body; the D5 (0008) finiteness door on setSoftZone keeps a NaN softZone from
arriving via a setter in the first place. HARD/ELASTIC/NONE branches are
byte-identical to 2.0.0; the module-local smoothstep helper was deleted (no
caller remained after the rewrite).

## Rejected alternatives

- Exponential edge, `edge + sz*(1 - exp(-k*d/sz))`: four transcendentals per
  frame on the hot path, and no closed-form "never nearer" proof without tuning
  k.
- Inverting the smoothstep blend, `edge + (val - edge)*(2 - t)`: non-monotone
  near the zone entry.

## The resize clamp is HARD, not SOFT (shared with D6/0008)

`clampToBounds` (the resize re-clamp, 0008) is always plain HARD against the
effective box, never SOFT/ELASTIC. A resize is a discontinuity that must land
legal IMMEDIATELY; SOFT/ELASTIC are per-frame feel, not a jump correction.
