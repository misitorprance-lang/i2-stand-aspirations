import {
  STANDS,
  SHIT_ABILITY,
  rollStand,
  type Ability,
  type StandId,
} from "./stands";
import type {
  ChannelState,
  Crater,
  DamageNumber,
  Entity,
  Frog,
  ItemPickup,
  MirrorShard,
  Particle,
  ProtectionTree,
  PuppetState,
  Projectile,
  Prop,
  Rect,
  UIState,
  Vec2,
  Vfx,
  Zone,
} from "./types";
import { play, type SfxKey } from "./sound";

// ---------- constants ----------
export const VW = 360;
export const VH = 640;
// Map 1.5x previous size (1700x2600 -> 2550x3900).
export const MAP_W = 2550;
export const MAP_H = 3900;
export const CAMERA_ZOOM = 1.7;

const PLAYER_SPEED = 110;
const PLAYER_SPRINT_SPEED = 142;
const PLAYER_ACCEL = 14; // higher = snappier
const NPC_SPEED = 55;
const ENEMY_SPEED = 70;
const ENEMY_AGGRO = 140;
const ENEMY_ATTACK_RANGE = 22;
// Hostile NPC base / crit damage (rebalanced).
const ENEMY_ATTACK_DMG = 2;
const ENEMY_ATTACK_DMG_CRIT = 3;
const ENEMY_CRIT_CHANCE = 0.18;
const ENEMY_ATTACK_CD = 1.3;
const PLAYER_MAX_HP = 100;
const NPC_MAX_HP = 30;
const ENEMY_MAX_HP = 45;
const RESPAWN_DELAY = 6;
const FRIENDLY_COUNT = 14;
const ENEMY_COUNT = 14;
// Faster respawn + bigger ground pool — map is 1.5x bigger now, so finding items
// shouldn't feel like a chore. Initial world also pre-seeds a starter pool.
const ARROW_INTERVAL = [3, 6] as const;
const DISC_INTERVAL = [7, 12] as const;
const MAX_ARROWS_ON_GROUND = 14;
const MAX_DISCS_ON_GROUND = 9;
const INITIAL_ARROW_COUNT = 8;
const INITIAL_DISC_COUNT = 5;
const MAX_BLUE_PEBBLES_ON_GROUND = 2;
const PICKUP_RADIUS = 18;
const AIM_ASSIST_RANGE = 220;
const FROG_MAX = 8;
const STAND_TETHER = 360;

// Stands that hold a weapon — punches with these spawn slash hit FX, not punch impacts.
const WEAPON_STANDS = new Set<StandId>(["hanged_man", "ebony_devil"]);

// Strict prop-damage gating.
// ONLY Star Platinum and Star Platinum: The World can damage props with anything.
// Any OTHER stand may only damage props through one of these explicitly "deadly" moves.
const PROP_BREAKERS_BY_STAND = new Set<StandId>(["star_platinum", "sptw"]);
// Keys are `${standId}:${abilityKey}` (m1/a1/a2/a3/a4).
const PROP_BREAKERS_BY_MOVE = new Set<string>([
  "rhcp:a3",          // Ground Bomber
  "rhcp:a4",          // Tesla Coil
  "white_album:a4",   // Frost Expanse
  "moon_rabbit:a4",   // Eternal Curse
]);

// ---------- helpers ----------
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (a: Vec2, b: Vec2) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const dist = (a: Vec2, b: Vec2) => Math.sqrt(dist2(a, b));
const norm = (v: Vec2): Vec2 => {
  const m = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / m, y: v.y / m };
};

