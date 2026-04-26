# Plan: Detached Stand Bodies, Balance, Boingo, Save/Load, White Album

## Part 1 — Hanged Man & Puppet as separate "player" entities

### Hanged Man requires summon
- Add `hangedManActive` flag in `World`. `m1` (Saber) is the only ability allowed when inactive.
- A1 "Pilot" toggles `hangedManActive` AND `pilotActive` together: first press summons + starts piloting; second press desummons. While inactive, A2/A3/A4 show banner "Summon Hanged Man first" and do nothing.
- A2 (Mirror Shard), A3 (Teleport), A4 (Brutal Slash) all require `hangedManActive` and now originate from `w.hangedMan.pos` instead of player.
- M1 Saber: when `hangedManActive`, swing originates from the Hanged Man entity (matches Ebony Devil M1 pattern).

### Visible model + collision
- Add `drawHangedMan(ctx, w, pos)` renderer: tall slim humanoid in grey/blue, saber, cloak. Called from main draw list when `hangedManActive`, sorted by `y` like `drawPuppet`.
- Add `drawPuppet` body refresh so the puppet reads as a separate "player-like" doll.
- Both already have `pos` and `radius` — pass through `pushOutOfProps` and `tryMove` paths each tick so they collide with props.

### Hostile NPCs target the active stand
- In NPC AI block (the `targetPos` selection around `puppetCloser`), extend logic:
  - If `w.hangedManActive`, also consider `w.hangedMan.pos` as a candidate. Pick whichever (player / puppet / hanged man) is closest.
  - When NPC reaches attack range of the puppet → call existing `damagePuppet`. When it reaches the hanged man → new `damageHangedMan(w, dmg)` that routes the damage to the player (HP shared).
- Player movement freeze: existing `piloting` flag already disables player joystick movement. Confirm it covers both stands; player still cannot move while either is active.

### Ebony Devil Rage Mode → puppet-only
- A4 `rage_mode`: require `w.puppet.active`; otherwise banner "Summon Puppet first".
- Damage multiplier (`* 1.55`) currently applied to all player damage during `rageUntil` — gate it so it only multiplies damage whose origin is the puppet (M1 puppetSwing, `puppet_spear`, `puppet_spin`). Player's own M1 / other abilities are unaffected.
- Visual rage ring drawn around puppet instead of player while rage is active and puppet is summoned.

## Part 2 — Balance pass (abilities only, M1 untouched)

Edit `src/game/stands.ts`:
- Star Platinum: Star Finger 6→5, Ranged Smash 8→6, Launch 14→11.
- RHCP: Electric Shot 5→4, Discharge 7→5, Ground Bomber 12→9, Tesla Coil tick 2.5→1.8.
- Echoes: Explosive Text 9→7, Burning Text DPS 1.5→1.1, Three Freeze 11→8 (S.H.I.T. 25→18).
- Ebony Devil: Spear Jab 8→6, Spin 7→5.
- Gold Experience: Eagle 6→5, Hologram Stun 7→5.
- Hanged Man: Brutal Slash 8→7 (already strong via bleed/stun/slow).

## Part 3 — Item spawn rate

In `engine.ts` constants:
- `ARROW_INTERVAL` 12-22 → 6-11
- `DISC_INTERVAL` 28-46 → 14-22
- `MAX_ARROWS_ON_GROUND` 2 → 4
- `MAX_DISCS_ON_GROUND` 1 → 2

## Part 4 — Boingo (tutorial NPC)

- New entity type tag `friendly` already exists. Add a dedicated `w.boingo: { pos, radius, alive }` spawned once at world init via `freeSpot`.
- Render as a smaller character (radius 7, shorter body, big head, fortune-card sprite).
- Proximity prompt: when player within 24px, show interact hint; tap a new on-screen "Talk" button (only visible when in range) or press `E` to open dialog.
- Dialog overlay (React in `Game.tsx`):
  - **Tabs**: "Combat Basics" + one tab per stand the player has already encountered (or all stands).
  - Combat: explain M1 auto-aim, abilities 1-4, arrows = roll, discs = drop, sprint, hostile NPCs.
  - Stand tab: shows the stand's mini canvas preview (reuse `drawStand`/`drawHangedMan`/`drawPuppet` rendered to a small offscreen canvas) plus each ability name + description pulled from `STANDS[id].abilities`.
- Boingo never takes damage, never moves.

## Part 5 — Browser Save / Load

