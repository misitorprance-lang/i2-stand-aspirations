## Goals (in order)

1. **Spawn safety & collision robustness** — no NPC/player ever ends up inside a prop.
2. **Echoes act overhaul** — act is driven by which ability was last used, not kills; per-act damage rules; fix Burning Text targeting.
3. **Crit system** — visible feedback (yellow burst, big number, screen pulse) shared by all stands.
4. **Star Platinum: Time Stop** replaces Ora Ora Rush.
5. **On-target hit guarantee** for non-pierce abilities; **range-gated** casting (no firing into empty air at far targets).
6. **Prop destruction + perfect respawn**.
7. **Smarter hostile AI** — pathing around props, no wall-stuck, avoid future spawn zones.
8. **Auto-kick** — push player out of a prop they're trying to walk into.
9. **New stand: Hanged Man** (mirror-shard / pilot mechanics) + Pilot mode for Ebony Devil's puppet.

---

## 1. Spawn & collision safety

**Files:** `src/game/engine.ts`

- Add `ejectFromProps(e, props, maxPushPx = 64)` that runs `pushOutOfProps` and then **verifies** no overlap; if still overlapping, walks the entity in 8 compass directions until free, else snaps to nearest `freeSpotOrGrid`.
- Call `ejectFromProps` immediately on:
  - `makeNpc` return (post-spawn validation).
  - `createWorld` for every spawned entity + the player.
  - After every NPC respawn (engine.ts:1175 block).
  - Inside `damageEntity` after applying knockback velocity (queue a 1-tick "verify" — simplest: call eject right after `e.vel` is set if the entity is currently overlapping).
- Increase `freeSpot` padding from 8 → 12 and require a 16 px clearance ring from any prop.
- For **NPC respawns**, also reject any spot within 60 px of an active crater or active tree zone.

## 2. Echoes act overhaul

**Files:** `src/game/engine.ts`, `src/game/types.ts`, `src/game/stands.ts`

- Add `echoesAct: 1 | 2 | 3` and `echoesActUntil: number` to `World`.
- On `castAbility` when `standId === "echoes"`:
  - `a1` → set `echoesAct = 1`.
  - `a2` or `a3` → set `echoesAct = 2`.
  - `a4` (Three Freeze or S.H.I.T.) → set `echoesAct = 3`.
  - `echoesActUntil = w.time + 8` (act persists 8 s of idle, then defaults to whatever the last cast was — i.e. it does NOT auto-revert; "remains until another ability" per spec).
- Default act on stand acquired = 1.
- `m1DamageRoll` for Echoes:
  - Act 1: `0.4` normal, `0.8` crit.
  - Act 2: `0.9` normal, `1.5` crit.
  - Act 3: `1.5` normal, `3.0` crit.
- `drawEchoes` now reads `w.echoesAct` instead of `w.kills`.
- **Burning Text (a3) fix:** in `castAbility`'s `dot_zone` case, use `resolveTargetPos(...).pos` (snap to target if within range) instead of `p + dir * range`. Also clamp drop distance to `min(ab.range, distToTarget)` so it lands ON the target.

## 3. Crit system polish

**Files:** `src/game/engine.ts`

- Refactor: `m1DamageRoll` returns `{ dmg, crit }`. Caller passes `crit` into `damageEntity` (new optional flag).
- `spawnDmg` already tiers by size — when `crit` is true:
  - Force color `#ffd24a`, +30% size, double `vy` (bigger pop-up).
  - Spawn a 6-particle yellow spark burst at the hit pos.
  - Add brief `w.shake = max(w.shake, 3)`.
  - Play new `crit` SFX (added to `src/game/sound.ts` — short bright tone).