function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRectOverlap(cx: number, cy: number, r: number, rect: Rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// ---------- input ----------
export interface InputState {
  joy: Vec2; // -1..1
  joyActive: boolean;
  aim: Vec2 | null;
  sprint: boolean;
  pressed: { m1: boolean; a1: boolean; a2: boolean; a3: boolean; a4: boolean };
  // True while M1 button is being held — engine auto-repeats M1 each tick the cooldown is ready.
  m1Held: boolean;
  useArrow: boolean;
  useDisc: boolean;
}

export function makeInput(): InputState {
  return {
    joy: { x: 0, y: 0 },
    joyActive: false,
    aim: null,
    sprint: false,
    pressed: { m1: false, a1: false, a2: false, a3: false, a4: false },
    m1Held: false,
    useArrow: false,
    useDisc: false,
  };
}

// ---------- world ----------
interface World {
  time: number;
  player: Entity;
  npcs: Entity[];
  props: Prop[];
  projectiles: Projectile[];
  zones: Zone[];
  channel: ChannelState | null;
  damageNumbers: DamageNumber[];
  craters: Crater[];
  particles: Particle[];
  vfx: Vfx[];
  items: ItemPickup[];
  nextArrowAt: number;
  nextDiscAt: number;
  cdTimers: { m1: number; a1: number; a2: number; a3: number; a4: number };
  standId: StandId;
  shitVariant: boolean;
  standActive: boolean; // can be toggled off (desummon)
  bannerText: string | null;
  bannerUntil: number;
  banners: { id: number; text: string; color: string | null; expireAt: number }[];
  nextId: number;
  shake: number;
  cam: Vec2;
  standPunchUntil: number;
  standPunchDir: Vec2;
  standAimUntil: number;
  standAimTarget: Vec2 | null;
  kills: number;
  footstepAcc: number;
  pointerAim: Vec2 | null;
  puppet: PuppetState;
  rage: number;
  rageUntil: number;
  // Gold Experience
  frogs: Frog[];
  trees: ProtectionTree[];
  geBuffUntil: number; // damage boost while in tree
  hologramHits: { entityId: number; expireAt: number; from: Vec2 }[];
  // M1 hold-to-repeat
  m1Held: boolean;
  // Echoes act state (drives model + M1 damage)
  echoesAct: 1 | 2 | 3;
  // Star Platinum — The World
  timeStopUntil: number;
  timeStopStartedAt: number;
  pendingPlayerDamage: { amount: number; dir: Vec2 }[];
  // Hanged Man
  hangedManFormed: boolean;     // false until Pilot has been engaged at least once
  hangedManActive: boolean;     // visible separate model standing on field
  pilotActive: boolean;         // currently piloting Hanged Man
  puppetPiloted: boolean;       // currently piloting Ebony Devil's puppet
  shards: MirrorShard[];
  shardPickerOpen: boolean;
  hangedMan: { pos: Vec2; facing: Vec2; attackUntil: number };
  // Auto-kick (anti-stuck) cooldown
  kickAt: number;
  // Player-input intent magnitude (used by kick detection)
  lastJoyMag: number;
  // White Album
  whiteAlbumActive: boolean;
  whiteAlbumBar: number;          // 0..100
  whiteAlbumToggleAt: number;     // earliest time a toggle is allowed
  whiteAlbumLockUntil: number;    // forced-off lockout when bar empty
  icePath: { pos: Vec2; expireAt: number; bornAt: number }[];
  // Purple Haze pilot mode (a3)
  purpleHazeActive: boolean;
  purpleHaze: { pos: Vec2; facing: Vec2; attackUntil: number };
  // Cleansly Violence (a4) — +8% damage window
  cleanslyUntil: number;
  cleanslyDuration: number;
  // PH M1 punch counter for poison-on-10 chance
  phPunchCount: number;
  // Boingo (tutorial-ish friendly NPC; no HP, scared AI, holds a purple book)
  boingo: {
    pos: Vec2;
    vel: Vec2;
    radius: number;
    facing: Vec2;
    wanderTarget: Vec2 | null;
    wanderUntil: number;
    bobPhase: number;
    pageFlipAt: number;
    pageIndex: number;
    alive: boolean;       // false → despawned permanently after first chat
    fadeUntil: number;    // when > 0 and time<this, render fading-out
  };
  // Inventory beyond arrows/discs
  requiemArrowCount: number;
  bluePebbleCount: number;
  tonthCopyCount: number;
  // One-shot toast (single notification at a time, replaces stacked banners for pickups)
  toastText: string | null;
  toastUntil: number;
  // Moon Rabbit runtime: active wasp swarms attached to a target
  swarms: { id: number; targetId: number; expireAt: number; nextStingAt: number; tickEvery: number; damage: number; range: number }[];
  // Moon Rabbit Eternal Curse: deferred lightning strikes from above (staggered)
  curseStrikes: { targetId: number; hitAt: number; dmg: number; color: string }[];
  // Harvest runtime
  harvestGatherActive: boolean;     // a1 toggle
  harvestCarryActive: boolean;      // a2 toggle
  harvestBeetles: {
    id: number;
    pos: Vec2;
    vel: Vec2;
    state: "orbit" | "seek" | "return";
    targetItemId?: number;
    carryingKind?: ItemPickup["kind"];
    phase: number;                  // for orbit bobbing
  }[];
  // Soft-banner suppression so repeat hints ("Out of range", "Resummon stand", etc.)
  // stop spamming the player after a few times.
  bannerSuppressCounts: Record<string, number>;
  // Strange Hat (one-shot SPTW unlock)
  strangeHatCount: number;
  strangeHatSpawned: boolean;
  sptwUnlocked: boolean;
  sptwRage: number;
  // Track last hit enemy id for Time Skip
  lastHitEnemyId?: number;
  lastHitEnemyAt?: number;
  // SPTW M1 hold tracking
  sptwM1HoldStart?: number;
  // Moon Rabbit Lunar Veil window
  moonRabbitInvulnUntil?: number;
}

function makeProps(): Prop[] {
  const props: Prop[] = [];

  // Trees — denser for the larger map.
  const treeSpots: Vec2[] = [];
  for (let i = 0; i < 90; i++) {
    let tries = 0;
    while (tries++ < 20) {
      const x = rand(40, MAP_W - 60);
      const y = rand(60, MAP_H - 80);
      const ok = treeSpots.every((p) => dist2(p, { x, y }) > 70 * 70);
      if (ok) { treeSpots.push({ x, y }); break; }
    }
  }
  for (const s of treeSpots) {
    const r: Rect = { x: s.x - 10, y: s.y - 6, w: 20, h: 16 };
    props.push({
      rect: r,
      draw: (ctx, rr) => {
        ctx.fillStyle = "#1f5d2a";
        ctx.beginPath();
        ctx.arc(rr.x + rr.w / 2, rr.y - 8, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a7a38";
        ctx.beginPath();
        ctx.arc(rr.x + rr.w / 2 - 4, rr.y - 12, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5a3a1c";
        ctx.fillRect(rr.x + rr.w / 2 - 4, rr.y, 8, rr.h);
      },
    });
  }

  // Rocks
  for (let i = 0; i < 45; i++) {
    const x = rand(30, MAP_W - 30), y = rand(30, MAP_H - 30);
    const w = rand(18, 30), h = rand(12, 18);
    const r: Rect = { x: x - w / 2, y: y - h / 2, w, h };
    props.push({
      rect: r,
      draw: (ctx, rr) => {
        ctx.fillStyle = "#6e6e76";
        ctx.beginPath();
        ctx.ellipse(rr.x + rr.w / 2, rr.y + rr.h / 2, rr.w / 2, rr.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8a8a92";
        ctx.beginPath();
        ctx.ellipse(rr.x + rr.w / 2 - 2, rr.y + rr.h / 2 - 2, rr.w / 2 - 4, rr.h / 2 - 4, 0, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }

  // Bushes
  for (let i = 0; i < 60; i++) {
    const x = rand(20, MAP_W - 20), y = rand(20, MAP_H - 20);
    const r: Rect = { x: x - 9, y: y - 7, w: 18, h: 14 };
    props.push({
      rect: r,
      draw: (ctx, rr) => {
        ctx.fillStyle = "#2c6b34";
        ctx.beginPath();
        ctx.arc(rr.x + 6, rr.y + 7, 8, 0, Math.PI * 2);
        ctx.arc(rr.x + 12, rr.y + 5, 8, 0, Math.PI * 2);
        ctx.arc(rr.x + 9, rr.y + 11, 8, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }

  // Houses (10) — bigger collision (110×84) spread across the bigger map.
  const houses: Vec2[] = [
    { x: 280, y: 360 },
    { x: 1380, y: 540 },
    { x: 2200, y: 380 },
    { x: 460, y: 1700 },
    { x: 1500, y: 1950 },
    { x: 2350, y: 1700 },
    { x: 820, y: 1250 },
    { x: 1900, y: 2700 },
    { x: 380, y: 3100 },
    { x: 2200, y: 3300 },
  ];
  for (const h of houses) {
    const r: Rect = { x: h.x - 55, y: h.y - 42, w: 110, h: 84 };
    props.push({
      rect: r,
      draw: (ctx, rr) => {
        ctx.fillStyle = "#caa472";
        ctx.fillRect(rr.x, rr.y + 14, rr.w, rr.h - 14);
        ctx.fillStyle = "#7a3a2a";
        ctx.beginPath();
        ctx.moveTo(rr.x - 6, rr.y + 18);
        ctx.lineTo(rr.x + rr.w / 2, rr.y - 16);
        ctx.lineTo(rr.x + rr.w + 6, rr.y + 18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#3a2418";
        ctx.fillRect(rr.x + rr.w / 2 - 9, rr.y + rr.h - 26, 18, 26);
        ctx.fillStyle = "#9bd9ff";
        ctx.fillRect(rr.x + 12, rr.y + 28, 16, 14);
        ctx.fillRect(rr.x + rr.w - 28, rr.y + 28, 16, 14);
      },
    });
  }

  // Fences
  for (let i = 0; i < 22; i++) {
    const x = rand(50, MAP_W - 140);
    const y = rand(50, MAP_H - 50);
    const w = rand(60, 120);
    const r: Rect = { x, y, w, h: 6 };
    props.push({
      rect: r,
      draw: (ctx, rr) => {
        ctx.fillStyle = "#b8946a";
        ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
        ctx.fillStyle = "#8a6a48";
        for (let p = 0; p < rr.w; p += 12) {
          ctx.fillRect(rr.x + p, rr.y - 6, 3, 12);
        }
      },
    });
  }

  // Prop tagging — assign HP. Houses are now 110×84.
  for (const p of props) {
    const r = p.rect;
    let hp = 0;
    if (r.w === 110 && r.h === 84) hp = 80;           // house
    else if (r.w === 20 && r.h === 16) hp = 12;       // tree
    else if (r.w === 18 && r.h === 14) hp = 12;       // bush
    else if (r.h === 6) hp = 12;                      // fence
    else hp = 30;                                     // rock
    p.hp = hp;
    p.maxHp = hp;
    p.destructible = true;
    p.original = { rect: { ...r }, hp };
  }

  return props;
}

// True if a prop is a "house" (the only props basic punches cannot break).
function isHouse(p: Prop): boolean {
  return p.rect.w === 110 && p.rect.h === 84;
}

// Strict spawn: never inside a prop, never inside an existing crater, never on player.
function freeSpot(props: Prop[], radius: number, opts?: { avoid?: Vec2; avoidR?: number; craters?: Crater[]; tries?: number }): Vec2 | null {
  const padding = 8;
  const tries = opts?.tries ?? 200;
  for (let i = 0; i < tries; i++) {
    const x = rand(40, MAP_W - 40);
    const y = rand(40, MAP_H - 40);
    let ok = true;
    for (const p of props) {
      if (propSolid(p) && circleRectOverlap(x, y, radius + padding, p.rect)) { ok = false; break; }
    }
    if (!ok) continue;
    if (opts?.craters) {
      for (const c of opts.craters) {
        const dx = x - c.pos.x, dy = y - c.pos.y;
        if (dx * dx + dy * dy < (c.radius + radius) ** 2) { ok = false; break; }
      }
    }
    if (!ok) continue;
    if (opts?.avoid) {
      const dx = x - opts.avoid.x, dy = y - opts.avoid.y;
      if (dx * dx + dy * dy < (opts.avoidR ?? 24) ** 2) continue;
    }
    return { x, y };
  }
  return null;
}

// Fallback when caller MUST have a spot (npc creation at world init).
// Walks a grid as a last resort so we never return a position inside a prop.
function freeSpotOrGrid(props: Prop[], radius: number): Vec2 {
  const random = freeSpot(props, radius, { tries: 200 });
  if (random) return random;
  const step = 24;
  for (let y = 40; y < MAP_H - 40; y += step) {
    for (let x = 40; x < MAP_W - 40; x += step) {
      let ok = true;
      for (const p of props) if (propSolid(p) && circleRectOverlap(x, y, radius + 6, p.rect)) { ok = false; break; }
      if (ok) return { x, y };
    }
  }
  return { x: MAP_W / 2, y: MAP_H / 2 };
}

const freeSpotOrCenter = freeSpotOrGrid;

function makeNpc(props: Prop[], kind: "friendly" | "enemy", id: number): Entity {
  const pos = freeSpotOrGrid(props, 10);
  const e: Entity = {
    id,
    kind,
    pos,
    vel: { x: 0, y: 0 },
    radius: 9,
    hp: kind === "enemy" ? ENEMY_MAX_HP : NPC_MAX_HP,
    maxHp: kind === "enemy" ? ENEMY_MAX_HP : NPC_MAX_HP,
    facing: { x: 0, y: 1 },
    color: kind === "enemy" ? "#c83838" : "#3a86ff",
    alive: true,
    stunUntil: 0,
    hitFlashUntil: 0,
  };
  // Belt-and-braces: eject in case the spawn brushed a prop edge.
  pushOutOfProps(e, props);
  return e;
}

export function createWorld(): World {
  const props = makeProps();
  const npcs: Entity[] = [];
  let id = 1;
  for (let i = 0; i < FRIENDLY_COUNT; i++) npcs.push(makeNpc(props, "friendly", id++));
  for (let i = 0; i < ENEMY_COUNT; i++) npcs.push(makeNpc(props, "enemy", id++));

  const player: Entity = {
    id: 0,
    kind: "player",
    pos: freeSpotOrGrid(props, 10),
    vel: { x: 0, y: 0 },
    radius: 9,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    facing: { x: 0, y: 1 },
    color: "#f4e1b5",
    alive: true,
    stunUntil: 0,
    hitFlashUntil: 0,
  };
  pushOutOfProps(player, props);

  const world: World = {
    time: 0,
    player,
    npcs,
    props,
    projectiles: [],
    zones: [],
    channel: null,
    damageNumbers: [],
    craters: [],
    particles: [],
    vfx: [],
    items: [],
    nextArrowAt: rand(ARROW_INTERVAL[0], ARROW_INTERVAL[1]),
    nextDiscAt: rand(DISC_INTERVAL[0], DISC_INTERVAL[1]),
    cdTimers: { m1: 0, a1: 0, a2: 0, a3: 0, a4: 0 },
    standId: "none",
    shitVariant: false,
    standActive: true,
    bannerText: null,
    bannerUntil: 0,
    banners: [],
    nextId: 1000,
    shake: 0,
    cam: { x: player.pos.x, y: player.pos.y },
    standPunchUntil: 0,
    standPunchDir: { x: 0, y: 1 },
    standAimUntil: 0,
    standAimTarget: null,
    kills: 0,
    footstepAcc: 0,
    pointerAim: null,
    frogs: [],
    trees: [],
    geBuffUntil: 0,
    hologramHits: [],
    m1Held: false,
    puppet: {
      active: false,
      pos: { x: player.pos.x - 14, y: player.pos.y + 10 },
      hp: PLAYER_MAX_HP / 2,
      maxHp: PLAYER_MAX_HP / 2,
      facing: { x: 0, y: 1 },
      attackUntil: 0,
    },
    rage: 0,
    rageUntil: 0,
    echoesAct: 1,
    timeStopUntil: 0,
    timeStopStartedAt: 0,
    pendingPlayerDamage: [],
    hangedManFormed: false,
    hangedManActive: false,
    pilotActive: false,
    puppetPiloted: false,
    shards: [],
    shardPickerOpen: false,
    hangedMan: { pos: { ...player.pos }, facing: { x: 0, y: 1 }, attackUntil: 0 },
    kickAt: 0,
    lastJoyMag: 0,
    whiteAlbumActive: true,
    whiteAlbumBar: 100,
    whiteAlbumToggleAt: 0,
    whiteAlbumLockUntil: 0,
    icePath: [],
    purpleHazeActive: false,
    purpleHaze: { pos: { ...player.pos }, facing: { x: 0, y: 1 }, attackUntil: 0 },
    cleanslyUntil: 0,
    cleanslyDuration: 0,
    phPunchCount: 0,
    boingo: {
      pos: freeSpot(props, 9, { avoid: player.pos, avoidR: 120 }) ?? { x: player.pos.x + 120, y: player.pos.y + 80 },
      vel: { x: 0, y: 0 },
      radius: 9,
      facing: { x: 0, y: 1 },
      wanderTarget: null,
      wanderUntil: 0,
      bobPhase: Math.random() * Math.PI * 2,
      pageFlipAt: 0,
      pageIndex: 0,
      alive: true,
      fadeUntil: 0,
    },
    requiemArrowCount: 0,
    bluePebbleCount: 0,
    tonthCopyCount: 0,
    toastText: null,
    toastUntil: 0,
    swarms: [],
    curseStrikes: [],
    harvestGatherActive: false,
    harvestCarryActive: false,
    harvestBeetles: [],
    bannerSuppressCounts: {},
    strangeHatCount: 0,
    strangeHatSpawned: false,
    sptwUnlocked: false,
    sptwRage: 0,
  };

  // Pre-seed a starter pool of arrows and discs scattered across the (now larger) map
  // so players don't spend forever hunting for their first stand or DISC.
  for (let i = 0; i < INITIAL_ARROW_COUNT; i++) trySpawnItem(world, "arrow");
  for (let i = 0; i < INITIAL_DISC_COUNT; i++) trySpawnItem(world, "disc");

  return world;
}

// A prop is solid only if it has HP left (or it isn't destructible).
function propSolid(p: Prop): boolean {
  if (p.destructible === false) return true;
  if (p.destructible && (p.hp ?? 0) <= 0) return false;
  return true;
}

// movement with collision
function tryMove(e: Entity, dx: number, dy: number, props: Prop[]) {
  // X axis
  let nx = e.pos.x + dx;
  if (nx - e.radius < 0) nx = e.radius;
  if (nx + e.radius > MAP_W) nx = MAP_W - e.radius;
  let blocked = false;
  for (const p of props) if (propSolid(p) && circleRectOverlap(nx, e.pos.y, e.radius, p.rect)) { blocked = true; break; }
  if (!blocked) e.pos.x = nx;

  let ny = e.pos.y + dy;
  if (ny - e.radius < 0) ny = e.radius;
  if (ny + e.radius > MAP_H) ny = MAP_H - e.radius;
  blocked = false;
  for (const p of props) if (propSolid(p) && circleRectOverlap(e.pos.x, ny, e.radius, p.rect)) { blocked = true; break; }
  if (!blocked) e.pos.y = ny;
}

// Eject an entity that has somehow ended up overlapping a prop (knockback push, spawn glitch).
// Walks them out along the shortest axis. Run every tick on every entity.
function pushOutOfProps(e: Entity, props: Prop[]) {
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const p of props) {
      if (!propSolid(p) || !circleRectOverlap(e.pos.x, e.pos.y, e.radius, p.rect)) continue;
      // find nearest exit direction
      const r = p.rect;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const halfW = r.w / 2 + e.radius;
      const halfH = r.h / 2 + e.radius;
      const dx = e.pos.x - cx, dy = e.pos.y - cy;
      const overlapX = halfW - Math.abs(dx);
      const overlapY = halfH - Math.abs(dy);
      if (overlapX < overlapY) {
        e.pos.x += Math.sign(dx || 1) * (overlapX + 0.5);
      } else {
        e.pos.y += Math.sign(dy || 1) * (overlapY + 0.5);
      }
      moved = true;
    }
    if (!moved) break;
  }
  // clamp inside map
  e.pos.x = Math.max(e.radius, Math.min(MAP_W - e.radius, e.pos.x));
  e.pos.y = Math.max(e.radius, Math.min(MAP_H - e.radius, e.pos.y));
}

// Soft-collide a free body (puppet/hanged man) with all alive NPCs at the given pos.
// Mutates `pos` in place.
function pushOutOfNpcs(w: World, pos: Vec2, radius: number) {
  for (const e of w.npcs) {
    if (!e.alive) continue;
    const dx = pos.x - e.pos.x, dy = pos.y - e.pos.y;
    const min = radius + e.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 < min * min) {
      const d = Math.sqrt(d2);
      const overlap = min - d;
      const nx = dx / d, ny = dy / d;
      // Free body absorbs 60% of push so NPCs don't get launched.
      pos.x += nx * overlap * 0.6;
      pos.y += ny * overlap * 0.6;
      e.pos.x -= nx * overlap * 0.4;
      e.pos.y -= ny * overlap * 0.4;
    }
  }
}

function spawnDmg(w: World, pos: Vec2, dmg: number, color = "#fff", crit = false, prefix = "") {
  let tier = dmg >= 15 ? 22 : dmg >= 8 ? 17 : dmg >= 3 ? 13 : 10;
  if (crit) tier = Math.round(tier * 1.35);
  const text = prefix + (dmg < 1 ? dmg.toFixed(1) : Math.round(dmg).toString()) + (crit ? "!" : "");
  w.damageNumbers.push({
    id: w.nextId++,
    pos: { x: pos.x + rand(-6, 6), y: pos.y - 6 },
    text,
    color: crit ? "#ffd24a" : (dmg >= 15 ? "#ffd24a" : dmg >= 8 ? "#ff8a3a" : color),
    size: tier,
    vy: crit ? -52 : -28,
    bornAt: w.time,
    expireAt: w.time + (crit ? 1.1 : 0.9),
  });
}

// Repeat-hint suppression: a banner key is allowed to fire 3 times, then is silenced
// for the rest of the session. Player figures it out or grabs Boingo's book.
function softBanner(w: World, key: string, text: string, seconds = 0.9) {
  const n = (w.bannerSuppressCounts[key] ?? 0) + 1;
  w.bannerSuppressCounts[key] = n;
  if (n > 3) return;
  w.bannerText = text;
  w.bannerUntil = w.time + seconds;
}

// Visible heal: green +N popup, sparkle ring, upward sparks. Used by every self-heal so
// the move never feels broken even at full HP.
function healPlayer(w: World, amount: number, color = "#5fd16a") {
  const before = w.player.hp;
  w.player.hp = Math.min(w.player.maxHp, w.player.hp + amount);
  const got = Math.round(w.player.hp - before);
  const shown = got > 0 ? got : amount;
  spawnDmg(w, { x: w.player.pos.x, y: w.player.pos.y - 4 }, shown, color, false, "+");
  spawnVfx(w, { kind: "shockwave", pos: { ...w.player.pos }, radius: 24, color, life: 0.45 });
  for (let i = 0; i < 12; i++) {
    spawnParticles(w, { x: w.player.pos.x + rand(-6, 6), y: w.player.pos.y + 4 }, color, 1, {
      shape: "spark", gravity: -90, speedMin: 20, speedMax: 60, life: 0.7,
    });
  }
  showToast(w, got > 0 ? `+${got} HP` : "Already full");
  return got;
}

function spawnParticles(w: World, pos: Vec2, color: string, n = 6, opts?: { shape?: Particle["shape"]; gravity?: number; speedMin?: number; speedMax?: number; life?: number }) {
  const sMin = opts?.speedMin ?? 20;
  const sMax = opts?.speedMax ?? 80;
  const life = opts?.life ?? 0.4;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rand(sMin, sMax);
    w.particles.push({
      pos: { ...pos },
      vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp },
      color,
      size: rand(1.5, 3),
      bornAt: w.time,
      expireAt: w.time + life,
      shape: opts?.shape,
      gravity: opts?.gravity,
    });
  }
}

function spawnVfx(w: World, v: Omit<Vfx, "bornAt" | "expireAt"> & { life: number }) {
  const { life, ...rest } = v;
  w.vfx.push({ ...rest, bornAt: w.time, expireAt: w.time + life });
}

function damageEntity(w: World, e: Entity, dmg: number, knockback?: { dir: Vec2; amount: number }, crit = false, opts?: { fromPuppet?: boolean }) {
  if (!e.alive) return;
  // Rage Mode now only multiplies damage that originates from the puppet itself.
  if (e.kind !== "player" && w.standId === "ebony_devil" && w.time < w.rageUntil && opts?.fromPuppet) dmg *= 1.55;
  // Cleansly Violence (Purple Haze A4): +8% damage to NPCs while active.
  if (e.kind !== "player" && w.standId === "purple_haze" && w.time < w.cleanslyUntil) dmg *= 1.08;
  // Gold Experience: Tree of Life buff (+15% damage while standing inside an active tree).
  if (e.kind !== "player" && w.standId === "gold_experience") {
    for (const t of w.trees) {
      if (w.time < t.expireAt && dist2(w.player.pos, t.pos) < t.radius * t.radius) { dmg *= 1.15; break; }
    }
  }
  // White Album suit armor: -1 damage to player while suit is active.
  if (e.kind === "player" && w.standId === "white_album" && w.whiteAlbumActive) dmg = Math.max(0.1, dmg - 1);
  // Moon Rabbit Lunar Veil: brief invincibility window.
  if (e.kind === "player" && w.standId === "moon_rabbit" && w.time < (w.moonRabbitInvulnUntil ?? 0)) dmg = 0;
  // SPTW Rage: +35% damage dealt during rage window.
  if (e.kind !== "player" && w.standId === "sptw" && w.time < w.rageUntil) dmg *= 1.35;
  e.hp -= dmg;
  e.hitFlashUntil = w.time + 0.12;
  spawnDmg(w, e.pos, dmg, "#fff", crit);
  spawnParticles(w, e.pos, "#ffd0a8", 4);
  if (crit) {
    spawnVfx(w, { kind: "crit_burst", pos: { ...e.pos }, color: "#ffd24a", radius: 18, life: 0.35 });
    spawnParticles(w, e.pos, "#ffd24a", 8, { shape: "spark", speedMin: 80, speedMax: 220, life: 0.45 });
    w.shake = Math.max(w.shake, 3);
    play("crit");
  }
  if (e.kind === "enemy") {
    e.provoked = true;
    // SPTW Rage meter charges as you deal damage to enemies.
    if (w.standId === "sptw") w.sptwRage = Math.min(100, w.sptwRage + dmg * 1.2);
    // Track last hit enemy for Time Skip.
    w.lastHitEnemyId = e.id;
    w.lastHitEnemyAt = w.time;
  }
  if (e.kind === "player") {
    w.rage = Math.min(100, w.rage + dmg * 3.5);
    if (dmg > 0) play("hurt");
  }
  if (knockback) {
    e.vel.x += knockback.dir.x * knockback.amount;
    e.vel.y += knockback.dir.y * knockback.amount;
    pushOutOfProps(e, w.props);
  }
  if (e.hp <= 0) {
    e.alive = false;
    e.respawnAt = w.time + RESPAWN_DELAY;
    spawnParticles(w, e.pos, e.color, 14);
    if (e.kind === "enemy") w.kills++;
  }
}

function damagePuppet(w: World, dmg: number) {
  if (!w.puppet.active || w.puppet.hp <= 0) return;
  w.puppet.hp -= dmg;
  w.rage = Math.min(100, w.rage + dmg * 2.2);
  spawnDmg(w, w.puppet.pos, dmg, "#d6d8dd");
  spawnParticles(w, w.puppet.pos, "#8f949c", 7);
  // HP link: damage to the puppet also drains the player (Ebony Devil's lore — he's tied to it).
  damageEntity(w, w.player, dmg, undefined, false);
  play("hurt");
  if (w.puppet.hp <= 0) {
    w.puppet.active = false;
    w.puppet.hp = w.puppet.maxHp;
    spawnVfx(w, { kind: "crater_smoke", pos: { ...w.puppet.pos }, radius: 20, color: "#585d66", life: 0.7 });
  }
}

// Hanged Man takes hits but its HP is shared with the player — route damage straight to player.
function damageHangedMan(w: World, dmg: number, dir: Vec2) {
  if (!w.hangedManActive) return;
  spawnDmg(w, w.hangedMan.pos, dmg, "#cfd6e3");
  spawnParticles(w, w.hangedMan.pos, "#9ec0ff", 6);
  damageEntity(w, w.player, dmg, { dir, amount: 30 });
}

function getAbility(w: World, key: "m1" | "a1" | "a2" | "a3" | "a4"): Ability {
  const stand = STANDS[w.standId];
  const a = stand.abilities[key];
  if (w.standId === "echoes" && key === "a4" && w.shitVariant) return SHIT_ABILITY;
  return a;
}

function nearestTarget(w: World, from: Vec2, range = AIM_ASSIST_RANGE, _preferEnemy = true): Entity | null {
  let target: Entity | null = null;
  let best = range * range;
  for (const e of w.npcs) {
    if (!e.alive) continue;
    const d = dist2(e.pos, from);
    if (d < best) { best = d; target = e; }
  }
  return target;
}

function abilityOrigin(w: World): Vec2 {
  if (w.standId === "ebony_devil" && w.puppet.active) return w.puppet.pos;
  if (w.standId === "hanged_man" && w.hangedManActive) return w.hangedMan.pos;
  if (w.standId === "purple_haze" && w.purpleHazeActive) return w.purpleHaze.pos;
  return w.player.pos;
}

// "any NPC" target — used for M1 punches which should hit closest NPC regardless of faction.
function nearestAnyNpc(w: World, from: Vec2, range = AIM_ASSIST_RANGE): Entity | null {
  let target: Entity | null = null;
  let best = range * range;
  for (const e of w.npcs) {
    if (!e.alive) continue;
    const d = dist2(e.pos, from);
    if (d < best) { best = d; target = e; }
  }
  return target;
}

function aimDir(w: World, input: InputState, ab?: Ability, key?: "m1" | "a1" | "a2" | "a3" | "a4"): Vec2 {
  // Manual aim wins
  if (input.aim) return norm(input.aim);
  // Resolve the body that's actually attacking — for Ebony Devil/Hanged Man with their stand summoned,
  // the puppet/Hanged Man is the one swinging, so they should aim from THEIR position.
  const body =
    (w.standId === "ebony_devil" && w.puppet.active) ? w.puppet.pos :
    (w.standId === "hanged_man" && w.hangedManActive) ? w.hangedMan.pos :
    (w.standId === "purple_haze" && w.purpleHazeActive) ? w.purpleHaze.pos :
    w.player.pos;
  if (key === "m1") {
    const t = nearestAnyNpc(w, body, AIM_ASSIST_RANGE);
    if (t) return norm({ x: t.pos.x - body.x, y: t.pos.y - body.y });
  } else {
    const range = ab?.range && ab.range > 30 ? Math.max(ab.range, AIM_ASSIST_RANGE) : AIM_ASSIST_RANGE;
    const target = nearestTarget(w, body, range);
    if (target) return norm({ x: target.pos.x - body.x, y: target.pos.y - body.y });
  }
  // Fall back to joystick / facing
  if (input.joyActive && (input.joy.x !== 0 || input.joy.y !== 0)) return norm(input.joy);
  // Use the stand body's facing if it has one
  if (w.standId === "ebony_devil" && w.puppet.active) return w.puppet.facing;
  if (w.standId === "hanged_man" && w.hangedManActive) return w.hangedMan.facing;
  if (w.standId === "purple_haze" && w.purpleHazeActive) return w.purpleHaze.facing;
  return w.player.facing;
}

// Returns the actual point we want to aim at (an entity if found, else a point along dir)
function resolveTargetPos(w: World, ab: Ability, dir: Vec2, origin: Vec2): { target: Entity | null; pos: Vec2 } {
  const range = ab.range > 30 ? Math.max(ab.range, AIM_ASSIST_RANGE) : Math.max(ab.range + 60, 80);
  const target = nearestTarget(w, origin, range);
  if (target) return { target, pos: { ...target.pos } };
  return {
    target: null,
    pos: { x: origin.x + dir.x * Math.max(40, ab.range), y: origin.y + dir.y * Math.max(40, ab.range) },
  };
}

function hitConeFrom(w: World, origin: Vec2, dir: Vec2, range: number, radius: number, damage: number, knockbackAmount?: number, crit = false) {
  const reach = range + radius;
  let hitAny = false;
  for (const e of w.npcs) {
    if (!e.alive) continue;
    const dx = e.pos.x - origin.x, dy = e.pos.y - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + e.radius) continue;
    const dot = d <= e.radius + 8 ? 1 : (dx * dir.x + dy * dir.y) / (d || 1);
    if (dot > 0.15) {
      damageEntity(w, e, damage, knockbackAmount ? { dir, amount: knockbackAmount } : undefined, crit);
      hitAny = true;
    }
  }
  return hitAny;
}

// Map ability identity -> SFX key. Resolved by stand+key (and shit variant).
function sfxFor(w: World, key: "m1" | "a1" | "a2" | "a3" | "a4"): SfxKey {
  const sid = w.standId;
  if (sid === "star_platinum") {
    if (key === "m1") return "punch";
    if (key === "a1") return "starFinger";
    if (key === "a2") return "rangedSmash";
    if (key === "a3") return "oraTick";
    return "launch";
  }
  if (sid === "rhcp") {
    if (key === "m1") return "punch";
    if (key === "a1") return "electricShot";
    if (key === "a2") return "discharge";
    if (key === "a3") return "bomber";
    return "tesla";
  }
  if (sid === "echoes") {
    if (key === "m1") return "punch";
    if (key === "a1") return "freezeTouch";
    if (key === "a2") return "explosiveText";
    if (key === "a3") return "burningText";
    return w.shitVariant ? "shit" : "threeFreeze";
  }
  if (sid === "ebony_devil") {
    if (key === "m1") return "punch";
    if (key === "a1") return "puppet";
    if (key === "a2") return "spear";
    if (key === "a3") return "spin";
    return "rage";
  }
  if (sid === "gold_experience") {
    if (key === "m1") return "punch";
    if (key === "a1") return "eagle";
    if (key === "a2") return "frog";
    if (key === "a3") return "hologram";
    return "tree";
  }
  return "punch";
}

// Per-stand M1 damage table. Returns { dmg, crit }. Crit chance = 15% (Hanged Man never crits).
function m1DamageRoll(w: World, puppetSwing: boolean): { dmg: number; crit: boolean } {
  const sid = w.standId;
  const crit = sid === "hanged_man" ? false : Math.random() < 0.15;
  if (sid === "ebony_devil") {
    if (puppetSwing) return { dmg: crit ? 2.5 : rand(1, 2), crit };
    return { dmg: crit ? 0.9 : 0.3, crit };
  }
  if (sid === "echoes") {
    // Act-driven damage
    if (w.echoesAct === 1) return { dmg: crit ? 0.8 : 0.4, crit };
    if (w.echoesAct === 2) return { dmg: crit ? 1.5 : 0.9, crit };
    return { dmg: crit ? 3 : 1.5, crit };
  }
  if (sid === "star_platinum")  return { dmg: crit ? 5   : 3,   crit };
  if (sid === "gold_experience")return { dmg: crit ? 4   : 2.5, crit };
  if (sid === "rhcp")           return { dmg: crit ? 3   : 1.4, crit };
  if (sid === "hanged_man")     return { dmg: 1.2, crit: false };
  return { dmg: 1, crit: false };
}

function castAbility(w: World, key: "m1" | "a1" | "a2" | "a3" | "a4", input: InputState) {
  const stand = STANDS[w.standId];
  if (stand.id === "none" && key !== "m1") return;
  // Stand desummoned: no abilities work (M1 = no-stand fallback below at "none")
  if (stand.id !== "none" && !w.standActive) {
    softBanner(w, "stand_off", "Resummon stand to attack", 0.8);
    return;
  }
  const ab = getAbility(w, key);
  if (ab.damage === 0 && !["stun_touch", "puppet_toggle", "rage_mode", "frog_summon", "tree_zone", "pilot_toggle", "mirror_shard", "shard_teleport", "time_stop", "ph_pilot_toggle", "cleansly_violence", "explosion_text"].includes(ab.kind)) return;
  if (w.cdTimers[key] > 0) return;
  // Hanged Man: A2/A3/A4 require the stand to be summoned first.
  if (w.standId === "hanged_man" && key !== "m1" && ab.kind !== "pilot_toggle" && !w.hangedManActive) {
    softBanner(w, "hm_summon", "Summon Hanged Man first", 0.9);
    return;
  }
  // Hanged Man: M1 / damaging abilities only work while inside (or attacking from) a mirror-shard dome.
  if (w.standId === "hanged_man" && (key === "m1" || ab.kind === "melee" || ab.kind === "pierce")) {
    const origin = w.hangedManActive ? w.hangedMan.pos : w.player.pos;
    const inDome = w.shards.some((s) => w.time < s.expireAt && dist2(origin, s.pos) < s.radius * s.radius);
    if (!inDome) {
      softBanner(w, "hm_dome", "Hanged Man only attacks inside a shard domain", 1.2);
      w.cdTimers[key] = 0.4;
      return;
    }
  }
  // Ebony Devil: Rage Mode now requires the puppet to be summoned.
  if (ab.kind === "rage_mode" && !w.puppet.active) {
    softBanner(w, "puppet_first", "Summon Puppet first", 0.9);
    return;
  }
  if (ab.kind === "rage_mode" && w.rage < 100) {
    w.bannerText = "Rage not ready";
    w.bannerUntil = w.time + 0.8;
    spawnVfx(w, { kind: "shockwave", pos: { ...w.player.pos }, radius: 22, color: ab.color, life: 0.22 });
    return;
  }

  // Range-gate ALL damaging abilities: don't burn cooldown on a cast that has nothing to hit.
  // Self-buffs, heals, summons, toggles, and pure utility are exempt.
  const SELF_OR_UTILITY = new Set<string>([
    "ice_heal", "rage_mode", "tree_zone", "time_stop", "time_stop_or_skip",
    "pilot_toggle", "ph_pilot_toggle", "puppet_toggle", "mirror_shard",
    "shard_teleport", "frog_summon", "cleansly_violence", "lunar_veil", "sptw_rage",
    // Harvest utility toggles (no damage, just QoL)
    "harvest_gather", "harvest_carry",
  ]);
  if (!input.aim && !SELF_OR_UTILITY.has(ab.kind) && ab.kind !== "melee") {
    // Use ability range, or a generous fallback for big AoEs that fire from the player.
    const checkRange = ab.range > 0 ? ab.range : (ab.radius ?? 60) + 20;
    const t = nearestTarget(w, w.player.pos, checkRange);
    if (!t) {
      softBanner(w, "out_of_range", "No target in range", 0.6);
      return;
    }
  }
  // M1 range gate: don't swing into empty air. Origin is puppet/hangedman pos when summoned.
  if (key === "m1" && ab.kind === "melee" && !input.aim) {
    let origin = w.player.pos;
    if (w.standId === "ebony_devil" && w.puppet.active) origin = w.puppet.pos;
    else if (w.standId === "hanged_man" && w.hangedManActive) origin = w.hangedMan.pos;
    const reach = ab.range + (ab.radius ?? 14);
    const t = nearestAnyNpc(w, origin, reach + 12);
    if (!t) return; // silent — feels better than a banner spam on hold
  }
  // Non-M1 melee abilities (Star Finger, Freeze Punch, Brutal Slash, Echoes Act 1 touch...) need a target too.
  if (key !== "m1" && ab.kind === "melee" && !input.aim) {
    const reach = ab.range + (ab.radius ?? 14);
    const t = nearestAnyNpc(w, w.player.pos, reach + 8);
    if (!t) {
      softBanner(w, "out_of_range", "No target in range", 0.6);
      return;
    }
  }

  // Echoes: act is driven by the LAST ability used (a1 -> 1, a2/a3 -> 2, a4 -> 3).
  if (w.standId === "echoes") {
    if (key === "a1") w.echoesAct = 1;
    else if (key === "a2" || key === "a3") w.echoesAct = 2;
    else if (key === "a4") w.echoesAct = 3;
  }

  // Tree of Life buff: while Gold Experience stands inside an active Tree zone, frog/eagle spam (75% reduced cd).
  let cdMul = 1;
  if (w.standId === "gold_experience" && (key === "a1" || key === "a2")) {
    for (const t of w.trees) {
      if (w.time < t.expireAt && dist2(w.player.pos, t.pos) < t.radius * t.radius) { cdMul = 0.25; break; }
    }
  }
  w.cdTimers[key] = ab.cooldown * cdMul;

  const dir = aimDir(w, input, ab, key);
  const p = w.player.pos;
  const sfx = sfxFor(w, key);

  // Generic cast cue (sound) — channel handles its own ticks
  if (ab.kind !== "channel_cone") play(sfx);

  // Stand aiming: project the stand model toward the cast target/direction
  w.standAimUntil = w.time + 0.4;
  if (ab.kind === "aoe_target" || ab.kind === "lobbed" || ab.kind === "stun_touch" || ab.kind === "knockback" || ab.kind === "channel_cone" || ab.kind === "pierce" || ab.kind === "projectile" || ab.kind === "auto_aim" || ab.kind === "chain_projectile" || ab.kind === "hologram_stun") {
    w.standAimTarget = { x: w.player.pos.x + dir.x * Math.min(ab.range, 60), y: w.player.pos.y + dir.y * Math.min(ab.range, 60) };
  }

  switch (ab.kind) {
    case "melee": {
      const angle = Math.atan2(dir.y, dir.x);
      // Ebony Devil M1: only the puppet swings. Hanged Man M1: swings from the stand body.
      const usePuppetOrigin = w.standId === "ebony_devil" && w.puppet.active && key === "m1";
      const useHangedOrigin = w.standId === "hanged_man" && w.hangedManActive && key === "m1";
      const origin = usePuppetOrigin ? w.puppet.pos : useHangedOrigin ? w.hangedMan.pos : p;
      const reach = ab.range + (ab.radius ?? 14);
      // slash arc VFX so misses still feel responsive
      spawnVfx(w, { kind: "slash_arc", pos: { x: origin.x, y: origin.y }, angle, radius: reach, color: ab.color, life: 0.2 });
      // M1 punches: roll critical per stand table.
      let dmg = ab.damage;
      let crit = false;
      if (key === "m1") { const r = m1DamageRoll(w, usePuppetOrigin); dmg = r.dmg; crit = r.crit; }
      // Hit any NPC within an arc in front of the player (cone test).
      hitConeFrom(w, origin, dir, ab.range, ab.radius ?? 14, dmg, key === "m1" && w.time < w.rageUntil ? 45 : undefined, crit);
      const tx = origin.x + dir.x * ab.range;
      const ty = origin.y + dir.y * ab.range;
      // Melee chops at props in front of you (heavy stands break things faster).
      damagePropsInRadius(w, tx, ty, (ab.radius ?? 14) + 4, dmg, { abilityKind: ab.kind, abilityKey: key, standId: w.standId });
      spawnParticles(w, { x: tx, y: ty }, ab.color, 6);
      // trigger stand-punch animation
      w.standPunchUntil = w.time + 0.25;
      w.standPunchDir = { x: dir.x, y: dir.y };
      if (w.standId === "ebony_devil") {
        w.puppet.facing = { x: dir.x, y: dir.y };
        w.puppet.attackUntil = w.time + 0.28;
      }
      break;
    }
    case "pierce": {
      const steps = 8;
      const hit = new Set<number>();
      for (let s = 1; s <= steps; s++) {
        const t = (ab.range / steps) * s;
        const x = p.x + dir.x * t, y = p.y + dir.y * t;
        for (const e of w.npcs) {
          if (!e.alive || hit.has(e.id)) continue;
          if (dist2(e.pos, { x, y }) < (ab.radius! + e.radius) ** 2) {
            damageEntity(w, e, ab.damage);
            hit.add(e.id);
          }
        }
      }
      spawnVfx(w, {
        kind: "stab_line",
        pos: { x: p.x, y: p.y },
        to: { x: p.x + dir.x * ab.range, y: p.y + dir.y * ab.range },
        radius: (ab.radius ?? 6) * 1.4,
        color: ab.color,
        life: 0.22,
      });
      for (let s = 0; s < 8; s++) {
        const t = (ab.range / 8) * s;
        spawnParticles(w, { x: p.x + dir.x * t, y: p.y + dir.y * t }, ab.color, 1, { life: 0.25 });
      }
      break;
    }
    case "projectile": {
      const { target } = resolveTargetPos(w, ab, dir, p);
      const shootDir = target ? norm({ x: target.pos.x - p.x, y: target.pos.y - p.y }) : dir;
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: shootDir.x * ab.speed!, y: shootDir.y * ab.speed! },
        radius: ab.radius || 6,
        damage: ab.damage,
        color: ab.color,
        ownerKind: "player",
        pierce: false,
        hitSet: new Set(),
        expireAt: w.time + ab.range / ab.speed!,
        homingTargetId: target?.id,
        homingStrength: 0.12,
        speed: ab.speed,
        applyElectro: w.standId === "rhcp" ? 0.7 : undefined,
      });
      if (target) w.standAimTarget = { ...target.pos };
      // muzzle flash
      spawnParticles(w, { x: p.x + shootDir.x * 10, y: p.y + shootDir.y * 10 }, ab.color, 6, { speedMin: 40, speedMax: 120, life: 0.2 });
      break;
    }
    case "lobbed": {
      const { target, pos: aimPos } = resolveTargetPos(w, ab, dir, p);
      const lobDir = target ? norm({ x: aimPos.x - p.x, y: aimPos.y - p.y }) : dir;
      const dist = target ? Math.hypot(aimPos.x - p.x, aimPos.y - p.y) : ab.range;
      const travelTime = Math.min(ab.range, dist) / ab.speed!;
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: lobDir.x * ab.speed!, y: lobDir.y * ab.speed! },
        radius: 5,
        damage: 0,
        color: ab.color,
        ownerKind: "player",
        pierce: false,
        hitSet: new Set(),
        expireAt: w.time + travelTime + 0.05,
        lobbed: true,
        detonateAt: w.time + travelTime,
        detonateRadius: ab.radius || 30,
        detonateColor: ab.color,
      });
      break;
    }
    case "aoe_self": {
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, p) < (ab.radius! + e.radius) ** 2) {
          damageEntity(w, e, ab.damage, { dir: norm({ x: e.pos.x - p.x, y: e.pos.y - p.y }), amount: 60 });
        }
      }
      damagePropsInRadius(w, p.x, p.y, ab.radius!, ab.damage, { abilityKind: ab.kind, abilityKey: key, standId: w.standId });
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: ab.radius!, color: ab.color, life: 0.45 });
      // arcing lightning to nearby targets
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, p) < (ab.radius! + e.radius) ** 2) {
          spawnVfx(w, { kind: "lightning_bolt", pos: { ...p }, to: { ...e.pos }, color: ab.color, life: 0.2 });
        }
      }
      w.shake = Math.max(w.shake, 4);
      break;
    }
    case "aoe_target": {
      // Drop AOE on the actual target if there is one in range, else along facing direction
      const { target, pos: aimPos } = resolveTargetPos(w, ab, dir, p);
      let tx: number, ty: number;
      if (target) { tx = target.pos.x; ty = target.pos.y; }
      else {
        const dist = Math.hypot(aimPos.x - p.x, aimPos.y - p.y);
        const clamped = Math.min(ab.range, dist);
        tx = p.x + dir.x * clamped;
        ty = p.y + dir.y * clamped;
      }
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, { x: tx, y: ty }) < (ab.radius! + e.radius) ** 2) {
          damageEntity(w, e, ab.damage);
        }
      }
      damagePropsInRadius(w, tx, ty, ab.radius!, ab.damage, { abilityKind: ab.kind, abilityKey: key, standId: w.standId });
      spawnVfx(w, { kind: "explosion_ring", pos: { x: tx, y: ty }, radius: ab.radius!, color: ab.color, life: 0.5 });
      spawnVfx(w, { kind: "fire_burst", pos: { x: tx, y: ty }, radius: ab.radius! * 0.8, color: ab.color, life: 0.55 });
      if (ab.crater) {
        w.craters.push({ pos: { x: tx, y: ty }, radius: ab.radius! * 0.7, bornAt: w.time, expireAt: w.time + 25 });
        spawnVfx(w, { kind: "crater_smoke", pos: { x: tx, y: ty }, radius: ab.radius! * 0.6, color: "#3a2a22", life: 1.2 });
      }
      spawnParticles(w, { x: tx, y: ty }, ab.color, 18, { speedMin: 60, speedMax: 180, life: 0.6, gravity: 60 });
      w.shake = Math.max(w.shake, 6);
      break;
    }
    case "channel_cone": {
      w.channel = {
        abilityKey: key,
        dir,
        expireAt: w.time + ab.duration!,
        nextTickAt: w.time,
        tickEvery: ab.tickEvery!,
        range: ab.range,
        radius: ab.radius!,
        damage: ab.damage,
        color: ab.color,
      };
      break;
    }
    case "knockback": {
      const { pos: aimPos } = resolveTargetPos(w, ab, dir, p);
      const tx = aimPos.x, ty = aimPos.y;
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, { x: tx, y: ty }) < (ab.radius! + e.radius) ** 2) {
          damageEntity(w, e, ab.damage, { dir, amount: ab.knockback || 200 });
        }
      }
      spawnVfx(w, { kind: "shockwave", pos: { x: tx, y: ty }, radius: ab.radius! * 1.6, color: ab.color, life: 0.35 });
      spawnParticles(w, { x: tx, y: ty }, ab.color, 12, { speedMin: 80, speedMax: 200, life: 0.4 });
      w.shake = Math.max(w.shake, 5);
      break;
    }
    case "stun_touch": {
      const { pos: aimPos } = resolveTargetPos(w, ab, dir, p);
      const tx = aimPos.x, ty = aimPos.y;
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, { x: tx, y: ty }) < (ab.radius! + e.radius) ** 2) {
          damageEntity(w, e, ab.damage);
          e.stunUntil = w.time + (ab.stunSeconds || 1);
        }
      }
      spawnVfx(w, { kind: "ice_burst", pos: { x: tx, y: ty }, radius: ab.radius!, color: ab.color, life: 0.4 });
      break;
    }
    case "dot_zone": {
      // Burning Text: snap landing point to the actual target so it lands ON the enemy, not past them.
      const { target, pos: aimPos } = resolveTargetPos(w, ab, dir, p);
      const distToAim = Math.hypot(aimPos.x - p.x, aimPos.y - p.y);
      const drop = Math.min(ab.range, distToAim);
      const tx = target ? target.pos.x : p.x + dir.x * drop;
      const ty = target ? target.pos.y : p.y + dir.y * drop;
      w.zones.push({
        id: w.nextId++,
        pos: { x: tx, y: ty },
        radius: ab.radius!,
        damagePerTick: ab.damage,
        tickEvery: ab.tickEvery!,
        nextTickAt: w.time + ab.tickEvery!,
        expireAt: w.time + ab.duration!,
        color: ab.color,
        ringColor: ab.color,
      });
      spawnVfx(w, { kind: "fire_burst", pos: { x: tx, y: ty }, radius: ab.radius!, color: ab.color, life: ab.duration! });
      break;
    }
    case "tesla": {
      w.zones.push({
        id: w.nextId++,
        pos: { ...p },
        radius: ab.radius!,
        damagePerTick: ab.damage,
        tickEvery: ab.tickEvery!,
        nextTickAt: w.time + ab.tickEvery!,
        expireAt: w.time + ab.duration!,
        color: ab.color,
        ringColor: ab.color,
      });
      break;
    }
    case "puppet_toggle": {
      w.puppet.active = !w.puppet.active;
      w.puppet.hp = w.puppet.active ? Math.max(1, w.puppet.hp || w.puppet.maxHp) : w.puppet.hp;
      w.puppet.pos = { x: p.x - w.player.facing.x * 22, y: p.y - w.player.facing.y * 18 };
      w.puppet.facing = { ...w.player.facing };
      w.bannerText = w.puppet.active ? "Puppet summoned" : "Puppet recalled";
      w.bannerUntil = w.time + 1;
      spawnVfx(w, { kind: "shockwave", pos: { ...w.puppet.pos }, radius: 28, color: ab.color, life: 0.35 });
      spawnParticles(w, w.puppet.pos, ab.color, 12, { shape: "spark", life: 0.45 });
      break;
    }
    case "puppet_spear": {
      if (!w.puppet.active || w.puppet.hp <= 0) { softBanner(w, "puppet_first", "Summon puppet first", 0.9); break; }
      const target = nearestTarget(w, w.puppet.pos, ab.range + 80);
      const spearDir = target ? norm({ x: target.pos.x - w.puppet.pos.x, y: target.pos.y - w.puppet.pos.y }) : dir;
      w.puppet.facing = spearDir;
      w.puppet.attackUntil = w.time + 0.35;
      w.standAimTarget = target ? { ...target.pos } : { x: w.puppet.pos.x + spearDir.x * ab.range, y: w.puppet.pos.y + spearDir.y * ab.range };
      w.standAimUntil = w.time + 0.45;
      w.projectiles.push({
        id: w.nextId++,
        pos: { ...w.puppet.pos },
        vel: { x: spearDir.x * ab.speed!, y: spearDir.y * ab.speed! },
        radius: ab.radius || 7,
        damage: ab.damage,
        color: ab.color,
        ownerKind: "player",
        pierce: true,
        hitSet: new Set(),
        expireAt: w.time + ab.range / ab.speed!,
      });
      spawnVfx(w, { kind: "stab_line", pos: { ...w.puppet.pos }, to: { x: w.puppet.pos.x + spearDir.x * 48, y: w.puppet.pos.y + spearDir.y * 48 }, radius: 7, color: ab.color, life: 0.2 });
      break;
    }
    case "puppet_spin": {
      if (!w.puppet.active || w.puppet.hp <= 0) { softBanner(w, "puppet_first", "Summon puppet first", 0.9); break; }
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, w.puppet.pos) < ((ab.radius ?? 58) + e.radius) ** 2) damageEntity(w, e, ab.damage, { dir: norm({ x: e.pos.x - w.puppet.pos.x, y: e.pos.y - w.puppet.pos.y }), amount: 90 });
      }
      w.puppet.attackUntil = w.time + 0.55;
      spawnVfx(w, { kind: "shockwave", pos: { ...w.puppet.pos }, radius: ab.radius!, color: ab.color, life: 0.45 });
      spawnVfx(w, { kind: "slash_arc", pos: { ...w.puppet.pos }, angle: w.time * 6, radius: ab.radius!, color: ab.color, life: 0.42 });
      spawnParticles(w, w.puppet.pos, ab.color, 18, { speedMin: 70, speedMax: 150, life: 0.45 });
      break;
    }
    case "rage_mode": {
      w.rage = 0;
      w.rageUntil = w.time + (ab.duration ?? 5);
      w.bannerText = "Rage Mode";
      w.bannerUntil = w.time + 1.2;
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 72, color: ab.color, life: 0.65 });
      spawnParticles(w, p, ab.color, 28, { shape: "ember", speedMin: 80, speedMax: 220, life: 0.7 });
      w.shake = Math.max(w.shake, 6);
      break;
    }
    case "auto_aim": {
      const target = nearestTarget(w, p, Math.max(ab.range, AIM_ASSIST_RANGE));
      if (target) {
        w.standAimTarget = { ...target.pos };
        w.standAimUntil = w.time + 0.5;
        damageEntity(w, target, ab.damage);
        spawnVfx(w, { kind: "beam", pos: { ...p }, to: { ...target.pos }, color: ab.color, life: 0.25 });
        spawnVfx(w, { kind: "explosion_ring", pos: { ...target.pos }, radius: ab.radius!, color: ab.color, life: 0.4 });
        spawnParticles(w, target.pos, ab.color, 20, { speedMin: 60, speedMax: 200, life: 0.5 });
        if (ab.crater) {
          w.craters.push({ pos: { ...target.pos }, radius: ab.radius! * 0.6, bornAt: w.time, expireAt: w.time + 30 });
          spawnVfx(w, { kind: "crater_smoke", pos: { ...target.pos }, radius: ab.radius! * 0.6, color: "#222", life: 1.4 });
        }
        w.shake = Math.max(w.shake, ab.damage > 15 ? 10 : 5);
      } else {
        // no target — visual ping so the player knows the cast happened
        spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 30, color: ab.color, life: 0.3 });
      }
      break;
    }
    case "chain_projectile": {
      const { target } = resolveTargetPos(w, ab, dir, p);
      const shootDir = target ? norm({ x: target.pos.x - p.x, y: target.pos.y - p.y }) : dir;
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: shootDir.x * ab.speed!, y: shootDir.y * ab.speed! },
        radius: ab.radius || 6,
        damage: ab.damage,
        color: ab.color,
        ownerKind: "player",
        pierce: true,
        hitSet: new Set(),
        expireAt: w.time + ab.range / ab.speed!,
        homingTargetId: target?.id,
        homingStrength: 0.18,
        speed: ab.speed,
        chainsLeft: 4,
        chainRange: 90,
        chainColor: ab.color,
      });
      if (target) w.standAimTarget = { ...target.pos };
      spawnParticles(w, p, ab.color, 8, { speedMin: 40, speedMax: 160, life: 0.3 });
      break;
    }
    case "frog_summon": {
      if (w.frogs.filter((f) => f.alive).length >= FROG_MAX) {
        w.bannerText = "Max 3 frogs out";
        w.bannerUntil = w.time + 0.9;
        w.cdTimers[key] = 0.5;
        break;
      }
      w.frogs.push({
        id: w.nextId++,
        pos: { x: p.x - dir.x * 12 + rand(-6, 6), y: p.y - dir.y * 12 + rand(-6, 6) },
        bobPhase: Math.random() * Math.PI * 2,
        alive: true,
      });
      spawnParticles(w, p, ab.color, 8, { speedMin: 30, speedMax: 80, life: 0.4, gravity: 80 });
      break;
    }
    case "hologram_stun": {
      const target = nearestTarget(w, p, Math.max(ab.range, AIM_ASSIST_RANGE));
      if (!target) {
        w.bannerText = "No target";
        w.bannerUntil = w.time + 0.7;
        w.cdTimers[key] = 1.5;
        spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 22, color: ab.color, life: 0.25 });
        break;
      }
      w.standAimTarget = { ...target.pos };
      w.standAimUntil = w.time + 0.6;
      damageEntity(w, target, ab.damage);
      const stunDur = ab.stunSeconds ?? 3.5;
      target.stunUntil = Math.max(target.stunUntil, w.time + stunDur);
      target.hologramUntil = w.time + stunDur;
      // hologram appears behind target (opposite of player->target)
      const back = norm({ x: target.pos.x - p.x, y: target.pos.y - p.y });
      target.hologramOrigin = { x: target.pos.x + back.x * 18, y: target.pos.y + back.y * 18 };
      spawnVfx(w, { kind: "hologram_burst", pos: { ...target.pos }, color: ab.color, life: 0.5 });
      spawnVfx(w, { kind: "beam", pos: { ...p }, to: { ...target.pos }, color: ab.color, life: 0.3 });
      spawnParticles(w, target.pos, ab.color, 16, { speedMin: 50, speedMax: 140, life: 0.6 });
      w.shake = Math.max(w.shake, 5);
      break;
    }
    case "tree_zone": {
      const tx = p.x + dir.x * Math.min(ab.range, 60);
      const ty = p.y + dir.y * Math.min(ab.range, 60);
      w.trees.push({
        pos: { x: tx, y: ty },
        radius: ab.radius!,
        bornAt: w.time,
        expireAt: w.time + (ab.duration ?? 6),
        rooted: new Map(),
      });
      spawnVfx(w, { kind: "tree_aura", pos: { x: tx, y: ty }, radius: ab.radius!, color: ab.color, life: ab.duration! });
      spawnParticles(w, { x: tx, y: ty }, ab.color, 18, { speedMin: 40, speedMax: 120, life: 0.6 });
      break;
    }
    case "time_stop": {
      // Star Platinum's "The World" — freeze NPCs for `duration` seconds.
      const dur = ab.duration ?? 5;
      w.timeStopUntil = w.time + dur;
      w.timeStopStartedAt = w.time;
      w.pendingPlayerDamage = [];
      spawnVfx(w, { kind: "time_clock", pos: { x: w.player.pos.x, y: w.player.pos.y - 30 }, radius: 60, color: ab.color, life: 1.4 });
      spawnVfx(w, { kind: "shockwave", pos: { ...w.player.pos }, radius: 220, color: ab.color, life: 0.8 });
      w.bannerText = "ZA WARUDO!";
      w.bannerUntil = w.time + 1.6;
      play("timeStop");
      break;
    }
    case "pilot_toggle": {
      // Hanged Man: toggle the stand on/off. While active, it's a separate body that gets piloted
      // and any incoming damage to it is shared 1:1 with the player.
      const turningOn = !w.hangedManActive;
      w.hangedManActive = turningOn;
      w.pilotActive = turningOn;
      w.hangedManFormed = true;
      if (turningOn) {
        // spawn the stand near the player on first engage
        w.hangedMan.pos = { x: w.player.pos.x + 18, y: w.player.pos.y };
        pushOutOfProps({ ...w.player, pos: w.hangedMan.pos, radius: 9 } as Entity, w.props);
      } else {
        // dropping the stand also closes the picker
        w.shardPickerOpen = false;
      }
      w.bannerText = turningOn ? "Hanged Man summoned" : "Hanged Man released";
      w.bannerUntil = w.time + 0.8;
      play("pilot");
      break;
    }
    case "mirror_shard": {
      // Drop a chrome shard at the stand's position (or player). Creates a combat dome.
      const origin = w.hangedManActive ? w.hangedMan.pos : w.player.pos;
      w.shards.push({
        id: w.nextId++,
        pos: { x: origin.x, y: origin.y },
        radius: ab.radius ?? 80,
        bornAt: w.time,
        expireAt: w.time + (ab.duration ?? 12),
      });
      spawnVfx(w, { kind: "mirror_dome", pos: { x: origin.x, y: origin.y }, radius: ab.radius ?? 80, color: ab.color, life: 0.6 });
      spawnVfx(w, { kind: "shard_flash", pos: { x: origin.x, y: origin.y }, radius: 20, color: ab.color, life: 0.4 });
      play("shard");
      break;
    }
    case "shard_teleport": {
      // Open a picker so the user can choose which shard to teleport to.
      const live = w.shards.filter((s) => w.time < s.expireAt);
      if (live.length === 0) {
        w.bannerText = "No shards placed";
        w.bannerUntil = w.time + 0.8;
        // refund cooldown so the user isn't penalized for an empty picker
        w.cdTimers[key] = 0;
        return;
      }
      w.shardPickerOpen = true;
      // refund cooldown until they actually pick one (set in teleportToShard)
      w.cdTimers[key] = 0;
      break;
    }
    case "brutal_slash": {
      // Big slash: heavy damage, bleed, stun, slow.
      const angle = Math.atan2(dir.y, dir.x);
      const origin = w.hangedManActive ? w.hangedMan.pos : p;
      const reach = ab.range + (ab.radius ?? 16);
      spawnVfx(w, { kind: "slash_arc", pos: { x: origin.x, y: origin.y }, angle, radius: reach, color: ab.color, life: 0.32 });
      for (const e of w.npcs) {
        if (!e.alive) continue;
        const dx = e.pos.x - origin.x, dy = e.pos.y - origin.y;
        const d = Math.hypot(dx, dy);
        if (d > reach + e.radius) continue;
        const dot = d <= e.radius + 8 ? 1 : (dx * dir.x + dy * dir.y) / (d || 1);
        if (dot > 0.1) {
          damageEntity(w, e, ab.damage, { dir, amount: 80 });
          e.stunUntil = Math.max(e.stunUntil, w.time + (ab.stunSeconds ?? 1.5));
          e.bleedUntil = w.time + 4;
          e.bleedNextTickAt = w.time + 0.5;
          e.slowUntil = w.time + 3;
        }
      }
      const tx = origin.x + dir.x * ab.range;
      const ty = origin.y + dir.y * ab.range;
      damagePropsInRadius(w, tx, ty, (ab.radius ?? 16) + 6, ab.damage, { abilityKind: ab.kind, abilityKey: key, standId: w.standId });
      play("brutal");
      break;
    }
    case "ice_heal": {
      // Restore HP and drain a hefty chunk of the bar.
      healPlayer(w, 28, "#9be7ff");
      w.whiteAlbumBar = Math.max(0, w.whiteAlbumBar - 45);
      spawnVfx(w, { kind: "ice_burst", pos: { ...p }, radius: 30, color: ab.color, life: 0.5 });
      play("standSummon");
      break;
    }
    case "ice_stomp": {
      // Ice spikes shoot out from the player toward the closest enemies in range.
      const candidates = w.npcs
        .filter((e) => e.alive && dist2(e.pos, p) < ab.range * ab.range)
        .map((e) => ({ e, d2: dist2(e.pos, p) }))
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, 5);
      if (candidates.length === 0) {
        // Fallback: forward fan of 3 spikes.
        const baseAng = Math.atan2(dir.y, dir.x);
        for (let i = -1; i <= 1; i++) {
          const a = baseAng + i * 0.35;
          const tx = p.x + Math.cos(a) * ab.range * 0.6;
          const ty = p.y + Math.sin(a) * ab.range * 0.6;
          spawnVfx(w, { kind: "stab_line", pos: { ...p }, to: { x: tx, y: ty }, color: ab.color, life: 0.35 });
          spawnVfx(w, { kind: "ice_burst", pos: { x: tx, y: ty }, radius: 18, color: ab.color, life: 0.45 });
          spawnParticles(w, { x: tx, y: ty }, ab.color, 8, { shape: "spark", life: 0.4 });
        }
      } else {
        for (const { e } of candidates) {
          // damage + stun + slow
          const knockDir = norm({ x: e.pos.x - p.x, y: e.pos.y - p.y });
          damageEntity(w, e, ab.damage, { dir: knockDir, amount: 70 });
          e.stunUntil = Math.max(e.stunUntil, w.time + (ab.stunSeconds ?? 1.6));
          e.slowUntil = Math.max(e.slowUntil ?? 0, w.time + 2.5);
          // Spike VFX from player to target, plus burst at target.
          spawnVfx(w, { kind: "stab_line", pos: { ...p }, to: { ...e.pos }, color: ab.color, life: 0.3 });
          spawnVfx(w, { kind: "ice_burst", pos: { ...e.pos }, radius: 22, color: ab.color, life: 0.5 });
          spawnParticles(w, e.pos, ab.color, 12, { shape: "spark", speedMin: 60, speedMax: 180, life: 0.5 });
        }
      }
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 24, color: ab.color, life: 0.3 });
      w.shake = Math.max(w.shake, 4);
      w.whiteAlbumBar = Math.max(0, w.whiteAlbumBar - 22);
      play("freezeTouch");
      break;
    }
    // ---- Gold Experience: Eagle Pierce (A1) ----
    case "ge_eagle_pierce": {
      const { target } = resolveTargetPos(w, ab, dir, p);
      const shootDir = target ? norm({ x: target.pos.x - p.x, y: target.pos.y - p.y }) : dir;
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: shootDir.x * ab.speed!, y: shootDir.y * ab.speed! },
        radius: ab.radius || 8,
        damage: ab.damage,
        color: ab.color,
        ownerKind: "player",
        pierce: true,
        hitSet: new Set(),
        expireAt: w.time + ab.range / ab.speed!,
        speed: ab.speed,
        textGlyph: "GE_EAGLE",
      });
      if (target) w.standAimTarget = { ...target.pos };
      spawnVfx(w, { kind: "stab_line", pos: { x: p.x, y: p.y }, to: { x: p.x + shootDir.x * 30, y: p.y + shootDir.y * 30 }, radius: 6, color: ab.color, life: 0.25 });
      spawnParticles(w, { x: p.x + shootDir.x * 10, y: p.y + shootDir.y * 10 }, ab.color, 8, { speedMin: 60, speedMax: 160, life: 0.3 });
      break;
    }
    // ---- Echoes: Sent Bleed (A1) ----
    case "bleed_text": {
      const { target } = resolveTargetPos(w, ab, dir, p);
      const shootDir = target ? norm({ x: target.pos.x - p.x, y: target.pos.y - p.y }) : dir;
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: shootDir.x * ab.speed!, y: shootDir.y * ab.speed! },
        radius: ab.radius || 7,
        damage: ab.damage,
        color: ab.color,
        ownerKind: "player",
        pierce: false,
        hitSet: new Set(),
        expireAt: w.time + ab.range / ab.speed!,
        homingTargetId: target?.id,
        homingStrength: 0.14,
        speed: ab.speed,
        applyBleed: { dps: 1.2, durationSeconds: ab.duration ?? 6 },
        textGlyph: "BLEED",
      });
      if (target) w.standAimTarget = { ...target.pos };
      spawnParticles(w, p, ab.color, 6, { speedMin: 50, speedMax: 140, life: 0.3 });
      break;
    }
    // ---- Echoes: Explosion text (A2) — self-buff that knocks back attackers when they hit you ----
    case "explosion_text": {
      // Set a buff window; melee hits during this window are reflected.
      w.cleanslyUntil = Math.max(w.cleanslyUntil, 0); // no-op safety
      // Reuse pressuredUntil pattern: tag the player with explosionUntil via slowUntil? No — use a dedicated time:
      // We'll piggyback on rageUntil-like via a new field; simplest: push a zone around player that knocks back contact.
      const dur = ab.duration ?? 6;
      // Reactive AOE pulse zone (visual + repeated quick knockback).
      w.zones.push({
        id: w.nextId++,
        pos: { ...p },
        radius: 24,
        damagePerTick: ab.damage,
        tickEvery: 0.6,
        nextTickAt: w.time + 0.6,
        expireAt: w.time + dur,
        color: ab.color,
        ringColor: ab.color,
        glyph: "BOMB",
      });
      spawnVfx(w, { kind: "explosion_ring", pos: { ...p }, radius: 32, color: ab.color, life: 0.5 });
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 36, color: ab.color, life: 0.45 });
      spawnParticles(w, p, ab.color, 14, { speedMin: 60, speedMax: 180, life: 0.5 });
      break;
    }
    // ---- Echoes: Frost Text (A3) ----
    case "frost_text": {
      const { target, pos: aimPos } = resolveTargetPos(w, ab, dir, p);
      const distToAim = Math.hypot(aimPos.x - p.x, aimPos.y - p.y);
      const drop = Math.min(ab.range, distToAim);
      const tx = target ? target.pos.x : p.x + dir.x * drop;
      const ty = target ? target.pos.y : p.y + dir.y * drop;
      w.zones.push({
        id: w.nextId++,
        pos: { x: tx, y: ty },
        radius: ab.radius!,
        damagePerTick: ab.damage,
        tickEvery: ab.tickEvery!,
        nextTickAt: w.time + ab.tickEvery!,
        expireAt: w.time + ab.duration!,
        color: ab.color,
        ringColor: ab.color,
        glyph: "FREEZE",
      });
      // Apply slow to enemies stepping in via slowUntil tagging in zone tick? simpler: tag now in radius
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, { x: tx, y: ty }) < (ab.radius! + e.radius) ** 2) {
          e.slowUntil = Math.max(e.slowUntil ?? 0, w.time + ab.duration!);
        }
      }
      spawnVfx(w, { kind: "ice_burst", pos: { x: tx, y: ty }, radius: ab.radius!, color: ab.color, life: 0.6 });
      break;
    }
    // ---- Echoes: Burn Text (unused alt) ----
    case "burn_text": {
      const { target, pos: aimPos } = resolveTargetPos(w, ab, dir, p);
      const distToAim = Math.hypot(aimPos.x - p.x, aimPos.y - p.y);
      const drop = Math.min(ab.range, distToAim);
      const tx = target ? target.pos.x : p.x + dir.x * drop;
      const ty = target ? target.pos.y : p.y + dir.y * drop;
      w.zones.push({
        id: w.nextId++,
        pos: { x: tx, y: ty },
        radius: ab.radius!,
        damagePerTick: ab.damage,
        tickEvery: ab.tickEvery!,
        nextTickAt: w.time + ab.tickEvery!,
        expireAt: w.time + ab.duration!,
        color: ab.color,
        ringColor: ab.color,
        glyph: "BURN",
      });
      spawnVfx(w, { kind: "fire_burst", pos: { x: tx, y: ty }, radius: ab.radius!, color: ab.color, life: ab.duration! });
      break;
    }
    // ---- Echoes: Three Freeze pressure (A4) — pressure 3 nearest enemies ----
    case "three_freeze_pressure": {
      const targets = w.npcs
        .filter((e) => e.alive)
        .map((e) => ({ e, d: dist2(e.pos, p) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      if (targets.length === 0) {
        spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 24, color: ab.color, life: 0.3 });
        break;
      }
      for (const { e } of targets) {
        e.pressuredUntil = w.time + (ab.duration ?? 4.5);
        e.slowUntil = Math.max(e.slowUntil ?? 0, w.time + (ab.duration ?? 4.5));
        e.bleedUntil = w.time + (ab.duration ?? 4.5);
        e.bleedNextTickAt = w.time + (ab.tickEvery ?? 0.5);
        spawnVfx(w, { kind: "beam", pos: { ...p }, to: { ...e.pos }, color: ab.color, life: 0.3 });
        spawnVfx(w, { kind: "ice_burst", pos: { ...e.pos }, radius: 16, color: ab.color, life: 0.6 });
      }
      break;
    }
    // ---- Purple Haze: Capsule Shot (A1) ----
    case "capsule_shot": {
      const { target } = resolveTargetPos(w, ab, dir, p);
      const shootDir = target ? norm({ x: target.pos.x - p.x, y: target.pos.y - p.y }) : dir;
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: shootDir.x * ab.speed!, y: shootDir.y * ab.speed! },
        radius: ab.radius || 6,
        damage: ab.damage,
        color: "#ffd24a",
        ownerKind: "player",
        pierce: false,
        hitSet: new Set(),
        expireAt: w.time + ab.range / ab.speed!,
        applyPoison: { dps: 1.4, durationSeconds: ab.duration ?? 6 },
      });
      spawnParticles(w, p, "#ffd24a", 8, { speedMin: 50, speedMax: 140, life: 0.3 });
      break;
    }
    // ---- Purple Haze: Gas Release (A2) ----
    case "gas_release": {
      const origin = w.purpleHazeActive ? w.purpleHaze.pos : p;
      // Damage zone (lasts longer than capsule cloud).
      w.zones.push({
        id: w.nextId++,
        pos: { ...origin },
        radius: ab.radius!,
        damagePerTick: ab.damage,
        tickEvery: ab.tickEvery!,
        nextTickAt: w.time + ab.tickEvery!,
        expireAt: w.time + ab.duration!,
        color: ab.color,
        ringColor: ab.color,
      });
      // Tag NPCs in radius with poison so DOT continues even if they walk out.
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, origin) < (ab.radius! + e.radius) ** 2) {
          e.poisonUntil = w.time + (ab.duration! + 2);
          e.poisonNextTickAt = w.time + 0.5;
          e.poisonDps = 1.6;
        }
      }
      // Light self-damage (player too).
      damageEntity(w, w.player, 0.5);
      spawnVfx(w, { kind: "poison_cloud", pos: { ...origin }, radius: ab.radius!, color: ab.color, life: ab.duration! });
      spawnParticles(w, origin, ab.color, 18, { speedMin: 30, speedMax: 110, life: 0.7 });
      break;
    }
    // ---- Purple Haze: Pilot toggle (A3) ----
    case "ph_pilot_toggle": {
      const turningOn = !w.purpleHazeActive;
      w.purpleHazeActive = turningOn;
      if (turningOn) {
        w.purpleHaze.pos = { x: w.player.pos.x + 18, y: w.player.pos.y };
        pushOutOfProps({ ...w.player, pos: w.purpleHaze.pos, radius: 9 } as Entity, w.props);
      }
      w.bannerText = turningOn ? "Piloting Purple Haze" : "Purple Haze released";
      w.bannerUntil = w.time + 0.9;
      play("pilot");
      break;
    }
    // ---- Purple Haze: Cleansly Violence (A4) ----
    case "cleansly_violence": {
      const dur = ab.duration ?? 8;
      w.cleanslyUntil = w.time + dur;
      w.cleanslyDuration = dur;
      w.bannerText = "Cleansly Violence!";
      w.bannerUntil = w.time + 1.0;
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 50, color: ab.color, life: 0.5 });
      spawnParticles(w, p, ab.color, 18, { shape: "ember", speedMin: 60, speedMax: 180, life: 0.6 });
      break;
    }
    // ---- Moon Rabbit: Wasp Swarm (A1) ----
    case "wasp_swarm": {
      const target = nearestTarget(w, p, Math.max(ab.range, AIM_ASSIST_RANGE));
      if (!target) {
        w.bannerText = "No target";
        w.bannerUntil = w.time + 0.7;
        w.cdTimers[key] = 1.5;
        break;
      }
      w.swarms.push({
        id: w.nextId++,
        targetId: target.id,
        expireAt: w.time + (ab.duration ?? 6),
        nextStingAt: w.time + (ab.tickEvery ?? 3),
        tickEvery: ab.tickEvery ?? 3,
        damage: ab.damage,
        range: ab.radius ?? 36,
      });
      spawnVfx(w, { kind: "beam", pos: { ...p }, to: { ...target.pos }, color: ab.color, life: 0.3 });
      spawnParticles(w, target.pos, ab.color, 14, { speedMin: 30, speedMax: 110, life: 0.5 });
      break;
    }
    // ---- Moon Rabbit: Lunar Veil (A2) — temporary invincibility ----
    case "lunar_veil": {
      (w as any).moonRabbitInvulnUntil = w.time + (ab.duration ?? 2.5);
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 28, color: ab.color, life: 0.5 });
      spawnParticles(w, p, ab.color, 16, { shape: "spark", speedMin: 40, speedMax: 140, life: 0.6 });
      w.bannerText = "Lunar Veil — invincible";
      w.bannerUntil = w.time + 1.0;
      play("toggleOn");
      break;
    }
    // ---- Star Platinum / SPTW: Star Rush — short dash + grab + 2 punches ----
    case "star_rush": {
      const target = nearestTarget(w, p, ab.range + 20);
      if (target) {
        // dash player to just shy of target
        const toT = norm({ x: target.pos.x - p.x, y: target.pos.y - p.y });
        const stopDist = (target.radius ?? 8) + 12;
        const dx = (target.pos.x - p.x) - toT.x * stopDist;
        const dy = (target.pos.y - p.y) - toT.y * stopDist;
        tryMove(w.player, dx, dy, w.props);
        target.stunUntil = Math.max(target.stunUntil, w.time + 0.6);
        // two staggered hits
        damageEntity(w, target, ab.damage);
        spawnVfx(w, { kind: "punch_impact", pos: { ...target.pos }, color: ab.color, life: 0.2 });
        // schedule second hit via curseStrikes-like? simpler: hit again now with bonus
        damageEntity(w, target, ab.damage + 1);
        spawnVfx(w, { kind: "slash_arc", pos: { ...target.pos }, angle: Math.atan2(toT.y, toT.x), radius: 18, color: ab.color, life: 0.25 });
        spawnParticles(w, target.pos, ab.color, 14, { speedMin: 60, speedMax: 180, life: 0.4 });
        w.standPunchUntil = w.time + 0.3;
        w.standPunchDir = toT;
        (w as any).lastHitEnemyId = target.id;
        (w as any).lastHitEnemyAt = w.time;
        w.shake = Math.max(w.shake, 5);
      }
      break;
    }
    // ---- Star Platinum / SPTW: The World — single tap = time stop, double tap = teleport-skip ----
    case "time_stop_or_skip": {
      const lastTap = (w as any).timeStopLastTapAt ?? 0;
      const isDoubleTap = w.time - lastTap < 0.45;
      (w as any).timeStopLastTapAt = w.time;
      if (isDoubleTap) {
        // Time Skip: teleport to last enemy you damaged within 5s
        const lastId = (w as any).lastHitEnemyId;
        const lastAt = (w as any).lastHitEnemyAt ?? 0;
        const target = w.npcs.find((e) => e.alive && e.id === lastId);
        if (target && w.time - lastAt < 5) {
          // SPTW gets 2 charges per cooldown; SP only single
          const charges = (w as any).timeSkipCharges ?? 0;
          if (w.standId === "sptw" && charges < 2) {
            (w as any).timeSkipCharges = charges + 1;
            w.cdTimers[key] = 0; // refund until charges spent
          } else {
            (w as any).timeSkipCharges = 0;
          }
          const toT = norm({ x: target.pos.x - w.player.pos.x, y: target.pos.y - w.player.pos.y });
          w.player.pos.x = target.pos.x - toT.x * 16;
          w.player.pos.y = target.pos.y - toT.y * 16;
          pushOutOfProps(w.player, w.props);
          target.stunUntil = Math.max(target.stunUntil, w.time + 1);
          spawnVfx(w, { kind: "shard_flash", pos: { ...target.pos }, radius: 24, color: ab.color, life: 0.4 });
          spawnVfx(w, { kind: "shockwave", pos: { ...w.player.pos }, radius: 36, color: ab.color, life: 0.4 });
          w.bannerText = "Time Skip!";
          w.bannerUntil = w.time + 1.2;
          play("timeStop");
          break;
        }
      }
      // Single tap → Time Stop
      (w as any).timeSkipCharges = 0;
      const dur = ab.duration ?? 5;
      w.timeStopUntil = w.time + dur;
      w.timeStopStartedAt = w.time;
      w.pendingPlayerDamage = [];
      spawnVfx(w, { kind: "time_clock", pos: { x: w.player.pos.x, y: w.player.pos.y - 30 }, radius: 60, color: ab.color, life: 1.4 });
      spawnVfx(w, { kind: "shockwave", pos: { ...w.player.pos }, radius: 220, color: ab.color, life: 0.8 });
      w.bannerText = "ZA WARUDO!";
      w.bannerUntil = w.time + 1.6;
      play("timeStop");
      break;
    }
    // ---- SPTW: Triple Pebble — three small fast flicks at one enemy ----
    case "triple_pebble": {
      const target = nearestTarget(w, p, ab.range);
      if (!target) break;
      const baseDir = norm({ x: target.pos.x - p.x, y: target.pos.y - p.y });
      for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * 0.05;
        const dx = baseDir.x * Math.cos(spread) - baseDir.y * Math.sin(spread);
        const dy = baseDir.x * Math.sin(spread) + baseDir.y * Math.cos(spread);
        w.projectiles.push({
          id: w.nextId++,
          pos: { x: p.x, y: p.y },
          vel: { x: dx * (ab.speed ?? 420), y: dy * (ab.speed ?? 420) },
          radius: ab.radius ?? 4,
          damage: ab.damage,
          color: ab.color,
          ownerKind: "player",
          pierce: false,
          hitSet: new Set(),
          expireAt: w.time + ab.range / (ab.speed ?? 420),
          homingTargetId: target.id,
          homingStrength: 0.18,
          speed: ab.speed,
          sourceStandId: w.standId,
          sourceAbilityKey: key,
        });
      }
      spawnParticles(w, p, ab.color, 8, { speedMin: 60, speedMax: 160, life: 0.25 });
      break;
    }
    // ---- SPTW: Rage activation (consumes meter) ----
    case "sptw_rage": {
      if (((w as any).sptwRage ?? 0) < 100) {
        softBanner(w, "sptw_rage_low", "Rage meter not full", 0.8);
        w.cdTimers[key] = 0;
        break;
      }
      (w as any).sptwRage = 0;
      w.rageUntil = w.time + 6;
      w.bannerText = "RAGE";
      w.bannerUntil = w.time + 1.2;
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 72, color: "#5fe8ff", life: 0.6 });
      spawnParticles(w, p, "#5fe8ff", 22, { shape: "spark", speedMin: 80, speedMax: 200, life: 0.6 });
      w.shake = Math.max(w.shake, 5);
      break;
    }
    // ---- Moon Rabbit: Crash (A3) — drawn motorcycle that rams forward and explodes ----
    case "crash": {
      const target = nearestTarget(w, p, Math.max(ab.range, AIM_ASSIST_RANGE));
      const shootDir = target ? norm({ x: target.pos.x - p.x, y: target.pos.y - p.y }) : dir;
      const speed = ab.speed ?? 360;
      const life = ab.range / speed;
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: shootDir.x * speed, y: shootDir.y * speed },
        radius: 10,
        damage: ab.damage,
        color: ab.color,
        ownerKind: "player",
        pierce: true,
        hitSet: new Set(),
        expireAt: w.time + life,
        detonateAt: w.time + life,
        detonateRadius: 36,
        detonateColor: "#ff6b3a",
        detonateCrater: false,
        textGlyph: "CRASH_BIKE",
        hurtsPlayer: true,
        sourceStandId: w.standId,
        sourceAbilityKey: key,
      });
      spawnParticles(w, p, "#cccccc", 10, { speedMin: 40, speedMax: 130, life: 0.4 });
      break;
    }
    // ---- Moon Rabbit: Eternal Curse (A4) — lightning RAINS DOWN from above on every nearby target ----
    case "eternal_curse": {
      const radius = ab.radius ?? 160;
      const targets = w.npcs.filter((e) => e.alive && dist2(e.pos, p) < radius * radius);
      if (targets.length === 0) {
        softBanner(w, "no_targets", "No targets in range", 0.7);
        spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius, color: ab.color, life: 0.6 });
        break;
      }
      // Stagger strikes by 0.08s each so it feels like a downpour, not a single zap.
      targets.forEach((t, i) => {
        w.curseStrikes.push({
          targetId: t.id,
          hitAt: w.time + 0.25 + i * 0.08,
          dmg: ab.damage,
          color: ab.color,
        });
      });
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius, color: ab.color, life: 0.5 });
      w.bannerText = "Eternal Curse!";
      w.bannerUntil = w.time + 1.0;
      break;
    }
    case "harvest_gather": {
      // Toggle the swarm's gather behavior. Beetles persist either way; this just flips intent.
      w.harvestGatherActive = !w.harvestGatherActive;
      // Cancel any in-progress seek so they all return when toggling off.
      if (!w.harvestGatherActive) {
        for (const b of w.harvestBeetles) {
          if (b.state === "seek") { b.state = "return"; b.targetItemId = undefined; }
        }
        showToast(w, "Harvest: Gather OFF");
      } else {
        showToast(w, "Harvest: Gather ON");
      }
      break;
    }
    case "harvest_carry": {
      // Toggle player carry. While active, player moves faster and can't damage props with M1.
      w.harvestCarryActive = !w.harvestCarryActive;
      showToast(w, w.harvestCarryActive ? "Harvest: Carry ON" : "Harvest: Carry OFF");
      // Visual flourish: a few beetles burst around the player to acknowledge the toggle.
      spawnVfx(w, { kind: "shockwave", pos: { ...p }, radius: 22, color: "#ffd24a", life: 0.3 });
      break;
    }
  }
  if (w.standId === "white_album" && w.whiteAlbumActive && ab.kind !== "ice_heal" && ab.kind !== "ice_stomp") {
    const drain = key === "m1" ? 3 : 12;
    w.whiteAlbumBar = Math.max(0, w.whiteAlbumBar - drain);
  }
}

