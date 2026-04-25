## Stand Test — Game Plan

A portrait, mobile-first top-down pixel RPG inspired by JoJo's Bizarre Adventure. Rendered with **HTML Canvas 2D** in a single fullscreen game view, using **colored rects/circles** for all visuals (player, stands, NPCs, props, items, projectiles, AOE rings, damage numbers).

---

### 1. Layout & rendering
- Single full-viewport portrait canvas, locked to a virtual resolution (e.g. 360×640) and scaled to fit the screen.
- Pixel-style rendering: integer positions, crisp edges, no smoothing.
- Camera follows the player, clamped to map bounds.
- Fixed-timestep game loop (60fps target) with delta-time movement; entities culled off-screen for performance.

### 2. The map
- One green grass map (~2× viewport in each direction) with scattered props: trees, rocks, bushes, fences, small houses.
- Each prop has a hand-tuned collision rectangle matching its visible shape (not just its bounding box).
- **Ground destruction:** certain moves (Ground Bomber, Tesla Coil, S.H.I.T.) leave persistent dark craters/scorch marks on the grass; craters fade after some time to keep memory bounded.

### 3. Controls (mobile portrait)
- **Left thumb:** virtual joystick (bottom-left) to move.
- **Right thumb:** five circular buttons (bottom-right) — **M1** plus **1, 2, 3, 4** for stand abilities.
- Aimed moves (e.g. Ora Ora Rush) fire in the direction the joystick is currently pointing, falling back to last-faced direction.
- Auto-aim moves (e.g. Three Freeze) pick the nearest valid target in range automatically.
- Each ability has its own cooldown shown as a radial sweep on the button.

### 4. NPCs
- **Friendly NPCs:** wander randomly within the map, can be hit (take damage, show numbers) but never retaliate.
- **Hostile enemies:** wander, then chase and melee the player when in aggro range; player has HP bar, can take damage and "die" (respawn at start with full HP — no game-over screen).
- Both types respawn at random valid spots after a delay when killed.
- Total NPC count is capped for performance.

### 5. Inventory & item spawns
- Tiny inventory UI at top of screen with two slots: **Stand Arrow** and **Stand DISC** (showing counts).
- **Stand Arrow:** spawns at a random walkable spot on a medium timer, picked up by walking over it.
- **Stand DISC:** same mechanic but on a longer timer (rarer).
- Tapping the **Stand Arrow** slot uses one arrow → rolls a stand (see rarity below).
- Tapping the **Stand DISC** slot uses one disc → removes your current stand (back to no stand, only basic punch).

### 6. Stand rolling (rarity)
Weighted roll on arrow use:
- **Red Hot Chili Pepper** — most common
- **Echoes** — uncommon
- **Star Platinum** — rarest
- Brief on-screen banner shows which stand you got.
- A **rare modifier roll** on Echoes can upgrade its slot-4 to **S.H.I.T. (Brutal Focused Gravity)**.

### 7. Stands & abilities
Each ability has: damage, range, cooldown, hit type (melee / projectile / AOE / auto-aim / aimed dash / channel). Damage numbers float up from each hit, color-coded by severity. No move names appear as text — only numbers.

**Default (no stand):** weak punch only.

**Star Platinum** (rarest, strongest)
- M1 — Punch (close melee)
- 1 — Star Finger (short forward stab, pierces)
- 2 — Ranged Smash (medium projectile)
- 3 — Ora Ora Rush (aimed channel, rapid hits in a cone, lots of small numbers)
- 4 — Launch (close-range knockback strike, high single-hit)

**Red Hot Chili Pepper** (common)
- M1 — Punch
- 1 — Electric Shot (fast straight projectile)
- 2 — Electric Discharge (AOE ring around player)
- 3 — Ground Bomber (targeted ground AOE, leaves crater)
- 4 — Tesla Coil (large stationary AOE that ticks for a few seconds)

**Echoes** (uncommon, scaling acts)
- M1 — Act 3 Punch (small melee, lowest damage in game ~0.3)
- 1 — Act 1 Freeze Touch (close-range, briefly stuns target)
- 2 — Act 2 Explosive Text (placed projectile that detonates)
- 3 — Act 2 Burning Text (DoT zone on ground)
- 4 — Act 3 Three Freeze (auto-aim Focused Gravity Crush on nearest target — heavy hit)
- 4 (rare variant) — **S.H.I.T.** (massive auto-aim crush, top damage ~25, leaves crater)

Damage values span the full **0.3 → 25** range you specified, tuned per move.

### 8. Combat feedback
- Floating damage numbers (varying size/color by damage tier).
- Brief screen shake on heavy hits and crater-making moves.
- Hit flashes on targets; small particle puffs from impacts (all drawn shapes).
- Player and enemies have small HP bars above them when damaged.

### 9. Performance & polish
- Object pools for projectiles, damage numbers, and particles.
- Off-screen entity culling; spatial partition (simple grid) for collision and auto-aim queries.
- Capped entity counts (NPCs, projectiles, craters).
- Pause when the browser tab is hidden.
- Touch + mouse both supported (so it's playable in the desktop preview too).

### 10. Title & first run
- Short "Stand Test" splash on launch, then drops you into the map with no stand, ready to find an arrow.

---

After approval I'll wire this up as a single `Game` component mounted on the `/` route, with the canvas filling the portrait viewport and all UI (joystick, ability buttons, inventory, HP) rendered as overlay HTML for crisp touch targets.