- Save key: `localStorage["standtest.save.v1"]`.
- Persisted fields: `standId`, `shitVariant`, `arrowsRef`, `discsRef`, `kills`, `player.hp/maxHp`, `player.pos`, `echoesAct`, `boingoTalkedTo` (so help banner doesn't repeat).
- Buttons in HUD top-right: "Save" / "Load" (small chips). Auto-save every 30s and on stand change.
- Load resets transient state (cooldowns, channel, projectiles, vfx) then applies persisted fields.

## Part 6 — Banner stacking

- Replace `bannerText` (single string) with `banners: { id, text, color, expireAt }[]` queue.
- Render in `Game.tsx`: stack vertically (top-to-bottom) at top-1/3 with 4px gap, each in its own pill. Pilot / Time Stop / "Out of range" never overlap.
- Existing call sites that set `bannerText`/`bannerUntil` become `pushBanner(w, text, durationSec, color?)` helper.

## Part 7 — White Album (new stand)

### Data (`stands.ts`)
- Add `"white_album"` to `StandId` union, add to `STANDS` map and `ROLLABLE` (rarityWeight 3).
- Aura color `#e8eaff`, accents purple `#7c5cff`, visor `#c8e64a`.
- Abilities:
  - **m1 Punch**: melee, base 1.4, crit 2.1 (15% crit chance — handled in `m1DamageRoll`).
  - **a1 Freeze Punch**: melee, dmg 5, applies new `frozenUntil` status (1.2s slow + tint), cd 3.
  - **a2 Ice Stomp**: aoe_target, dmg 6, radius 56, applies freeze + 1.6s stun, cd 6.
  - **a3 Ice Heal**: self-heal — restores 18 armor (suit hp), cd 8, drains a chunk of bar.
  - **a4 Frost Expanse**: dot_zone, radius 110, dps 1.5 (chip 1-2), slow inside, duration 5s, cd 16.

### Passives (engine)
- `whiteAlbumActive` flag (default true on equip), with toggle cooldown 4s on top of existing `toggleStandActive`.
- New `w.whiteAlbumBar: number` (0-100). Drains 6/s while active, refills 10/s while inactive. Each ability subtracts (a1:8, a2:18, a3:35, a4:25). At 0 → forced deactivation + 6s cooldown.
- **Suit armor**: while active, all incoming player damage reduced by 1 (min 0.1).
- **Speed boost**: while active, base player speed +20%.
- **Ice trail**: while active and moving, push small `iceTile` props onto a list `w.icePath: { pos, expireAt }[]` (1s spawn cadence). NPCs whose center is within 16px of any iceTile get -25% movespeed for 0.5s. Render as thin pale-blue circles under entities.
- **NPC slow on player ice**: handled via per-NPC `iceSlowUntil` updated each tick.

### Rendering
- `drawWhiteAlbum(ctx, w, pos)` — white body, purple trim, yellow-green visor stripe across face, ice skate triangles under feet. Skating wobble = sin(t*8).
- Add ice-trail particles (cyan sparkles) when player moves while active.

### Sound
- New keys in `sound.ts`: `iceCast`, `iceShatter`, `iceSkate`, `whiteAlbumOn`, `whiteAlbumOff`. Cheap synth tones.

## Files touched

- `src/game/types.ts` — `World` additions: `hangedManActive`, `whiteAlbumActive`, `whiteAlbumBar`, `whiteAlbumToggleAt`, `icePath`, `boingo`, `banners[]`, `boingoOpen`. NPC: `iceSlowUntil`, `frozenUntil`.
- `src/game/stands.ts` — balance numbers + new `white_album` entry + add to ROLLABLE.
- `src/game/codex.ts` — codex entry for White Album, version bump to 1.2.0.
- `src/game/engine.ts` — Hanged Man activation gating, puppet/hangedman as targetable, rage-mode puppet-only, ice trail logic, new ability cases (`ice_heal`, generic reuse for others), Boingo spawn + render + dialog data, save/load functions, banner queue, spawn-rate constants.
- `src/game/sound.ts` — new sfx keys.
- `src/components/Game.tsx` — banner stack rendering, Boingo talk button + modal with mini stand previews, Save/Load HUD chips, White Album bar UI, suit/skate icons.

## Out of scope (this iteration)
- Multiplayer.
- Cloud (cross-device) save — local only.
- Boingo voice lines / animations beyond idle bob.