function trySpawnItem(w: World, kind: ItemPickup["kind"]) {
  // Soft caps per item kind.
  const cap =
    kind === "arrow" ? MAX_ARROWS_ON_GROUND :
    kind === "disc"  ? MAX_DISCS_ON_GROUND  :
    kind === "requiem_arrow" ? 2 :
    /* blue_pebble */         2;
  const existing = w.items.filter((it) => it.kind === kind).length;
  if (existing >= cap) return;
  const pos = freeSpot(w.props, 10, { avoid: w.player.pos, avoidR: 28, craters: w.craters });
  if (!pos) return;
  w.items.push({ id: w.nextId++, kind, pos, bornAt: w.time });
}

export function update(w: World, input: InputState, dt: number) {
  w.time += dt;

  // Time Stop gating — Star Platinum's "The World" freezes everything except the player and their stand.
  const timeStopped = w.time < w.timeStopUntil;
  if (timeStopped && w.timeStopStartedAt === 0) w.timeStopStartedAt = w.time;
  if (!timeStopped && w.timeStopStartedAt > 0) {
    // Just resumed — apply pending damage in one burst.
    if (w.pendingPlayerDamage.length > 0) {
      let total = 0;
      for (const d of w.pendingPlayerDamage) total += d.amount;
      damageEntity(w, w.player, total);
      w.shake = Math.max(w.shake, 8);
      play("timeResume");
      w.bannerText = "Time resumes";
      w.bannerUntil = w.time + 1.0;
    } else {
      play("timeResume");
    }
    w.pendingPlayerDamage = [];
    w.timeStopStartedAt = 0;
  }

  // Cooldowns
  for (const k of ["m1", "a1", "a2", "a3", "a4"] as const) {
    if (w.cdTimers[k] > 0) w.cdTimers[k] = Math.max(0, w.cdTimers[k] - dt);
  }

  // Pilot mode: joystick drives the puppet (Ebony Devil) or Hanged Man instead of the player.
  // The player stops moving while piloting; HP is shared.
  const piloting = w.puppet.active || w.pilotActive || w.hangedManActive;

  // Player movement
  const pl = w.player;
  if (pl.alive) {
    const j = input.joy;
    const len = Math.hypot(j.x, j.y);
    w.lastJoyMag = len;
    if (!piloting && len > 0.05) {
      const nx = j.x / Math.max(1, len), ny = j.y / Math.max(1, len);
      let baseSpeed = input.sprint || w.time < w.rageUntil ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
      // White Album: ice skating boost while suit is active.
      if (w.standId === "white_album" && w.whiteAlbumActive) baseSpeed *= 1.2;
      // Harvest: Carry mode lifts the player along — faster, smoother movement.
      if (w.standId === "harvest" && w.harvestCarryActive && w.standActive) baseSpeed *= 1.45;
      const speed = baseSpeed * Math.min(1, len);
      const before = { x: pl.pos.x, y: pl.pos.y };
      tryMove(pl, nx * speed * dt, ny * speed * dt, w.props);
      pl.facing = { x: nx, y: ny };
      // Auto-kick: if we asked to move but barely budged AND a prop sits in our path, push us out hard.
      const moved = Math.hypot(pl.pos.x - before.x, pl.pos.y - before.y);
      if (moved < 0.4 * Math.max(0.5, speed * dt) && w.time - w.kickAt > 0.4) {
        for (const p of w.props) {
          if (!propSolid(p)) continue;
          if (circleRectOverlap(pl.pos.x + nx * (pl.radius + 1), pl.pos.y + ny * (pl.radius + 1), pl.radius, p.rect)) {
            pushOutOfProps(pl, w.props);
            pl.pos.x -= nx * 6; pl.pos.y -= ny * 6;
            pushOutOfProps(pl, w.props);
            spawnParticles(w, { x: pl.pos.x, y: pl.pos.y + 6 }, "#a1814a", 4, {
              shape: "square", gravity: 80, speedMin: 20, speedMax: 60, life: 0.4,
            });
            play("footstep");
            w.kickAt = w.time;
            break;
          }
        }
      }
      w.footstepAcc += dt * Math.min(1, len);
      if (w.footstepAcc >= 0.32) {
        w.footstepAcc = 0;
        play("footstep");
        const back = { x: -nx, y: -ny };
        spawnParticles(w, { x: pl.pos.x + back.x * 4, y: pl.pos.y + 6 + back.y * 2 }, "#a1814a", input.sprint ? 5 : 3, {
          shape: "square", gravity: 60, speedMin: 8, speedMax: input.sprint ? 60 : 35, life: 0.45,
        });
      }
    } else {
      w.footstepAcc = 0.32;
    }
    // Player regen — disabled while piloting (HP shared with puppet/Hanged Man).
    const recentlyHurt = w.time - pl.hitFlashUntil < 4.0;
    if (!piloting && !recentlyHurt && pl.hp < pl.maxHp) pl.hp = Math.min(pl.maxHp, pl.hp + 1.2 * dt);

    if (pl.hp < pl.maxHp * 0.5 && Math.random() < dt * 5) {
      spawnParticles(w, { x: pl.pos.x + rand(-3, 3), y: pl.pos.y - 2 }, "#b21717", 1, {
        shape: "circle", gravity: 120, speedMin: 8, speedMax: 24, life: 0.5,
      });
    }
  } else {
    if (pl.respawnAt && w.time >= pl.respawnAt) {
      pl.alive = true;
      pl.hp = pl.maxHp;
      pl.pos = { x: MAP_W / 2, y: MAP_H / 2 };
      pushOutOfProps(pl, w.props);
      // dropping pilot states on death
      w.pilotActive = false;
      w.puppetPiloted = false;
    }
  }

  // M1 hold-to-repeat (input-driven). Allowed during time stop because player still acts.
  w.m1Held = input.m1Held;
  if (pl.alive && w.m1Held && w.cdTimers.m1 <= 0 && (w.standId === "none" || w.standActive)) {
    castAbility(w, "m1", input);
  }

  if (input.aim) w.pointerAim = norm(input.aim);

  // Puppet movement: while summoned, the player is frozen and the joystick drives the puppet.
  if (w.puppet.active) {
    if (w.puppet.hp <= 0) { w.puppet.active = false; w.puppetPiloted = false; }
    const j = input.joy;
    const len = Math.hypot(j.x, j.y);
    if (len > 0.05) {
      const nx = j.x / Math.max(1, len), ny = j.y / Math.max(1, len);
      const sp = PLAYER_SPEED * Math.min(1, len);
      const e: Entity = { ...pl, pos: w.puppet.pos, radius: 9 };
      tryMove(e, nx * sp * dt, ny * sp * dt, w.props);
      w.puppet.pos.x = e.pos.x; w.puppet.pos.y = e.pos.y;
      w.puppet.facing = { x: nx, y: ny };
    }
    w.puppet.pos.x = Math.max(10, Math.min(MAP_W - 10, w.puppet.pos.x));
    w.puppet.pos.y = Math.max(10, Math.min(MAP_H - 10, w.puppet.pos.y));
    // NPC soft collision (push apart)
    pushOutOfNpcs(w, w.puppet.pos, 9);
    // Tether: clamp distance from player. Past tether, drag the puppet back toward player.
    const dx = w.puppet.pos.x - pl.pos.x, dy = w.puppet.pos.y - pl.pos.y;
    const td = Math.hypot(dx, dy);
    if (td > STAND_TETHER) {
      const k = STAND_TETHER / td;
      w.puppet.pos.x = pl.pos.x + dx * k;
      w.puppet.pos.y = pl.pos.y + dy * k;
      if (!w.bannerText || w.time > w.bannerUntil) {
        w.bannerText = "Puppet leashed";
        w.bannerUntil = w.time + 0.5;
      }
    }
  }

  // Hanged Man pilot movement.
  if (w.standId === "hanged_man" && w.pilotActive) {
    const j = input.joy;
    const len = Math.hypot(j.x, j.y);
    if (len > 0.05) {
      const nx = j.x / Math.max(1, len), ny = j.y / Math.max(1, len);
      const sp = PLAYER_SPEED * Math.min(1, len);
      const e: Entity = { ...pl, pos: w.hangedMan.pos, radius: 9 };
      tryMove(e, nx * sp * dt, ny * sp * dt, w.props);
      w.hangedMan.pos.x = e.pos.x; w.hangedMan.pos.y = e.pos.y;
      w.hangedMan.facing = { x: nx, y: ny };
    }
    w.hangedMan.pos.x = Math.max(10, Math.min(MAP_W - 10, w.hangedMan.pos.x));
    w.hangedMan.pos.y = Math.max(10, Math.min(MAP_H - 10, w.hangedMan.pos.y));
    pushOutOfNpcs(w, w.hangedMan.pos, 9);
    const dx = w.hangedMan.pos.x - pl.pos.x, dy = w.hangedMan.pos.y - pl.pos.y;
    const td = Math.hypot(dx, dy);
    if (td > STAND_TETHER) {
      const k = STAND_TETHER / td;
      w.hangedMan.pos.x = pl.pos.x + dx * k;
      w.hangedMan.pos.y = pl.pos.y + dy * k;
      if (!w.bannerText || w.time > w.bannerUntil) {
        w.bannerText = "Hanged Man leashed";
        w.bannerUntil = w.time + 0.5;
      }
    }
  }

  // Item use buttons
  if (input.useArrow) {
    input.useArrow = false;
    // consumed by Game component which decrements arrows; here we only roll if it asked
  }
  if (input.useDisc) input.useDisc = false;

  // NPC AI — fully frozen during Time Stop.
  if (!timeStopped) for (const e of w.npcs) {
    if (!e.alive) {
      if (e.respawnAt && w.time >= e.respawnAt) {
        // respawn at strict free spot
        const spot = freeSpot(w.props, 10, { avoid: w.player.pos, avoidR: 80, craters: w.craters });
        if (spot) {
          e.pos = spot;
          e.hp = e.maxHp;
          e.alive = true;
          e.provoked = false;
          pushOutOfProps(e, w.props);
        } else {
          e.respawnAt = w.time + 1; // try again soon
        }
      }
      continue;
    }
    if (w.time < e.stunUntil) {
      // stunned: friction
      e.vel.x *= 0.85;
      e.vel.y *= 0.85;
      tryMove(e, e.vel.x * dt, e.vel.y * dt, w.props);
      continue;
    }
    // velocity friction (knockback)
    e.vel.x *= 0.9;
    e.vel.y *= 0.9;
    tryMove(e, e.vel.x * dt, e.vel.y * dt, w.props);

    if (e.kind === "enemy" && e.provoked && pl.alive && (dist2(e.pos, pl.pos) < ENEMY_AGGRO * ENEMY_AGGRO || (w.puppet.active && dist2(e.pos, w.puppet.pos) < ENEMY_AGGRO * ENEMY_AGGRO) || (w.hangedManActive && dist2(e.pos, w.hangedMan.pos) < ENEMY_AGGRO * ENEMY_AGGRO))) {
      // Pick the closest player-like body: player, puppet, hanged man.
      const pd = dist2(e.pos, pl.pos);
      const ppd = w.puppet.active ? dist2(e.pos, w.puppet.pos) : Infinity;
      const hpd = w.hangedManActive ? dist2(e.pos, w.hangedMan.pos) : Infinity;
      const minD = Math.min(pd, ppd, hpd);
      const aimAtPuppet = ppd === minD && ppd < Infinity;
      const aimAtHanged = !aimAtPuppet && hpd === minD && hpd < Infinity;
      // Frog interception: if a frog is closer than chosen target, hit the frog instead
      const aliveFrogs = w.frogs.filter((f) => f.alive);
      let frogTarget: Frog | null = null;
      const baseTargetPos = aimAtPuppet ? w.puppet.pos : aimAtHanged ? w.hangedMan.pos : pl.pos;
      for (const f of aliveFrogs) {
        if (dist2(f.pos, e.pos) < dist2(baseTargetPos, e.pos) && dist2(f.pos, e.pos) < 50 * 50) { frogTarget = f; break; }
      }
      const targetPos = frogTarget ? frogTarget.pos : baseTargetPos;
      const dir = norm({ x: targetPos.x - e.pos.x, y: targetPos.y - e.pos.y });
      const slowMul = w.time < (e.slowUntil ?? 0) ? 0.45 : 1;
      tryMove(e, dir.x * ENEMY_SPEED * slowMul * dt, dir.y * ENEMY_SPEED * slowMul * dt, w.props);
      e.facing = dir;
      if (dist(e.pos, targetPos) < ENEMY_ATTACK_RANGE && (!e.nextAttackAt || w.time >= e.nextAttackAt)) {
        e.nextAttackAt = w.time + ENEMY_ATTACK_CD;
        const isCrit = Math.random() < ENEMY_CRIT_CHANCE;
        const dmg = isCrit ? ENEMY_ATTACK_DMG_CRIT : ENEMY_ATTACK_DMG;
        // NPC swing FX (matches the player's M1 hit feel).
        spawnVfx(w, { kind: "punch_impact", pos: { ...targetPos }, color: "#ffd0a8", radius: 10, life: 0.22 });
        if (isCrit) spawnVfx(w, { kind: "crit_burst", pos: { ...targetPos }, color: "#ffd24a", radius: 16, life: 0.32 });
        if (frogTarget) {
          // Frog leaps onto the strike, dies, reflects 50% back.
          frogTarget.alive = false;
          spawnVfx(w, { kind: "shockwave", pos: { ...frogTarget.pos }, radius: 14, color: "#5fd16a", life: 0.3 });
          spawnParticles(w, frogTarget.pos, "#7fc97f", 14, { gravity: 80, life: 0.6 });
          play("frog");
          damageEntity(w, e, dmg * 0.5);
        } else if (aimAtPuppet) damagePuppet(w, dmg);
        else if (aimAtHanged) damageHangedMan(w, dmg, dir);
        else damageEntity(w, pl, dmg, { dir, amount: 40 });
      }
    } else {
      // wander
      if (!e.wanderUntil || w.time >= e.wanderUntil || !e.wanderTarget) {
        e.wanderTarget = freeSpotOrCenter(w.props, 10);
        e.wanderUntil = w.time + rand(2, 5);
      }
      const tgt = e.wanderTarget;
      const d = dist(e.pos, tgt);
      if (d > 4) {
        const dir = norm({ x: tgt.x - e.pos.x, y: tgt.y - e.pos.y });
        const slowMul = w.time < (e.slowUntil ?? 0) ? 0.45 : 1;
        tryMove(e, dir.x * NPC_SPEED * slowMul * dt, dir.y * NPC_SPEED * slowMul * dt, w.props);
        e.facing = dir;
      }
    }
  }

  // Entity vs entity soft collision (push apart). Player <-> NPCs and NPC <-> NPC.
  const all: Entity[] = pl.alive ? [pl, ...w.npcs] : [...w.npcs];
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      if (!b.alive) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const minD = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < minD * minD) {
        const d = Math.sqrt(d2);
        const overlap = minD - d;
        const nx = dx / d, ny = dy / d;
        // Player is heavier than NPCs: push NPC more.
        const aIsPlayer = a.kind === "player";
        const bIsPlayer = b.kind === "player";
        const aShare = aIsPlayer ? 0.25 : bIsPlayer ? 0.75 : 0.5;
        const bShare = 1 - aShare;
        a.pos.x -= nx * overlap * aShare;
        a.pos.y -= ny * overlap * aShare;
        b.pos.x += nx * overlap * bShare;
        b.pos.y += ny * overlap * bShare;
      }
    }
  }

  // Boingo update — scared NPC AI: wanders idly, flees from anything threatening (player, puppet, hanged man, hostile NPCs).
  // After being talked to, Boingo despawns permanently — skip all of his updates.
  if (!timeStopped && w.boingo.alive) {
    const b = w.boingo;
    // page-flip timer (purely visual)
    if (w.time >= b.pageFlipAt) {
      b.pageIndex = (b.pageIndex + 1) % 4;
      b.pageFlipAt = w.time + rand(2.2, 4.8);
    }
    // Calm wander only — no flee behavior.
    if (!b.wanderTarget || w.time >= b.wanderUntil) {
      b.wanderTarget = freeSpotOrCenter(w.props, 10);
      b.wanderUntil = w.time + rand(2.5, 5);
    }
    const tgt = b.wanderTarget;
    const d = dist(b.pos, tgt);
    if (d > 4) {
      const dir = norm({ x: tgt.x - b.pos.x, y: tgt.y - b.pos.y });
      tryMove(b as unknown as Entity, dir.x * (NPC_SPEED * 0.6) * dt, dir.y * (NPC_SPEED * 0.6) * dt, w.props);
      b.facing = dir;
    }

    // Soft-collide Boingo against the player + every alive NPC + puppet + hanged man.
    const collideWith = (px: number, py: number, pr: number, heavyOther: boolean) => {
      const dx = b.pos.x - px;
      const dy = b.pos.y - py;
      const minD = b.radius + pr;
      const d2v = dx * dx + dy * dy;
      if (d2v > 0 && d2v < minD * minD) {
        const d = Math.sqrt(d2v);
        const overlap = minD - d;
        const nx = dx / d, ny = dy / d;
        // Boingo is "lighter" than the player/stand bodies — he gets pushed more
        const boingoShare = heavyOther ? 0.85 : 0.5;
        b.pos.x += nx * overlap * boingoShare;
        b.pos.y += ny * overlap * boingoShare;
      }
    };
    if (pl.alive) collideWith(pl.pos.x, pl.pos.y, pl.radius, true);
    if (w.puppet.active) collideWith(w.puppet.pos.x, w.puppet.pos.y, 8, true);
    if (w.hangedManActive) collideWith(w.hangedMan.pos.x, w.hangedMan.pos.y, 9, true);
    for (const e of w.npcs) if (e.alive) collideWith(e.pos.x, e.pos.y, e.radius, false);
  }

  // Eject any entity overlapping a prop (knockback/spawn glitches push them inside houses).
  if (pl.alive) pushOutOfProps(pl, w.props);
  for (const e of w.npcs) if (e.alive) pushOutOfProps(e, w.props);
  if (w.boingo.alive) pushOutOfProps(w.boingo as unknown as Entity, w.props);

  // Sweep expired Hanged Man mirror shards.
  if (w.shards.length) w.shards = w.shards.filter((s) => w.time < s.expireAt);
  // Auto-close shard picker if all shards have died while it was open.
  if (w.shardPickerOpen && w.shards.length === 0) w.shardPickerOpen = false;

  // Prop respawn loop — destructible props come back fully healed after their timer.
  for (const p of w.props) {
    if (p.destroyedAt && p.respawnAt && w.time >= p.respawnAt) {
      if (p.original) {
        p.rect = { ...p.original.rect };
        p.hp = p.original.hp;
      }
      p.destroyedAt = 0;
      p.respawnAt = 0;
      p.hitFlashUntil = 0;
    }
  }

  if (pl.alive) {
    if (input.pressed.m1) { input.pressed.m1 = false; castAbility(w, "m1", input); }
    if (input.pressed.a1) { input.pressed.a1 = false; castAbility(w, "a1", input); }
    if (input.pressed.a2) { input.pressed.a2 = false; castAbility(w, "a2", input); }
    if (input.pressed.a3) { input.pressed.a3 = false; castAbility(w, "a3", input); }
    if (input.pressed.a4) { input.pressed.a4 = false; castAbility(w, "a4", input); }
  }

  // Channel (ora ora)
  if (w.channel) {
    if (w.time >= w.channel.expireAt) w.channel = null;
    else {
      // re-aim if joystick moves
      if (input.joyActive && (input.joy.x !== 0 || input.joy.y !== 0)) {
        w.channel.dir = norm(input.joy);
      }
      while (w.time >= w.channel.nextTickAt && w.time < w.channel.expireAt) {
        const c = w.channel;
        const tx = pl.pos.x + c.dir.x * c.range;
        const ty = pl.pos.y + c.dir.y * c.range;
        for (const e of w.npcs) {
          if (!e.alive) continue;
          if (dist2(e.pos, { x: tx, y: ty }) < (c.radius + e.radius) ** 2) {
            damageEntity(w, e, c.damage);
          }
        }
        spawnParticles(w, { x: tx, y: ty }, c.color, 2);
        play("oraTick");
        c.nextTickAt += c.tickEvery;
      }
    }
  }

  // Projectiles — homing steering for projectiles with a target id
  for (const pr of w.projectiles) {
    if (pr.homingTargetId !== undefined && pr.speed) {
      const tgt = w.npcs.find((n) => n.id === pr.homingTargetId && n.alive);
      if (tgt) {
        const want = norm({ x: tgt.pos.x - pr.pos.x, y: tgt.pos.y - pr.pos.y });
        const cur = norm(pr.vel);
        const k = pr.homingStrength ?? 0.1;
        const nx = cur.x * (1 - k) + want.x * k;
        const ny = cur.y * (1 - k) + want.y * k;
        const nm = Math.hypot(nx, ny) || 1;
        pr.vel.x = (nx / nm) * pr.speed;
        pr.vel.y = (ny / nm) * pr.speed;
      }
    }
    pr.pos.x += pr.vel.x * dt;
    pr.pos.y += pr.vel.y * dt;
  }
  // Lobbed detonate
  for (const pr of w.projectiles) {
    if (pr.lobbed && pr.detonateAt !== undefined && w.time >= pr.detonateAt) {
      // detonate
      const r = pr.detonateRadius || 30;
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, pr.pos) < (r + e.radius) ** 2) {
          damageEntity(w, e, 9);
        }
      }
      damagePropsInRadius(w, pr.pos.x, pr.pos.y, r, 14, { abilityKind: "aoe_target", abilityKey: pr.sourceAbilityKey, standId: pr.sourceStandId ?? w.standId });
      w.zones.push({
        id: w.nextId++,
        pos: { ...pr.pos },
        radius: r,
        damagePerTick: 0,
        tickEvery: 999,
        nextTickAt: 999,
        expireAt: w.time + 0.35,
        color: pr.detonateColor || "#fff",
        ringColor: pr.detonateColor || "#fff",
      });
      spawnParticles(w, pr.pos, pr.detonateColor || "#fff", 14, { speedMin: 60, speedMax: 180, life: 0.5, gravity: 60 });
      spawnVfx(w, { kind: "explosion_ring", pos: { ...pr.pos }, radius: r, color: pr.detonateColor || "#fff", life: 0.45 });
      spawnVfx(w, { kind: "fire_burst", pos: { ...pr.pos }, radius: r * 0.8, color: pr.detonateColor || "#ff8a3a", life: 0.5 });
      play("bomber");
      w.shake = Math.max(w.shake, 5);
      pr.expireAt = 0; // mark for removal
    }
  }
  // Projectile collision (non-lobbed)
  for (const pr of w.projectiles) {
    if (pr.lobbed) continue;
    if (pr.pos.x < 0 || pr.pos.x > MAP_W || pr.pos.y < 0 || pr.pos.y > MAP_H) { pr.expireAt = 0; continue; }
    // hit props?
    for (const p of w.props) {
      if (propSolid(p) && circleRectOverlap(pr.pos.x, pr.pos.y, pr.radius, p.rect)) { damageProp(w, p, pr.damage, { abilityKind: "projectile", abilityKey: pr.sourceAbilityKey, standId: pr.sourceStandId ?? w.standId }); pr.expireAt = 0; spawnParticles(w, pr.pos, pr.color, 4); break; }
    }
    if (pr.expireAt === 0) continue;
    // hit player (Moon Rabbit Crash bike loops back / clips player)
    if (pr.hurtsPlayer && w.player.alive && !pr.hitSet.has(-1)) {
      if (dist2(w.player.pos, pr.pos) < (pr.radius + w.player.radius) ** 2) {
        damageEntity(w, w.player, 3);
        pr.hitSet.add(-1);
        pr.expireAt = 0;
        spawnVfx(w, { kind: "explosion_ring", pos: { ...pr.pos }, radius: 28, color: "#ff6b3a", life: 0.4 });
        continue;
      }
    }
    // hit npcs
    for (const e of w.npcs) {
      if (!e.alive || pr.hitSet.has(e.id)) continue;
      if (dist2(e.pos, pr.pos) < (pr.radius + e.radius) ** 2) {
        damageEntity(w, e, pr.damage);
        pr.hitSet.add(e.id);
        // Apply bleed if projectile carries it (Echoes Sent Bleed).
        if (pr.applyBleed) {
          e.bleedUntil = Math.max(e.bleedUntil ?? 0, w.time + pr.applyBleed.durationSeconds);
          e.bleedNextTickAt = w.time + 0.5;
        }
        // Apply poison if projectile carries it (Purple Haze Capsule Shot — explodes into gas).
        if (pr.applyPoison) {
          e.poisonUntil = Math.max(e.poisonUntil ?? 0, w.time + pr.applyPoison.durationSeconds);
          e.poisonNextTickAt = w.time + 0.5;
          e.poisonDps = pr.applyPoison.dps;
          // Spawn lingering poison cloud zone at hit point.
          w.zones.push({
            id: w.nextId++,
            pos: { ...pr.pos },
            radius: 28,
            damagePerTick: 0.6,
            tickEvery: 0.5,
            nextTickAt: w.time + 0.5,
            expireAt: w.time + pr.applyPoison.durationSeconds,
            color: "#a06bff",
            ringColor: "#a06bff",
          });
          spawnVfx(w, { kind: "poison_cloud", pos: { ...pr.pos }, radius: 30, color: "#a06bff", life: pr.applyPoison.durationSeconds });
        }
        if (!pr.pierce) { pr.expireAt = 0; break; }
      }
    }
  }
  w.projectiles = w.projectiles.filter((p) => w.time < p.expireAt);

  // Zones
  for (const z of w.zones) {
    if (z.damagePerTick > 0) {
      while (w.time >= z.nextTickAt && w.time < z.expireAt) {
        let hitAny = false;
        for (const e of w.npcs) {
          if (!e.alive) continue;
          if (dist2(e.pos, z.pos) < (z.radius + e.radius) ** 2) {
            damageEntity(w, e, z.damagePerTick);
            hitAny = true;
          }
        }
        // arc lightning visual for tesla-style zones
        if (hitAny) {
          for (const e of w.npcs) {
            if (!e.alive) continue;
            if (dist2(e.pos, z.pos) < (z.radius + e.radius) ** 2) {
              spawnVfx(w, { kind: "lightning_bolt", pos: { ...z.pos }, to: { ...e.pos }, color: z.color, life: 0.18 });
            }
          }
          play("tesla");
        }
        z.nextTickAt += z.tickEvery;
      }
    }
  }
  w.zones = w.zones.filter((z) => w.time < z.expireAt);

  // Status DOTs (bleed, poison, pressure) — ticked per-NPC.
  for (const e of w.npcs) {
    if (!e.alive) continue;
    if (e.bleedUntil && w.time < e.bleedUntil) {
      if (!e.bleedNextTickAt || w.time >= e.bleedNextTickAt) {
        damageEntity(w, e, 0.6);
        spawnParticles(w, e.pos, "#c4202d", 3, { gravity: 60, speedMin: 10, speedMax: 30, life: 0.4 });
        e.bleedNextTickAt = w.time + 0.5;
      }
    }
    if (e.poisonUntil && w.time < e.poisonUntil) {
      if (!e.poisonNextTickAt || w.time >= e.poisonNextTickAt) {
        damageEntity(w, e, e.poisonDps ?? 1.2);
        spawnParticles(w, e.pos, "#a06bff", 3, { gravity: -10, speedMin: 8, speedMax: 24, life: 0.5 });
        e.poisonNextTickAt = w.time + 0.5;
      }
    }
    if (e.pressuredUntil && w.time < e.pressuredUntil) {
      // Slow + can't act: extend stun window briefly so they can't attack.
      e.stunUntil = Math.max(e.stunUntil, w.time + 0.15);
    }
  }
  // Player poison from Gas Release self-effect.
  if (w.player.poisonUntil && w.time < w.player.poisonUntil) {
    if (!w.player.poisonNextTickAt || w.time >= w.player.poisonNextTickAt) {
      damageEntity(w, w.player, w.player.poisonDps ?? 0.6);
      w.player.poisonNextTickAt = w.time + 0.6;
    }
  }
  // Tree of Life: heal player inside an active tree, root enemies inside dome,
  // and remove expired trees from the world (so the visuals + dome despawn cleanly).
  if (w.standId === "gold_experience" && w.player.alive) {
    for (const t of w.trees) {
      if (w.time < t.expireAt && dist2(w.player.pos, t.pos) < t.radius * t.radius) {
        w.player.hp = Math.min(w.player.maxHp, w.player.hp + 6 * dt);
        break;
      }
    }
  }
  // Apply root/slow to NPCs inside any active tree dome (re-applied each tick).
  for (const t of w.trees) {
    if (w.time >= t.expireAt) continue;
    for (const e of w.npcs) {
      if (!e.alive) continue;
      if (dist2(e.pos, t.pos) < t.radius * t.radius) {
        e.rootedUntil = Math.max(e.rootedUntil ?? 0, w.time + 0.4);
        e.slowUntil = Math.max(e.slowUntil ?? 0, w.time + 0.4);
        // Occasional root sprout VFX
        if (!t.rooted.has(e.id) || w.time > (t.rooted.get(e.id) ?? 0)) {
          spawnParticles(w, e.pos, "#5a3a1c", 3, { gravity: 60, life: 0.5, speedMin: 20, speedMax: 60, shape: "square" });
          t.rooted.set(e.id, w.time + 0.6);
        }
      }
    }
  }
  // Despawn expired trees (fixes the bug where trees never disappeared).
  if (w.trees.length) w.trees = w.trees.filter((t) => w.time < t.expireAt);

  // Frogs follow the player in stable orbit slots (no jitter / stacking).
  const aliveFrogsList = w.frogs.filter((f) => f.alive);
  for (let i = 0; i < aliveFrogsList.length; i++) {
    const f = aliveFrogsList[i];
    const slot = (i / Math.max(1, aliveFrogsList.length)) * Math.PI * 2;
    const orbit = 22;
    const tx = w.player.pos.x + Math.cos(slot + w.time * 0.6) * orbit;
    const ty = w.player.pos.y + Math.sin(slot + w.time * 0.6) * orbit;
    const dx = tx - f.pos.x, dy = ty - f.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const sp = Math.min(d * 6, 140);
      f.pos.x += (dx / d) * sp * dt;
      f.pos.y += (dy / d) * sp * dt;
    }
    f.bobPhase += dt * 4;
  }
  // Clean dead frogs from list periodically.
  if (w.frogs.some((f) => !f.alive)) w.frogs = w.frogs.filter((f) => f.alive);

  // Purple Haze pilot movement (mirrors Hanged Man pilot behavior, slower).
  if (w.standId === "purple_haze" && w.purpleHazeActive) {
    const j = input.joy;
    const len = Math.hypot(j.x, j.y);
    if (len > 0.05) {
      const nx = j.x / Math.max(1, len), ny = j.y / Math.max(1, len);
      const sp = PLAYER_SPEED * 0.75 * Math.min(1, len);
      const e: Entity = { ...w.player, pos: w.purpleHaze.pos, radius: 9 };
      tryMove(e, nx * sp * dt, ny * sp * dt, w.props);
      w.purpleHaze.pos.x = e.pos.x; w.purpleHaze.pos.y = e.pos.y;
      w.purpleHaze.facing = { x: nx, y: ny };
    }
    w.purpleHaze.pos.x = Math.max(10, Math.min(MAP_W - 10, w.purpleHaze.pos.x));
    w.purpleHaze.pos.y = Math.max(10, Math.min(MAP_H - 10, w.purpleHaze.pos.y));
    pushOutOfNpcs(w, w.purpleHaze.pos, 9);
    const dpx = w.purpleHaze.pos.x - w.player.pos.x, dpy = w.purpleHaze.pos.y - w.player.pos.y;
    const td = Math.hypot(dpx, dpy);
    if (td > STAND_TETHER) {
      const k = STAND_TETHER / td;
      w.purpleHaze.pos.x = w.player.pos.x + dpx * k;
      w.purpleHaze.pos.y = w.player.pos.y + dpy * k;
    }
  }
  for (const dn of w.damageNumbers) dn.pos.y += dn.vy * dt;
  w.damageNumbers = w.damageNumbers.filter((d) => w.time < d.expireAt);

  // Particles
  for (const pa of w.particles) {
    pa.pos.x += pa.vel.x * dt;
    pa.pos.y += pa.vel.y * dt;
    pa.vel.x *= 0.9; pa.vel.y *= 0.9;
    if (pa.gravity) pa.vel.y += pa.gravity * dt;
  }
  w.particles = w.particles.filter((p) => w.time < p.expireAt);

  // VFX expire
  w.vfx = w.vfx.filter((v) => w.time < v.expireAt);

  // Craters expire
  w.craters = w.craters.filter((c) => w.time < c.expireAt);


  // Item spawns
  w.nextArrowAt -= dt;
  if (w.nextArrowAt <= 0) {
    trySpawnItem(w, "arrow");
    // Rare side-loot: every ~6th arrow tick has a chance to drop a Requiem Arrow or Blue Pebble instead.
    if (Math.random() < 0.18) {
      trySpawnItem(w, Math.random() < 0.55 ? "blue_pebble" : "requiem_arrow");
    }
    w.nextArrowAt = rand(ARROW_INTERVAL[0], ARROW_INTERVAL[1]);
  }
  w.nextDiscAt -= dt;
  if (w.nextDiscAt <= 0) {
    trySpawnItem(w, "disc");
    w.nextDiscAt = rand(DISC_INTERVAL[0], DISC_INTERVAL[1]);
  }

  // Single-toast lifecycle (separate from stacked banners).
  if (w.toastText && w.time >= w.toastUntil) w.toastText = null;

  // Moon Rabbit: tick wasp swarms — sting their target every `tickEvery` and despawn on expiry/death.
  if (w.swarms.length) {
    const remain: typeof w.swarms = [];
    for (const s of w.swarms) {
      if (w.time >= s.expireAt) continue;
      const t = w.npcs.find((e) => e.id === s.targetId);
      if (!t || !t.alive) continue;
      if (w.time >= s.nextStingAt) {
        damageEntity(w, t, s.damage);
        spawnVfx(w, { kind: "explosion_ring", pos: { ...t.pos }, radius: s.range, color: "#ffd24a", life: 0.3 });
        spawnParticles(w, t.pos, "#ffd24a", 10, { speedMin: 30, speedMax: 100, life: 0.4 });
        s.nextStingAt = w.time + s.tickEvery;
      }
      remain.push(s);
    }
    w.swarms = remain;
  }

  // Moon Rabbit Eternal Curse: drain deferred lightning strikes.
  if (w.curseStrikes.length) {
    const remainCurse: typeof w.curseStrikes = [];
    for (const c of w.curseStrikes) {
      if (w.time < c.hitAt) { remainCurse.push(c); continue; }
      const t = w.npcs.find((e) => e.id === c.targetId);
      if (!t || !t.alive) continue;
      // Bolt FROM ABOVE (not from the player).
      const skyAbove = { x: t.pos.x, y: t.pos.y - 220 };
      spawnVfx(w, { kind: "lightning_bolt", pos: skyAbove, to: { ...t.pos }, color: c.color, life: 0.35 });
      spawnVfx(w, { kind: "explosion_ring", pos: { ...t.pos }, radius: 18, color: c.color, life: 0.4 });
      spawnParticles(w, t.pos, c.color, 12, { speedMin: 60, speedMax: 200, life: 0.5 });
      damageEntity(w, t, c.dmg);
      w.shake = Math.max(w.shake, 4);
    }
    w.curseStrikes = remainCurse;
  }

  // ---------- Harvest beetles ----------
  // Spawn / despawn the swarm to match equipped state. Idle beetles orbit the
  // player; with Gather ON they pursue items and ferry them back; with Carry
  // ON they cluster low under the player as a "platform" of legs.
  {
    const HARVEST_BEETLE_COUNT = 14;
    const GATHER_RANGE = 220;
    const HOME_RADIUS = 14;
    const beetleSpeed = 180;
    if (w.standId === "harvest" && w.standActive) {
      // Lazy spawn
      while (w.harvestBeetles.length < HARVEST_BEETLE_COUNT) {
        w.harvestBeetles.push({
          id: w.nextId++,
          pos: { x: w.player.pos.x + (Math.random() - 0.5) * 20, y: w.player.pos.y + (Math.random() - 0.5) * 20 },
          vel: { x: 0, y: 0 },
          state: "orbit",
          phase: Math.random() * Math.PI * 2,
        });
      }
    } else if (w.harvestBeetles.length) {
      w.harvestBeetles = [];
    }

    if (w.harvestBeetles.length) {
      // Build set of items already targeted so beetles don't all chase the same one.
      const claimed = new Set<number>();
      for (const b of w.harvestBeetles) if (b.targetItemId != null) claimed.add(b.targetItemId);

      for (const b of w.harvestBeetles) {
        b.phase += dt * 4;
        const goHome = (target: Vec2, sp: number) => {
          const dx = target.x - b.pos.x, dy = target.y - b.pos.y;
          const d = Math.hypot(dx, dy) || 1;
          b.vel.x = (dx / d) * sp;
          b.vel.y = (dy / d) * sp;
          b.pos.x += b.vel.x * dt;
          b.pos.y += b.vel.y * dt;
          return d;
        };

        // Gather mode: idle orbiting beetles look for an unclaimed item to fetch.
        if (w.harvestGatherActive && b.state === "orbit") {
          let best: ItemPickup | null = null;
          let bestD = GATHER_RANGE * GATHER_RANGE;
          for (const it of w.items) {
            if (claimed.has(it.id)) continue;
            const d = dist2(it.pos, w.player.pos);
            if (d < bestD) { bestD = d; best = it; }
          }
          if (best) {
            b.state = "seek";
            b.targetItemId = best.id;
            claimed.add(best.id);
          }
        }

        if (b.state === "seek" && b.targetItemId != null) {
          const it = w.items.find((x) => x.id === b.targetItemId);
          if (!it) {
            b.state = "orbit"; b.targetItemId = undefined;
          } else {
            const d = goHome(it.pos, beetleSpeed);
            if (d < 8) {
              // Pick up the item: remove from world, beetle now carries it home.
              w.items = w.items.filter((x) => x.id !== it.id);
              b.state = "return";
              b.carryingKind = it.kind;
              b.targetItemId = undefined;
            }
          }
        } else if (b.state === "return") {
          const d = goHome(w.player.pos, beetleSpeed);
          if (d < HOME_RADIUS) {
            // Drop the item AT the player as a fresh pickup so existing pickup logic
            // handles inventory increment & sound.
            if (b.carryingKind) {
              w.items.push({
                id: w.nextId++,
                kind: b.carryingKind,
                pos: { x: w.player.pos.x, y: w.player.pos.y },
                bornAt: w.time,
              });
              spawnVfx(w, { kind: "shockwave", pos: { ...w.player.pos }, radius: 14, color: "#ffd24a", life: 0.25 });
            }
            b.carryingKind = undefined;
            b.state = "orbit";
          }
        } else {
          // Orbit: low buzzing cloud around the player. Carry mode tightens the cloud beneath them.
          const radius = w.harvestCarryActive ? 10 : 22;
          const yOffset = w.harvestCarryActive ? 8 : 0;
          const tx = w.player.pos.x + Math.cos(b.phase) * radius;
          const ty = w.player.pos.y + yOffset + Math.sin(b.phase * 1.3) * (radius * 0.4);
          goHome({ x: tx, y: ty }, beetleSpeed * 0.9);
        }
      }
    }
  }

  // Mirror current bannerText into the stacked banners queue (so multiple notifs can show at once).
  if (w.bannerText) {
    const last = w.banners[w.banners.length - 1];
    if (!last || last.text !== w.bannerText || last.expireAt < w.time) {
      w.banners.push({ id: w.nextId++, text: w.bannerText, color: null, expireAt: w.bannerUntil });
    } else {
      // refresh expiry if same text re-asserted
      last.expireAt = Math.max(last.expireAt, w.bannerUntil);
    }
  }
  if (w.bannerText && w.time >= w.bannerUntil) w.bannerText = null;
  // Sweep expired stacked banners.
  if (w.banners.length) w.banners = w.banners.filter((b) => w.time < b.expireAt);

  // Shake decays
  w.shake *= 0.85;

  // White Album: bar drain/refill + ice trail + NPC slow on ice.
  // Two states: Suit On (drain) and Suit Off (forced lockout while bar refills) — no "regular stand" mode.
  if (w.standId === "white_album") {
    if (w.whiteAlbumActive) {
      // Slow passive drain so the bar lasts ~50s base before any moves are used.
      w.whiteAlbumBar = Math.max(0, w.whiteAlbumBar - 2 * dt);
      if (w.whiteAlbumBar <= 0) {
        w.whiteAlbumActive = false;
        w.standActive = false;
        w.whiteAlbumLockUntil = w.time + 8;
        w.bannerText = "Suit overheated"; w.bannerUntil = w.time + 1.4;
      }
      // Spawn ice tile every ~0.15s while moving.
      if (pl.alive && w.lastJoyMag > 0.1 && (!w.icePath.length || w.time - w.icePath[w.icePath.length - 1].bornAt > 0.15)) {
        w.icePath.push({ pos: { x: pl.pos.x, y: pl.pos.y + 6 }, bornAt: w.time, expireAt: w.time + 4 });
      }
    } else {
      // Suit off: refill the bar. Player must MANUALLY tap Stand to re-equip.
      w.whiteAlbumBar = Math.min(100, w.whiteAlbumBar + 6 * dt);
      if (w.whiteAlbumBar >= 100 && w.time >= w.whiteAlbumLockUntil &&
          (w.bannerSuppressCounts["wa_ready"] ?? 0) < 1) {
        softBanner(w, "wa_ready", "Suit ready — tap Stand to wear", 1.4);
      }
    }
    // Slow NPCs on ice.
    if (w.icePath.length) {
      for (const tile of w.icePath) {
        for (const e of w.npcs) {
          if (!e.alive) continue;
          if (dist2(e.pos, tile.pos) < 16 * 16) e.slowUntil = Math.max(e.slowUntil ?? 0, w.time + 0.5);
        }
      }
      w.icePath = w.icePath.filter((t) => w.time < t.expireAt);
    }
  } else if (w.icePath.length) {
    w.icePath = [];
  }


  // Camera — focus on the active stand body (puppet/Hanged Man) when present, else the player.
  const camFocus =
    w.standId === "ebony_devil" && w.puppet.active ? w.puppet.pos :
    w.standId === "hanged_man" && w.hangedManActive ? w.hangedMan.pos :
    w.standId === "purple_haze" && w.purpleHazeActive ? w.purpleHaze.pos :
    pl.pos;
  const viewW = VW / CAMERA_ZOOM;
  const viewH = VH / CAMERA_ZOOM;
  const camTargetX = Math.max(viewW / 2, Math.min(MAP_W - viewW / 2, camFocus.x));
  const camTargetY = Math.max(viewH / 2, Math.min(MAP_H - viewH / 2, camFocus.y));
  w.cam.x += (camTargetX - w.cam.x) * Math.min(1, dt * 6);
  w.cam.y += (camTargetY - w.cam.y) * Math.min(1, dt * 6);
}

