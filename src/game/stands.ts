// Stand & ability data tables for Stand Test.
// All ability behavior is data-driven; the engine reads `kind` to decide how to execute.

export type StandId = "none" | "star_platinum" | "rhcp" | "echoes" | "ebony_devil" | "gold_experience";

export type AbilityKind =
  | "melee" // short cone in facing dir
  | "projectile" // straight-line moving hit
  | "pierce" // short forward stab, hits multiple
  | "aoe_self" // ring around the player
  | "aoe_target" // AOE at point in facing direction (leaves crater optional)
  | "channel_cone" // multi-tick cone (ora ora)
  | "knockback" // close-range strong push
  | "auto_aim" // pick nearest enemy in range, hit it
  | "stun_touch" // close range, applies stun
  | "lobbed" // travels then explodes
  | "dot_zone" // ground zone ticking damage
  | "tesla" // stationary AOE that ticks for a few seconds
  | "puppet_toggle"
  | "puppet_spear"
  | "puppet_spin"
  | "rage_mode"
  | "chain_projectile" // homing piercing shot that chains to nearby targets
  | "frog_summon"      // summons frog protector(s)
  | "hologram_stun"    // long stun + hologram visual
  | "tree_zone";       // protection/heal/buff zone with rooting

export interface Ability {
  name: string;
  kind: AbilityKind;
  damage: number;
  range: number;
  radius?: number;
  cooldown: number; // seconds
  duration?: number; // for channels / zones / tesla
  tickEvery?: number; // for channels / zones
  speed?: number; // projectiles
  knockback?: number;
  crater?: boolean;
  stunSeconds?: number;
  color: string;
}

export interface Stand {
  id: StandId;
  name: string;
  color: string; // aura color
  rarityWeight: number; // 0 means not in roll pool
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
    rarityWeight: 1, // rarest
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 3, range: 22, radius: 16, cooldown: 0.3, color: "#b8a6ff" },
      a1: { name: "Star Finger", kind: "pierce", damage: 6, range: 70, radius: 8, cooldown: 1.6, color: "#fff2a8" },
      a2: { name: "Ranged Smash", kind: "projectile", damage: 8, range: 220, radius: 8, cooldown: 2.0, speed: 320, color: "#b8a6ff" },
      a3: { name: "Ora Ora Rush", kind: "channel_cone", damage: 1.2, range: 30, radius: 22, cooldown: 6, duration: 2.0, tickEvery: 0.09, color: "#ffffff" },
      a4: { name: "Launch", kind: "knockback", damage: 14, range: 26, radius: 18, cooldown: 5, knockback: 220, color: "#7c5cff" },
    },
  },
  rhcp: {
    id: "rhcp",
    name: "Red Hot Chili Pepper",
    color: "#ff4444",
    rarityWeight: 6, // most common
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 1.4, range: 20, radius: 14, cooldown: 0.32, color: "#ffd0a8" },
      a1: { name: "Electric Shot", kind: "projectile", damage: 5, range: 220, radius: 6, cooldown: 1.2, speed: 380, color: "#fff36b" },
      a2: { name: "Electric Discharge", kind: "aoe_self", damage: 7, range: 0, radius: 70, cooldown: 4, color: "#fff36b" },
      a3: { name: "Ground Bomber", kind: "aoe_target", damage: 12, range: 120, radius: 50, cooldown: 6, crater: true, color: "#ff8a3a" },
      a4: { name: "Tesla Coil", kind: "tesla", damage: 2.5, range: 0, radius: 90, cooldown: 12, duration: 4, tickEvery: 0.4, color: "#9be7ff" },
    },
  },
  echoes: {
    id: "echoes",
    name: "Echoes",
    color: "#5fd1a0",
    rarityWeight: 3,
    abilities: {
      m1: { name: "Act 3 Punch", kind: "melee", damage: 1.5, range: 18, radius: 12, cooldown: 0.28, color: "#bff5da" },
      a1: { name: "Freeze Touch", kind: "stun_touch", damage: 1, range: 22, radius: 16, cooldown: 4, stunSeconds: 1.6, color: "#a8e8ff" },
      a2: { name: "Explosive Text", kind: "lobbed", damage: 9, range: 160, radius: 38, cooldown: 3.5, speed: 240, color: "#ffb84d" },
      a3: { name: "Burning Text", kind: "dot_zone", damage: 1.5, range: 100, radius: 44, cooldown: 7, duration: 3.5, tickEvery: 0.35, color: "#ff6a3a" },
      a4: { name: "Three Freeze", kind: "auto_aim", damage: 11, range: 220, radius: 22, cooldown: 8, color: "#5fd1a0" },
    },
  },
  ebony_devil: {
    id: "ebony_devil",
    name: "Ebony Devil",
    color: "#8f949c",
    rarityWeight: 4,
    abilities: {
      m1: { name: "Slice", kind: "melee", damage: 0.3, range: 24, radius: 16, cooldown: 0.32, color: "#cfd3dc" },
      a1: { name: "Doll / Puppet", kind: "puppet_toggle", damage: 0, range: 0, radius: 0, cooldown: 0.35, color: "#b8bcc6" },
      a2: { name: "Spear Jab", kind: "puppet_spear", damage: 8, range: 190, radius: 8, cooldown: 2.4, speed: 360, color: "#d6d8dd" },
      a3: { name: "360° Spear Spin", kind: "puppet_spin", damage: 7, range: 0, radius: 58, cooldown: 4.5, color: "#b8bcc6" },
      a4: { name: "Rage Mode", kind: "rage_mode", damage: 0, range: 0, radius: 0, cooldown: 10, duration: 5, color: "#ff3d3d" },
    },
  },
  gold_experience: {
    id: "gold_experience",
    name: "Gold Experience",
    color: "#f5d36b",
    rarityWeight: 2, // rare
    abilities: {
      m1: { name: "Punch", kind: "melee", damage: 2.5, range: 22, radius: 16, cooldown: 0.3, color: "#fff0a8" },
      a1: { name: "Eagle Summon", kind: "chain_projectile", damage: 6, range: 260, radius: 6, cooldown: 3.2, speed: 380, color: "#ffd24a" },
      a2: { name: "Frog Summon", kind: "frog_summon", damage: 0, range: 0, cooldown: 4.5, color: "#7fc97f" },
      a3: { name: "Out of Body", kind: "hologram_stun", damage: 7, range: 36, radius: 18, cooldown: 12, stunSeconds: 3.5, color: "#bff5da" },
      a4: { name: "Tree of Life", kind: "tree_zone", damage: 0, range: 70, radius: 78, cooldown: 30, duration: 6, color: "#5fd16a" },
    },
  },
};

// S.H.I.T. — rare upgraded variant of Echoes' a4
export const SHIT_ABILITY: Ability = {
  name: "S.H.I.T.",
  kind: "auto_aim",
  damage: 25,
  range: 280,
  radius: 30,
  cooldown: 12,
  crater: true,
  color: "#222",
};

const ROLLABLE: StandId[] = ["star_platinum", "rhcp", "echoes", "ebony_devil", "gold_experience"];

export function rollStand(): { id: StandId; shitVariant: boolean } {
  const total = ROLLABLE.reduce((s, id) => s + STANDS[id].rarityWeight, 0);
  let r = Math.random() * total;
  for (const id of ROLLABLE) {
    r -= STANDS[id].rarityWeight;
    if (r <= 0) {
      const shitVariant = id === "echoes" && Math.random() < 0.15; // 15% on Echoes
      return { id, shitVariant };
    }
  }
  return { id: "rhcp", shitVariant: false };
}
