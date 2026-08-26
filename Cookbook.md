# lite-camera-pro · Cookbook

**Twenty recipes. Twenty real-world camera problems, solved in plain code you can copy.**

Every recipe is self-contained. Every code block is something you can paste into your project and ship. Most are under ten lines.

If you've never used the library before, start with [Recipe 01](#01--quick-start) and work down — each one builds on the last only loosely, so feel free to jump around once you've got the basics.

---

## How to read this cookbook

Each recipe has four parts:

- **The vibe** — what kind of moment this is for, in one sentence.
- **When to use it** — the situation in your game where you'd reach for this.
- **The code** — copy this into your project. It works on its own.
- **What's happening** — a plain-English explanation of why it works.

If you see a `// ...` in code, it means "your existing game code goes here." Everything else is real and ready to run.

---

## Setup (read once)

Every recipe assumes you've done this much already. If you have, skip ahead.

```js
import { CinematicCameraPro } from '@zakkster/lite-camera-pro';

// 1. Create the camera
const camera = new CinematicCameraPro(
    canvas.width,  canvas.height,    // viewport (what the player sees)
    worldWidth,    worldHeight       // world (the whole level)
);

// 2. Run it every frame
let lastTime = performance.now();
function frame(now) {
    const dt = (now - lastTime) / 1000;  // delta time in seconds
    lastTime = now;

    camera.update(dt, player.x, player.y, player.vx, player.vy);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    camera.apply(ctx);     // applies zoom, shake, scroll
    drawWorld(ctx);        // your draw code
    ctx.restore();

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

That's the whole API surface in one snippet. Everything below is variations on this theme.

---

# The Recipes

---

## 01 — Quick Start
**The vibe.** Your first camera, following your first player, in twelve lines.

**When to use it:** Day one. You have a player on a canvas and want the camera to follow them.

```js
const camera = new CinematicCameraPro(800, 600, 3200, 2400);