// Show one toast at a time. Newer toasts replace older ones rather than stacking.
function showToast(w: World, text: string, seconds = 1.6) {
  w.toastText = text;
  w.toastUntil = w.time + seconds;
}

// API for UI side
export function tryPickupItems(w: World): { arrows: number; discs: number } {
  let a = 0, d = 0;
  const remain: ItemPickup[] = [];
  for (const it of w.items) {
    if (dist2(it.pos, w.player.pos) < (PICKUP_RADIUS + w.player.radius) ** 2) {
      if (it.kind === "arrow") { a++; play("pickupArrow"); showToast(w, "Picked up Arrow"); }
      else if (it.kind === "disc") { d++; play("pickupDisc"); showToast(w, "Picked up DISC"); }
      else if (it.kind === "requiem_arrow") { w.requiemArrowCount++; play("pickupArrow"); showToast(w, "Picked up Requiem Arrow"); }
      else if (it.kind === "blue_pebble") { w.bluePebbleCount++; play("pickupArrow"); showToast(w, "Picked up Blue Pebble"); }
      else if (it.kind === "strange_hat") { w.strangeHatCount++; play("pickupArrow"); showToast(w, "Picked up Strange Black Hat"); }
    } else remain.push(it);
  }
  w.items = remain;
  return { arrows: a, discs: d };
}

