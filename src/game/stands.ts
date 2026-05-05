// Stand & ability data tables for Stand Test.
// All ability behavior is data-driven; the engine reads `kind` to decide how to execute.

export type StandId =
  | "none"
  | "star_platinum"
  | "sptw"
  | "rhcp"
  | "echoes"
  | "ebony_devil"
  | "gold_experience"
  | "ger"
  | "hanged_man"
  | "white_album"
  | "purple_haze"
  | "moon_rabbit"
  | "harvest";

export type StandRarity = "common" | "uncommon" | "rare" | "epic" | "pebble" | "legendary";

export type AbilityKind =
  | "melee"
  | "projectile"
  | "pierce"
  | "aoe_self"
  | "aoe_target"
  | "channel_cone"
  | "knockback"
  | "auto_aim"
  | "stun_touch"
  | "lobbed"
  | "dot_zone"
  | "tesla"
  | "puppet_toggle"
  | "puppet_spear"
  | "puppet_spin"
  | "rage_mode"
  | "chain_projectile"
  | "frog_summon"
  | "hologram_stun"
  | "tree_zone"
  | "time_stop"
  | "pilot_toggle"
  | "mirror_shard"
  | "shard_teleport"
  | "brutal_slash"
  | "ice_heal"
  | "ice_stomp"
  | "ge_eagle_pierce"
  | "bleed_text"
  | "explosion_text"
  | "frost_text"
  | "burn_text"
  | "three_freeze_pressure"
  | "capsule_shot"
  | "gas_release"
  | "ph_pilot_toggle"
  | "cleansly_violence"
  // Star Platinum reworks
  | "star_rush"          // dash + grab + 2 punches
  | "time_stop_or_skip"  // single tap = time stop, double tap = teleport-to-last-hit
  | "triple_pebble"      // SPTW A2 — three small flicks
  | "sptw_rage"          // SPTW manual rage mode (consumes meter)
  // Moon Rabbit
  | "wasp_swarm"
  | "lunar_veil"         // brief invincibility (replaces moon_carrot)
  | "crash"
  | "eternal_curse"
  // Harvest
  | "harvest_gather"
  | "harvest_carry"
  // RHCP rework
  | "rhcp_dash"
  // Echoes Japanese-text reworks
  | "echoes_freeze_target"
  | "echoes_amplify"
  // Gold Experience Requiem
  | "ger_life_beam"
  | "ger_truth_punch"
  | "ger_triple_loop";

export interface Ability {
  name: string;
  kind: AbilityKind;
  damage: number;
  range: number;
  radius?: number;
  cooldown: number;
  duration?: number;
  tickEvery?: number;
  speed?: number;
  knockback?: number;
  crater?: boolean;
  stunSeconds?: number;
  color: string;
}

export interface Stand {
  id: StandId;
  name: string;
  color: string;
  /** Display rarity tier. "pebble" = Moon Rabbit (Blue Pebble), "legendary" = SPTW (Hat). */
  rarity: StandRarity;
  /** Legacy field, kept for save back-compat. Not used by the new tier roller. */
  rarityWeight: number;
  abilities: {
    m1: Ability;
    a1: Ability;
    a2: Ability;
    a3: Ability;
    a4: Ability;
  };
}

