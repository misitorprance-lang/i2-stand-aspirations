import type { StandId } from "./stands";

export interface Vec2 { x: number; y: number; }

export interface Rect { x: number; y: number; w: number; h: number; }

export type EntityKind = "player" | "friendly" | "enemy";

export interface Entity {
  id: number;
  kind: EntityKind;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  facing: Vec2; // unit
  color: string;
  alive: boolean;
  stunUntil: number; // game time seconds
  hitFlashUntil: number;
  // wander
  wanderTarget?: Vec2;
  wanderUntil?: number;
  // respawn
  respawnAt?: number;
  // attack cd (enemies)
  nextAttackAt?: number;
  // hostile only retaliates after being damaged
  provoked?: boolean;
  // status effects
  electroUntil?: number;
  hologramUntil?: number;
  hologramOrigin?: Vec2;
  bleedUntil?: number;
  bleedNextTickAt?: number;
  slowUntil?: number;
  // Purple Haze poison
  poisonUntil?: number;
  poisonNextTickAt?: number;
  poisonDps?: number;
  // Echoes Three Freeze pressure (slow + can't act)
  pressuredUntil?: number;
  // Echoes rooting visual via Tree of Life
  rootedUntil?: number;
  // AI anti-stuck
  stuckAcc?: number;
  lastPos?: Vec2;
}

export interface Frog {
  id: number;
  pos: Vec2;
  bobPhase: number;
  alive: boolean;
}

export interface ProtectionTree {
  pos: Vec2;
  radius: number;
  expireAt: number;
  bornAt: number;
  rooted: Map<number, number>; // entityId -> stun-applied-until
}

export interface Prop {
  rect: Rect; // collision rect (current)
  draw: (ctx: CanvasRenderingContext2D, r: Rect) => void;
  // destruction state
  hp?: number;
  maxHp?: number;
  destructible?: boolean;
  destroyedAt?: number;   // game time when destroyed; null/0 = alive
  respawnAt?: number;     // game time when it should respawn
  hitFlashUntil?: number;
  // pristine snapshot for "perfect respawn"
  original?: { rect: Rect; hp: number };
}

export interface MirrorShard {
  id: number;
  pos: Vec2;
  expireAt: number;     // life timer; extended while NPC is inside dome
  radius: number;       // dome radius
  bornAt: number;
}

export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  color: string;
  ownerKind: "player";
  pierce: boolean;
  hitSet: Set<number>;
  expireAt: number;
  lobbed?: boolean;
  detonateAt?: number;
  detonateRadius?: number;
  detonateColor?: string;
  detonateCrater?: boolean;
  // homing toward this target (gentle steering)
  homingTargetId?: number;
  homingStrength?: number; // 0..1 each tick
  speed?: number;
  // chain lightning style: on hit, jump to next nearest within range
  chainsLeft?: number;
  chainRange?: number;
  chainColor?: string;
  // applies electrocute status on hit
  applyElectro?: number;
  // applies bleed status on hit (Echoes Sent Bleed)
  applyBleed?: { dps: number; durationSeconds: number };
  // applies poison status on hit (Purple Haze Capsule Shot)
  applyPoison?: { dps: number; durationSeconds: number };
  // textual rendering hint (Echoes/Purple Haze projectiles)
  textGlyph?: string;
}

export interface Zone {
  id: number;
  pos: Vec2;
  radius: number;
  damagePerTick: number;
  tickEvery: number;
  nextTickAt: number;
  expireAt: number;
  color: string;
  ringColor?: string;
  crater?: boolean;
  craterPlaced?: boolean;
}

export interface PuppetState {
  active: boolean;
  pos: Vec2;
  hp: number;
  maxHp: number;
  facing: Vec2;
  attackUntil: number;
}

export interface ChannelState {
  abilityKey: "m1" | "a1" | "a2" | "a3" | "a4";
  dir: Vec2;
  expireAt: number;
  nextTickAt: number;
  tickEvery: number;
  range: number;
  radius: number;
  damage: number;
  color: string;
}

export interface DamageNumber {
  id: number;
  pos: Vec2;
  text: string;
  color: string;
  size: number;
  vy: number;
  expireAt: number;
  bornAt: number;
}

export interface Crater {
  pos: Vec2;
  radius: number;
  expireAt: number;
  bornAt: number;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  color: string;
  size: number;
  expireAt: number;
  bornAt: number;
  shape?: "square" | "circle" | "spark" | "ember";
  gravity?: number;
}

export type VfxKind =
  | "slash_arc"      // arcing melee swipe
  | "shockwave"      // expanding ring
  | "lightning_bolt" // jagged line between two points
  | "fire_burst"     // upward flame puff
  | "ice_burst"      // crystal shards
  | "stab_line"      // forward streak
  | "beam"           // straight beam between points
  | "explosion_ring" // big blast
  | "crater_smoke"   // smoke after explosion
  | "tree_aura"      // protection tree dome
  | "hologram_burst" // out-of-body hologram pop
  | "chain_arc"      // chain-lightning hop
  | "crit_burst"     // critical hit yellow sparks
  | "time_clock"     // big clock during time stop
  | "shard_flash"    // teleport flash
  | "mirror_dome";   // dome edge ring

export interface Vfx {
  kind: VfxKind;
  pos: Vec2;
  to?: Vec2;
  radius?: number;
  angle?: number;
  color: string;
  bornAt: number;
  expireAt: number;
}

export interface ItemPickup {
  id: number;
  kind: "arrow" | "disc";
  pos: Vec2;
  bornAt: number;
}

export interface UIState {
  standId: StandId;
  shitVariant: boolean;
  arrows: number;
  discs: number;
  hp: number;
  maxHp: number;
  cooldowns: { m1: number; a1: number; a2: number; a3: number; a4: number }; // remaining seconds
  banner: string | null;
  bannerUntil: number;
}
