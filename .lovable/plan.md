I’ll implement this as one gameplay pass across `engine.ts`, `types.ts`, `stands.ts`, `codex.ts`, and `Game.tsx`.

## Plan

### 1. Gold Experience fixes
- Rework Ability 1 projectile rendering so it is visibly an eagle instead of a generic orb/emoji:
  - Draw a small golden bird body, wings, beak, tail, and wing-flap frames while it flies forward.
  - Keep it piercing so it can hit more than 3 enemies.
- Fix Ability 2 frogs:
  - Make frogs follow in stable offset slots around the player instead of stacking/jittering.
  - When an NPC attack reaches the player, a frog leaps onto the player/attack point, disappears, and reflects 50% of that incoming damage to the attacker.
- Fix Ability 3 hologram/afterimage:
  - Add a real Gold Experience afterimage behind/through the target, not only a burst effect.
  - Render the target’s out-of-body afterimage state clearly while stunned.
- Fix Ability 4 Tree of Life:
  - Remove expired tree objects from `w.trees`, not just the VFX.
  - Make tree + dome disappear exactly when the duration ends.
  - Root/grab enemies inside the dome by applying `rootedUntil`/short stun/slow and root visuals.
  - Clear tree effects when switching stands or using a DISC.

### 2. Stand summon + cleanup behavior
- Change arrow usage so the new stand is equipped but not automatically summoned:
  - `standActive = false` after using an Arrow or Blue Pebble.
  - The player must tap `Stand: ON/OFF` to summon.
  - On summon, show colored floating text with the stand name near the player for a few seconds.
- Add a centralized `resetStandRuntime` cleanup so stand switching/discarding removes old map effects:
  - GE frogs/trees/holograms.
  - Echoes text zones/status leftovers where appropriate.
  - Purple Haze poison clouds/projectiles/pilot/violence state.
  - Hanged Man shards/pilot state.
  - White Album trail/suit runtime where needed.

### 3. Boingo + Tonth UI rework
- Replace the current long Boingo modal with a paged book UI named `Tonth`:
  - Page 1: current player stand, in-game visual design, special model notes like Ebony Devil’s puppet, stats, rarity, and abilities.
  - Page 2: stand rarity table ordered from most common to rarest.
- Freeze Boingo at his last position while the player is inside his UI.
- On first talk:
  - Award `Tonth Copy`.
  - Boingo despawns/disappears permanently for that run/save.
  - Show a single item notification: `Got Tonth Copy`.
- Add `Tonth Copy` to inventory; using it opens the same Tonth book without Boingo speech.

### 4. Inventory system and item pickups
- Remove the top-bar Arrow/DISC counters/buttons.
- Add an inventory button/panel that contains:
  - Stand Arrow count and Use button.
  - DISC count and Use button.
  - Tonth Copy Use button if owned.
  - Requiem Arrow count/entry, marked unusable for now.
  - Blue Pebble count and Use button.
- Update save/load to persist the new inventory counts and Boingo/Tonth state.
- Keep item pickup collision, but route pickups into inventory instead of separate `arrowsRef` / `discsRef` counters.

### 5. New world items
- Add `Requiem Arrow`:
  - Spawns once in an Arrow spawn area.
  - Once picked up, it never spawns again.
  - Currently appears in inventory but cannot be used.
- Add `Blue Pebble`:
  - Spawns in DISC spawn areas.
  - Limit uncollected Blue Pebbles on the map to 2.
  - Picking one up adds it to inventory.
  - Using it grants `Moon Rabbit` guaranteed and sets it unsummoned until the player manually summons it.

### 6. Map, props, and spawning
- Increase map size by 1.5x from the current values:
  - `MAP_W: 1700 -> 2550`
  - `MAP_H: 2600 -> 3900`
- Make houses bigger again without overdoing it.
- Expand generated prop counts/placement for the larger map.
- Add more item spawn areas and ensure Arrows/DISCs/Requiem Arrow/Blue Pebbles never spawn on generated props, craters, houses, or the player.

### 7. House damage restrictions
- Stop basic player punches and weak attacks from damaging houses.
- Allow house damage only from Star Platinum and selected strong abilities such as heavy explosions, Star Finger/Launch, major lightning, and other explicitly strong moves.
- Keep smaller props destructible by normal attacks if they already are.

### 8. Hostile NPC balance and hit effects
- Change hostile NPC punches to:
  - Base damage: `2`
  - Critical damage: `3`
- Add an NPC M1 hit effect matching the player’s hit feel.
- Add colored punch impacts per stand based on each stand’s main color.
- Improve status visuals on NPCs:
  - Bleeding: red drips/marks.
  - Frozen/slowed: icy overlay and shards.
  - Burning: orange embers/flames.
  - Poisoned: purple gas bubbles/cloud puffs.

### 9. Hanged Man shard-domain rule
- Enforce the rule that Hanged Man can only damage enemies while inside an active mirror shard dome:
  - Hanged Man M1 does no damage outside a shard domain.
  - Brutal Slash does no damage outside a shard domain.
  - Damage only applies if Hanged Man’s origin and/or the target is inside an active shard dome, so he cannot attack freely across the map.
- Show a short warning if the player tries to attack outside the domain.

### 10. Add Moon Rabbit stand
- Add `moon_rabbit` to stand data, roll/save/codex/rendering, but make it currently attainable through Blue Pebble.
- Player model replacement like White Album:
  - Blonde hair.
  - Maroon eyes.
  - Light brown rabbit ears/hands/feet.
  - Dark red suit with dull pink grid stripes.
  - White undershirt and black tie.
- Stats/passives:
  - M1 base damage `0.9`, crit damage `3`.
  - Movement speed like White Album.
  - Slightly more max HP while equipped.
  - DISC can remove it like any other stand.
- Abilities:
  - `1 - Wasp Swarm`: wasps surround the nearest target and sting every 3s for 6s, 5 damage per sting.
  - `2 - Moon Carrot`: heals 8 HP.
  - `3 - Crash`: vehicle/object charges through a target line, 3 damage first impact, 2 to other enemies hit, small knockback, then explodes for 5 damage.
  - `4 - Eternal Curse`: nearby targets in range are struck by lightning for 15 damage.

## Technical notes
- `ItemPickup.kind` will expand from `arrow | disc` to include `requiem_arrow | blue_pebble`.
- `World` will gain an `inventory` object and Boingo despawn/open/freeze flags.
- Rendering will get custom projectile drawing for GE eagle and custom player rendering for Moon Rabbit.
- Save data will be upgraded compatibly so older saves with `arrows`/`discs` still load into the new inventory.