export const STANDS: Record<StandId, Stand> = {
  none: {
    id: "none",
    name: "No Stand",
    color: "#cccccc",
    rarity: "common",
    rarityWeight: 0,
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 1, range: 18, radius: 14, cooldown: 0.35, color: "#ffffff" },
      a1: { name: "-", kind: "melee", damage: 0, range: 0, cooldown: 999, color: "#888" },
      a2: { name: "-", kind: "melee", damage: 0, range: 0, cooldown: 999, color: "#888" },
      a3: { name: "-", kind: "melee", damage: 0, range: 0, cooldown: 999, color: "#888" },
      a4: { name: "-", kind: "melee", damage: 0, range: 0, cooldown: 999, color: "#888" },
    },
  },
  star_platinum: {
    id: "star_platinum",
    name: "Star Platinum",
    color: "#7c5cff",
    rarity: "epic",
    rarityWeight: 4,
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 5, range: 22, radius: 16, cooldown: 0.3, color: "#b8a6ff" },
      a1: { name: "Star Rush", kind: "star_rush", damage: 7, range: 40, radius: 14, cooldown: 4, color: "#b8a6ff" },
      a2: { name: "Star Finger", kind: "pierce", damage: 9, range: 110, radius: 5, cooldown: 1.6, knockback: 60, color: "#fff2a8" },
      a3: { name: "The World", kind: "time_stop_or_skip", damage: 0, range: 0, cooldown: 18, duration: 5, color: "#dcd6ff" },
      a4: { name: "Launch", kind: "knockback", damage: 18, range: 18, radius: 16, cooldown: 6, knockback: 320, color: "#7c5cff" },
    },
  },
  sptw: {
    id: "sptw",
    name: "Star Platinum: The World",
    color: "#5fe8ff",
    rarity: "legendary",
    rarityWeight: 0, // hat-exclusive
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 7, range: 22, radius: 16, cooldown: 0.28, color: "#5fe8ff" },
      a1: { name: "Star Rush", kind: "star_rush", damage: 8, range: 42, radius: 14, cooldown: 3.5, color: "#5fe8ff" },
      a2: { name: "Triple Pebble", kind: "triple_pebble", damage: 3, range: 240, radius: 3, cooldown: 2.0, speed: 480, color: "#5fe8ff" },
      a3: { name: "The World", kind: "time_stop_or_skip", damage: 0, range: 0, cooldown: 16, duration: 7, color: "#dcd6ff" },
      a4: { name: "Launch", kind: "knockback", damage: 20, range: 18, radius: 16, cooldown: 5.5, knockback: 340, color: "#a06bff" },
    },
  },
  rhcp: {
    id: "rhcp",
    name: "Red Hot Chili Pepper",
    color: "#ff4444",
    rarity: "uncommon",
    rarityWeight: 15,
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 1.4, range: 20, radius: 14, cooldown: 0.32, color: "#ffd0a8" },
      a1: { name: "Electric Shot", kind: "projectile", damage: 4, range: 220, radius: 6, cooldown: 1.2, speed: 380, color: "#fff36b" },
      a2: { name: "Electric Discharge", kind: "aoe_self", damage: 5, range: 0, radius: 70, cooldown: 4, color: "#fff36b" },
      a3: { name: "Ground Bomber", kind: "aoe_target", damage: 9, range: 120, radius: 50, cooldown: 6, crater: true, color: "#ff8a3a" },
      a4: { name: "Tesla Coil", kind: "tesla", damage: 1.8, range: 0, radius: 90, cooldown: 12, duration: 3, tickEvery: 0.4, color: "#9be7ff" },
    },
  },
  echoes: {
    id: "echoes",
    name: "Echoes",
    color: "#5fd1a0",
    rarity: "rare",
    rarityWeight: 6,
    abilities: {
      m1: { name: "Act 1 Touch", kind: "melee", damage: 0.5, range: 14, radius: 10, cooldown: 0.35, color: "#bff5da" },
      a1: { name: "Sent Bleed", kind: "bleed_text", damage: 2, range: 220, radius: 7, cooldown: 3.2, speed: 360, duration: 6, color: "#ff4d4d" },
      a2: { name: "Explosion", kind: "explosion_text", damage: 6, range: 0, radius: 26, cooldown: 7, duration: 6, knockback: 220, color: "#ffb84d" },
      a3: { name: "Ground Text", kind: "frost_text", damage: 0.8, range: 110, radius: 44, cooldown: 5, duration: 4, tickEvery: 0.45, color: "#a8e8ff" },
      a4: { name: "Three Freeze", kind: "three_freeze_pressure", damage: 0.9, range: 240, radius: 22, cooldown: 9, duration: 4.5, tickEvery: 0.5, color: "#5fd1a0" },
    },
  },
  ebony_devil: {
    id: "ebony_devil",
    name: "Ebony Devil",
    color: "#8f949c",
    rarity: "common",
    rarityWeight: 48,
    abilities: {
      m1: { name: "Slice", kind: "melee", damage: 0.3, range: 24, radius: 16, cooldown: 0.32, color: "#cfd3dc" },
      a1: { name: "Doll / Puppet", kind: "puppet_toggle", damage: 0, range: 0, radius: 0, cooldown: 0.35, color: "#b8bcc6" },
      a2: { name: "Spear Jab", kind: "puppet_spear", damage: 6, range: 190, radius: 8, cooldown: 2.4, speed: 360, color: "#d6d8dd" },
      a3: { name: "360° Spear Spin", kind: "puppet_spin", damage: 5, range: 0, radius: 58, cooldown: 4.5, color: "#b8bcc6" },
      a4: { name: "Rage Mode", kind: "rage_mode", damage: 0, range: 0, radius: 0, cooldown: 10, duration: 5, color: "#ff3d3d" },
    },
  },
  gold_experience: {
    id: "gold_experience",
    name: "Gold Experience",
    color: "#f5d36b",
    rarity: "rare",
    rarityWeight: 6,
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 2.5, range: 22, radius: 16, cooldown: 0.3, color: "#fff0a8" },
      a1: { name: "Eagle Shot", kind: "ge_eagle_pierce", damage: 4, range: 280, radius: 8, cooldown: 3.0, speed: 360, color: "#ffd24a" },
      a2: { name: "Frog Summon", kind: "frog_summon", damage: 0, range: 0, cooldown: 4.5, color: "#7fc97f" },
      a3: { name: "Out of Body", kind: "hologram_stun", damage: 5, range: 36, radius: 18, cooldown: 12, stunSeconds: 3.5, color: "#bff5da" },
      a4: { name: "Tree of Life", kind: "tree_zone", damage: 0, range: 70, radius: 90, cooldown: 30, duration: 14, color: "#5fd16a" },
    },
  },
  hanged_man: {
    id: "hanged_man",
    name: "Hanged Man",
    color: "#cfd6e3",
    rarity: "uncommon",
    rarityWeight: 15,
    abilities: {
      m1: { name: "Saber", kind: "melee", damage: 1.2, range: 28, radius: 14, cooldown: 0.34, color: "#cfd6e3" },
      a1: { name: "Pilot", kind: "pilot_toggle", damage: 0, range: 0, cooldown: 0.4, color: "#cfd6e3" },
      a2: { name: "Mirror Shard", kind: "mirror_shard", damage: 0, range: 0, radius: 80, cooldown: 1.2, duration: 12, color: "#dfe6f0" },
      a3: { name: "Teleport", kind: "shard_teleport", damage: 0, range: 0, cooldown: 6, color: "#dfe6f0" },
      a4: { name: "Brutal Slash", kind: "brutal_slash", damage: 7, range: 30, radius: 16, cooldown: 9, stunSeconds: 1.5, color: "#9ec0ff" },
    },
  },
  white_album: {
    id: "white_album",
    name: "White Album",
    color: "#e8eaff",
    rarity: "rare",
    rarityWeight: 6,
    abilities: {
      m1: { name: "Frost Punch", kind: "melee", damage: 1.4, range: 22, radius: 14, cooldown: 0.32, color: "#dfe6ff" },
      a1: { name: "Freeze Punch", kind: "melee", damage: 5, range: 24, radius: 16, cooldown: 3, stunSeconds: 1.2, color: "#a8e8ff" },
      a2: { name: "Ice Stomp", kind: "ice_stomp", damage: 5, range: 130, radius: 56, cooldown: 6, stunSeconds: 2.0, color: "#bff5ff" },
      a3: { name: "Ice Heal", kind: "ice_heal", damage: 0, range: 0, radius: 0, cooldown: 8, color: "#dfe6ff" },
      a4: { name: "Frost Expanse", kind: "dot_zone", damage: 1.5, range: 90, radius: 110, cooldown: 16, duration: 5, tickEvery: 0.5, color: "#9be7ff" },
    },
  },
  purple_haze: {
    id: "purple_haze",
    name: "Purple Haze",
    color: "#a06bff",
    rarity: "epic",
    rarityWeight: 5,
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 1.5, range: 22, radius: 14, cooldown: 0.32, color: "#c8a8ff" },
      a1: { name: "Capsule Shot", kind: "capsule_shot", damage: 3, range: 240, radius: 6, cooldown: 2.8, speed: 320, duration: 6, color: "#ffd24a" },
      a2: { name: "Gas Release", kind: "gas_release", damage: 1.0, range: 0, radius: 80, cooldown: 9, duration: 5, tickEvery: 0.45, color: "#a06bff" },
      a3: { name: "Pilot", kind: "ph_pilot_toggle", damage: 0, range: 0, cooldown: 0.4, color: "#a06bff" },
      a4: { name: "Cleansly Violence", kind: "cleansly_violence", damage: 0, range: 0, cooldown: 18, duration: 8, color: "#ff6bd1" },
    },
  },
  moon_rabbit: {
    id: "moon_rabbit",
    name: "Moon Rabbit",
    color: "#a8334a",
    rarity: "pebble",
    rarityWeight: 0,
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 0.9, range: 22, radius: 14, cooldown: 0.3, color: "#ffd1d1" },
      a1: { name: "Wasp Swarm", kind: "wasp_swarm", damage: 4, range: 220, radius: 36, cooldown: 9, duration: 6, tickEvery: 2.5, color: "#ffd24a" },
      a2: { name: "Lunar Veil", kind: "lunar_veil", damage: 0, range: 0, cooldown: 12, duration: 3, color: "#ffe2ee" },
      a3: { name: "Crash", kind: "crash", damage: 9, range: 300, radius: 26, cooldown: 10, speed: 420, color: "#5a2a1a" },
      a4: { name: "Lightning Strike", kind: "eternal_curse", damage: 12, range: 180, radius: 180, cooldown: 22, duration: 10, color: "#cfd6ff" },
    },
  },
  harvest: {
    id: "harvest",
    name: "Harvest",
    color: "#ffd24a",
    rarity: "common",
    rarityWeight: 28,
    abilities: {
      m1: { name: "Bite", kind: "melee", damage: 0.6, range: 16, radius: 10, cooldown: 0.4, color: "#fff36b" },
      a1: { name: "Resource Gather", kind: "harvest_gather", damage: 0, range: 220, cooldown: 4, color: "#ffd24a" },
      a2: { name: "Carry", kind: "harvest_carry", damage: 0, range: 0, cooldown: 4, color: "#ffe28a" },
      a3: { name: "-", kind: "melee", damage: 0, range: 0, cooldown: 999, color: "#888" },
      a4: { name: "-", kind: "melee", damage: 0, range: 0, cooldown: 999, color: "#888" },
    },
  },
};