function frame(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    camera.update(dt, player.x, player.y, player.vx, player.vy);

    ctx.clearRect(0, 0, 800, 600);
    ctx.save();
    camera.apply(ctx);
    drawWorld(ctx);
    ctx.restore();

    requestAnimationFrame(frame);
}
```

**What's happening:** `update()` figures out where the camera should be this frame. `apply()` transforms the canvas so when you draw at world coordinates, things appear at the right place on screen. Everything between `ctx.save()` and `ctx.restore()` gets the camera transform; anything outside is screen-space (good for UI).

---

## 02 — Smooth Follow
**The vibe.** The camera glides after the player instead of locking to them. The default "good feel."

**When to use it:** Most action games. Adventure games. Anywhere "snappy but soft" is the goal.

```js
camera.setMode(FollowMode.SMOOTH);     // already the default
camera.deadzoneX = 60;                 // pixels of slack horizontally
camera.deadzoneY = 40;                 // pixels of slack vertically
camera.lookaheadDist = 80;             // how far it "peeks" ahead
camera.lerpSpeed = 5;                  // higher = snappier (default 5)
```

**What's happening:** The deadzone is an invisible box around the camera target. When the player moves inside this box, the camera doesn't move at all — that's what makes small movements feel calm. Once the player exits the box, the camera catches up smoothly. Lookahead means the camera peeks slightly in the direction you're moving, so you see what's coming.

**Try:** Set `deadzoneX = 0` for a tight follow. Set `lookaheadDist = 200` for a chase-cam feel.

---

## 03 — Platformer Camera
**The vibe.** Horizontal scroll is smooth, vertical is rock-solid. The Mario / Hollow Knight feel.

**When to use it:** 2D platformers. Side-scrollers. Anywhere jumping shouldn't make the camera bounce up and down.

```js
camera.setMode(FollowMode.HYBRID);
camera.hybridVerticalSnap = true;   // vertical follows the player exactly
camera.deadzoneX = 80;              // gentle horizontal slack
camera.lookaheadDist = 120;         // peek ahead when running
```

**What's happening:** HYBRID is a blended mode. The horizontal axis uses smooth follow with deadzone and lookahead. The vertical axis snaps directly to the player every frame, so jumps and falls don't make the camera "swim." This is exactly the trick used in most beloved platformers.

**Try:** `hybridVerticalSnap = false` adds a gentle vertical lerp — softer feel, but cameras lag during long falls.

---

## 04 — Twin-Stick Shooter
**The vibe.** The camera *is* the player. Zero lag.

**When to use it:** Top-down shooters, twin-stick action, anything where precise aim matters more than smooth motion.

```js
camera.setMode(FollowMode.LOCK);
```

**What's happening:** LOCK mode skips all the smoothing and just teleports the camera to the player every frame. There's no deadzone, no lookahead, no lerp. Whatever the player sees on screen is *immediately* up-to-date with where they actually are.

**Try:** Add a tiny shake on each shot fired — `camera.shakePreset('recoil')` — to add weight without losing the precision.

---

## 05 — Racing Game
**The vibe.** The camera reads your mind. It shows you the future, not the present.

**When to use it:** Anything fast — racing, runners, fast-paced action. When the player is moving so fast that "where they are" isn't useful — you need "where they're going."

```js
camera.setMode(FollowMode.PREDICTIVE);
camera.predictTime = 0.4;       // look 0.4 seconds into the future
camera.lookaheadSpeed = 6;      // how fast the camera commits to the prediction
```

**What's happening:** Instead of looking at the player's position, the camera looks at `position + velocity * predictTime`. At 400 px/sec and 0.4s prediction, the camera sits 160 pixels in front of you. The faster you go, the further ahead it sees.

**Try:** `predictTime = 0.8` for an extreme "where am I about to crash" feel. `predictTime = 0.15` for a subtle anticipation.

---

## 06 — Cinematic Zoom
**The vibe.** The world breathes in. A reveal, a moment, a punch landing.

**When to use it:** Boss reveals, dialogue moments, special attacks, "look at this!" beats.

```js
// Zoom in slowly over 1 second, using a smooth ease
camera.setZoom(2.0, 1000, easeInOutCubic);

// Later, zoom back out
camera.setZoom(1.0, 800, easeOutExpo);
```

**What's happening:** `setZoom(level, duration, ease)` interpolates the zoom level over time. The easing function controls the *feel* — `easeInOutCubic` is gentle on both ends (cinematic), `easeOutExpo` slams out fast and decelerates (punchy).

**Try:** Pair this with `addTrauma` on the same frame for an "impact zoom." Camera punches in and shakes — classic anime fight scene move.

---

## 07 — Mouse Wheel Zoom
**The vibe.** The point under your cursor stays under your cursor while the world scales. Like every map app you've used.

**When to use it:** Strategy games, level editors, any RTS-style camera.

```js
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    // Convert mouse position to world coordinates
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPoint = { x: 0, y: 0 };
    camera.screenToWorld(sx, sy, worldPoint);

    // Zoom toward that exact point, instantly (no animation)
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = camera.zoom * zoomFactor;
    camera.zoomAt(worldPoint.x, worldPoint.y, newZoom, 0);
});
```

**What's happening:** `screenToWorld` figures out which world point is currently under the mouse. `zoomAt(x, y, level, 0)` — note the zero duration — instantly changes the zoom while keeping that world point pinned to the same screen position. This is the only correct way to do "zoom under cursor."

**Try:** Change the `0` to `200` (ms) to get a softer, animated zoom that still tracks the cursor.

---

## 08 — Explosion Shake
**The vibe.** Something exploded. The whole world flinches.

**When to use it:** Anywhere you want weight — explosions, big hits, landings, level transitions.

```js
camera.shakePreset('explosion');         // one shot, decays automatically
camera.shakePreset('explosion', 0.5);    // half intensity
camera.shakePreset('explosion', 1.2);    // 120% intensity
```

The eight built-in presets:

| Preset           | Feel                                    |
| ---------------- | --------------------------------------- |
| `explosion`      | Big, slow, lots of rotation             |
| `heavy_impact`   | Maximum damage, world-shaking           |
| `earthquake`     | Long, low-frequency, sustained          |
| `impact`         | Sharp, fast, sword-clash energy         |
| `recoil`         | Directional kick (upward)               |
| `landing`        | Directional thud (downward)             |
| `damage`         | Quick flinch, no rotation               |
| `rumble`         | Subtle continuous tremor                |

**What's happening:** Each preset is a tuned shake profile. The library handles trauma, frequency, decay, and noise-based randomization for you. Multiple shakes can stack — calling `explosion` while `rumble` is already running gives you both, layered.

**Try:** `camera.shakePreset('rumble')` at the start of a boss fight, then layer `impact` on each hit. Subtle ambient + sharp punctuation.

---

## 09 — Layered Shake
**The vibe.** Sustained tension underneath, sharp jolts on top. Like a movie score.

**When to use it:** Boss fights, set pieces, anything that needs both ambient unease and discrete events.

```js
// Set up the ambient layer once at the start of the fight
camera.shakePreset('rumble');

