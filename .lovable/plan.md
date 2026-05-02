# Stand Overhaul + Star Platinum: The World

## 1. Rarity tiers (canonical)

Add a `rarity` field to each stand and rebuild the roll system around 4 buckets that always sum to 100%. The Tonth Catalog page reads from this same table so what you see is what rolls.

- **Common (50%)** — Ebony Devil, Harvest
- **Uncommon (28%)** — RHCP, Hanged Man
- **Rare (16%)** — Echoes, Gold Experience, White Album
- **Epic (6%)** — Star Platinum, Purple Haze
- **Pebble-exclusive (Epic, guaranteed)** — Moon Rabbit (not in Arrow pool)
- **Hat-exclusive (Legendary, guaranteed)** — Star Platinum: The World (not in Arrow pool)

`rollStand()` rewrites: pick a tier by its tier %, then uniform-pick a stand inside that tier. Each stand's effective % = `tierPct / standsInTier`. `rareLuck` (Requiem Arrow) shifts probability mass from Common→Uncommon→Rare→Epic instead of scaling weights.

## 2. Tonth book — page 2 rewrite

Group display top-to-bottom: Common → Uncommon → Rare → Epic → Pebble → Legendary. Each row shows the colored mini-model, name, exact % (e.g. "8.0%"). Tier headers show the tier's total %. Simple flat list, no weight numbers exposed.

## 3. Strict prop-damage gating (real fix)

Current bug: `HOUSE_STRONG_KINDS` includes `pierce`, `knockback`, `tesla`, `aoe_target`, `crash`, `eternal_curse`, etc. — that lets RHCP, Moon Rabbit, GE, etc. break trees/fences. Tighten to: **only Star Platinum / SPTW destroy props**, plus a tiny allowlist of explicitly "deadly" moves keyed by `(standId, abilityKey)`:

```text
PROP_BREAKERS_BY_STAND  = { star_platinum, sptw }            # everything they do
PROP_BREAKERS_BY_MOVE   = {
  rhcp:a3 (Ground Bomber), rhcp:a4 (Tesla),
  moon_rabbit:a4 (Eternal Curse),
  white_album:a4 (Frost Expanse),
  gold_experience:a4 (Tree of Life — roots only, no break? -> exclude),
}
```

`damageProp` checks this exact `(sid, abilityKey)` pair. Everything else spawns the harmless puff. Pass `abilityKey` (not just `abilityKind`) through every `damagePropsInRadius` call site (engine has ~6 call sites).

## 4. Ability gating audit

Cover the gaps in the no-target gate:
- `aoe_self` (RHCP Discharge, Purple Haze Gas) — currently exempt; gate them on "any enemy within radius".
- `tree_zone`, `mirror_shard`, `frog_summon` stay exempt (real utility).
- `time_stop` stays exempt (Star Platinum / SPTW signature).
- Toggle abilities (`pilot_toggle`, `ph_pilot_toggle`, `puppet_toggle`, `harvest_*`) stay exempt.
- Confirm `useArrow` already returns false when stand equipped (it does); audit `useRequiemArrow` / `useBluePebble` / new `useStrangeHat` so the **inventory count never decrements** if equip is rejected.

## 5. Star Platinum rework

| Slot | New behavior |
|------|---|
| M1 | Unchanged: 5 dmg / 8 crit |
| A1 — Star Rush | Short dash (range 40), grab the closest enemy, lock them in place ~0.6s, deliver 2 punches (6 + 8). Replaces current pierce. |
| A2 — Star Finger | Narrower hitbox (radius 5), longer reach (range 110), small knockback (60). Damage 9. |
| A3 — The World | Time stop SFX/text moves OFF the stand label and into a centered banner + screen tint. New double-tap variant: **Time Skip** — teleport to last enemy you damaged within last 5s, brief stun (1s) on arrival. Single-tap = time stop (5s, unchanged). |
| A4 — Launch | Range shorter (18), damage 18, knockback 320. |

## 6. Star Platinum: The World (new Legendary)

New StandId `sptw`. Palette: cyan `#5fe8ff` + bright purple `#a06bff` body trim, white `#ffffff` loincloth/gloves, gold `#f5d36b` markings, black `#1a1a1a` hair. New `drawSptw` renders this distinct from SP.

| Slot | Behavior |
|------|---|
| M1 | 7 dmg / 8 crit. If held >1.0s continuously, drop to 4 dmg (track `sptwM1HoldStart`). |
| A1 | Same as SP A1 (Star Rush). |
| A2 — Triple Pebble | Three small fast projectiles (speed 420, dmg 4 each, range 240) all aimed at the locked target. |
| A3 | Same shape as SP A3 but **Time Stop is 7s** and **Time Skip can be used twice per cooldown** (charge counter, refunds 1 charge per cast until cd ends). |
| A4 | Same as SP A4 (Launch, 18 dmg, kb 320). |
| Rage Meter | New `sptwRage` 0..100, fills +5 per damage dealt. When full, a new HUD button "RAGE" lights up. Activating: 6s buff, +35% damage, eyes glow cyan + cyan outline aura on player sprite. |

## 7. Strange Black Hat (new item)

