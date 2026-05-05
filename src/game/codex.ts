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
      m1: moveOf("star_platinum", "m1", "Quick punch, 15% crit. ORA-flurry on chain."),
      a1: moveOf("star_platinum", "a1", "Star Rush — short dash, grab nearest enemy and deliver two punches."),
      a2: moveOf("star_platinum", "a2", "Star Finger — narrow piercing stab; light knockback."),
      a3: moveOf("star_platinum", "a3", "The World — single tap stops time 5s. Double tap = Time Skip: teleport to last enemy you hit and stun them."),
      a4: moveOf("star_platinum", "a4", "Launch — short, brutal close-range knockback."),
    },
  },
  sptw: {
    id: "sptw",
    model: {
      description: "Cyan-and-purple humanoid with white loincloth/gloves, gold markings, black hair. Stronger evolution of Star Platinum.",
      silhouette: ["cyan body w/ purple trim", "white waist + gloves", "gold accent markings"],
      auraColor: "#5fe8ff",
    },
    moves: {
      m1: moveOf("sptw", "m1", "7 dmg / 8 crit. Drops to 4 if held continuously."),
      a1: moveOf("sptw", "a1", "Star Rush (same as SP)."),
      a2: moveOf("sptw", "a2", "Triple Pebble — three small fast flicks at one enemy."),
      a3: moveOf("sptw", "a3", "Time Stop 7s. Time Skip can be used twice per cooldown."),
      a4: moveOf("sptw", "a4", "Launch — close-range knockback."),
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
      a1: moveOf("echoes", "a1", "ゴゴゴ — close-range; tag the NPC with bleed."),
      a2: moveOf("echoes", "a2", "ドドド — drop a bomb-text on the ground that detonates only when an NPC walks over it."),
      a3: moveOf("echoes", "a3", "ピピピ — single-target freeze: lock one NPC in place + heavy slow."),
      a4: moveOf("echoes", "a4", "ズキューン — close-range mark: hit one NPC, slows heavily and amps your damage to it for 5s."),
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
      a1: moveOf("gold_experience", "a1", "Eagle shoots forward in a straight line, piercing every enemy in its path."),
      a2: moveOf("gold_experience", "a2", "Frog protectors follow you (max 3); they leap to block hits and reflect 50%."),
      a3: moveOf("gold_experience", "a3", "Long single-target stun; a hologram of GE shoots out from behind the target."),
      a4: moveOf("gold_experience", "a4", "Tree of Life zone: roots enemies, heals you, buffs frog/eagle spam. Despawns on expire."),
    },
  },
  ger: {
    id: "ger",
    model: {
      description: "Gold Experience Requiem — porcelain-pale humanoid with rosy-gold trim and ladybug emblems on shoulders/forehead/knees; long pink-tipped hair.",
      silhouette: ["ladybug emblems", "porcelain face", "pink-tipped hair"],
      auraColor: "#ffd6e0",
    },
    moves: {
      m1: moveOf("ger", "m1", "Crisp punch — 6 dmg / 7 crit. Passive: Return to Zero rewinds attackers 5s back when they hit you (20s ICD)."),
      a1: moveOf("ger", "a1", "Life Beam — flicked pebble becomes a piercing beam, 13 dmg."),
      a2: moveOf("ger", "a2", "You'll Never Reach the Truth — punch + ghost copies of the target stack damage until they die."),
      a3: moveOf("ger", "a3", "Triple Loop — target frozen, then killed by lightning → poison → pebbles in sequence."),
      a4: moveOf("ger", "a4", "—"),
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
      m1: moveOf("hanged_man", "m1", "Saber slash, fixed 1.2 dmg, no crits."),
      a1: moveOf("hanged_man", "a1", "Pilot toggle: control the stand directly; HP shared, regen disabled."),
      a2: moveOf("hanged_man", "a2", "Drop a mirror shard with a combat dome (max 5, 12s)."),
      a3: moveOf("hanged_man", "a3", "Open shard picker; teleport to chosen shard."),
      a4: moveOf("hanged_man", "a4", "Brutal slash — bleed + stun + slow."),
    },
  },
  white_album: {
    id: "white_album",
    model: {
      description: "White suit with purple trim and a yellow-green visor; ice skates under feet.",
      silhouette: ["sleek visored helmet", "white body w/ purple piping", "ice-skate triangle feet"],
      auraColor: "#e8eaff",
    },
    moves: {
      m1: moveOf("white_album", "m1", "Quick frost punch. 15% crit (2.1 dmg)."),
      a1: moveOf("white_album", "a1", "Heavy frozen punch with stun."),
      a2: moveOf("white_album", "a2", "Ice spikes shoot out and hit only the 2 closest enemies."),
      a3: moveOf("white_album", "a3", "Ice Heal repairs the suit bar and restores player HP with a visible burst."),
      a4: moveOf("white_album", "a4", "Frost dome that slows and chips all enemies inside."),
    },
  },
  purple_haze: {
    id: "purple_haze",
    model: {
      description: "Hulking purple-armored stand with bio-capsule fists and a pale, snarling helm.",
      silhouette: ["spiked purple helm", "broad violet torso", "capsule knuckles on fists"],
      auraColor: "#a06bff",
    },
    moves: {
      m1: moveOf("purple_haze", "m1", "Standard punch. Every 10 punches, ~0.2% chance to poison the target for 6s."),
      a1: moveOf("purple_haze", "a1", "Capsule Shot — golden capsule explodes into a poison gas cloud on contact."),
      a2: moveOf("purple_haze", "a2", "Gas Release — a ring of poison vents from Purple Haze; light self-damage too."),
      a3: moveOf("purple_haze", "a3", "Pilot — Purple Haze becomes the controlled body; attacks originate from its position."),
      a4: moveOf("purple_haze", "a4", "Cleansly Violence — +8% damage for several seconds, shown by a bar."),
    },
  },
  moon_rabbit: {
    id: "moon_rabbit",
    model: {
      description: "Replaces the player. Blonde hair, maroon eyes, light-brown rabbit ears/hands/feet, dark red suit with dull pink grid stripes, white shirt, black tie.",
      silhouette: ["rabbit ears on top", "dark red suit body", "white collar + black tie"],
      auraColor: "#a8334a",
    },
    moves: {
      m1: moveOf("moon_rabbit", "m1", "Soft punch — 0.9 base, 3 on crits."),
      a1: moveOf("moon_rabbit", "a1", "Wasps swarm the nearest target and sting every ~2.5s for 6s."),
      a2: moveOf("moon_rabbit", "a2", "Lunar Veil — short invincibility window (2.5s)."),
      a3: moveOf("moon_rabbit", "a3", "Crash — a motorbike rushes in from off-screen and attacks the closest target. It does not hurt you."),
      a4: moveOf("moon_rabbit", "a4", "Lightning Strike — one nearby target is struck three random times across 10 seconds."),
    },
  },
  harvest: {
    id: "harvest",
    model: {
      description: "A swarm of dozens of tiny yellow beetles. Each one is a thumbnail-sized stand. They normally orbit the user in a low cloud and only fan out when commanded.",
      silhouette: ["yellow beetle cloud", "low buzzing orbit", "tiny black legs"],
      auraColor: "#ffd24a",
    },
    moves: {
      m1: moveOf("harvest", "m1", "A few beetles latch onto the closest target. Tiny per-bite damage."),
      a1: moveOf("harvest", "a1", "Resource Gather (toggle) — beetles fan out within 220 units, picking up one item at a time and ferrying it home to you."),
      a2: moveOf("harvest", "a2", "Carry (toggle) — the swarm lifts you up and ferries you along the joystick. Faster, no terrain damage."),
      a3: moveOf("harvest", "a3", "—"),
      a4: moveOf("harvest", "a4", "—"),
    },
  },
};