- Same crit pipeline available to ability hits where it makes sense (Star Finger / Star Platinum's projectile / Hanged Man saber later).

## 4. Star Platinum — Time Stop replaces Ora Ora

**Files:** `src/game/stands.ts`, `src/game/engine.ts`, `src/game/types.ts`, `src/components/Game.tsx`, `src/game/sound.ts`

- `STANDS.star_platinum.abilities.a3` becomes:
  ```
  { name: "The World", kind: "time_stop", damage: 0, range: 0, cooldown: 18, duration: 5, color: "#dcd6ff" }
  ```
- New `AbilityKind: "time_stop"` and a new world field `timeStopUntil: number` + `timeStopStartedAt: number`.
- **Engine effect** while `w.time < w.timeStopUntil`:
  - In `update()`, freeze all NPC AI, projectile motion (incoming), zone ticks, particle ages — easiest: gate them on `if (w.time < w.timeStopUntil) skip` for NPC/projectile/zone updates.
  - The **player + their stand + their projectiles** continue normal updates.
  - Damage to the player from frozen sources is **deferred**: any incoming damage during stop accumulates into a `pendingDamage` array `{amount, dir}` — applied in a single burst on `timeStopUntil` end (with a red flash + shake).
- **Visuals:**
  - Render pass: when stopped, draw everything except player/own stand/own projectiles into an offscreen pass with `filter: grayscale(1)`; player layer drawn normally on top.
  - HUD clock: top-center analog clock SVG-style (drawn on canvas) with hand sweeping from full to 0, showing `5.9 → 0.0` countdown to one decimal.
- New SFX: `timeStop` (deep dramatic tone, slide down) and `timeResume` (reversed).
- Cooldown 18 s, duration 5 s. M1 hold-to-repeat already works inside time stop (player is unfrozen).

## 5. On-target ability locking + range gating

**Files:** `src/game/engine.ts`

- All non-pierce/non-channel abilities go through `resolveTargetPos` already, but several still cast on `dir * range` without checking distance. Update:
  - `aoe_target`, `lobbed`, `dot_zone`, `stun_touch`, `knockback`, `auto_aim`, `chain_projectile` → if a target was resolved, **always** use `target.pos`. If none, fall back to direction.
- **Range gate (per request "K"):** before applying cooldown in `castAbility`, if the ability has `range > 0` and `kind != pierce` and `kind != aoe_self` and `kind != tesla` and there's no manual aim:
  - If `nearestTarget` returns null OR distance to nearest > `ab.range`, show banner `"Out of range"` and **do not consume cooldown**.
- M1 also gated: M1 only fires if there's an NPC within `ab.range + ab.radius` when no manual aim is provided. (Keeps "M1 hold to repeat" but stops it from spamming useless animations in empty space.)

## 6. Prop destruction + perfect respawn

**Files:** `src/game/types.ts`, `src/game/engine.ts`

- Extend `Prop` with `hp?: number; maxHp?: number; destroyedAt?: number; respawnAt?: number; original: { rect: Rect; draw: ...; hp: number; }`.
- On spawn: assign HP — trees/bushes/fences `12`, houses `60`, rocks `30`. Static no-HP props: invulnerable.
- New helper `damageProp(prop, dmg)` called from melee/AOE/explosion code paths when a hit overlaps a prop's rect (currently we ignore props as targets). Trigger:
  - SP M1 / Star Finger / Ranged Smash / Time-Stop hits.
  - All explosions (`aoe_target`, `lobbed` detonate, RHCP discharge & bomber).
  - Hanged Man's Brutal Slash.
- Damage VFX: chips fly (square particles), hp shaded as cracks (overlay dark cross-hatch when hp < 50%).
- On destroy: big particle burst, 1 small crater, prop becomes inert and its rect is removed from collision (but kept in array with `destroyedAt`).
- Respawn after `30 s` (configurable per type): restores `hp = maxHp`, draws back, collision returns.
- Edge case: if any entity is currently inside the rect when respawning, push them out with `ejectFromProps` first.

## 7. Smarter hostile AI

**Files:** `src/game/engine.ts`

- Replace direct "move toward target" steering with a lightweight **whisker** check:
  - Every AI tick, sample 3 rays (left, forward, right) of length `e.radius * 4`. If forward is blocked by a prop, pick the unblocked side ray with smallest deviation from desired heading. Falls back to wandering if both sides blocked.
- Track `e.stuckAcc`: if the entity tried to move and its position changed by < `0.5 px` for `0.6 s`, force a random wander target away from any prop within 40 px.
- Wander targets generated via `freeSpotOrGrid` already; additionally reject targets whose straight-line path crosses a house rect.

## 8. Auto-kick (player anti-stuck)

**Files:** `src/game/engine.ts`

- After player movement integration, if the player input had nonzero magnitude AND `pl.pos` changed by < `0.4 px` this tick AND any of the 4 cardinal probes (`pl.pos + dir * (pl.radius + 1)`) is inside a prop:
  - Compute the nearest prop edge perpendicular to player heading and apply a `40 px` push along it.
  - Spawn small dust particles + play `footstep` once (no new SFX needed).
- Cap kick frequency: at most once per 0.4 s.

## 9. New stand: **Hanged Man**

**Files:** `src/game/stands.ts`, `src/game/types.ts`, `src/game/engine.ts`, `src/game/sound.ts`, `src/components/Game.tsx`, `src/game/codex.ts`

- Add `StandId = "hanged_man"`. Rarity weight `5` (uncommon-ish). Aura color `#cfd6e3`.
- **Initial state:** `formless = true` until Pilot is engaged. While formless, abilities 2/3/4 are cast from the player's position; M1 disabled (banner "Engage Pilot to attack").
- **M1 (saber):** kind `"melee"`, damage `1.2`, no crits (force `crit = false` in `m1DamageRoll`), range 28, radius 14. Slash arc VFX in steel blue.
- **a1 — Pilot:** new kind `"pilot_toggle"`. Toggling on:
  - Spawns/positions Hanged Man at the player's location, sets `pilotActive = true`.
  - Player **stops moving** (input.joy ignored for the player); the stand becomes the puppet (controlled by joystick). Camera follows the stand.
  - Health is shared with the player (already true: damage to stand routes through `pl`).
  - Disables regen while pilot active.
  - Toggling off: stand dissolves back into the player; player resumes control.
  - Same toggle pattern is **applied to Ebony Devil's puppet** (new World field `puppetPiloted: boolean`; while piloted, joystick drives puppet; player frozen; **regen off** for player; HP shared via the existing `damagePuppet` shunt — simplified to "damage to puppet damages player too at 50%").
- **a2 — Mirror Shard:** new kind `"mirror_shard"`. Creates a `MirrorShard { pos, expireAt = w.time + 12, lastNpcInside }`. Up to 5 active.
  - Render: small chrome diamond on ground (no collision).
  - Maintain a `dome { radius: 80 }` around each shard; while NPCs are inside the dome, the shard's `expireAt` extends. While shard exists, Hanged Man can damage targets inside its dome (dome is a "valid combat zone"). Outside any dome, M1 does nothing (banner "Need a shard's dome").
- **a3 — Teleport:** new kind `"shard_teleport"`. Opens a small picker overlay listing active shards with index numbers (1..5) sorted by distance. Tap or press number key to teleport Hanged Man to that shard's center with a flash VFX.
  - Implementation: when ability fires, set `w.shardPickerOpen = true`; render UI list in `Game.tsx`; on select, dispatch a synthetic action that calls `teleportHangedMan(idx)` exported from engine.
  - Cooldown 6 s.
- **a4 — Brutal Slash:** new kind `"brutal_slash"`. Single forward arc, damage 8, applies `bleedUntil = w.time + 4` (DOT 0.6/s) + `stunUntil = +1.5 s` + `slowUntil = +3 s` (slow = movement *0.45 in NPC AI). Cooldown 9 s.
- Add bleed handling: each tick on every entity with `bleedUntil > w.time`, drip 0.1 dmg every 0.25 s and spawn red drop particles.
- Drawing: tall draped figure with dark cape, lighter face, saber when M1ing; in dome it's bordered by faint chrome ring.
- Add SFX: `pilot`, `shard`, `teleport`, `brutal`.
- Add Hanged Man entry to `STAND_CODEX`.

## 10. Codex update

**Files:** `src/game/codex.ts`

- Bump `STAND_CODEX_VERSION` (in codex.ts header).
- Add Time Stop (Star Platinum a3 replacement), Hanged Man (full entry), and updated Echoes act notes.

## 11. UI / Game.tsx polish

- Banner messages added: "Out of range", "Engage Pilot to attack", "Need a shard's dome", "Time stopped".
- Add small "Pilot ON" indicator chip when piloting.
- Crit hit-flash CSS hook (optional `body` 100 ms tint via canvas overlay — keep on canvas for cohesion).
- Add Hanged Man + Time Stop to the stand color/name lookup tables in `Game.tsx`.

## 12. Tests / verification

- Manual smoke: spawn each stand via arrow, verify abilities cast, verify Time Stop visuals, verify Echoes act-by-ability, verify Hanged Man Pilot mode + shard teleport. We don't currently have integration tests for the engine; this remains a visual QA pass after implementation.

---

## Risks / open questions

- **Time Stop grayscale rendering** uses an offscreen canvas pass; cheap on modern devices but worth profiling. Fallback: tint NPCs grey + freeze without offscreen.
- **Hanged Man Pilot HP sharing** — confirming "the puppet/pilot can move freely AND attack but shares HP with player and disables regen." Spec is clear; just flagging it's a substantial control switch.
- **Shard picker UI** uses a small overlay list. If you'd rather it be a radial wheel, say so before approval.

## Files touched (summary)

- `src/game/engine.ts` — biggest changes (acts, time stop, AI, eject, kick, destruction, hanged man casts).
- `src/game/types.ts` — new fields (`MirrorShard`, `pilotActive`, `puppetPiloted`, `bleedUntil`, `slowUntil`, `pendingDamage`, `echoesAct`, prop hp).
- `src/game/stands.ts` — Time Stop ability, Hanged Man stand entry, rarity rebalance.
- `src/game/sound.ts` — `crit`, `timeStop`, `timeResume`, `pilot`, `shard`, `teleport`, `brutal`.
- `src/game/codex.ts` — new entries + bump version.
- `src/components/Game.tsx` — new banners, shard picker overlay, Hanged Man color, Pilot indicator.