export const SHIT_ABILITY: Ability = {
  name: "S.H.I.T.",
  kind: "auto_aim",
  damage: 18,
  range: 280,
  radius: 30,
  cooldown: 12,
  crater: true,
  color: "#222",
};

// ===== Tier-based rarity rolling =====
// Each Arrow rolls from a fixed tier distribution that always sums to 100%.
// Pebble (Moon Rabbit) and Legendary (SPTW) are NOT in this pool — they're
// granted by their dedicated items.
export const TIER_ORDER: StandRarity[] = ["common", "uncommon", "rare", "epic"];

// Base weights — sum to 100 for arrow rolls.
export const TIER_BASE_PCT: Record<StandRarity, number> = {
  common: 50,
  uncommon: 28,
  rare: 16,
  epic: 6,
  pebble: 0,
  legendary: 0,
};

const ROLLABLE: StandId[] = [
  "star_platinum",
  "rhcp",
  "echoes",
  "ebony_devil",
  "gold_experience",
  "hanged_man",
  "white_album",
  "purple_haze",
  "harvest",
];

// Group rollable stands by tier so we can pick a tier first, then a stand within it.
function standsByTier(tier: StandRarity): StandId[] {
  return ROLLABLE.filter((id) => STANDS[id].rarity === tier);
}