// During the fight, fire one-shots on top — they layer
function onPlayerHit() {
    camera.shakePreset('damage');
}

function onBossSmash() {
    camera.shakePreset('heavy_impact');
}
```

**What's happening:** The shake engine has 8 slots. Each call to `shakePreset` takes a new slot and runs independently. They sum together to produce the final camera offset. If you fill all 8 slots, the engine evicts the weakest one — so there's no allocation, ever, even in a chaotic fight.

**Try:** During the boss's "phase 2" transition, fire `earthquake` for a long sustained low rumble while continuing to use `impact` for hits. Three layers playing at once.

---

## 10 — Custom Shake Profile
**The vibe.** Build your own shake for your specific moment.

**When to use it:** The presets don't quite fit. You want a very specific feel — a magical spell, a vehicle stutter, a sci-fi warp.

```js
camera.shake({
    trauma:    0.7,     // initial intensity, 0 to 1
    freq:      18,      // shake speed (higher = jittery, lower = swaying)
    decay:     1.5,     // how fast it fades (higher = shorter)
    maxOffset: 20,      // max pixel displacement at full trauma
    maxAngle:  0.04,    // max rotation in radians at full trauma
});
```

**What's happening:** Trauma is squared internally to produce the actual offset, which is why low trauma feels gentle and high trauma feels violent. Frequency is in samples per second — `freq: 30` is rapid teeth-chattering; `freq: 4` is a slow drunken sway. Decay is units of trauma lost per second — at `decay: 1.0` and `trauma: 1.0`, the shake lasts ~1 second.

**Try:** `freq: 4, decay: 0.3, maxAngle: 0.15` is a great "spaceship in trouble" feel. Slow, drifty, lots of roll.

---

## 11 — Directional Recoil
**The vibe.** A gun fires. The camera kicks up. Not random — *up*.

**When to use it:** Firearms, melee strikes, ground slams, anything with a clear direction.

```js
// On every shot fired
camera.shake({
    trauma:    0.6,
    freq:      22,
    decay:     2.5,
    maxOffset: 15,
    dirX:      0,     // no horizontal motion
    dirY:      -1,    // shake upward only
});
```

For a sword swing to the right:

```js
camera.shake({
    trauma:    0.5,
    freq:      18,
    decay:     2.0,
    maxOffset: 18,
    dirX:      1,     // shake to the right
    dirY:      0,
});
```

**What's happening:** When you provide a direction, the shake's noise is projected onto that vector instead of being omnidirectional. The camera moves along the line you specified, with magnitude that still wobbles via noise — so it doesn't look mechanical.

**Try:** Set `dirX` and `dirY` from the actual direction the player is firing. A perfectly responsive directional kick that always fights against where the bullet is going.

---

## 12 — Boss Reveal
**The vibe.** The music swells. The camera pulls back from the player, races across the arena, and lands on the boss. *Now you see what you're up against.*

**When to use it:** Boss introductions, big reveals, set-piece moments.

```js
const seq = camera.createSequence();
seq.moveAndZoom(boss.x, boss.y, 1.7, 1100, { ease: easeInOutCubic })
   .shake('heavy_impact')
   .wait(900)
   .moveAndZoom(player.x, player.y, 1.0, 1000, { ease: easeInOutCubic });

