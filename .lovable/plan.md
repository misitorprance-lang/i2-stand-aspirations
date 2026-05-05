# Stand Overhaul Pass — Visuals, Balance, GER

A focused pass covering all three parts of your request. Single update, no part 2 follow-up.

## Part 1 — Visuals & gating

### Strange Hat remodel (`engine.ts` — pickup draw + Game.tsx inventory icon)
Replace the bowler silhouette with:
- Black flat-brim cap (rounded crown + flat visor)
- Tuft of dark hair at the back of the cap
- Small gold accessory box beside it with a black palm-print outline (5-finger silhouette)
- Subtle cyan glow keeps "strange" feel

### SPTW Rage Mode rework (`Game.tsx`, `engine.ts`)
- **Button position**: rage button now overlays A1+A2 (spans the two slots) when meter is full, instead of free-floating. Match standard `AbilityBtn` styling.
- **Visual**: glowing cyan eyes on the **player** (not the stand), with a vertical "flow" trail rising off the eyes. Stand tints stay normal.
- **Duration**: 6s → **10s**. Damage bonus unchanged (+35%).

### SPTW A2 redesign — "Triple Pebble" → click-to-fire 3-shot
- Smaller pebbles (radius 4 → 3), faster, **damage 4 → 2**.
- On press: enters a 3-charge window (~2.5s). Each tap of A2 fires one pebble at nearest target. After 3 shots OR window expires, full cooldown begins.
- UI: A2 button shows `1/3 → 2/3 → 3/3` while window is open.

### SPTW model remodel (`drawSptw` in `engine.ts`)
Reference JoJo wiki SPTW: shorter, more compact frame than SP; cyan/teal palette with purple accents; star-shaped shoulder pads, pointed crown headpiece, pale face with cyan eye glow, gauntlets with star emblems. Reuse the same draw style as Star Platinum but recolor + add the star-pad/crown details.

### Time Stop banner position (`Game.tsx`)
Move "TIME STOPPED" banner from above SPTW's nameplate to top-center of the screen (same placement as other banners).

## Part 2 — NPCs, Echoes, RHCP, items

### Buff NPC HP (`engine.ts` spawn paths)
- Neutrals: 18 → **30**
- Hostiles: 28 → **48**
- Boss/elite (if any): scale by same ~1.7×

### Echoes rework (`stands.ts`, `engine.ts`, `codex.ts`)
- **A1 "ゴゴゴ" (Sent Bleed)**: convert to **short-range / melee-cast** — must be within 30u of target; applies bleed DoT. Glyph rendered as Japanese (ゴ ゴ ゴ).
- **A2 "ドドド" (Ground Text)**: lower damage (6→3 burst), text **persists on ground until an NPC touches it**, then triggers explosion + knockback. Glyph: ドドド.
- **A3 "ピピピ" (Freeze)**: change from area DoT to **single-target freeze** (locks one NPC in place + slow), no diverse FX. Glyph: ピピピ.
- **A4 (new "ズキューン")**: close-range single-target buff — Echoes hits one NPC, marks them as "amplified" (slowed heavily, takes +50% damage from player for 5s). Replaces three-freeze pressure. No stun.

### RHCP rework (`stands.ts`, `engine.ts`, `codex.ts`)
- **A2 → "Cable Dash"**: blitz-dash through nearest target. Player teleports past target along the line, deals damage on pass-through, brief i-frames. Replaces the AoE discharge.
- **A3 "Ground Bomber"**: add real **knockback** (240u) to hit NPCs. Crater FX becomes **temporary** — fades after 4s instead of lingering permanently.

### Requiem Arrow rules (`engine.ts`)
- Cap **1 in world at any time**. Track via `requiemArrowInWorldCount`; suppress further spawns until picked up.
- **Only Gold Experience** can use it (evolves → GER). Any other stand attempting use → toast "Only Gold Experience can use this".
- **Remodel pickup**: identical to normal arrow shaft, with a small beetle silhouette (scarab outline) on the head — same shape language as the regular arrow.

### Strange Hat rules
- Cap **1 in world**, same gating as Requiem (already partially in place; tighten the spawn check).
- Already SP-only — keep enforced.

## Part 3 — Gold Experience Requiem

New stand `gold_experience_requiem` (id: `ger`). Unlocked by using Requiem Arrow while having Gold Experience.

### Model (`drawGer` in `engine.ts`)
Per JoJo wiki GER: gold/pink humanoid, smooth porcelain face, **ladybug emblems on shoulders, knees, forehead**, long pink-tipped hair, ornate gauntlets. Reuse Gold Experience pose; recolor pale-gold + pink, add ladybug dots.

### Stats / abilities (`stands.ts`, `engine.ts`, `codex.ts`)
- **M1**: Punch — damage 6, crit 7, range 22.
- **Passive "Return to Zero"**: When player takes damage, the attacker is **rewound** to its position 5s ago (snapshot history per NPC). NPC keeps damage taken; player negates this hit. **20s internal cooldown.** Implement via per-entity `posHistory: Vec2[]` (push every 0.5s, keep last 12).
- **A1 "Life Beam"**: instant beam projectile (visual: thin gold line) — pebble-flick, pierces, 13 damage, range 280, cooldown 5s.
- **A2 "You'll Never Reach the Truth"**: GER punches NPC; spawn 3-5 ghost copies of NPC drifting from behind; copies fade over 1s; NPC takes staged damage ticks (6 ticks × heavy) until dead or 4s elapses. Cooldown 12s.
- **A3 "Triple Loop"**: lock target in place; cycles 3 deaths over ~5s — (1) lightning strike, (2) poison kill, (3) pebble barrage. Each cycle deals lethal-tier damage (24+) but target can survive if HP very high. Cooldown 18s.
- **A4**: none (button shows `—`, disabled).

### Codex entry
Full `codex.ts` page with description, rarity = legendary (Requiem-exclusive, not in roll table).

## Part 3 — DISC spawning

### Better spawn rate + zones (`engine.ts`)
- Increase DISC spawn weight (current arrow:disc ratio favors arrows ~3:1) → roughly **1:1**.
- Add 4 new spawn anchor zones, including one in the **map center** (currently spawns cluster around houses). Pick from anchor list when spawning items.

## Files touched
- `src/game/stands.ts` — add `ger`, rework Echoes/RHCP/SPTW A2 ability data, new `triple_pebble_charge` kind, Echoes Japanese glyphs.
- `src/game/types.ts` — add `posHistory`, `gerReturnReadyAt`, `sptwTriplePebble: { charges, expireAt }`, RHCP dash state.
- `src/game/engine.ts` — Hat/Requiem caps + remodels, NPC HP buff, ability handlers, GER passive history, GER abilities, RHCP dash, Echoes rework, time-stop banner removal from stand label, DISC spawn changes, draw functions for SPTW remodel, GER model, new Hat model, Requiem-arrow remodel.
- `src/components/Game.tsx` — Rage button placement spanning A1+A2 with player-eye flow VFX hook, A2 charge counter UI, GER A4 disabled, time-stop banner moved to top-center.
- `src/game/codex.ts` — GER entry, Echoes/RHCP/SPTW description updates.

Approve and I'll implement everything in one pass.