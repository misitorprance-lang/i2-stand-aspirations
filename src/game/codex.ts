// CANONICAL STAND CODEX — version-locked snapshot of stand models, moves,
// and behavior tags. This file is the source of truth referenced by
// stands.ts and the renderer; future updates can diff against this version
// to migrate, restore, or serialize older builds.
//
// DO NOT mutate values here without bumping CODEX_VERSION.

import { STANDS } from "./stands";
import type { StandId } from "./stands";

export const CODEX_VERSION = "1.1.0";

export interface ModelSpec {
  description: string;     // verbal description of the visible model
  silhouette: string[];    // pixel-art notes (head/body/limbs)
  auraColor: string;
}

export interface MoveSpec {
  name: string;
  kind: string;
  damage: number;
  range: number;
  cooldown: number;
  notes: string;
}

export interface StandCodexEntry {
  id: StandId;
  model: ModelSpec;
  moves: { m1: MoveSpec; a1: MoveSpec; a2: MoveSpec; a3: MoveSpec; a4: MoveSpec };
}

function moveOf(s: StandId, k: "m1" | "a1" | "a2" | "a3" | "a4", notes: string): MoveSpec {
  const a = STANDS[s].abilities[k];
  return {
    name: a.name,
    kind: a.kind,
    damage: a.damage,
    range: a.range,
    cooldown: a.cooldown,
    notes,
  };
}

export const STAND_CODEX: Record<Exclude<StandId, "none">, StandCodexEntry> = {
  star_platinum: {
    id: "star_platinum",
    model: {
      description: "Tall purple humanoid with a teal headband and white face accents.",
      silhouette: ["square head w/ headband", "purple torso", "extending arm on punch"],
      auraColor: "#7c5cff",
    },
    moves: {
      m1: moveOf("star_platinum", "m1", "Cone melee in front of player."),
      a1: moveOf("star_platinum", "a1", "Forward stab pierce, hits multiple in line."),
      a2: moveOf("star_platinum", "a2", "Straight-line projectile aimed at target."),
      a3: moveOf("star_platinum", "a3", "Time stop — freezes the world for 5s; player can still attack and move."),
      a4: moveOf("star_platinum", "a4", "Close knockback strike."),
    },
  },
  rhcp: {
    id: "rhcp",
    model: {
      description: "Lanky red figure with jagged head and yellow electric crackle.",
      silhouette: ["triangular head", "thin red body", "lightning above head"],
      auraColor: "#ff4444",
    },
    moves: {
      m1: moveOf("rhcp", "m1", "Cone melee."),
      a1: moveOf("rhcp", "a1", "Fast electric projectile, applies electrocute status."),
      a2: moveOf("rhcp", "a2", "Ring AOE around player with knockback."),
      a3: moveOf("rhcp", "a3", "Targeted explosion at point, leaves crater."),
      a4: moveOf("rhcp", "a4", "Stationary tesla zone ticking damage."),
    },
  },
  echoes: {
    id: "echoes",
    model: {
      description: "Three acts. Form is driven by the last ability cast (a1=Act1, a2/a3=Act2, a4=Act3).",
      silhouette: [
        "Act 1: small egg+tail",
        "Act 2: bigger humanoid w/ green torso",
        "Act 3: white body w/ green band, taller",
      ],
      auraColor: "#5fd1a0",
    },
    moves: {
      m1: moveOf("echoes", "m1", "Tiny melee tick."),
      a1: moveOf("echoes", "a1", "Touch that stuns target."),
      a2: moveOf("echoes", "a2", "Lobbed text that explodes on landing."),
      a3: moveOf("echoes", "a3", "Burning ground zone that ticks damage."),
      a4: moveOf("echoes", "a4", "Auto-aim crush on nearest enemy. Rare S.H.I.T. variant: 25 dmg + crater."),
    },
  },
  ebony_devil: {
    id: "ebony_devil",
    model: {
      description: "Small grey beetle-headed stand with chrome armor accents.",
      silhouette: ["beetle helmet w/ horns", "grey body", "thin arms"],
      auraColor: "#8f949c",
    },
    moves: {
      m1: moveOf("ebony_devil", "m1", "Slice from puppet origin if active."),
      a1: moveOf("ebony_devil", "a1", "Toggle puppet doll (half player HP)."),
      a2: moveOf("ebony_devil", "a2", "Puppet fires spear at nearest enemy."),
      a3: moveOf("ebony_devil", "a3", "Puppet spins spear in 360° AOE."),
      a4: moveOf("ebony_devil", "a4", "Consumes full rage bar; 5s damage boost."),
    },
  },
  gold_experience: {
    id: "gold_experience",
    model: {
      description: "Slim gold humanoid with a ladybug motif and yellow glow.",
      silhouette: ["round gold head", "yellow torso", "fluid arms"],
      auraColor: "#f5d36b",
    },
    moves: {
      m1: moveOf("gold_experience", "m1", "Cone melee."),
      a1: moveOf("gold_experience", "a1", "Eagle homes to nearest enemy; chains up to 4 (50% per hop)."),
      a2: moveOf("gold_experience", "a2", "Spawns frog protector (max 3); intercepts attack and reflects 50% damage."),
      a3: moveOf("gold_experience", "a3", "Long single-target stun with hologram exit/return visual."),
      a4: moveOf("gold_experience", "a4", "Tree of Life zone: roots enemies, heals + boosts player."),
    },
  },
  hanged_man: {
    id: "hanged_man",
    model: {
      description: "Tall draped figure that lives in mirror shards; dormant until Pilot is engaged.",
      silhouette: ["dark cloak", "pale face", "saber arm"],
      auraColor: "#cfd6e3",
    },
    moves: {
      m1: moveOf("hanged_man", "m1", "Saber slash, fixed 1.2 dmg, no crits. Only inside an active mirror dome."),
      a1: moveOf("hanged_man", "a1", "Pilot toggle: control the stand directly; HP shared, regen disabled."),
      a2: moveOf("hanged_man", "a2", "Drop a mirror shard with a combat dome (max 5, 12s)."),
      a3: moveOf("hanged_man", "a3", "Open shard picker; teleport to chosen shard."),
      a4: moveOf("hanged_man", "a4", "Brutal slash — bleed + stun + slow."),
    },
  },
};