/** Per-stand effective % across the full Arrow roll, used by the Tonth catalog. */
export function standRollPct(id: StandId, rareLuck = 1): number {
  const s = STANDS[id];
  if (!ROLLABLE.includes(id)) return 0;
  const tierPct = effectiveTierPct(rareLuck);
  const peers = standsByTier(s.rarity).length || 1;
  return (tierPct[s.rarity] ?? 0) / peers;
}

/** Tier % with rareLuck applied. Shifts mass from common→uncommon→rare→epic. */
export function effectiveTierPct(rareLuck = 1): Record<StandRarity, number> {
  const luck = Math.max(1, rareLuck);
  // Simple model: scale rare/epic, take the surplus from common/uncommon proportionally.
  const epic = Math.min(40, TIER_BASE_PCT.epic * luck);
  const rare = Math.min(40, TIER_BASE_PCT.rare * Math.max(1, Math.sqrt(luck)));
  const remaining = 100 - epic - rare;
  // Split remaining across common/uncommon by their original ratio.
  const baseCU = TIER_BASE_PCT.common + TIER_BASE_PCT.uncommon;
  const common = remaining * (TIER_BASE_PCT.common / baseCU);
  const uncommon = remaining * (TIER_BASE_PCT.uncommon / baseCU);
  return { common, uncommon, rare, epic, pebble: 0, legendary: 0 };
}

// ----- Real RNG for stand rolls (seedable, uniform) -----
function makeMulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeed(): number {
  try {
    const u32 = new Uint32Array(1);
    (globalThis.crypto ?? (globalThis as any).msCrypto).getRandomValues(u32);
    return u32[0] || (Date.now() >>> 0);
  } catch {
    return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  }
}

let standRng: () => number = makeMulberry32(makeSeed());

export function reseedStandRng(seed?: number) {
  standRng = makeMulberry32(seed ?? makeSeed());
}

export interface RollOptions {
  rareLuck?: number;
}

export function rollStand(opts: RollOptions = {}): { id: StandId; shitVariant: boolean; tier: StandRarity; roll: number } {
  const tierPct = effectiveTierPct(opts.rareLuck ?? 1);
  const roll = standRng();
  let r = roll * 100;
  let chosenTier: StandRarity = "common";
  for (const t of TIER_ORDER) {
    r -= tierPct[t];
    if (r <= 0) { chosenTier = t; break; }
  }
  const peers = standsByTier(chosenTier);
  const safePool = peers.length > 0 ? peers : standsByTier("common");
  const pickIdx = Math.floor(standRng() * safePool.length);
  const id = safePool[Math.min(pickIdx, safePool.length - 1)];
  return { id, shitVariant: false, tier: chosenTier, roll };
}
