
# Stand Test — pass to clean up the remaining issues

This pass touches `src/components/Game.tsx`, `src/game/engine.ts`, `src/game/stands.ts`, `src/game/types.ts`. No new files.

---

## 1. Inventory drawer + button (replaces the pile of icons)

In `Game.tsx` top bar, remove the four item buttons (arrow / disc / requiem / pebble / tonth).
Add ONE button: `🎒 Inventory (N)` where N is total carried items.
Tapping it opens a centered modal listing every item with: pixel-art icon, name, count, "Use" button.

- Arrow → `useArrow` (only when standId === "none")
- DISC → `useDisc` (only when a stand is equipped, not Moon Rabbit-from-pebble lock)
- Requiem Arrow → see #7 (no longer freely usable)
- Blue Pebble → `useBluePebble` (only when standId === "none")
- Tonth Copy → opens the Tonth book modal (#6)

Keep S / L / 🔊 buttons in the top bar.

## 2. Moon Rabbit overlay (like White Album)

In `engine.ts`:
- Treat `moon_rabbit` like `white_album`: hide the floating stand body, draw the player as the Moon Rabbit instead. Add `wearingMoonRabbit = w.standId === "moon_rabbit" && w.standActive` next to `wearingWhiteAlbum` in `drawPlayer`, set `standVisible` accordingly.
- Add `drawMoonRabbitPlayer(ctx, w, pl)` matching the codex description: rabbit ears on top of head, blonde hair tuft under ears, maroon eyes, light-brown rabbit-paw hands/feet, dark red suit body with dull-pink grid stripes, white collar, black tie.

## 3. Smaller, single-line notifications

In `Game.tsx` change the banner block (lines 517–527):
- Position: `top-16` (just under HP bar) instead of `top-1/3`.
- Style: `text-[10px] px-2 py-1 rounded-sm`, semi-transparent black, no thick colored border (use `borderColor: standColor55`).
- Show only `ui.toast`. Drop the `ui.banners` fallback here so item pickups and "out of range" stop dominating the screen.
- Stand-name announcements (got new stand) keep their own bigger banner via `bannerText` so it still feels like an event — keep that block separate at top-1/3 but only render when `bannerText` starts with `"Got Stand"`.

## 4. Limit "stand off" / "out of range" repeat spam

In `engine.ts`:
- Add `w.bannerSuppressCounts: Record<string, number>` (init `{}`), and a helper `softBanner(w, key, text, seconds)` that increments and only sets `bannerText` if count ≤ 3. Counts persist for the session.
- Replace the four offending banners with `softBanner`:
  - "Resummon stand to attack" (line 902)
  - "Out of range" (line 945)
  - "Summon Hanged Man first" (line 911)
  - "Hanged Man only attacks inside a shard domain" (line 920)
  - "Summon Puppet first" (lines 928, 1229)
- After 3 trips, the banner stops showing — player figures it out or grabs Boingo's book.

## 5. Stand-arrow swap requires a free stand slot

`useArrow`, `useRequiemArrow`, `useBluePebble` in `engine.ts` currently overwrite the active stand. Change all three to early-return with a soft banner if `w.standId !== "none"`:

```ts
if (w.standId !== "none") {
  showToast(w, "Use a DISC to drop your stand first");
  return false;
}
```

Return `false` so `Game.tsx` does NOT decrement the inventory count when blocked. (Update the Game.tsx click handlers to check the boolean.)

## 6. Tonth Copy / Boingo's book — TWO pages

Replace the Boingo modal body with a two-page spread (`page` state in Game.tsx, default 0). Page tabs at the top: "Your Stand" / "Stand Rarity".

**Page 1 — Your Stand**:
- Pixel-art preview of the player's current stand (reuse `drawStand` on a small offscreen canvas, or render a static SVG-ish JSX block).
- Name, description from `STAND_CODEX[id].model.description`, aura color swatch.
- All 5 moves (M1, A1–A4) with name, dmg, cooldown, codex notes.
- "No stand yet" placeholder when none.

**Page 2 — Stand Rarity**:
- Iterate every entry of `STANDS` with `rarityWeight > 0`.
- For each: small pixel-art model preview (same renderer as page 1, fed each stand's `id`), name, total weight, computed % chance (`weight / sumOfWeights * 100`).
- Note at the bottom: "Moon Rabbit is unlock-only via Blue Pebble (not in arrow pool)."

Tonth Copy in inventory opens the same modal (`boingoOpen` true). Boingo button keeps existing despawn-on-talk behavior.

## 7. Requiem Arrow — purely a visual broken-arrow upgrade

- In `stands.ts` (no change to STANDS) — but in `engine.ts`:
  - Remove the inventory "Use Requiem Arrow" path. Stop tracking it as usable.
  - Drop `useRequiemArrow` entirely (or keep but make it unreachable from UI).
- In `engine.ts` item rendering (lines ~2769–2798) redo the Requiem Arrow visual: a normal arrow with a chunk missing from the shaft (skip a 2-pixel gap), and a beetle drawn on the blade — small black oval + 2 dots for spots + 2 antennae. No pink. Keep a faint dim glow only.
- In Inventory UI: Requiem Arrow appears with no "Use" button — labeled "Broken arrow (decorative)".

## 8. Echoes Act 1 = touch melee, Acts 1/2 ability text is colored

`stands.ts` rewrite Echoes:
- `m1` (Act 1 contact): `kind: "melee"`, `damage: 0.5`, `range: 14`, `radius: 10`, `cooldown: 0.35`, color `"#bff5da"`.
- `a1` Sent Bleed → keep as `bleed_text` projectile but render as colored TEXT word "BLEED" floating in red.
- `a2` Explosion text → render text "BOMB" in orange.
- `a3` Frost text → text "FREEZE" in cyan.
- `a4` keep Three Freeze.

In `engine.ts` projectile draw block (lines 2927–2982), add a generic `if (pr.textGlyph)` branch that draws the glyph string (use a lookup: `BLEED→"BLEED"`, `FREEZE→"FREEZE"`, etc.) using `ctx.font = "bold 11px monospace"; ctx.fillStyle = pr.color;` with a black outline. Apply this for `bleed_text` and any other Echoes text-projectiles.

Add zone rendering hook: when a zone has `glyph` (new optional field on Zone), draw the glyph word centered in the zone repeatedly. Wire `frost_text`/`burn_text`/`explosion_text` casts to set `glyph: "FREEZE"|"BURN"|"BOMB"` on the spawned zone, with the ability's color.

## 9. Healing moves actually show feedback

In `engine.ts` add a shared helper:

```ts
function healPlayer(w, amount, color) {
  const before = w.player.hp;
  w.player.hp = Math.min(w.player.maxHp, w.player.hp + amount);
  const got = Math.round(w.player.hp - before);
  spawnDmg(w, w.player.pos, Math.max(1, got || amount), color);  // green +N popup
  spawnVfx(w, { kind: "shockwave", pos: { ...w.player.pos }, radius: 24, color, life: 0.45 });
  for (let i = 0; i < 12; i++) {
    spawnParticles(w, { x: w.player.pos.x + rand(-6,6), y: w.player.pos.y + 4 }, color, 1, {
      shape: "spark", gravity: -90, speedMin: 20, speedMax: 60, life: 0.7,
    });
  }
  showToast(w, got > 0 ? `+${got} HP` : "Already full");
}
```

Make the "+N" damage number render with a `+` prefix when color is green — extend `spawnDmg` with an optional `prefix` argument.

Use `healPlayer` in:
- `case "ice_heal"` (replace the existing ad-hoc heal block; keep the bar drain).
- `case "moon_carrot"` (replace existing spawnVfx-only block).
- Tree of Life passive heal (search `gold_experience` tree tick — currently it just buffs damage; add `+1 HP/sec` while standing in the tree using healPlayer when `Math.floor(w.time)` ticks).

## 10. Moon Rabbit A3 "Crash" — drawn motorcycle

Currently spawns a generic projectile (rolling ball). Change:
- In the `case "crash"` ability set `textGlyph: "CRASH_BIKE"` on the projectile and `radius: 10`.
- In projectile renderer, add a `CRASH_BIKE` branch: draw a proper sprite oriented along velocity — two black wheels (circles), a red frame bar, a small rider silhouette on top, exhaust puff particles spawned each frame behind it. On detonate (existing logic) keep the explosion + extra 5 dmg AOE.

## 11. Moon Rabbit A4 "Eternal Curse" — lightning from above

In `case "eternal_curse"`:
- For each target, spawn a vertical `lightning_bolt` VFX from `{x: t.pos.x, y: t.pos.y - 220}` to `t.pos` (NOT from the player).
- Add a small delay-then-strike: push a deferred entry into a new `w.curseStrikes: { targetId, hitAt, dmg }[]` for each target with `hitAt = w.time + 0.25 + i*0.08`. In `update`, drain entries when time elapses, deal damage and play the bolt VFX + ground burst at the target. This produces a staggered "lightning rains down" visual.

## 12. House/prop damage strictly Star-Platinum-only (plus listed strong moves)

`damageProp` already gates houses but lets every melee chip trees/rocks/fences/bushes for any stand. Tighten:
- Extend the gate so non-house destructibles also require `HOUSE_BREAKERS.has(sid)` OR `HOUSE_STRONG_KINDS.has(ak)`. Move the existing house-only logic to apply to ALL destructibles.
- Keep current set: SP punches everything; strong AOE moves (aoe_target, knockback, tesla, lobbed, brutal_slash, rage_mode, time_stop, pierce, crash, eternal_curse) can also break props regardless of stand.

## 13. Star Platinum damage bump (+2..3 across the board, plus crit table)

In `stands.ts` `star_platinum.abilities`:
- m1 damage 3 → 5 (range/cd unchanged).
- a1 Star Finger 5 → 8.
- a2 Ranged Smash 6 → 9.
- a3 The World — unchanged (no damage).
- a4 Launch 11 → 14.

In `engine.ts` `m1DamageRoll` for `star_platinum`: `{ dmg: crit ? 8 : 5, crit }` (was 5/3).

Also bump M1 crit chance for SP only from 0.15 to 0.2.

## 14. White Album toggle bug fix

Currently `toggleStandActive` blocks all white_album toggling and the suit auto-flips on bar=0. Result: stand turns on instantly, no manual control.

Change behavior:
- When the player rolls or pebbles into White Album, set `standActive = false` (matches every other stand) AND set `whiteAlbumActive = false` so the suit isn't auto-on.
- In `toggleStandActive` for white_album: actually flip `standActive` AND `whiteAlbumActive` together, but only allow flipping ON when `whiteAlbumBar > 0` and `time >= whiteAlbumLockUntil`.
- Remove the auto-suit-recharge re-enable (`whiteAlbumActive = true; standActive = true;` at line 2533–2536). Replace with a banner: "Suit ready — tap Stand to wear".
- Bar drain only applies while `standActive && whiteAlbumActive`.

## 15. Save game — add inventory + boingo state, add Save/Load buttons label

`SaveData` extend with: `requiemArrows`, `bluePebbles`, `tonthCopies`, `boingoAlive`, `bannerSuppressCounts`, `whiteAlbumActive`, `whiteAlbumBar` (already), `standActive`. Read/write in `exportSave` / `applySave`. Make autosave run every 10s instead of 30s.

Game.tsx: change S / L buttons to "Save" / "Load" text labels (still small) so it's discoverable.

---

## Out of scope for this pass

- New stand art beyond Moon Rabbit overlay.
- New SFX.
- Save versioning migration beyond v1 → v2 default-fill.

After this pass, expected behaviors I'll verify in code review (not runtime):
- Top bar shows Inventory button + S/L/🔊; pickup banners are tiny and one-line.
- Arrows / Pebbles refuse to roll while a stand is equipped.
- Echoes A1 = punch on contact only; bleed/frost/burn render as colored words.
- ice_heal / moon_carrot show green +N popup, sparkle, and shockwave.
- Tree of Life ticks +1 HP/s while standing inside.
- Houses, fences, trees, rocks, bushes only break for SP punches or listed strong moves.
- Star Platinum M1 averages 5 (8 on crit); A1 8, A2 9, A4 14.
- White Album starts OFF and stays OFF until the player taps Stand.
- Save persists inventory + boingo despawn + suit state across reloads.