camera.playSequence(seq);
```

**What's happening:** Sequences are a fluent, chainable mini-language for cinematics. `moveAndZoom(x, y, zoom, duration, opts)` pans and zooms in one breath. `shake(presetName)` fires a shake at that moment. `wait(ms)` is a pause. The whole thing runs on its own timeline — the camera is "taken over" while it plays, then returns to following the player when it finishes.

**Try:** Add `.call(() => playSound('boss_roar'))` between the zoom and the shake to sync audio.

---

## 13 — Pan to Point
**The vibe.** The camera glides somewhere to show you something.

**When to use it:** Tutorial pointers, scripted reveals, "look over here" moments. Simpler than a full cinematic.

```js
const seq = camera.createSequence({
    onComplete: () => console.log('camera arrived')
});
seq.moveTo(treasureChest.x, treasureChest.y, 1500, { ease: easeInOutCubic });
camera.playSequence(seq);
```

**What's happening:** `moveTo(x, y, duration, opts)` is a simple pan without zoom changes. The `onComplete` callback fires when the move finishes — useful for chaining game logic ("now show the dialog box").

**Try:** Wrap this in a function `panToObject(obj, duration)` and use it everywhere — tutorial markers, NPCs starting dialog, quest objectives appearing.

---

## 14 — Composed Cinematic
**The vibe.** Pan, zoom, shake, beat, pan, zoom out. Hand-choreographed.

**When to use it:** Cutscenes, intros, dramatic endings, post-credits stingers. Anywhere you'd write a storyboard.

```js
const seq = camera.createSequence();
seq.moveAndZoom(allyA.x, allyA.y, 1.4, 900)       // pan to ally A
   .wait(300)                                       // beat
   .shake('damage')                                  // ally takes a hit
   .moveAndZoom(allyB.x, allyB.y, 1.4, 900)        // swing to ally B
   .wait(300)
   .shake('damage')
   .moveAndZoom(boss.x, boss.y, 1.8, 1200, { ease: easeInOutCubic })
   .shake('explosion')
   .wait(800)
   .moveAndZoom(player.x, player.y, 1.0, 1100);    // return to player

camera.playSequence(seq);
```

**What's happening:** Sequences are just lists of timed events. Each one runs in order by default. You're essentially writing a tiny screenplay: "the camera does X, then waits, then does Y." Chaining keeps it readable — read top to bottom, that's the order it happens.

**Try:** Pass `{ at: '+=200' }` to overlap steps slightly. Pass `{ at: 0 }` to start a step at the very beginning regardless of where you put it in the chain. Pass `{ at: '<' }` to start when the previous step started.

---

## 15 — Co-op Multi-Target
**The vibe.** Two players. One camera. It frames both, zooming out when they spread apart and in when they converge.

**When to use it:** Co-op games, fighting games, any setup where multiple characters share the screen.

```js
const players = [player1, player2];