// Boingo interaction: grants one Tonth Copy and despawns Boingo permanently.
export function talkToBoingo(w: World): { tonthGranted: boolean } {
  if (!w.boingo.alive) return { tonthGranted: false };
  w.tonthCopyCount++;
  w.boingo.alive = false;
  w.boingo.fadeUntil = w.time + 1.0;
  showToast(w, "Received Tonth Copy");
  return { tonthGranted: true };
}

function resetStandRuntime(w: World) {
  // Clear ability state that can leak when switching/dropping a stand mid-cast.
  w.cdTimers = { m1: 0, a1: 0, a2: 0, a3: 0, a4: 0 };
  w.channel = null;
  w.standPunchUntil = 0;
  w.standAimUntil = 0;
  w.standAimTarget = null;
  w.puppet.active = false;
  w.puppet.hp = w.puppet.maxHp;
  w.standActive = true;
  w.echoesAct = 1;
  w.timeStopUntil = 0;
  w.pendingPlayerDamage = [];
  w.pilotActive = false;
  w.puppetPiloted = false;
  w.hangedManActive = false;
  w.shards = [];
  w.shardPickerOpen = false;
  // Clear Gold Experience runtime (frogs, trees, hologram tracking).
  w.frogs = [];
  w.trees = [];
  w.hologramHits = [];
  for (const e of w.npcs) {
    e.hologramUntil = 0;
    e.rootedUntil = 0;
  }
  // Drop any in-flight player projectiles so a stand swap doesn't leak homing locks.
  w.projectiles = [];
  // Harvest cleanup
  w.harvestGatherActive = false;
  w.harvestCarryActive = false;
  w.harvestBeetles = [];
}

