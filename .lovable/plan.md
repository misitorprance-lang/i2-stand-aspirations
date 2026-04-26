# Stand Test — Big Update

## 1. Fix missing dependency
`vite.config.ts` dedupes `@tanstack/query-core` but it isn't installed (only `@tanstack/react-query` is). Add `@tanstack/query-core` to dependencies so the dev server / build stops complaining.

## 2. Auto-aim that actually aims at the target
Currently moves use a *direction* and march straight from the player. We'll switch to **target-locked** execution:

- New helper `resolveTarget(world, ability)` → returns either:
  - the entity under the manual aim ray (if right-side aim is active), or
  - the nearest valid target within the ability's range (with a generous fallback range for very long-range moves), or
  - `null` (then fall back to facing direction).
- For each ability kind, use the target's *position* not just a direction:
  - **melee / pierce / knockback / channel_cone / stun_touch**: face the target, then run cone hit from player or stand origin toward the target — guaranteeing the hit lands when in range.
  - **projectile / lobbed**: spawn moving toward target position, with slight homing (gentle steering each tick, capped) so long-range shots like Electric Shot, Ranged Smash, Eagle, Spear Jab actually connect.
  - **aoe_target**: drop the AOE on the target's position (clamped to ability range) instead of "max range in facing dir".
  - **auto_aim**: already target-based; tighten so it never fires into empty space when a valid target exists.
- M1 specifically gets a small "snap to target" if a target is within `range * 1.4`, fixing the "always punches downward" bug.
- Stand model orients toward target during attacks (already partially done; extend to all attack kinds).

## 3. Stand desummon / resummon button
- New small toggle button in the right-side ability column (above M1): **Stand ON/OFF**.
- When stand is "off":
  - No stand model rendered, no aura.
  - All abilities (M1, 1–4) become disabled (greyed out).
  - Player can still walk, take damage, use items.
- Toggling re-summons with the `standSummon` SFX and brief VFX.
- Internally tracked as `world.standActive: boolean`; `standId` stays the same so toggling is free.

## 4. DISC notification when Ebony Devil puppet is active
- When the player taps the DISC inventory slot while `standId === "ebony_devil"` and `puppet.active === true`:
  - Show a banner: *"Desummon the puppet first (tap 1)"*.
  - Don't consume the disc.
- Also surface the same hint as a small text under the DISC button when conditions are met.

## 5. Smaller items
- Reduce arrow + DISC visual size by another ~25% (current size is still too large per user).
- Pickup radius unchanged so they're still easy to grab.

## 6. Spawn safety (NPCs, players, items)
Refactor `freeSpot()` into a **strict** version used for *all* spawning (NPCs at world creation, NPC respawns, item drops):
- Reject any candidate inside or within 6px of any prop rect.
- Reject any candidate within 20px of the player at item-spawn time (avoid spawning underfoot).
- Reject any candidate inside an existing crater.
- Cap retries at 80; if exhausted, skip this spawn tick instead of forcing a bad position.

Also: only allow at most **2 arrows** and **1 disc** on the ground at once (currently `MAX_ITEMS_ON_GROUND = 4` mixed) — keeps the field clean and "limits spawn generation" as requested.

## 7. Hostile NPC damage rebalance
- Lower `ENEMY_ATTACK_DMG` from `6` → randomized `2..4` per hit.
- Slightly bump enemy attack cooldown from `1.2s` → `1.3s` to compensate.

## 8. Camera closer to player
- Bump `CAMERA_ZOOM` from `1.35` → `1.7`.
- Keep border clamping so the camera never reveals out-of-map black areas.
- Reduce the auto-aim default scan range slightly so it still feels balanced at the closer zoom.

## 9. Particle effects (combat + ambient)
- **Walking dust**: small brown puffs trailing the player when moving on grass (every ~6 footsteps), more intense while sprinting.
- **Bleeding**: when an entity is below 50% HP, it leaks small red droplet particles that fall with gravity.
- **Electrocuted**: when hit by RHCP electric moves or Tesla Coil, the target shows yellow spark particles arcing off them for ~0.6s.
- **Gravity-affected** particle option added to the existing particle struct (already in `Particle.gravity`) and used by blood + dust.
- **Hit impact** particles tinted by damage type (chrome for spear, green for Echoes, etc.).

## 10. Lo-fi background music
- Pre-process the uploaded MP3 down to **8 kHz / 8-bit mono WAV** with `ffmpeg`, save to `public/music/bg-pixel.wav`.
- New `src/game/music.ts`: HTML5 `<audio>` element, `loop = true`, low volume (~0.25), starts on first user gesture (tied to existing `unlockAudio()`), respects the sound toggle.
- Music starts when the player first interacts; toggling sound stops/resumes it.