- New world prop `strange_hat` spawned next to a random house when the player first equips Star Platinum.
- One-shot: only ever exists if `w.sptwUnlocked === false`. Once picked up + used, never spawns again.
- Pickup adds `w.strangeHatCount = 1`; appears in INV with "Use" button.
- `useStrangeHat()`: requires `standId === "star_platinum"`, otherwise toast "Need Star Platinum equipped". On success: replace stand with `sptw`, set `sptwUnlocked = true`, banner "Star Platinum: THE WORLD".
- Spawn notification: soft banner "A strange hat has appeared near a house..."

## 8. Moon Rabbit changes

- **A2 — Moon Carrot → Lunar Veil**: removes heal, instead grants 2.5s of invincibility (`w.moonRabbitInvulnUntil`). White flicker overlay on player. Damage taken short-circuits to 0 during window.
- **A3 — Crash**: replace circular projectile with a dedicated motorbike sprite (drawn in projectile renderer when `pr.kind === "crash_bike"`): 2-wheel chassis, handlebars, exhaust puff trail. Explodes on contact with target **or the player** (self-damage 3 if it loops back / hits player hitbox).
- **A4 — Eternal Curse**: keep lightning targeting, but each lightning strike now spawns a **motorbike projectile** at the strike point that drives into the target and explodes (chains the Crash visual + 5 explosion dmg). Lightning still does 15.

## 9. Per-stand idle/punch animations

Match the polish Hanged Man already has. Add lightweight per-stand animation hooks in each `drawXxx` (small offsets driven by `w.time` and `w.standPunchUntil`):
- **Star Platinum**: idle bob + ORA-flurry: when M1 chains, draw 2-3 ghost arms staggered behind the punch arm.
- **SPTW**: same as SP but cyan ghost arms + gold sparkle particles.
- **RHCP**: lightning crackle already animated; add idle limb twitch.
- **Echoes**: tail wag (Act1), small hover bob (Act2/3).
- **Ebony Devil**: bobblehead rotation while idle.
- **Gold Experience**: gentle hand sway, sparkle on punch already present — add ladybug spin.
- **White Album** (player overlay): visor shimmer line every 1.2s.
- **Purple Haze**: capsule fists pulse purple→pink.
- **Moon Rabbit** (player overlay): rabbit ears twitch every ~2s.
- **Harvest**: beetle cloud already animates; add subtle Y-bob orbit.
- **Hanged Man**: existing idle/saber animation, untouched.

Add a `drawSptw` and wire it into `drawStand`. Also add missing entries: `purple_haze`, `moon_rabbit`, `harvest` are not currently in `drawStand`'s switch — fix that.

## 10. UI polish

- Inventory drawer: 2-column grid on narrow viewports, each slot shows item icon, count badge, name, and **disabled state** with tooltip when stand-locked (e.g. Arrow grayed when stand equipped).
- New INV slot: **Strange Hat** (only visible while `strangeHatCount > 0`).
- HUD: **RAGE** button below A4 only when `standId === sptw` and `sptwRage >= 100`. Pulsing cyan border.
- Toasts/banners: keep the small style; ensure new banners ("Strange hat appeared", "THE WORLD") use the centered banner channel, not toast spam.

## 11. General balance pass (small)

- Echoes A4 cooldown 11→9.
- White Album A2 (Ice Stomp) damage 6→5, but stun 1.6→2.0 (more utility, less burst).
- RHCP A4 (Tesla) duration 4→3.
- Purple Haze A1 capsule cloud lingering damage tick 0.6→0.5.
- Harvest M1 dmg 0.4→0.6 (currently feels useless).
- Moon Rabbit A1 (Wasp Swarm) 5→4 dmg per sting, but tickEvery 3→2.5.

## 12. Technical notes

**Files touched**
- `src/game/stands.ts` — add `rarity` field, `sptw` stand, rewrite `rollStand`, ability table edits.
- `src/game/codex.ts` — add `sptw` codex entry, update Moon Rabbit A2 wording.
- `src/game/types.ts` — add `sptwUnlocked`, `sptwRage`, `sptwTimeSkipCharges`, `sptwM1HoldStart`, `moonRabbitInvulnUntil`, `strangeHatCount`, `strangeHatSpawned`, prop type `strange_hat`, projectile `kind: "crash_bike"`.
- `src/game/engine.ts` — prop-gate rewrite, ability-gate fixes, SP rework, SPTW runtime, Strange Hat spawn/pickup/use, Moon Rabbit A2/A3/A4 changes, `drawSptw`, draw-switch fix, idle animations, rage meter logic.
- `src/components/Game.tsx` — Tonth page 2 tier layout, INV: Strange Hat slot + disabled states, RAGE button, `useStrangeHat()` wired with no-consume-on-fail.

**Acceptance checks (run mentally before declaring done)**
1. With RHCP + Echoes + Hanged Man + Moon Rabbit + Harvest + Gold Experience equipped, M1 a tree → tree takes 0 damage, puff plays. Confirm in code at every `damagePropsInRadius` call site.
2. Equip Star Platinum → punch tree → tree breaks.
3. Equip stand, click Arrow in INV → arrow count unchanged, toast says "use a DISC".
4. Tonth page 2 percentages sum to 100% across Common+Uncommon+Rare+Epic.
5. Strange Hat spawns exactly once after first SP equip; using it without SP equipped does not consume it.
6. SPTW M1 held >1s drops to 4 dmg; release + re-press resets.
7. Rage button only appears for SPTW at 100 rage; consumes on activate.