export function useArrow(w: World): boolean {
  if (w.standId !== "none") {
    showToast(w, "Use a DISC to drop your stand first");
    return false;
  }
  const { id, shitVariant } = rollStand();
  resetStandRuntime(w);
  w.standId = id;
  w.shitVariant = shitVariant;
  w.standActive = false;
  if (id === "white_album") (w as any).whiteAlbumActive = false;
  const name = STANDS[id].name + (shitVariant ? " (S.H.I.T.!)" : "");
  w.bannerText = "Got Stand: " + name + " — tap Stand to summon";
  w.bannerUntil = w.time + 3;
  play("rollStand");
  // First time the player rolls Star Platinum, spawn a Strange Black Hat near a house.
  maybeSpawnStrangeHat(w);
  return true;
}

function maybeSpawnStrangeHat(w: World) {
  if (w.standId !== "star_platinum") return;
  if (w.sptwUnlocked) return;
  if (w.strangeHatSpawned) return;
  // Pick a random house and drop the hat just outside it.
  const houses = w.props.filter((p) => p.rect.w === 110 && p.rect.h === 84);
  if (houses.length === 0) return;
  const house = houses[Math.floor(Math.random() * houses.length)];
  const hx = house.rect.x + house.rect.w / 2;
  const hy = house.rect.y + house.rect.h + 20;
  w.items.push({ id: w.nextId++, kind: "strange_hat", pos: { x: hx, y: Math.min(MAP_H - 30, hy) }, bornAt: w.time });
  w.strangeHatSpawned = true;
  showToast(w, "A strange hat has appeared near a house...");
}

export function useStrangeHat(w: World): boolean {
  if (w.strangeHatCount <= 0) return false;
  if (w.standId !== "star_platinum") {
    showToast(w, "Need Star Platinum equipped");
    return false;
  }
  w.strangeHatCount--;
  resetStandRuntime(w);
  w.standId = "sptw";
  w.shitVariant = false;
  w.standActive = false;
  w.sptwUnlocked = true;
  w.sptwRage = 0;
  w.bannerText = "Star Platinum: THE WORLD";
  w.bannerUntil = w.time + 3;
  play("rollStand");
  return true;
}

export function useDisc(w: World) {
  if (w.standId === "none") return;
  resetStandRuntime(w);
  w.standId = "none";
  w.shitVariant = false;
  w.bannerText = "Stand discarded";
  w.bannerUntil = w.time + 1.5;
  play("pickupDisc");
}

// Requiem Arrow: decorative-only (kept for back-compat; UI no longer offers a use button).
export function useRequiemArrow(w: World): boolean {
  if (w.standId !== "none") {
    showToast(w, "Use a DISC to drop your stand first");
    return false;
  }
  if (w.requiemArrowCount <= 0) return false;
  w.requiemArrowCount--;
  const { id, shitVariant } = rollStand();
  resetStandRuntime(w);
  w.standId = id;
  w.shitVariant = shitVariant;
  w.standActive = false;
  if (id === "white_album") (w as any).whiteAlbumActive = false;
  const name = STANDS[id].name + (shitVariant ? " (S.H.I.T.!)" : "");
  showToast(w, "Requiem Arrow → " + name);
  play("rollStand");
  return true;
}

// Blue Pebble: grants Moon Rabbit as the active stand.
export function useBluePebble(w: World): boolean {
  if (w.standId !== "none") {
    showToast(w, "Use a DISC to drop your stand first");
    return false;
  }
  if (w.bluePebbleCount <= 0) return false;
  w.bluePebbleCount--;
  resetStandRuntime(w);
  w.standId = "moon_rabbit";
  w.shitVariant = false;
  w.standActive = false;
  showToast(w, "Got Stand: Moon Rabbit — tap Stand to summon");
  play("rollStand");
  return true;
}

// Tonth Copy: opens Boingo's book without him present (handled in UI).
export function useTonthCopy(w: World): boolean {
  return w.tonthCopyCount > 0;
}

export function getUIState(w: World): UIState {
  return {
    standId: w.standId,
    shitVariant: w.shitVariant,
    arrows: 0, // tracked externally
    discs: 0,
    hp: Math.max(0, w.player.hp),
    maxHp: w.player.maxHp,
    cooldowns: { ...w.cdTimers },
    banner: w.bannerText,
    bannerUntil: w.bannerUntil,
  };
}