camera.trackMultiple(players, {
    padding:   100,      // space around the group
    minZoom:   0.4,      // don't zoom further out than this
    maxZoom:   1.6,      // don't zoom closer than this
    zoomSpeed: 4,        // how fast the zoom adjusts
});
```

To stop tracking multiple targets and return to single-player:

```js
camera.trackSingle();
```

**What's happening:** The camera builds a bounding box around all the targets you give it, adds padding, and figures out the zoom level needed to fit that box on screen. It does this every frame, smoothly. If the players get too far apart and minZoom would be exceeded, the camera caps at minZoom — protecting your art from being shown at unreadable distances.

**Try:** For Smash-style fighting games, use `padding: 200, minZoom: 0.5, maxZoom: 2.0`. For Magicka-style co-op, `padding: 100, minZoom: 0.3`.

---

## 16 — Soft Bounds
**The vibe.** As the camera approaches the edge of the world, it smoothly slows down instead of slamming to a halt.

**When to use it:** When your level has firm edges but you want them to feel like a gradient, not a wall.

```js
camera.setBoundsType(BoundsType.SOFT);
camera._bounds.softZone = 100;   // last 100px before the edge eases the camera
```

**What's happening:** With SOFT bounds, when the camera target enters the last `softZone` pixels before the world edge, its motion is multiplied by a smoothstep curve. The closer to the edge, the slower it goes — until it gracefully stops at the boundary. The player can keep moving, but the camera glides to a stop.

**Try:** Use `HARD` bounds in fast-paced action levels (instant feedback) and `SOFT` in exploration zones (gentle feel). You can change at runtime — `setBoundsType` is one call.

---

## 17 — Elastic Bounds
**The vibe.** Push against the edge and it pushes back. Like a rubber band.

**When to use it:** Cute games. Toy-like feel. Anywhere "physical" softness is the personality.

```js
camera.setBoundsType(BoundsType.ELASTIC);
camera._bounds.elasticMax = 30;        // max overshoot in pixels
camera._bounds.elasticStrength = 8;    // how strongly it springs back
```

**What's happening:** ELASTIC allows the camera target to go slightly past the world edge (capped by `elasticMax`), then a spring force pulls the camera back. The effect is a satisfying rubber-band stretch when the player runs into the world boundary.

**Try:** Combine ELASTIC bounds with a `wobble` shake on the "snap back" frame for an even more toy-like feel.

---

## 18 — Arena Bounds
**The vibe.** During a boss fight, the camera can't leave the arena even if the player tries.

**When to use it:** Boss arenas, contained encounters, mini-games that take place in a subset of the world.

```js
// Player enters the boss arena — lock the camera to it
camera.setBoundsRect(
    bossArena.x, bossArena.y,
    bossArena.width, bossArena.height
);

// Boss defeated — release the camera back to free roaming
camera.clearBoundsRect();
```

**What's happening:** `setBoundsRect` overrides the world bounds with a custom rectangle. The camera will respect *this* rect instead of the full world for as long as it's set. The bounds type (HARD / SOFT / ELASTIC) still applies — so an elastic arena bounds with a small overshoot feels like the camera "wants to leave but can't."

**Try:** Use this for split-screen reveals — give each player a custom rect that covers their half of the world.

---

## 19 — Parallax Backgrounds
**The vibe.** Distant mountains drift slowly. Foreground bushes whip past. The world has depth.

**When to use it:** Side-scrollers, platformers, exploration games, anything with a sense of space.

```js
// Register layers once, at level load
camera.addParallaxLayer('sky',       0.05);   // distant — barely moves
camera.addParallaxLayer('mountains', 0.20);
camera.addParallaxLayer('hills',     0.50);
camera.addParallaxLayer('foreground', 1.30);   // closer than the world — moves faster

// Then in your render loop:
ctx.save();
camera.applyParallax('sky', ctx);
drawSky(ctx);
ctx.restore();

ctx.save();
camera.applyParallax('mountains', ctx);
drawMountains(ctx);
ctx.restore();

ctx.save();
camera.apply(ctx);            // your main world layer (speed = 1.0 implicitly)
drawWorld(ctx);
ctx.restore();

ctx.save();
camera.applyParallax('foreground', ctx);
drawForeground(ctx);
ctx.restore();
```

**What's happening:** Each parallax layer scrolls at its own speed multiplier. A speed of `0.05` means the layer moves 5% as fast as the camera — so distant mountains appear to barely move, while a speed of `1.30` means a layer scrolls 30% faster than the world (great for very close foreground elements).

**Try:** Different speedX and speedY produce a "tilted plane" effect — `addParallaxLayer('floor', 1.0, 0.6)` creates a floor that scrolls horizontally with the world but slower vertically, giving a sense of perspective.

---

## 20 — Debug Like a Pro
**The vibe.** A live readout of every camera decision. Indispensable while building.

**When to use it:** Development, always. Disable for production.

```js
// In your render loop, after camera.apply()
const debugConfig = {
    show: {
        position: true,    // pos & target coords
        zoom:     true,    // current zoom level
        mode:     true,    // active follow mode
        shake:    true,    // live shake slot inspector
        sequence: true,    // sequence progress bar
        parallax: true,    // active layers
        bounds:   true,    // bounds type per edge
    },
};