## 11. Stand models — keep + extend orientation
- Existing Star Platinum / RHCP / Echoes (Acts 1-3) / Ebony Devil models stay.
- All stands now properly face the targeted enemy when attacking (not just Ebony Devil's puppet).
- Idle: trail behind player. Aiming an attack: float in front, aimed at target.

## 12. New stand: Gold Experience (rare)
Add to `STANDS` and roll pool with a low rarity weight (like Star Platinum tier). Color: `#f5d36b` (gold).

| Slot | Move | Behavior |
|---|---|---|
| M1 | Punch | Close cone melee, moderate damage. |
| 1 | **Eagle Summon** | Fast piercing projectile that homes to nearest enemy; on hit, chains to up to 4 more enemies within 90px (50% chance per chain — "if lucky"). Each chain hop draws a yellow streak VFX. Cooldown ~3s. |
| 2 | **Frog Summon** | Spawns 1 frog (cap 3 active). Frogs follow player. When player would take damage, the closest frog intercepts, is desummoned, and reflects 50% of the incoming damage back to the attacker. Cooldown ~5s per summon. |
| 3 | **Out of World Experience** | Single-target stun (~3.5s). On hit, spawn a "hologram" (translucent copy of the target) behind it, drifting slowly outward and back; despawns when stun ends. Long cooldown (~12s). |
| 4 | **Tree Summon** | Places a stationary tree zone (radius ~70, lasts ~6s). Enemies entering are rooted (stun + visual root particles) for ~1.5s once per enemy. Player inside heals ~2 hp/s and gets +50% damage. Largest cooldown (~30s). |

Implementation notes:
- New `AbilityKind`s: `chain_projectile`, `frog_summon`, `hologram_stun`, `tree_zone`.
- Frogs are stored as a small `world.frogs: { pos, alive }[]` and rendered as little green circles hopping behind the player.
- Hologram is a transient ghost entity drawn with low alpha, no collision.
- Tree zone reuses `Zone` struct with extra `kind: "heal_buff"` flag and prop-like trunk drawn at center.

## 13. Larger map (1.5x)
- `MAP_W: 900 → 1350`, `MAP_H: 1400 → 2100`.
- Scale prop counts ~1.5x so density stays similar (trees 28→42, rocks 14→21, bushes 18→27, houses 3→5, fences 6→9).
- Bump NPC counts: friendlies 5→7, enemies 4→6.

## 14. Internal "version code" for moves & models
Per your clarification — not a player-facing input — we'll create:
- `src/game/codex.ts`: a single exported `STAND_CODEX` object that captures the canonical definition of each stand's model description, abilities, damage, range, cooldown, VFX, SFX. Tagged with `CODEX_VERSION = "1.0.0"`.
- This becomes the source of truth referenced by `STANDS` and the renderer, so a future update can diff against it / restore older versions / serialize a build.
- No UI surface yet; just the locked-in spec file for "much later."

## 15. Movement & QoL polish
- Slight acceleration ramp on player movement (no more instant snap) for better feel at high zoom.
- M1 button "auto-repeats" when held (fires again as soon as cooldown ends).
- When stand is off, ability buttons show an "OFF" overlay instead of just being grey.
- Help overlay updated to mention the desummon button and Gold Experience.

---

## Technical sections (file-level)

- `package.json`: add `@tanstack/query-core`.
- `public/music/bg-pixel.wav`: generated from uploaded MP3 via ffmpeg (8kHz / u8 / mono).
- `src/game/music.ts`: new — singleton bg music controller.
- `src/game/codex.ts`: new — canonical move/model spec snapshot.
- `src/game/sound.ts`: add `bleed`, `electrocute`, `eagle`, `frog`, `tree`, `hologram`, `chain` SFX.
- `src/game/stands.ts`: add `gold_experience`, new `AbilityKind`s, lower roll weight.
- `src/game/types.ts`: add `Frog`, hologram entity flag, `standActive`, electro/bleed flags on `Entity`.
- `src/game/engine.ts`:
  - Constants: zoom, map size, prop/NPC counts, enemy damage range.
  - `freeSpot` strict version + spawn caps.
  - `resolveTarget` + per-kind target-aware execution.
  - Projectile gentle homing.
  - Player accel, footstep dust, bleed particles, electrocute flag/particles.
  - Stand on/off rendering & gating.
  - Gold Experience handlers (chain projectile, frog manager, hologram stun, tree zone w/ heal+buff).
  - Camera zoom + clamp.
- `src/components/Game.tsx`:
  - New stand on/off button.
  - DISC + Ebony Devil notification.
  - Item button hint.
  - Help overlay text.
  - Wire music start on first interaction.

After approval I'll switch to build mode and implement everything end-to-end.