// ---------- render ----------
export function render(ctx: CanvasRenderingContext2D, w: World) {
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, VW, VH);

  // Camera with shake
  const sx = (Math.random() - 0.5) * w.shake;
  const sy = (Math.random() - 0.5) * w.shake;
  const viewW = VW / CAMERA_ZOOM;
  const viewH = VH / CAMERA_ZOOM;
  const clampedCamX = Math.max(viewW / 2, Math.min(MAP_W - viewW / 2, w.cam.x));
  const clampedCamY = Math.max(viewH / 2, Math.min(MAP_H - viewH / 2, w.cam.y));
  const camX = clampedCamX - viewW / 2 + sx;
  const camY = clampedCamY - viewH / 2 + sy;
  ctx.save();
  ctx.scale(CAMERA_ZOOM, CAMERA_ZOOM);
  ctx.translate(-Math.round(camX), -Math.round(camY));

  // Grass background — tiled checker
  const tile = 32;
  const x0 = Math.floor(camX / tile) * tile;
  const y0 = Math.floor(camY / tile) * tile;
  for (let y = y0; y < camY + viewH + tile; y += tile) {
    for (let x = x0; x < camX + viewW + tile; x += tile) {
      const dark = ((x / tile + y / tile) & 1) === 0;
      ctx.fillStyle = dark ? "#3e8a3a" : "#4aa044";
      ctx.fillRect(x, y, tile, tile);
    }
  }
  // map edges
  ctx.fillStyle = "#22421f";
  ctx.fillRect(-20, -20, MAP_W + 40, 20);
  ctx.fillRect(-20, MAP_H, MAP_W + 40, 20);
  ctx.fillRect(-20, -20, 20, MAP_H + 40);
  ctx.fillRect(MAP_W, -20, 20, MAP_H + 40);

  // Craters (under everything else but above grass)
  for (const c of w.craters) {
    const a = Math.min(1, (w.time - c.bornAt) / 0.2);
    ctx.fillStyle = `rgba(28, 22, 18, ${0.55 * a})`;
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(80, 50, 30, ${0.5 * a})`;
    ctx.beginPath();
    ctx.arc(c.pos.x - 2, c.pos.y - 2, c.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ice trail (ground layer, behind entities) — White Album passive
  if (w.icePath.length) {
    for (const tile of w.icePath) {
      const age = w.time - tile.bornAt;
      const a = Math.max(0, 1 - age / 4);
      ctx.fillStyle = `rgba(190,235,255,${0.5 * a})`;
      ctx.beginPath(); ctx.ellipse(tile.pos.x, tile.pos.y, 13, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.4 * a})`;
      ctx.beginPath(); ctx.ellipse(tile.pos.x, tile.pos.y, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Items
  for (const it of w.items) {
    const bob = Math.sin((w.time - it.bornAt) * 4) * 2;
    const cx = it.pos.x, cy = it.pos.y + bob;
    const SC = 0.7; // smaller items
    // soft drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(it.pos.x, it.pos.y + 6, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    if (it.kind === "arrow" || it.kind === "requiem_arrow") {
      const isRequiem = it.kind === "requiem_arrow";
      // Faint glow halo for Requiem variant.
      if (isRequiem) {
        const pulse = 0.35 + 0.25 * Math.sin(w.time * 6);
        const grd = ctx.createRadialGradient(cx, cy, 1, cx, cy, 14);
        grd.addColorStop(0, `rgba(255,90,200,${0.55 * pulse})`);
        grd.addColorStop(1, "rgba(255,90,200,0)");
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(SC, SC);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = "#3a2418";
      ctx.fillRect(-8, -1, 13, 2);
      ctx.fillStyle = isRequiem ? "#ff5ac8" : "#caa14a";
      ctx.beginPath();
      ctx.moveTo(5, -5); ctx.lineTo(10, 0); ctx.lineTo(5, 5); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = isRequiem ? "#ffaee2" : "#e8c870";
      ctx.beginPath();
      ctx.moveTo(6, -2); ctx.lineTo(9, 0); ctx.lineTo(6, 2); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = isRequiem ? "#ff5ac8" : "#caa14a";
      ctx.fillRect(-10, -3, 3, 6);
      ctx.fillStyle = "#5a3a1c";
      ctx.fillRect(-10, -1, 3, 2);
      ctx.restore();
    } else if (it.kind === "blue_pebble") {
      // Glowing blue stone — unlocks Moon Rabbit when consumed.
      const pulse = 0.4 + 0.4 * Math.sin(w.time * 5);
      ctx.fillStyle = `rgba(80,160,255,${0.5 * pulse})`;
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(SC, SC);
      const grd = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7);
      grd.addColorStop(0, "#bce0ff");
      grd.addColorStop(0.55, "#4a86d6");
      grd.addColorStop(1, "#1a3a78");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(-1.5, -1.5, 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (it.kind === "strange_hat") {
      // Strange Black Hat — bowler-ish silhouette with cyan glow.
      const pulse = 0.4 + 0.4 * Math.sin(w.time * 4);
      ctx.fillStyle = `rgba(95,232,255,${0.45 * pulse})`;
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(cx - 7, cy + 1, 14, 2);   // brim
      ctx.fillRect(cx - 4, cy - 5, 8, 6);    // crown
      ctx.fillStyle = "#5fe8ff";
      ctx.fillRect(cx - 4, cy, 8, 1);        // band
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(SC, SC);
      const grd = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
      grd.addColorStop(0, "#f5f5f8");
      grd.addColorStop(0.55, "#a8acb4");
      grd.addColorStop(1, "#5e636c");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(40,40,46,0.5)";
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#3e8a3a";
      ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1a1f";
      ctx.font = "bold 4px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DISC", 0, -5);
      ctx.restore();
    }
  }

  // Sort props + entities by Y for proper overlap
  type Drawable = { y: number; draw: () => void };
  const drawables: Drawable[] = [];
  for (const p of w.props) {
    if (!propSolid(p)) continue;
    drawables.push({ y: p.rect.y + p.rect.h, draw: () => {
      p.draw(ctx, p.rect);
      // damage cracks overlay when below 50% hp
      if (p.maxHp && p.hp !== undefined && p.hp < p.maxHp * 0.5) {
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.rect.x + 2, p.rect.y + p.rect.h * 0.3);
        ctx.lineTo(p.rect.x + p.rect.w - 4, p.rect.y + p.rect.h * 0.65);
        ctx.moveTo(p.rect.x + p.rect.w * 0.6, p.rect.y + 2);
        ctx.lineTo(p.rect.x + p.rect.w * 0.3, p.rect.y + p.rect.h - 2);
        ctx.stroke();
      }
      if (p.hitFlashUntil && w.time < p.hitFlashUntil) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(p.rect.x, p.rect.y, p.rect.w, p.rect.h);
      }
    }});
  }
  // player
  const pl = w.player;
  if (pl.alive) drawables.push({ y: pl.pos.y, draw: () => drawPlayer(ctx, w) });
  for (const e of w.npcs) {
    if (e.alive) drawables.push({ y: e.pos.y, draw: () => drawNpc(ctx, w, e) });
  }
  if (w.puppet.active) drawables.push({ y: w.puppet.pos.y, draw: () => drawPuppet(ctx, w) });
  if (w.hangedManActive) drawables.push({ y: w.hangedMan.pos.y, draw: () => drawHangedMan(ctx, w) });
  if (w.boingo.alive || w.time < w.boingo.fadeUntil) {
    drawables.push({ y: w.boingo.pos.y, draw: () => drawBoingo(ctx, w) });
  }
  // Trees (drawn as ground-anchored zones — sort by their root Y)
  for (const t of w.trees) {
    drawables.push({ y: t.pos.y - 4, draw: () => drawProtectionTree(ctx, w, t) });
  }
  // Frogs
  for (const f of w.frogs) {
    if (f.alive) drawables.push({ y: f.pos.y, draw: () => drawFrog(ctx, w, f) });
  }
  // Harvest beetles — each gets its own y so it sorts naturally with everything else.
  for (const b of w.harvestBeetles) {
    drawables.push({ y: b.pos.y, draw: () => {
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.ellipse(b.pos.x, b.pos.y + 2, 2.5, 1, 0, 0, Math.PI * 2); ctx.fill();
      // body
      ctx.fillStyle = "#ffd24a";
      ctx.fillRect(b.pos.x - 2, b.pos.y - 1, 4, 3);
      // head dot
      ctx.fillStyle = "#caa14a";
      ctx.fillRect(b.pos.x - 2, b.pos.y - 2, 4, 1);
      // tiny legs flicker
      ctx.fillStyle = "#222";
      const legPhase = Math.sin(b.phase * 6) > 0 ? 1 : 0;
      ctx.fillRect(b.pos.x - 3, b.pos.y + legPhase, 1, 1);
      ctx.fillRect(b.pos.x + 2, b.pos.y + (1 - legPhase), 1, 1);
      // carrying icon
      if (b.carryingKind) {
        const c =
          b.carryingKind === "arrow" ? "#caa14a" :
          b.carryingKind === "disc" ? "#cfd2d8" :
          b.carryingKind === "requiem_arrow" ? "#ffd24a" : "#4a86d6";
        ctx.fillStyle = c;
        ctx.fillRect(b.pos.x - 1, b.pos.y - 5, 2, 2);
      }
    }});
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // Moon Rabbit: wasp swirl around each swarmed target.
  for (const s of w.swarms) {
    const t = w.npcs.find((e) => e.id === s.targetId);
    if (!t || !t.alive) continue;
    const baseAngle = w.time * 4;
    for (let i = 0; i < 6; i++) {
      const ang = baseAngle + (i * Math.PI * 2) / 6;
      const r = 12 + Math.sin(w.time * 8 + i) * 3;
      const wx = t.pos.x + Math.cos(ang) * r;
      const wy = t.pos.y + Math.sin(ang) * r - 2;
      ctx.fillStyle = "#1a1a14";
      ctx.fillRect(wx - 1.5, wy - 1, 3, 2);
      ctx.fillStyle = "#ffd24a";
      ctx.fillRect(wx - 1.5, wy - 1, 3, 1);
      // wing flicker
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(wx - 2, wy - 2, 1, 1);
      ctx.fillRect(wx + 1, wy - 2, 1, 1);
    }
  }

  // Channel cone visual (above entities)
  if (w.channel) {
    const c = w.channel;
    const tx = w.player.pos.x + c.dir.x * c.range;
    const ty = w.player.pos.y + c.dir.y * c.range;
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.arc(tx, ty, c.radius, 0, Math.PI * 2); ctx.fill();
    // dashes between
    for (let s = 0; s < 6; s++) {
      const f = (s + (w.time * 6) % 1) / 6;
      const x = w.player.pos.x + c.dir.x * c.range * f;
      const y = w.player.pos.y + c.dir.y * c.range * f;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Projectiles
  for (const pr of w.projectiles) {
    if (pr.textGlyph === "GE_EAGLE") {
      // Custom golden eagle silhouette flying along velocity direction.
      const ang = Math.atan2(pr.vel.y, pr.vel.x);
      const flap = Math.sin(w.time * 28) * 0.6;
      ctx.save();
      ctx.translate(pr.pos.x, pr.pos.y);
      ctx.rotate(ang);
      // body
      ctx.fillStyle = "#caa14a";
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      // tail
      ctx.fillStyle = "#a87f30";
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-14, -3);
      ctx.lineTo(-14, 3);
      ctx.closePath(); ctx.fill();
      // wings (flap)
      ctx.fillStyle = "#e0c068";
      ctx.beginPath();
      ctx.moveTo(-2, -1);
      ctx.lineTo(2, -10 - flap * 4);
      ctx.lineTo(6, -1);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, 1);
      ctx.lineTo(2, 10 + flap * 4);
      ctx.lineTo(6, 1);
      ctx.closePath(); ctx.fill();
      // head + beak
      ctx.fillStyle = "#fff1b8";
      ctx.beginPath(); ctx.arc(8, 0, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffaa1f";
      ctx.beginPath();
      ctx.moveTo(10, -0.6);
      ctx.lineTo(13, 0);
      ctx.lineTo(10, 0.6);
      ctx.closePath(); ctx.fill();
      // eye
      ctx.fillStyle = "#1a1a1f";
      ctx.fillRect(8, -1, 1, 1);
      ctx.restore();
      // glow trail
      ctx.fillStyle = hexToRgba("#ffd24a", 0.35);
      ctx.beginPath(); ctx.arc(pr.pos.x - pr.vel.x * 0.02, pr.pos.y - pr.vel.y * 0.02, 4, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    ctx.fillStyle = pr.color;
    ctx.beginPath(); ctx.arc(pr.pos.x, pr.pos.y, pr.radius, 0, Math.PI * 2); ctx.fill();
    if (pr.lobbed) {
      ctx.strokeStyle = pr.color;
      ctx.beginPath(); ctx.arc(pr.pos.x, pr.pos.y, pr.radius + 3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Zones (rings)
  for (const z of w.zones) {
    const lifeFrac = Math.max(0, (z.expireAt - w.time));
    const alpha = z.damagePerTick > 0 ? 0.25 : Math.min(0.5, lifeFrac);
    ctx.fillStyle = hexToRgba(z.color, alpha * 0.5);
    ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexToRgba(z.color, Math.min(1, alpha + 0.3));
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.stroke();
  }

  // VFX (move-specific effects)
  for (const v of w.vfx) {
    const total = v.expireAt - v.bornAt;
    const t = Math.min(1, Math.max(0, (w.time - v.bornAt) / total));
    drawVfx(ctx, v, t, w.time);
  }

  // Particles
  for (const pa of w.particles) {
    const f = 1 - (w.time - pa.bornAt) / (pa.expireAt - pa.bornAt);
    ctx.fillStyle = hexToRgba(pa.color, Math.max(0, f));
    ctx.fillRect(Math.round(pa.pos.x), Math.round(pa.pos.y), pa.size, pa.size);
  }

  // Damage numbers
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  for (const dn of w.damageNumbers) {
    const f = 1 - (w.time - dn.bornAt) / (dn.expireAt - dn.bornAt);
    ctx.font = `bold ${dn.size}px monospace`;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(dn.text, Math.round(dn.pos.x) + 1, Math.round(dn.pos.y) + 1);
    ctx.fillStyle = hexToRgba(dn.color, Math.max(0, f));
    ctx.fillText(dn.text, Math.round(dn.pos.x), Math.round(dn.pos.y));
  }

  // Mirror shards (Hanged Man) — chrome diamond markers + soft dome ring.
  for (const s of w.shards) {
    const lifeLeft = s.expireAt - w.time;
    const a = Math.min(1, lifeLeft / 2);
    ctx.strokeStyle = hexToRgba("#dfe6f0", a * 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, s.radius, 0, Math.PI * 2); ctx.stroke();
    // diamond
    ctx.fillStyle = hexToRgba("#dfe6f0", a);
    ctx.beginPath();
    ctx.moveTo(s.pos.x, s.pos.y - 8);
    ctx.lineTo(s.pos.x + 6, s.pos.y);
    ctx.lineTo(s.pos.x, s.pos.y + 8);
    ctx.lineTo(s.pos.x - 6, s.pos.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hexToRgba("#7a8aa0", a);
    ctx.stroke();
  }

  ctx.restore();

  // Time Stop tint — desaturated blue overlay across the whole viewport.
  if (w.time < w.timeStopUntil) {
    ctx.fillStyle = "rgba(120, 130, 180, 0.18)";
    ctx.fillRect(0, 0, VW, VH);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, w: World) {
  const pl = w.player;
  // White Album reskins the player itself instead of using a floating stand body.
  const wearingWhiteAlbum = w.standId === "white_album" && w.whiteAlbumActive;
  // Moon Rabbit also overlays the player (red suit + rabbit ears) like White Album.
  const wearingMoonRabbit = w.standId === "moon_rabbit" && w.standActive;
  const wearingOverlay = wearingWhiteAlbum || wearingMoonRabbit;
  // Stand drawn UNDER player when behind, OVER when in front. Hidden entirely if standActive=false
  // OR when an overlay (White Album / Moon Rabbit) is worn.
  const standVisible = w.standId !== "none" && w.standActive && !wearingOverlay;
  const standPos = computeStandPos(w);
  const standInFront = standPos.y >= pl.pos.y;
  if (standVisible && !standInFront) drawStand(ctx, w, standPos);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(pl.pos.x, pl.pos.y + 8, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  // stand aura — only when active (and not overlaid)
  if (standVisible) {
    const auraColor = STANDS[w.standId].color;
    ctx.fillStyle = hexToRgba(auraColor, 0.18 + Math.sin(w.time * 6) * 0.05);
    ctx.beginPath(); ctx.arc(pl.pos.x, pl.pos.y, 16, 0, Math.PI * 2); ctx.fill();
  }
  // Overlay aura tint for Moon Rabbit
  if (wearingMoonRabbit) {
    ctx.fillStyle = `rgba(255,90,90,${0.16 + Math.sin(w.time * 5) * 0.05})`;
    ctx.beginPath(); ctx.arc(pl.pos.x, pl.pos.y, 17, 0, Math.PI * 2); ctx.fill();
  }
  // body
  const flash = w.time < pl.hitFlashUntil;
  if (wearingWhiteAlbum) {
    ctx.fillStyle = flash ? "#ffffff" : "#f3f4ff";
    ctx.fillRect(pl.pos.x - 6, pl.pos.y - 2, 12, 10);
    ctx.fillStyle = flash ? "#ffffff" : "#7c5cff";
    ctx.fillRect(pl.pos.x - 6, pl.pos.y + 1, 12, 2);
    ctx.fillStyle = flash ? "#ffffff" : "#ffffff";
    ctx.fillRect(pl.pos.x - 5, pl.pos.y - 10, 10, 9);
    ctx.fillStyle = "#c8e64a";
    ctx.fillRect(pl.pos.x - 4, pl.pos.y - 7, 8, 2);
    ctx.fillStyle = "#bfe9ff";
    ctx.beginPath(); ctx.moveTo(pl.pos.x - 6, pl.pos.y + 9); ctx.lineTo(pl.pos.x - 1, pl.pos.y + 12); ctx.lineTo(pl.pos.x - 6, pl.pos.y + 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(pl.pos.x + 6, pl.pos.y + 9); ctx.lineTo(pl.pos.x + 1, pl.pos.y + 12); ctx.lineTo(pl.pos.x + 6, pl.pos.y + 12); ctx.closePath(); ctx.fill();
  } else if (wearingMoonRabbit) {
    // Red suit body
    ctx.fillStyle = flash ? "#ffffff" : "#c0392b";
    ctx.fillRect(pl.pos.x - 6, pl.pos.y - 2, 12, 10);
    // suit belt
    ctx.fillStyle = flash ? "#ffffff" : "#5a1f17";
    ctx.fillRect(pl.pos.x - 6, pl.pos.y + 4, 12, 2);
    // bowtie
    ctx.fillStyle = flash ? "#ffffff" : "#222";
    ctx.fillRect(pl.pos.x - 2, pl.pos.y - 1, 4, 2);
    // head (white furry)
    ctx.fillStyle = flash ? "#ffffff" : "#f5f5f5";
    ctx.fillRect(pl.pos.x - 5, pl.pos.y - 10, 10, 9);
    // rabbit ears
    ctx.fillStyle = flash ? "#ffffff" : "#f5f5f5";
    ctx.fillRect(pl.pos.x - 5, pl.pos.y - 16, 3, 7);
    ctx.fillRect(pl.pos.x + 2, pl.pos.y - 16, 3, 7);
    // ear inner pink
    ctx.fillStyle = "#ff9bb5";
    ctx.fillRect(pl.pos.x - 4, pl.pos.y - 15, 1, 5);
    ctx.fillRect(pl.pos.x + 3, pl.pos.y - 15, 1, 5);
    // red eyes (rabbit)
    ctx.fillStyle = "#d12727";
    const fx = pl.facing.x, fy = pl.facing.y;
    ctx.fillRect(pl.pos.x - 3 + Math.sign(fx), pl.pos.y - 6 + Math.sign(fy), 2, 2);
    ctx.fillRect(pl.pos.x + 1 + Math.sign(fx), pl.pos.y - 6 + Math.sign(fy), 2, 2);
  } else {
    ctx.fillStyle = flash ? "#ffffff" : "#caa14a";
    ctx.fillRect(pl.pos.x - 6, pl.pos.y - 2, 12, 10);
    ctx.fillStyle = flash ? "#ffffff" : pl.color;
    ctx.fillRect(pl.pos.x - 5, pl.pos.y - 10, 10, 9);
    const fx = pl.facing.x, fy = pl.facing.y;
    ctx.fillStyle = "#222";
    ctx.fillRect(pl.pos.x - 3 + Math.sign(fx) * 1, pl.pos.y - 6 + Math.sign(fy) * 1, 2, 2);
    ctx.fillRect(pl.pos.x + 1 + Math.sign(fx) * 1, pl.pos.y - 6 + Math.sign(fy) * 1, 2, 2);
  }
  if (pl.hp < pl.maxHp) drawHpBar(ctx, pl.pos.x, pl.pos.y - 16, pl.hp / pl.maxHp);
  if (standVisible && standInFront) drawStand(ctx, w, standPos);
  if (w.time < w.rageUntil) {
    ctx.strokeStyle = `rgba(255,61,61,${0.45 + Math.sin(w.time * 16) * 0.18})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pl.pos.x, pl.pos.y, 18 + Math.sin(w.time * 12) * 2, 0, Math.PI * 2); ctx.stroke();
  }
}

function computeStandPos(w: World): Vec2 {
  const pl = w.player;
  // Default: behind the player (opposite of facing)
  const back = { x: -pl.facing.x, y: -pl.facing.y };
  let target = { x: pl.pos.x + back.x * 14, y: pl.pos.y + back.y * 6 + 2 };
  // While punching/aiming, place IN FRONT of player toward dir/target
  if (w.time < w.standPunchUntil) {
    const d = w.standPunchDir;
    target = { x: pl.pos.x + d.x * 16, y: pl.pos.y + d.y * 10 - 2 };
  } else if (w.time < w.standAimUntil) {
    let dir = pl.facing;
    if (w.standAimTarget) {
      const dx = w.standAimTarget.x - pl.pos.x;
      const dy = w.standAimTarget.y - pl.pos.y;
      const m = Math.hypot(dx, dy) || 1;
      dir = { x: dx / m, y: dy / m };
    }
    target = { x: pl.pos.x + dir.x * 16, y: pl.pos.y + dir.y * 10 - 2 };
  }
  // Smooth toward target stored in world.cam-like field; cheap: lerp via sine wobble
  const wob = Math.sin(w.time * 5) * 1.5;
  return { x: target.x, y: target.y + wob };
}

function drawStand(ctx: CanvasRenderingContext2D, w: World, pos: Vec2) {
  const id = w.standId;
  if (id === "star_platinum") drawStarPlatinum(ctx, w, pos);
  else if (id === "sptw") drawSptw(ctx, w, pos);
  else if (id === "rhcp") drawRhcp(ctx, w, pos);
  else if (id === "echoes") drawEchoes(ctx, w, pos);
  else if (id === "ebony_devil") drawEbonyDevil(ctx, w, pos);
  else if (id === "gold_experience") drawGoldExperience(ctx, w, pos);
  else if (id === "white_album") drawWhiteAlbum(ctx, w, pos);
}

function drawSptw(ctx: CanvasRenderingContext2D, w: World, pos: Vec2) {
  const punching = w.time < w.standPunchUntil;
  const bob = Math.sin(w.time * 4) * 0.6;
  const raging = w.time < w.rageUntil;
  // aura — cyan with purple trim
  ctx.fillStyle = raging ? "rgba(95,232,255,0.45)" : "rgba(95,232,255,0.28)";
  ctx.beginPath(); ctx.arc(pos.x, pos.y + bob, raging ? 16 : 13, 0, Math.PI * 2); ctx.fill();
  // body — purple with cyan trim
  ctx.fillStyle = "#5a3fbf";
  ctx.fillRect(pos.x - 5, pos.y - 2 + bob, 10, 11);
  ctx.fillStyle = "#a06bff";
  ctx.fillRect(pos.x - 4, pos.y - 1 + bob, 8, 4);
  // gold markings
  ctx.fillStyle = "#f5d36b";
  ctx.fillRect(pos.x - 1, pos.y + 1 + bob, 2, 2);
  // head — cyan-tinted
  ctx.fillStyle = "#cfe9ff";
  ctx.fillRect(pos.x - 4, pos.y - 10 + bob, 8, 8);
  // hair (black)
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(pos.x - 4, pos.y - 11 + bob, 8, 2);
  // headband (white)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(pos.x - 4, pos.y - 7 + bob, 8, 1);
  // eyes — cyan glow when raging
  ctx.fillStyle = raging ? "#5fe8ff" : "#fff";
  ctx.fillRect(pos.x - 3, pos.y - 5 + bob, 2, 2);
  ctx.fillRect(pos.x + 1, pos.y - 5 + bob, 2, 2);
  // arms / punch
  if (punching) {
    const d = w.standPunchDir;
    // ghost arms (3 staggered)
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(95,232,255,${0.25 + i * 0.2})`;
      ctx.fillRect(pos.x - 1 + d.x * (4 + i * 2), pos.y - 1 + d.y * (4 + i * 2) + bob, 5, 4);
    }
    // gold sparkle
    ctx.fillStyle = "#f5d36b";
    ctx.fillRect(pos.x + d.x * 8 + ((w.time * 60) % 3) - 1, pos.y + d.y * 8 + bob - 2, 1, 1);
  } else {
    ctx.fillStyle = "#a06bff";
    ctx.fillRect(pos.x - 7, pos.y + bob, 3, 5);
    ctx.fillRect(pos.x + 4, pos.y + bob, 3, 5);
  }
}

function drawGoldExperience(ctx: CanvasRenderingContext2D, w: World, pos: Vec2) {
  const punching = w.time < w.standPunchUntil;
  // soft golden aura
  ctx.fillStyle = "rgba(245,211,107,0.28)";
  ctx.beginPath(); ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2); ctx.fill();
  // body — slim gold humanoid
  ctx.fillStyle = "#b58a2c";
  ctx.fillRect(pos.x - 4, pos.y - 2, 8, 12);
  ctx.fillStyle = "#f5d36b";
  ctx.fillRect(pos.x - 3, pos.y - 1, 6, 5);
  // ladybug-style chest spots
  ctx.fillStyle = "#8a5a14";
  ctx.fillRect(pos.x - 2, pos.y + 2, 1, 1);
  ctx.fillRect(pos.x + 1, pos.y + 4, 1, 1);
  // round head
  ctx.fillStyle = "#ffe89a";
  ctx.beginPath(); ctx.arc(pos.x, pos.y - 7, 5, 0, Math.PI * 2); ctx.fill();
  // visor / eyes — purple-tinted (matches GE's signature look)
  ctx.fillStyle = "#3a1a5a";
  ctx.fillRect(pos.x - 3, pos.y - 8, 6, 1);
  ctx.fillStyle = "#c79bff";
  ctx.fillRect(pos.x - 2, pos.y - 8, 1, 1);
  ctx.fillRect(pos.x + 1, pos.y - 8, 1, 1);
  // small purple lip
  ctx.fillStyle = "#9d6dd1";
  ctx.fillRect(pos.x - 1, pos.y - 4, 2, 1);
  // shoulder pads
  ctx.fillStyle = "#fff0b8";
  ctx.fillRect(pos.x - 5, pos.y - 2, 2, 3);
  ctx.fillRect(pos.x + 3, pos.y - 2, 2, 3);
  // arms — punch extension
  if (punching) {
    const d = w.standPunchDir;
    ctx.fillStyle = "#f5d36b";
    ctx.fillRect(pos.x - 1 + d.x * 7, pos.y - 1 + d.y * 7, 5, 4);
    // gold sparkle on fist
    ctx.fillStyle = "#fff";
    ctx.fillRect(pos.x + d.x * 9, pos.y + d.y * 9, 2, 2);
  } else {
    ctx.fillStyle = "#f5d36b";
    ctx.fillRect(pos.x - 6, pos.y + 1, 3, 5);
    ctx.fillRect(pos.x + 3, pos.y + 1, 3, 5);
  }
}

function drawStarPlatinum(ctx: CanvasRenderingContext2D, w: World, pos: Vec2) {
  const punching = w.time < w.standPunchUntil;
  // aura
  ctx.fillStyle = "rgba(124,92,255,0.25)";
  ctx.beginPath(); ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2); ctx.fill();
  // body — purple/teal humanoid
  ctx.fillStyle = "#5b3fbf";
  ctx.fillRect(pos.x - 5, pos.y - 2, 10, 11);
  ctx.fillStyle = "#7c5cff";
  ctx.fillRect(pos.x - 4, pos.y - 1, 8, 4);
  // head
  ctx.fillStyle = "#b9a4ff";
  ctx.fillRect(pos.x - 4, pos.y - 10, 8, 8);
  // headband
  ctx.fillStyle = "#2a1f5a";
  ctx.fillRect(pos.x - 4, pos.y - 7, 8, 2);
  // eyes
  ctx.fillStyle = "#fff";
  ctx.fillRect(pos.x - 3, pos.y - 5, 2, 2);
  ctx.fillRect(pos.x + 1, pos.y - 5, 2, 2);
  // arms — punch extension
  ctx.fillStyle = "#7c5cff";
  if (punching) {
    const d = w.standPunchDir;
    ctx.fillRect(pos.x - 1 + d.x * 6, pos.y - 1 + d.y * 6, 5, 4);
  } else {
    ctx.fillRect(pos.x - 7, pos.y, 3, 5);
    ctx.fillRect(pos.x + 4, pos.y, 3, 5);
  }
}

function drawRhcp(ctx: CanvasRenderingContext2D, w: World, pos: Vec2) {
  const punching = w.time < w.standPunchUntil;
  ctx.fillStyle = "rgba(255,68,68,0.22)";
  ctx.beginPath(); ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2); ctx.fill();
  // body — red lanky
  ctx.fillStyle = "#a02323";
  ctx.fillRect(pos.x - 4, pos.y - 2, 8, 11);
  ctx.fillStyle = "#ff4444";
  ctx.fillRect(pos.x - 3, pos.y, 6, 3);
  // head — angular
  ctx.fillStyle = "#ff6a6a";
  ctx.beginPath();
  ctx.moveTo(pos.x - 4, pos.y - 4);
  ctx.lineTo(pos.x, pos.y - 11);
  ctx.lineTo(pos.x + 4, pos.y - 4);
  ctx.closePath();
  ctx.fill();
  // eyes (jagged)
  ctx.fillStyle = "#fff36b";
  ctx.fillRect(pos.x - 2, pos.y - 7, 1, 2);
  ctx.fillRect(pos.x + 1, pos.y - 7, 1, 2);
  // electric crackle
  ctx.strokeStyle = "rgba(255,243,107,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pos.x - 6, pos.y - 8 + Math.sin(w.time * 20) * 2);
  ctx.lineTo(pos.x + 6, pos.y - 6 + Math.cos(w.time * 18) * 2);
  ctx.stroke();
  // arms
  if (punching) {
    const d = w.standPunchDir;
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(pos.x - 1 + d.x * 6, pos.y - 1 + d.y * 6, 5, 4);
  } else {
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(pos.x - 6, pos.y + 1, 3, 4);
    ctx.fillRect(pos.x + 3, pos.y + 1, 3, 4);
  }
}

function drawEchoes(ctx: CanvasRenderingContext2D, w: World, pos: Vec2) {
  // Echoes form is driven by which ability the player last used.
  // a1 -> Act 1, a2/a3 -> Act 2, a4 (or S.H.I.T.) -> Act 3.
  const act = w.shitVariant ? 3 : w.echoesAct;
  const punching = w.time < w.standPunchUntil;
  if (act === 1) {
    // small egg-like creature with tail
    ctx.fillStyle = "rgba(95,209,160,0.25)";
    ctx.beginPath(); ctx.arc(pos.x, pos.y + 2, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4ab089";
    ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 2, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#9af0c8";
    ctx.beginPath(); ctx.ellipse(pos.x - 1, pos.y, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    // eye
    ctx.fillStyle = "#222";
    ctx.fillRect(pos.x - 1, pos.y - 1, 2, 2);
    // tail
    ctx.strokeStyle = "#4ab089";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pos.x + 5, pos.y + 4);
    ctx.quadraticCurveTo(pos.x + 10, pos.y + 8 + Math.sin(w.time * 6) * 2, pos.x + 12, pos.y + 2);
    ctx.stroke();
  } else if (act === 2) {
    ctx.fillStyle = "rgba(95,209,160,0.25)";
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3d8c6c";
    ctx.fillRect(pos.x - 4, pos.y - 2, 8, 10);
    ctx.fillStyle = "#5fd1a0";
    ctx.fillRect(pos.x - 3, pos.y - 1, 6, 4);
    // head
    ctx.fillStyle = "#bff5da";
    ctx.fillRect(pos.x - 4, pos.y - 9, 8, 8);
    // beak/mouth
    ctx.fillStyle = "#3d8c6c";
    ctx.fillRect(pos.x - 1, pos.y - 4, 2, 2);
    ctx.fillStyle = "#222";
    ctx.fillRect(pos.x - 3, pos.y - 6, 1, 2);
    ctx.fillRect(pos.x + 2, pos.y - 6, 1, 2);
    if (punching) {
      const d = w.standPunchDir;
      ctx.fillStyle = "#5fd1a0";
      ctx.fillRect(pos.x - 1 + d.x * 5, pos.y - 1 + d.y * 5, 4, 4);
    } else {
      ctx.fillStyle = "#5fd1a0";
      ctx.fillRect(pos.x - 6, pos.y + 1, 3, 4);
      ctx.fillRect(pos.x + 3, pos.y + 1, 3, 4);
    }
  } else {
    // Act 3: mostly white with green accents, taller humanoid
    ctx.fillStyle = "rgba(95,209,160,0.3)";
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f4f7f3";
    ctx.fillRect(pos.x - 5, pos.y - 3, 10, 12);
    // green chest stripe
    ctx.fillStyle = "#5fd1a0";
    ctx.fillRect(pos.x - 5, pos.y + 1, 10, 2);
    // shoulders
    ctx.fillStyle = "#bff5da";
    ctx.fillRect(pos.x - 6, pos.y - 2, 2, 5);
    ctx.fillRect(pos.x + 4, pos.y - 2, 2, 5);
    // head — white with green band
    ctx.fillStyle = "#fff";
    ctx.fillRect(pos.x - 4, pos.y - 11, 8, 9);
    ctx.fillStyle = "#5fd1a0";
    ctx.fillRect(pos.x - 4, pos.y - 8, 8, 2);
    ctx.fillStyle = "#222";
    ctx.fillRect(pos.x - 3, pos.y - 6, 2, 2);
    ctx.fillRect(pos.x + 1, pos.y - 6, 2, 2);
    if (punching) {
      const d = w.standPunchDir;
      ctx.fillStyle = "#fff";
      ctx.fillRect(pos.x - 1 + d.x * 7, pos.y - 1 + d.y * 7, 5, 5);
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(pos.x - 7, pos.y + 1, 3, 5);
      ctx.fillRect(pos.x + 4, pos.y + 1, 3, 5);
    }
  }
}

function drawEbonyDevil(ctx: CanvasRenderingContext2D, w: World, pos: Vec2) {
  const attacking = w.time < w.standPunchUntil || w.time < w.standAimUntil;
  const bob = Math.sin(w.time * 10) * 1.5;
  ctx.fillStyle = "rgba(143,148,156,0.24)";
  ctx.beginPath(); ctx.arc(pos.x, pos.y + bob, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#555b64";
  ctx.fillRect(pos.x - 5, pos.y - 1 + bob, 10, 10);
  ctx.fillStyle = "#8f949c";
  ctx.beginPath();
  ctx.moveTo(pos.x - 7, pos.y - 5 + bob);
  ctx.lineTo(pos.x - 3, pos.y - 12 + bob);
  ctx.lineTo(pos.x, pos.y - 8 + bob);
  ctx.lineTo(pos.x + 3, pos.y - 12 + bob);
  ctx.lineTo(pos.x + 7, pos.y - 5 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#191b20";
  ctx.fillRect(pos.x - 3, pos.y - 6 + bob, 2, 2);
  ctx.fillRect(pos.x + 1, pos.y - 6 + bob, 2, 2);
  ctx.fillStyle = "#cfd3dc";
  ctx.fillRect(pos.x - 2, pos.y - 2 + bob, 4, 2);
  ctx.strokeStyle = attacking ? "#f2f3f5" : "#8f949c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pos.x - 7, pos.y + 2 + bob);
  ctx.lineTo(pos.x - 12, pos.y + (attacking ? -4 : 6) + bob);
  ctx.moveTo(pos.x + 7, pos.y + 2 + bob);
  ctx.lineTo(pos.x + 12, pos.y + (attacking ? -4 : 6) + bob);
  ctx.stroke();
}

function drawPuppet(ctx: CanvasRenderingContext2D, w: World) {
  const p = w.puppet;
  const attacking = w.time < p.attackUntil;
  const spin = attacking ? w.time * 22 : Math.sin(w.time * 6) * 0.2;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(p.pos.x, p.pos.y + 7, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#72533e";
  ctx.fillRect(p.pos.x - 5, p.pos.y - 1, 10, 10);
  ctx.fillStyle = "#b08a65";
  ctx.fillRect(p.pos.x - 4, p.pos.y - 9, 8, 8);
  ctx.fillStyle = "#1b1714";
  ctx.fillRect(p.pos.x - 3, p.pos.y - 6, 2, 2);
  ctx.fillRect(p.pos.x + 1, p.pos.y - 6, 2, 2);
  // ----- proper spear -----
  ctx.save();
  ctx.translate(p.pos.x, p.pos.y + 1);
  if (attacking) ctx.rotate(spin);
  else ctx.rotate(Math.atan2(p.facing.y, p.facing.x));
  // long wooden shaft (dark brown) with binding wraps
  ctx.strokeStyle = "#5a3a22";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(20, 0); ctx.stroke();
  // shaft binding (leather wraps)
  ctx.strokeStyle = "#2a1a0e";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const x = 2 + i * 5;
    ctx.beginPath(); ctx.moveTo(x, -1); ctx.lineTo(x, 1); ctx.stroke();
  }
  // butt cap
  ctx.fillStyle = "#3a2614";
  ctx.fillRect(-4, -1, 2, 3);
  // metal collar at base of head
  ctx.fillStyle = "#9aa0aa";
  ctx.fillRect(19, -2, 2, 4);
  // spearhead — narrow pointed leaf shape
  ctx.fillStyle = "#e8ecf2";
  ctx.strokeStyle = "#3a4252";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(21, -3);
  ctx.lineTo(29, 0);
  ctx.lineTo(21, 3);
  ctx.lineTo(23, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // side fins (the small wings near the base of the head)
  ctx.fillStyle = "#c8ccd4";
  ctx.beginPath();
  ctx.moveTo(21, -3); ctx.lineTo(19, -5); ctx.lineTo(22, -2); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(21, 3); ctx.lineTo(19, 5); ctx.lineTo(22, 2); ctx.closePath(); ctx.fill();
  // central blood-groove highlight
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(23, 0, 4, 1);
  ctx.restore();
  if (p.hp < p.maxHp) drawHpBar(ctx, p.pos.x, p.pos.y - 15, p.hp / p.maxHp);
}

function drawWhiteAlbum(ctx: CanvasRenderingContext2D, w: World, pos: Vec2) {
  const punching = w.time < w.standPunchUntil;
  // ice trail tiles (under everything)
  for (const tile of w.icePath) {
    const a = Math.max(0, 1 - (w.time - tile.bornAt) / 4);
    ctx.fillStyle = `rgba(190,235,255,${0.35 * a})`;
    ctx.beginPath(); ctx.arc(tile.pos.x, tile.pos.y, 8, 0, Math.PI * 2); ctx.fill();
  }
  // soft white aura
  ctx.fillStyle = `rgba(232,234,255,${0.25 + Math.sin(w.time * 6) * 0.05})`;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2); ctx.fill();
  // body — white w/ purple piping
  ctx.fillStyle = "#f3f4ff";
  ctx.fillRect(pos.x - 5, pos.y - 2, 10, 12);
  ctx.fillStyle = "#7c5cff";
  ctx.fillRect(pos.x - 5, pos.y + 1, 10, 2);
  // head
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(pos.x - 4, pos.y - 11, 8, 9);
  // visor (greenish-yellow)
  ctx.fillStyle = "#c8e64a";
  ctx.fillRect(pos.x - 3, pos.y - 8, 6, 2);
  // ice skates
  ctx.fillStyle = "#bfe9ff";
  ctx.beginPath(); ctx.moveTo(pos.x - 5, pos.y + 11); ctx.lineTo(pos.x - 1, pos.y + 13); ctx.lineTo(pos.x - 5, pos.y + 13); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(pos.x + 5, pos.y + 11); ctx.lineTo(pos.x + 1, pos.y + 13); ctx.lineTo(pos.x + 5, pos.y + 13); ctx.closePath(); ctx.fill();
  if (punching) {
    ctx.strokeStyle = "rgba(190,235,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawHangedMan(ctx: CanvasRenderingContext2D, w: World) {
  const h = w.hangedMan;
  const attacking = w.time < h.attackUntil;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(h.pos.x, h.pos.y + 9, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  // pale aura
  ctx.fillStyle = `rgba(207,214,227,${0.18 + Math.sin(w.time * 5) * 0.05})`;
  ctx.beginPath(); ctx.arc(h.pos.x, h.pos.y, 14, 0, Math.PI * 2); ctx.fill();
  // ----- mummy body: linen wraps -----
  // base body (slightly cream)
  ctx.fillStyle = "#d8cfb0";
  ctx.fillRect(h.pos.x - 5, h.pos.y - 2, 10, 13);
  // bandage strips (diagonal darker tan)
  ctx.fillStyle = "#a8987a";
  for (let i = 0; i < 4; i++) {
    const yy = h.pos.y - 1 + i * 3;
    ctx.fillRect(h.pos.x - 5, yy, 10, 1);
  }
  // shoulder gap
  ctx.fillStyle = "#1b1611";
  ctx.fillRect(h.pos.x - 5, h.pos.y + 5, 10, 1);
  // ----- mummy head -----
  ctx.fillStyle = "#e6dcc0";
  ctx.fillRect(h.pos.x - 4, h.pos.y - 11, 8, 9);
  // wrappings on head
  ctx.fillStyle = "#a8987a";
  ctx.fillRect(h.pos.x - 4, h.pos.y - 9, 8, 1);
  ctx.fillRect(h.pos.x - 4, h.pos.y - 5, 8, 1);
  // dark eye sockets (glowing pale blue)
  ctx.fillStyle = "#0a0d14";
  ctx.fillRect(h.pos.x - 3, h.pos.y - 8, 2, 2);
  ctx.fillRect(h.pos.x + 1, h.pos.y - 8, 2, 2);
  ctx.fillStyle = "#9ec0ff";
  ctx.fillRect(h.pos.x - 3, h.pos.y - 8, 1, 1);
  ctx.fillRect(h.pos.x + 1, h.pos.y - 8, 1, 1);
  // trailing bandage tail (animated wave)
  ctx.strokeStyle = "#d8cfb0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(h.pos.x - 5, h.pos.y + 6);
  ctx.lineTo(h.pos.x - 9 + Math.sin(w.time * 3) * 1.5, h.pos.y + 9);
  ctx.lineTo(h.pos.x - 11 + Math.sin(w.time * 3 + 1) * 2, h.pos.y + 12);
  ctx.stroke();
  // ----- curved saber (scimitar) — clearly different from a straight spear -----
  ctx.save();
  ctx.translate(h.pos.x, h.pos.y + 1);
  ctx.rotate(attacking ? w.time * 18 : Math.atan2(h.facing.y, h.facing.x));
  // hilt (gold)
  ctx.fillStyle = "#c9a14a";
  ctx.fillRect(-1, -2, 5, 4);
  // guard
  ctx.fillStyle = "#7a5a1c";
  ctx.fillRect(4, -3, 2, 6);
  // curved blade — drawn as a quadratic curve filled
  ctx.fillStyle = "#eaf2ff";
  ctx.strokeStyle = "#9ec0ff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, -2);
  ctx.quadraticCurveTo(16, -6, 22, -1);
  ctx.quadraticCurveTo(16, 0, 6, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // glint
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(12, -3, 4, 1);
  ctx.restore();
  // shared HP indicator (matches player hp)
  if (w.player.hp < w.player.maxHp) drawHpBar(ctx, h.pos.x, h.pos.y - 17, w.player.hp / w.player.maxHp);
}

function drawBoingo(ctx: CanvasRenderingContext2D, w: World) {
  const b = w.boingo;
  const bob = Math.sin(w.time * 3 + b.bobPhase) * 0.8;
  const x = b.pos.x;
  const y = b.pos.y + bob;
  // Fade-out alpha while despawning after first chat.
  let alpha = 1;
  if (!b.alive) {
    const remain = Math.max(0, b.fadeUntil - w.time);
    alpha = remain;            // fade over ~1s
    if (alpha <= 0) return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(b.pos.x, b.pos.y + 9, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  // small kid body — bright yellow shirt
  ctx.fillStyle = "#f5d24a";
  ctx.fillRect(x - 5, y - 1, 10, 11);
  // brown shorts
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(x - 5, y + 7, 10, 3);
  // legs
  ctx.fillStyle = "#3a2614";
  ctx.fillRect(x - 4, y + 10, 3, 2);
  ctx.fillRect(x + 1, y + 10, 3, 2);
  // head — pale skin tone
  ctx.fillStyle = "#f3d9b1";
  ctx.fillRect(x - 4, y - 11, 8, 9);
  // dark messy hair cap on top
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(x - 4, y - 11, 8, 3);
  ctx.fillRect(x - 5, y - 10, 1, 2);
  ctx.fillRect(x + 4, y - 10, 1, 2);
  // wide nervous eyes (look the way he's facing)
  const ex = Math.max(-1, Math.min(1, b.facing.x));
  const ey = Math.max(-1, Math.min(1, b.facing.y));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 3, y - 7, 2, 2);
  ctx.fillRect(x + 1, y - 7, 2, 2);
  ctx.fillStyle = "#0a0d14";
  ctx.fillRect(x - 3 + Math.round(ex * 0.5), y - 7 + Math.round(ey * 0.5), 1, 1);
  ctx.fillRect(x + 1 + Math.round(ex * 0.5), y - 7 + Math.round(ey * 0.5), 1, 1);
  // tiny worried mouth
  ctx.fillStyle = "#5a2a1a";
  ctx.fillRect(x - 1, y - 3, 2, 1);

  // ----- purple book held in front -----
  ctx.save();
  // book sits slightly in front of his torso
  const bx = x;
  const by = y + 4;
  // back cover
  ctx.fillStyle = "#3a1a5a";
  ctx.fillRect(bx - 6, by - 3, 12, 7);
  // spine highlight
  ctx.fillStyle = "#5a2c8a";
  ctx.fillRect(bx - 6, by - 3, 12, 1);
  // open pages — pale lavender
  ctx.fillStyle = "#e7dcff";
  ctx.fillRect(bx - 5, by - 2, 11, 5);
  // page split
  ctx.fillStyle = "#3a1a5a";
  ctx.fillRect(bx, by - 2, 1, 5);
  // strange unidentifiable glyphs (vary with pageIndex so it looks alive)
  ctx.fillStyle = "#3a1a5a";
  const pi = b.pageIndex;
  // left page glyphs
  if (pi === 0) {
    ctx.fillRect(bx - 4, by - 1, 1, 1); ctx.fillRect(bx - 2, by - 1, 2, 1);
    ctx.fillRect(bx - 4, by + 1, 3, 1); ctx.fillRect(bx - 4, by + 2, 1, 1);
  } else if (pi === 1) {
    ctx.fillRect(bx - 4, by - 1, 3, 1); ctx.fillRect(bx - 3, by + 1, 1, 2);
    ctx.fillRect(bx - 1, by + 2, 1, 1);
  } else if (pi === 2) {
    ctx.fillRect(bx - 4, by, 1, 2); ctx.fillRect(bx - 3, by - 1, 2, 1);
    ctx.fillRect(bx - 2, by + 2, 2, 1);
  } else {
    ctx.fillRect(bx - 4, by - 1, 1, 3); ctx.fillRect(bx - 3, by + 2, 2, 1);
    ctx.fillRect(bx - 1, by - 1, 1, 1);
  }
  // right page glyphs (mirrored-ish)
  if (pi === 0) {
    ctx.fillRect(bx + 2, by - 1, 2, 1); ctx.fillRect(bx + 4, by + 1, 1, 2);
    ctx.fillRect(bx + 1, by + 2, 1, 1);
  } else if (pi === 1) {
    ctx.fillRect(bx + 1, by - 1, 3, 1); ctx.fillRect(bx + 4, by, 1, 2);
    ctx.fillRect(bx + 2, by + 2, 2, 1);
  } else if (pi === 2) {
    ctx.fillRect(bx + 4, by - 1, 1, 1); ctx.fillRect(bx + 2, by, 2, 1);
    ctx.fillRect(bx + 1, by + 2, 3, 1);
  } else {
    ctx.fillRect(bx + 4, by - 1, 1, 3); ctx.fillRect(bx + 2, by + 1, 1, 1);
    ctx.fillRect(bx + 3, by + 2, 1, 1);
  }
  // faint mystic shimmer above the book
  const shimmer = (Math.sin(w.time * 4 + b.bobPhase) + 1) * 0.5;
  ctx.fillStyle = `rgba(186,140,255,${0.18 + shimmer * 0.18})`;
  ctx.fillRect(bx - 4, by - 5, 8, 1);
  ctx.restore();

  // little hands gripping the book sides
  ctx.fillStyle = "#f3d9b1";
  ctx.fillRect(x - 7, y + 3, 2, 2);
  ctx.fillRect(x + 5, y + 3, 2, 2);
  ctx.restore();
}

function drawFrog(ctx: CanvasRenderingContext2D, w: World, f: Frog) {
  const bob = Math.sin(w.time * 4 + f.bobPhase) * 1.2;
  const y = f.pos.y + bob;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(f.pos.x, f.pos.y + 5, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
  // body — dark green ellipse
  ctx.fillStyle = "#2f7a3a";
  ctx.beginPath(); ctx.ellipse(f.pos.x, y, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  // back highlight (lighter green)
  ctx.fillStyle = "#5fd16a";
  ctx.beginPath(); ctx.ellipse(f.pos.x, y - 1, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  // belly
  ctx.fillStyle = "#bff5da";
  ctx.beginPath(); ctx.ellipse(f.pos.x, y + 2, 4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  // eyes — bulging
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(f.pos.x - 3, y - 3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(f.pos.x + 3, y - 3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1a1a1f";
  ctx.fillRect(f.pos.x - 3, y - 3, 1, 1);
  ctx.fillRect(f.pos.x + 3, y - 3, 1, 1);
  // mouth
  ctx.strokeStyle = "#1a3a1a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(f.pos.x - 2, y + 1);
  ctx.lineTo(f.pos.x + 2, y + 1);
  ctx.stroke();
}

function drawProtectionTree(ctx: CanvasRenderingContext2D, w: World, t: ProtectionTree) {
  const remaining = Math.max(0, t.expireAt - w.time);
  const total = t.expireAt - t.bornAt;
  const lifeFrac = total > 0 ? remaining / total : 0;
  const pulse = 0.5 + Math.sin(w.time * 3) * 0.15;
  // ----- protection dome (golden-green circle) -----
  ctx.save();
  ctx.fillStyle = `rgba(95,209,106,${0.10 * pulse})`;
  ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(159,247,170,${0.45 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.radius, 0, Math.PI * 2); ctx.stroke();
  // inner ring
  ctx.strokeStyle = `rgba(255,232,154,${0.35 * pulse})`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.radius * 0.7, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // ----- roots radiating out (curved tendrils) -----
  ctx.strokeStyle = "#5a3a1c";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.sin(w.time * 0.5 + i) * 0.05;
    const r1 = 14, r2 = 30;
    const x1 = t.pos.x + Math.cos(a) * r1;
    const y1 = t.pos.y + Math.sin(a) * r1;
    const x2 = t.pos.x + Math.cos(a) * r2;
    const y2 = t.pos.y + Math.sin(a) * r2 * 0.6; // squashed for ground perspective
    ctx.beginPath();
    ctx.moveTo(t.pos.x, t.pos.y + 4);
    ctx.quadraticCurveTo(x1, y1 + 2, x2, y2);
    ctx.stroke();
  }
  // ----- trunk -----
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(t.pos.x - 4, t.pos.y - 8, 8, 14);
  ctx.fillStyle = "#3a2410";
  ctx.fillRect(t.pos.x - 4, t.pos.y - 4, 8, 1);
  ctx.fillRect(t.pos.x - 4, t.pos.y + 1, 8, 1);
  // ----- canopy (layered green) -----
  ctx.fillStyle = "#1f5d2a";
  ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y - 14, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2a7a38";
  ctx.beginPath(); ctx.arc(t.pos.x - 6, t.pos.y - 18, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5fd16a";
  ctx.beginPath(); ctx.arc(t.pos.x + 5, t.pos.y - 20, 10, 0, Math.PI * 2); ctx.fill();
  // golden fruits
  ctx.fillStyle = "#ffd24a";
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + w.time * 0.5;
    const fx = t.pos.x + Math.cos(a) * 12;
    const fy = t.pos.y - 15 + Math.sin(a) * 8;
    ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  // ----- life timer ring -----
  ctx.strokeStyle = "rgba(255,232,154,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(t.pos.x, t.pos.y - 14, 22, -Math.PI / 2, -Math.PI / 2 + lifeFrac * Math.PI * 2);
  ctx.stroke();
}

function drawNpc(ctx: CanvasRenderingContext2D, w: World, e: Entity) {
  // Gold Experience hologram afterimage — render a faded copy of the NPC at hologramOrigin.
  if (e.hologramOrigin && w.time < (e.hologramUntil ?? 0)) {
    const ho = e.hologramOrigin;
    const flick = 0.55 + Math.sin(w.time * 24) * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.55 * flick;
    // shadow
    ctx.fillStyle = "rgba(202,161,74,0.25)";
    ctx.beginPath(); ctx.ellipse(ho.x, ho.y + 8, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    // body silhouette in gold
    ctx.fillStyle = "#caa14a";
    ctx.fillRect(ho.x - 6, ho.y - 2, 12, 10);
    ctx.fillStyle = "#ffe89a";
    ctx.fillRect(ho.x - 5, ho.y - 10, 10, 9);
    // outline shimmer
    ctx.strokeStyle = "rgba(255,232,154,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ho.x - 6.5, ho.y - 10.5, 13, 19.5);
    ctx.restore();
    // sparkle particles
    if (Math.random() < 0.35) {
      spawnParticles(w, ho, "#ffe89a", 1, { life: 0.4, gravity: -20, speedMin: 10, speedMax: 30, shape: "spark" });
    }
  }
  // Match player silhouette: shadow 8x3, body 12x10, head 10x9, hp bar at -16.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(e.pos.x, e.pos.y + 8, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  const flash = w.time < e.hitFlashUntil;
  // body
  ctx.fillStyle = flash ? "#ffffff" : (e.kind === "enemy" ? "#5a1a1a" : "#1d3a7a");
  ctx.fillRect(e.pos.x - 6, e.pos.y - 2, 12, 10);
  // head
  ctx.fillStyle = flash ? "#ffffff" : e.color;
  ctx.fillRect(e.pos.x - 5, e.pos.y - 10, 10, 9);
  // eyes (face direction)
  const fx = e.facing.x, fy = e.facing.y;
  ctx.fillStyle = "#222";
  ctx.fillRect(e.pos.x - 3 + Math.sign(fx) * 1, e.pos.y - 6 + Math.sign(fy) * 1, 2, 2);
  ctx.fillRect(e.pos.x + 1 + Math.sign(fx) * 1, e.pos.y - 6 + Math.sign(fy) * 1, 2, 2);
  // stunned mark
  if (w.time < e.stunUntil) {
    ctx.fillStyle = "#a8e8ff";
    ctx.fillRect(e.pos.x - 1, e.pos.y - 15, 2, 2);
    ctx.fillRect(e.pos.x + 2, e.pos.y - 14, 2, 2);
  }
  // slowed (icy) overlay
  if (w.time < (e.slowUntil ?? 0)) {
    ctx.fillStyle = "rgba(190,235,255,0.35)";
    ctx.fillRect(e.pos.x - 6, e.pos.y - 10, 12, 19);
  }
  if (e.hp < e.maxHp) drawHpBar(ctx, e.pos.x, e.pos.y - 16, e.hp / e.maxHp);
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - 8, y, 16, 3);
  ctx.fillStyle = frac > 0.5 ? "#5fd16a" : frac > 0.25 ? "#e0c34a" : "#d04848";
  ctx.fillRect(x - 8, y, Math.round(16 * Math.max(0, frac)), 3);
}

function hexToRgba(hex: string, a: number) {
  if (hex.startsWith("rgba")) return hex;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export type { World };

// ---------- VFX renderer ----------
function drawVfx(ctx: CanvasRenderingContext2D, v: Vfx, t: number, time: number) {
  const inv = 1 - t;
  switch (v.kind) {
    case "slash_arc": {
      // arcing crescent in the facing direction
      const cx = v.pos.x, cy = v.pos.y;
      const ang = v.angle ?? 0;
      const r = (v.radius ?? 22) * (0.7 + t * 0.4);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.strokeStyle = hexToRgba(v.color, inv * 0.95);
      ctx.lineWidth = 5 * inv + 1;
      ctx.beginPath();
      ctx.arc(0, 0, r, -0.9, 0.9);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba("#ffffff", inv * 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, -0.7, 0.7);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "shockwave": {
      const r = (v.radius ?? 30) * (0.4 + t * 1.0);
      ctx.strokeStyle = hexToRgba(v.color, inv * 0.9);
      ctx.lineWidth = 3 * inv + 1;
      ctx.beginPath();
      ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba("#ffffff", inv * 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(v.pos.x, v.pos.y, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "lightning_bolt": {
      if (!v.to) break;
      const segs = 6;
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 2;
      ctx.beginPath();
      let px = v.pos.x, py = v.pos.y;
      ctx.moveTo(px, py);
      for (let i = 1; i <= segs; i++) {
        const f = i / segs;
        const x = v.pos.x + (v.to.x - v.pos.x) * f + (Math.random() - 0.5) * 8;
        const y = v.pos.y + (v.to.y - v.pos.y) * f + (Math.random() - 0.5) * 8;
        ctx.lineTo(x, y);
        px = x; py = y;
      }
      ctx.stroke();
      ctx.strokeStyle = hexToRgba("#ffffff", inv * 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    case "fire_burst": {
      const r = v.radius ?? 30;
      // multiple flame puffs
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + time * 2;
        const dx = Math.cos(a) * r * 0.5 * (0.4 + t * 0.6);
        const dy = Math.sin(a) * r * 0.5 * (0.4 + t * 0.6) - t * 14;
        const sz = r * (0.45 - t * 0.3);
        ctx.fillStyle = hexToRgba(v.color, inv * 0.7);
        ctx.beginPath();
        ctx.arc(v.pos.x + dx, v.pos.y + dy, Math.max(2, sz), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexToRgba("#ffd24a", inv * 0.5);
        ctx.beginPath();
        ctx.arc(v.pos.x + dx, v.pos.y + dy, Math.max(1, sz * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "ice_burst": {
      const r = (v.radius ?? 16) * (0.6 + t * 0.8);
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 2;
      // 6 spokes
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(v.pos.x + Math.cos(a) * r * 0.3, v.pos.y + Math.sin(a) * r * 0.3);
        ctx.lineTo(v.pos.x + Math.cos(a) * r, v.pos.y + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.fillStyle = hexToRgba("#ffffff", inv * 0.7);
      ctx.beginPath();
      ctx.arc(v.pos.x, v.pos.y, 3 * inv + 1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "stab_line": {
      if (!v.to) break;
      const w = (v.radius ?? 6) * inv;
      const dx = v.to.x - v.pos.x, dy = v.to.y - v.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      ctx.fillStyle = hexToRgba(v.color, inv * 0.85);
      ctx.beginPath();
      ctx.moveTo(v.pos.x + nx * w, v.pos.y + ny * w);
      ctx.lineTo(v.to.x + nx * w * 0.3, v.to.y + ny * w * 0.3);
      ctx.lineTo(v.to.x - nx * w * 0.3, v.to.y - ny * w * 0.3);
      ctx.lineTo(v.pos.x - nx * w, v.pos.y - ny * w);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hexToRgba("#ffffff", inv * 0.6);
      ctx.beginPath();
      ctx.arc(v.to.x, v.to.y, 4 * inv + 1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "beam": {
      if (!v.to) break;
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 6 * inv + 1;
      ctx.beginPath();
      ctx.moveTo(v.pos.x, v.pos.y);
      ctx.lineTo(v.to.x, v.to.y);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba("#ffffff", inv * 0.85);
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "explosion_ring": {
      const r = (v.radius ?? 30) * (0.3 + t * 1.1);
      ctx.fillStyle = hexToRgba(v.color, inv * 0.4);
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexToRgba("#ffd24a", inv * 0.95);
      ctx.lineWidth = 3 * inv + 1;
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "crater_smoke": {
      const r = (v.radius ?? 30) * (0.6 + t * 0.6);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + time;
        const dx = Math.cos(a) * r * 0.4;
        const dy = Math.sin(a) * r * 0.4 - t * 10;
        ctx.fillStyle = hexToRgba(v.color, inv * 0.5);
        ctx.beginPath();
        ctx.arc(v.pos.x + dx, v.pos.y + dy, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "crit_burst": {
      // Bright yellow ring + radiating spokes
      const r = (v.radius ?? 18) * (0.3 + t * 1.4);
      ctx.strokeStyle = hexToRgba("#ffd24a", inv);
      ctx.lineWidth = 2.5 * inv + 0.5;
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = hexToRgba("#ffffff", inv * 0.85);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(v.pos.x + Math.cos(a) * r * 0.55, v.pos.y + Math.sin(a) * r * 0.55);
        ctx.lineTo(v.pos.x + Math.cos(a) * r * 1.1, v.pos.y + Math.sin(a) * r * 1.1);
        ctx.stroke();
      }
      break;
    }
    case "time_clock": {
      const r = (v.radius ?? 60);
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r * 0.78, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(v.pos.x + Math.cos(a) * r * 0.82, v.pos.y + Math.sin(a) * r * 0.82);
        ctx.lineTo(v.pos.x + Math.cos(a) * r * 0.96, v.pos.y + Math.sin(a) * r * 0.96);
        ctx.stroke();
      }
      const ang = t * Math.PI * 4;
      ctx.beginPath();
      ctx.moveTo(v.pos.x, v.pos.y);
      ctx.lineTo(v.pos.x + Math.cos(ang) * r * 0.7, v.pos.y + Math.sin(ang) * r * 0.7);
      ctx.stroke();
      break;
    }
    case "shard_flash": {
      const r = (v.radius ?? 20) * (0.4 + t * 1.6);
      ctx.fillStyle = hexToRgba("#ffffff", inv * 0.85);
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "mirror_dome": {
      const r = (v.radius ?? 80);
      ctx.strokeStyle = hexToRgba(v.color, inv * 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r * (0.7 + t * 0.4), 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "tree_aura": {
      const r = (v.radius ?? 60);
      ctx.fillStyle = hexToRgba(v.color, inv * 0.15);
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexToRgba(v.color, inv * 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "hologram_burst": {
      const r = (v.radius ?? 30) * (0.4 + t * 1.2);
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "chain_arc": {
      if (!v.to) break;
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(v.pos.x, v.pos.y);
      const mx = (v.pos.x + v.to.x) / 2 + (Math.random() - 0.5) * 8;
      const my = (v.pos.y + v.to.y) / 2 + (Math.random() - 0.5) * 8;
      ctx.lineTo(mx, my);
      ctx.lineTo(v.to.x, v.to.y);
      ctx.stroke();
      break;
    }
    case "punch_impact": {
      const r = (v.radius ?? 8) * (0.5 + t * 1.2);
      ctx.fillStyle = hexToRgba("#ffffff", inv * 0.85);
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "slash_hit": {
      const r = (v.radius ?? 10) * (0.6 + t * 1.0);
      ctx.strokeStyle = hexToRgba(v.color, inv);
      ctx.lineWidth = 2.5 * inv + 0.5;
      ctx.beginPath();
      ctx.arc(v.pos.x, v.pos.y, r, -0.6, 0.6);
      ctx.stroke();
      ctx.fillStyle = hexToRgba("#ffffff", inv * 0.7);
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, 2 + inv * 2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "poison_cloud": {
      const r = (v.radius ?? 30);
      // multiple soft purple puffs that drift
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + time * 0.5;
        const dx = Math.cos(a) * r * 0.45 * (0.5 + t * 0.5);
        const dy = Math.sin(a) * r * 0.45 * (0.5 + t * 0.5) - t * 4;
        ctx.fillStyle = hexToRgba(v.color, inv * 0.45);
        ctx.beginPath(); ctx.arc(v.pos.x + dx, v.pos.y + dy, r * 0.42, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = hexToRgba(v.color, inv * 0.18);
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "ge_hologram": {
      // Faint gold humanoid silhouette behind target.
      const flick = 0.5 + Math.sin(time * 30) * 0.3;
      ctx.fillStyle = hexToRgba(v.color, inv * 0.6 * flick);
      ctx.fillRect(v.pos.x - 5, v.pos.y - 11, 10, 20);
      ctx.fillStyle = hexToRgba("#ffe89a", inv * 0.4 * flick);
      ctx.beginPath(); ctx.arc(v.pos.x, v.pos.y - 12, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
}

const PROP_RESPAWN_DELAY = 30;
// Routes all prop damage. If `kind` is "house" we require the source to be a house-breaker stand
// or a strong ability. Otherwise the hit is ignored (the bonk lands but the wall holds).
function damageProp(w: World, p: Prop, dmg: number, source?: { abilityKind?: string; abilityKey?: string; standId?: StandId }) {
  if (p.destructible !== true) return;
  if ((p.hp ?? 0) <= 0) return;
  // Strict gate: only Star Platinum / SPTW can damage props at all, OR a specific
  // (stand, abilityKey) pair listed in PROP_BREAKERS_BY_MOVE.
  {
    const sid = source?.standId ?? w.standId;
    const ak = source?.abilityKey ?? "";
    const allowed = PROP_BREAKERS_BY_STAND.has(sid) || (ak && PROP_BREAKERS_BY_MOVE.has(`${sid}:${ak}`));
    if (!allowed) {
      p.hitFlashUntil = w.time + 0.06;
      spawnParticles(w, { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 }, "#caa472", 2, {
        shape: "square", gravity: 40, speedMin: 10, speedMax: 30, life: 0.25,
      });
      return;
    }
  }
  p.hp = (p.hp ?? 0) - dmg;
  p.hitFlashUntil = w.time + 0.12;
  spawnParticles(w, { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 }, "#a07050", 4, {
    shape: "square", gravity: 80, speedMin: 30, speedMax: 100, life: 0.4,
  });
  if (p.hp <= 0) {
    p.hp = 0;
    p.destroyedAt = w.time;
    p.respawnAt = w.time + PROP_RESPAWN_DELAY;
    spawnParticles(w, { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 }, "#7a5a3a", 22, {
      shape: "square", gravity: 110, speedMin: 60, speedMax: 200, life: 0.7,
    });
    spawnVfx(w, { kind: "shockwave", pos: { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 }, radius: Math.max(p.rect.w, p.rect.h) * 0.6, color: "#caa472", life: 0.4 });
    w.shake = Math.max(w.shake, 4);
    play("propBreak");
  }
}

function damagePropsInRadius(w: World, x: number, y: number, radius: number, dmg: number, source?: { abilityKind?: string; abilityKey?: string; standId?: StandId }) {
  for (const p of w.props) {
    if (!propSolid(p)) continue;
    if (circleRectOverlap(x, y, radius, p.rect)) damageProp(w, p, dmg, source);
  }
}

// ---- public toggles for UI ----
export function toggleStandActive(w: World): boolean {
  if (w.standId === "none") return w.standActive;
  // White Album: manual toggle, but blocked while bar empty / cooling.
  if (w.standId === "white_album") {
    if (w.whiteAlbumActive) {
      // Turning OFF
      w.whiteAlbumActive = false;
      w.standActive = false;
      w.bannerText = "Suit removed";
      w.bannerUntil = w.time + 1.0;
      play("toggleOff");
      w.channel = null;
    } else {
      // Turning ON — only if bar has charge and lockout has elapsed.
      if (w.whiteAlbumBar <= 0 || w.time < w.whiteAlbumLockUntil) {
        const left = Math.max(0, Math.ceil(w.whiteAlbumLockUntil - w.time));
        w.bannerText = left > 0 ? `Suit cooling (${left}s)` : `Recharging ${Math.round(w.whiteAlbumBar)}%`;
        w.bannerUntil = w.time + 1.0;
      } else {
        w.whiteAlbumActive = true;
        w.standActive = true;
        w.bannerText = "Suit equipped";
        w.bannerUntil = w.time + 1.0;
        play("toggleOn");
      }
    }
    return w.whiteAlbumActive;
  }
  w.standActive = !w.standActive;
  w.bannerText = w.standActive ? "Stand summoned" : "Stand desummoned";
  w.bannerUntil = w.time + 1.0;
  if (w.standActive) play("toggleOn");
  else { play("toggleOff"); w.channel = null; }
  return w.standActive;
}

export function tryUseDisc(w: World): { ok: boolean; reason?: string } {
  if (w.standId === "none") return { ok: false, reason: "No stand to discard" };
  if (w.standId === "ebony_devil" && w.puppet.active) {
    w.bannerText = "Desummon puppet first (tap 1)";
    w.bannerUntil = w.time + 1.4;
    return { ok: false, reason: "puppet" };
  }
  return { ok: true };
}

// Hanged Man: teleport the player (or piloted stand) to a chosen mirror shard.
export function teleportToShard(w: World, shardId: number) {
  const s = w.shards.find((x) => x.id === shardId && w.time < x.expireAt);
  w.shardPickerOpen = false;
  if (!s) return;
  // flash at origin and destination
  const origin = w.hangedManActive ? w.hangedMan.pos : w.player.pos;
  spawnVfx(w, { kind: "shard_flash", pos: { x: origin.x, y: origin.y }, radius: 24, color: "#dfe6f0", life: 0.4 });
  if (w.pilotActive) {
    w.hangedMan.pos = { x: s.pos.x, y: s.pos.y };
  } else {
    w.player.pos = { x: s.pos.x, y: s.pos.y };
    pushOutOfProps(w.player, w.props);
  }
  spawnVfx(w, { kind: "shard_flash", pos: { x: s.pos.x, y: s.pos.y }, radius: 24, color: "#dfe6f0", life: 0.4 });
  // commit the cooldown now
  const ab = STANDS[w.standId].abilities.a3;
  w.cdTimers.a3 = ab.cooldown;
  play("shard");
}

export function closeShardPicker(w: World) {
  w.shardPickerOpen = false;
}

// ---------- Save / Load ----------
export interface SaveData {
  v: number;
  standId: StandId;
  shitVariant: boolean;
  arrows: number;
  discs: number;
  kills: number;
  hp: number;
  maxHp: number;
  px: number;
  py: number;
  echoesAct: number;
  whiteAlbumActive?: boolean;
  whiteAlbumBar?: number;
  boingoTalkedTo?: boolean;
}

export function exportSave(w: World, arrows: number, discs: number): SaveData {
  return {
    v: 1,
    standId: w.standId,
    shitVariant: w.shitVariant,
    arrows,
    discs,
    kills: w.kills,
    hp: w.player.hp,
    maxHp: w.player.maxHp,
    px: w.player.pos.x,
    py: w.player.pos.y,
    echoesAct: w.echoesAct,
    whiteAlbumActive: (w as any).whiteAlbumActive ?? true,
    whiteAlbumBar: (w as any).whiteAlbumBar ?? 100,
    boingoTalkedTo: (w as any).boingoTalkedTo ?? false,
  };
}

export function applySave(w: World, s: SaveData): { arrows: number; discs: number } {
  resetStandRuntime(w);
  w.standId = s.standId;
  w.shitVariant = !!s.shitVariant;
  w.kills = s.kills | 0;
  w.player.hp = Math.max(1, Math.min(s.maxHp || w.player.maxHp, s.hp));
  w.player.maxHp = s.maxHp || w.player.maxHp;
  w.player.pos = { x: s.px, y: s.py };
  pushOutOfProps(w.player, w.props);
  w.echoesAct = (s.echoesAct as 1 | 2 | 3) || 1;
  if ((w as any).whiteAlbumActive !== undefined) (w as any).whiteAlbumActive = s.whiteAlbumActive ?? true;
  if ((w as any).whiteAlbumBar !== undefined) (w as any).whiteAlbumBar = s.whiteAlbumBar ?? 100;
  if ((w as any).boingoTalkedTo !== undefined) (w as any).boingoTalkedTo = !!s.boingoTalkedTo;
  w.bannerText = "Game loaded";
  w.bannerUntil = w.time + 1.6;
  return { arrows: s.arrows | 0, discs: s.discs | 0 };
}