// After drawing the world
camera.debugHUD(ctx, debugConfig);

// And before camera.apply(), inside the world transform:
camera.debugWorld(ctx);   // deadzone, lookahead, world bounds visualizer
```

**What's happening:** The HUD draws a screen-space panel in the top-left with live values, color-coded by category. The world overlay draws the deadzone box, the lookahead vector, and the world bounds inside the camera transform — so you can see exactly what the camera is "thinking" relative to where things actually are.

**Try:** Set `position: false` and keep just `shake: true` during a tuning session — you'll see every shake slot's trauma decay in real time, which makes designing custom profiles much easier.

---

# Quick Reference

The whole library in one screen.

| Need                              | Call                                             |
| --------------------------------- | ------------------------------------------------ |
| Create a camera                   | `new CinematicCameraPro(vW, vH, wW, wH)`         |
| Update each frame                 | `camera.update(dt, x, y, vx, vy)`                |
| Apply transform for drawing       | `camera.apply(ctx)`                              |
| Change follow style               | `camera.setMode(FollowMode.SMOOTH)`              |
| Smooth zoom                       | `camera.setZoom(level, duration, ease)`          |
| Zoom centered on a point          | `camera.zoomAt(x, y, level, duration, ease)`     |
| Convert screen → world            | `camera.screenToWorld(sx, sy, out)`              |
| Convert world → screen            | `camera.worldToScreen(wx, wy, out)`              |
| One-shot shake from preset        | `camera.shakePreset('explosion')`                |
| Custom shake                      | `camera.shake({ trauma, freq, decay, ... })`     |
| Clear all shakes immediately      | `camera.clearShakes()`                           |
| Track multiple targets            | `camera.trackMultiple(targets, options)`         |
| Stop multi-tracking               | `camera.trackSingle()`                           |
| Build a sequence                  | `camera.createSequence().moveTo(...).shake(...)` |
| Play a sequence                   | `camera.playSequence(seq)`                       |
| Stop the current sequence         | `camera.stopSequence()`                          |
| Set bounds behavior               | `camera.setBoundsType(BoundsType.SOFT)`          |
| Set a custom bounds rectangle     | `camera.setBoundsRect(x, y, w, h)`               |
| Add a parallax layer              | `camera.addParallaxLayer(id, speedX, speedY?)`   |
| Draw a parallax layer             | `camera.applyParallax(id, ctx)`                  |
| Debug overlay (screen space)      | `camera.debugHUD(ctx, config)`                   |
| Debug overlay (world space)       | `camera.debugWorld(ctx)`                         |

---

## Five rules to ship by

1. **Use `dt` everywhere, never frame count.** The library is built around delta time. Pass it in seconds (`(now - last) / 1000`).
2. **Set up the camera before your first render call.** This guarantees the internal timeline ticker starts in the right order.
3. **`camera.apply(ctx)` goes between `ctx.save()` and `ctx.restore()`.** Always. If you forget the restore, your UI will inherit the camera transform.
4. **Don't read positions before calling update.** `camera.pos` is the *result* of the latest update, not the goal you're setting.
5. **Reach for presets first.** All 8 shake presets are tuned. Reach for a custom profile only when you have a specific moment in mind.

---

## Where to go next

- The interactive demo (`lite-camera-pro-demo.html`) — try every feature with sliders.
- The README — full API reference and architecture notes.
- The TypeScript definitions (`index.d.ts`) — every parameter, documented.

That's it. Twenty recipes, one library, every game. Go build something beautiful.
