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
  ItemPickup,
  Particle,
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
export const MAP_W = 900;
export const MAP_H = 1400;
const CAMERA_ZOOM = 1.35;

const PLAYER_SPEED = 110;
const PLAYER_SPRINT_SPEED = 142;
const NPC_SPEED = 55;
const ENEMY_SPEED = 70;
const ENEMY_AGGRO = 140;
const ENEMY_ATTACK_RANGE = 22;
const ENEMY_ATTACK_DMG = 6;
const ENEMY_ATTACK_CD = 1.2;
const PLAYER_MAX_HP = 100;
const NPC_MAX_HP = 30;
const ENEMY_MAX_HP = 45;
const RESPAWN_DELAY = 6;
const FRIENDLY_COUNT = 5;
const ENEMY_COUNT = 4;
const ARROW_INTERVAL = [10, 18] as const;
const DISC_INTERVAL = [22, 38] as const;
const MAX_ITEMS_ON_GROUND = 4;
const PICKUP_RADIUS = 18;
const AIM_ASSIST_RANGE = 260;

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
  pressed: { m1: boolean; a1: boolean; a2: boolean; a3: boolean; a4: boolean };
  useArrow: boolean;
  useDisc: boolean;
}

export function makeInput(): InputState {
  return {
    joy: { x: 0, y: 0 },
    joyActive: false,
    pressed: { m1: false, a1: false, a2: false, a3: false, a4: false },
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
  bannerText: string | null;
  bannerUntil: number;
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
}

function makeProps(): Prop[] {
  const props: Prop[] = [];

  // Trees (round canopies + brown trunk; collision = trunk + roots area, smaller than canopy)
  const treeSpots: Vec2[] = [];
  for (let i = 0; i < 28; i++) {
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
        // canopy
        ctx.fillStyle = "#1f5d2a";
        ctx.beginPath();
        ctx.arc(rr.x + rr.w / 2, rr.y - 8, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a7a38";
        ctx.beginPath();
        ctx.arc(rr.x + rr.w / 2 - 4, rr.y - 12, 14, 0, Math.PI * 2);
        ctx.fill();
        // trunk
        ctx.fillStyle = "#5a3a1c";
        ctx.fillRect(rr.x + rr.w / 2 - 4, rr.y, 8, rr.h);
      },
    });
  }

  // Rocks (gray ovals)
  for (let i = 0; i < 14; i++) {
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

  // Bushes (small dark green) — non-blocking? Make them blocking small
  for (let i = 0; i < 18; i++) {
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

  // Houses (a couple) — bigger collision
  const houses: Vec2[] = [
    { x: 180, y: 250 },
    { x: 700, y: 900 },
    { x: 250, y: 1100 },
  ];
  for (const h of houses) {
    const r: Rect = { x: h.x - 40, y: h.y - 30, w: 80, h: 60 };
    props.push({
      rect: r,
      draw: (ctx, rr) => {
        // body
        ctx.fillStyle = "#caa472";
        ctx.fillRect(rr.x, rr.y + 10, rr.w, rr.h - 10);
        // roof
        ctx.fillStyle = "#7a3a2a";
        ctx.beginPath();
        ctx.moveTo(rr.x - 4, rr.y + 14);
        ctx.lineTo(rr.x + rr.w / 2, rr.y - 12);
        ctx.lineTo(rr.x + rr.w + 4, rr.y + 14);
        ctx.closePath();
        ctx.fill();
        // door
        ctx.fillStyle = "#3a2418";
        ctx.fillRect(rr.x + rr.w / 2 - 7, rr.y + rr.h - 18, 14, 18);
        // window
        ctx.fillStyle = "#9bd9ff";
        ctx.fillRect(rr.x + 8, rr.y + 20, 12, 10);
        ctx.fillRect(rr.x + rr.w - 20, rr.y + 20, 12, 10);
      },
    });
  }

  // Fence segments
  for (let i = 0; i < 6; i++) {
    const x = rand(50, MAP_W - 100);
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

  return props;
}

function freeSpot(props: Prop[], radius: number): Vec2 {
  for (let i = 0; i < 100; i++) {
    const x = rand(30, MAP_W - 30);
    const y = rand(30, MAP_H - 30);
    let ok = true;
    for (const p of props) if (circleRectOverlap(x, y, radius + 4, p.rect)) { ok = false; break; }
    if (ok) return { x, y };
  }
  return { x: MAP_W / 2, y: MAP_H / 2 };
}

function makeNpc(props: Prop[], kind: "friendly" | "enemy", id: number): Entity {
  const pos = freeSpot(props, 10);
  return {
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
    pos: { x: MAP_W / 2, y: MAP_H / 2 },
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

  return {
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
    bannerText: null,
    bannerUntil: 0,
    nextId: 1000,
    shake: 0,
    cam: { x: 0, y: 0 },
    standPunchUntil: 0,
    standPunchDir: { x: 0, y: 1 },
    standAimUntil: 0,
    standAimTarget: null,
    kills: 0,
    footstepAcc: 0,
    pointerAim: null,
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
  };
}

// movement with collision
function tryMove(e: Entity, dx: number, dy: number, props: Prop[]) {
  // X axis
  let nx = e.pos.x + dx;
  if (nx - e.radius < 0) nx = e.radius;
  if (nx + e.radius > MAP_W) nx = MAP_W - e.radius;
  let blocked = false;
  for (const p of props) if (circleRectOverlap(nx, e.pos.y, e.radius, p.rect)) { blocked = true; break; }
  if (!blocked) e.pos.x = nx;

  let ny = e.pos.y + dy;
  if (ny - e.radius < 0) ny = e.radius;
  if (ny + e.radius > MAP_H) ny = MAP_H - e.radius;
  blocked = false;
  for (const p of props) if (circleRectOverlap(e.pos.x, ny, e.radius, p.rect)) { blocked = true; break; }
  if (!blocked) e.pos.y = ny;
}

function spawnDmg(w: World, pos: Vec2, dmg: number, color = "#fff") {
  const tier = dmg >= 15 ? 22 : dmg >= 8 ? 17 : dmg >= 3 ? 13 : 10;
  const text = dmg < 1 ? dmg.toFixed(1) : Math.round(dmg).toString();
  w.damageNumbers.push({
    id: w.nextId++,
    pos: { x: pos.x + rand(-6, 6), y: pos.y - 6 },
    text,
    color: dmg >= 15 ? "#ffd24a" : dmg >= 8 ? "#ff8a3a" : color,
    size: tier,
    vy: -28,
    bornAt: w.time,
    expireAt: w.time + 0.9,
  });
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

function damageEntity(w: World, e: Entity, dmg: number, knockback?: { dir: Vec2; amount: number }) {
  if (!e.alive) return;
  e.hp -= dmg;
  e.hitFlashUntil = w.time + 0.12;
  spawnDmg(w, e.pos, dmg);
  spawnParticles(w, e.pos, "#ffd0a8", 4);
  if (e.kind === "enemy") e.provoked = true;
  if (e.kind === "player") play("hurt");
  if (knockback) {
    e.vel.x += knockback.dir.x * knockback.amount;
    e.vel.y += knockback.dir.y * knockback.amount;
  }
  if (e.hp <= 0) {
    e.alive = false;
    e.respawnAt = w.time + RESPAWN_DELAY;
    spawnParticles(w, e.pos, e.color, 14);
    if (e.kind === "enemy") w.kills++;
  }
}

function getAbility(w: World, key: "m1" | "a1" | "a2" | "a3" | "a4"): Ability {
  const stand = STANDS[w.standId];
  const a = stand.abilities[key];
  if (w.standId === "echoes" && key === "a4" && w.shitVariant) return SHIT_ABILITY;
  return a;
}

function aimDir(w: World, input: InputState): Vec2 {
  if (input.joyActive && (input.joy.x !== 0 || input.joy.y !== 0)) {
    return norm(input.joy);
  }
  return w.player.facing;
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
  return "punch";
}

function castAbility(w: World, key: "m1" | "a1" | "a2" | "a3" | "a4", input: InputState) {
  const stand = STANDS[w.standId];
  if (stand.id === "none" && key !== "m1") return;
  const ab = getAbility(w, key);
  if (ab.damage === 0 && ab.kind !== "stun_touch") return;
  if (w.cdTimers[key] > 0) return;
  w.cdTimers[key] = ab.cooldown;

  const dir = aimDir(w, input);
  const p = w.player.pos;
  const sfx = sfxFor(w, key);

  // Generic cast cue (sound) — channel handles its own ticks
  if (ab.kind !== "channel_cone") play(sfx);

  // Stand aiming: project the stand model toward the cast target/direction
  w.standAimUntil = w.time + 0.4;
  if (ab.kind === "aoe_target" || ab.kind === "lobbed" || ab.kind === "stun_touch" || ab.kind === "knockback" || ab.kind === "channel_cone" || ab.kind === "pierce" || ab.kind === "projectile") {
    w.standAimTarget = { x: w.player.pos.x + dir.x * Math.min(ab.range, 60), y: w.player.pos.y + dir.y * Math.min(ab.range, 60) };
  }

  switch (ab.kind) {
    case "melee": {
      const angle = Math.atan2(dir.y, dir.x);
      const reach = ab.range + (ab.radius ?? 14);
      // slash arc VFX so misses still feel responsive
      spawnVfx(w, { kind: "slash_arc", pos: { x: p.x, y: p.y }, angle, radius: reach, color: ab.color, life: 0.2 });
      // Hit any NPC within an arc in front of the player (cone test).
      for (const e of w.npcs) {
        if (!e.alive) continue;
        const dx = e.pos.x - p.x, dy = e.pos.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > reach + e.radius) continue;
        // cone of ~140deg facing dir; if very close (touching) ignore facing
        if (d < e.radius + 6) { damageEntity(w, e, ab.damage); continue; }
        const dot = (dx * dir.x + dy * dir.y) / (d || 1);
        if (dot > 0.3) damageEntity(w, e, ab.damage);
      }
      const tx = p.x + dir.x * ab.range;
      const ty = p.y + dir.y * ab.range;
      spawnParticles(w, { x: tx, y: ty }, ab.color, 6);
      // trigger stand-punch animation
      w.standPunchUntil = w.time + 0.25;
      w.standPunchDir = { x: dir.x, y: dir.y };
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
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: dir.x * ab.speed!, y: dir.y * ab.speed! },
        radius: ab.radius || 6,
        damage: ab.damage,
        color: ab.color,
        ownerKind: "player",
        pierce: false,
        hitSet: new Set(),
        expireAt: w.time + ab.range / ab.speed!,
      });
      // muzzle flash
      spawnParticles(w, { x: p.x + dir.x * 10, y: p.y + dir.y * 10 }, ab.color, 6, { speedMin: 40, speedMax: 120, life: 0.2 });
      break;
    }
    case "lobbed": {
      const travelTime = ab.range / ab.speed!;
      w.projectiles.push({
        id: w.nextId++,
        pos: { x: p.x, y: p.y },
        vel: { x: dir.x * ab.speed!, y: dir.y * ab.speed! },
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
      const tx = p.x + dir.x * ab.range;
      const ty = p.y + dir.y * ab.range;
      for (const e of w.npcs) {
        if (!e.alive) continue;
        if (dist2(e.pos, { x: tx, y: ty }) < (ab.radius! + e.radius) ** 2) {
          damageEntity(w, e, ab.damage);
        }
      }
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
      const tx = p.x + dir.x * ab.range, ty = p.y + dir.y * ab.range;
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
      const tx = p.x + dir.x * ab.range, ty = p.y + dir.y * ab.range;
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
      const tx = p.x + dir.x * ab.range, ty = p.y + dir.y * ab.range;
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
    case "auto_aim": {
      // Pick nearest HOSTILE within range; fall back to nearest friendly only if no enemy in range.
      let target: Entity | null = null;
      let best = ab.range * ab.range;
      for (const e of w.npcs) {
        if (!e.alive || e.kind !== "enemy") continue;
        const d = dist2(e.pos, p);
        if (d < best) { best = d; target = e; }
      }
      if (!target) {
        // fallback: any alive npc in range
        best = ab.range * ab.range;
        for (const e of w.npcs) {
          if (!e.alive) continue;
          const d = dist2(e.pos, p);
          if (d < best) { best = d; target = e; }
        }
      }
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
  }
}

function trySpawnItem(w: World, kind: "arrow" | "disc") {
  if (w.items.length >= MAX_ITEMS_ON_GROUND) return;
  const pos = freeSpot(w.props, 10);
  w.items.push({ id: w.nextId++, kind, pos, bornAt: w.time });
}

export function update(w: World, input: InputState, dt: number) {
  w.time += dt;

  // Cooldowns
  for (const k of ["m1", "a1", "a2", "a3", "a4"] as const) {
    if (w.cdTimers[k] > 0) w.cdTimers[k] = Math.max(0, w.cdTimers[k] - dt);
  }

  // Player movement
  const pl = w.player;
  if (pl.alive) {
    const j = input.joy;
    const len = Math.hypot(j.x, j.y);
    if (len > 0.05) {
      const nx = j.x / Math.max(1, len), ny = j.y / Math.max(1, len);
      const speed = PLAYER_SPEED * Math.min(1, len);
      tryMove(pl, nx * speed * dt, ny * speed * dt, w.props);
      pl.facing = { x: nx, y: ny };
      w.footstepAcc += dt * Math.min(1, len);
      if (w.footstepAcc >= 0.32) { w.footstepAcc = 0; play("footstep"); }
    } else {
      w.footstepAcc = 0.32; // ready to step on next move
    }
  } else {
    if (pl.respawnAt && w.time >= pl.respawnAt) {
      pl.alive = true;
      pl.hp = pl.maxHp;
      pl.pos = { x: MAP_W / 2, y: MAP_H / 2 };
    }
  }

  // Item use buttons
  if (input.useArrow) {
    input.useArrow = false;
    // consumed by Game component which decrements arrows; here we only roll if it asked
  }
  if (input.useDisc) input.useDisc = false;

  // NPC AI
  for (const e of w.npcs) {
    if (!e.alive) {
      if (e.respawnAt && w.time >= e.respawnAt) {
        // respawn at random spot
        const spot = freeSpot(w.props, 10);
        e.pos = spot;
        e.hp = e.maxHp;
        e.alive = true;
        e.provoked = false;
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

    if (e.kind === "enemy" && e.provoked && pl.alive && dist2(e.pos, pl.pos) < ENEMY_AGGRO * ENEMY_AGGRO) {
      const dir = norm({ x: pl.pos.x - e.pos.x, y: pl.pos.y - e.pos.y });
      tryMove(e, dir.x * ENEMY_SPEED * dt, dir.y * ENEMY_SPEED * dt, w.props);
      e.facing = dir;
      if (dist(e.pos, pl.pos) < ENEMY_ATTACK_RANGE && (!e.nextAttackAt || w.time >= e.nextAttackAt)) {
        e.nextAttackAt = w.time + ENEMY_ATTACK_CD;
        damageEntity(w, pl, ENEMY_ATTACK_DMG, { dir, amount: 40 });
      }
    } else {
      // wander
      if (!e.wanderUntil || w.time >= e.wanderUntil || !e.wanderTarget) {
        e.wanderTarget = freeSpot(w.props, 10);
        e.wanderUntil = w.time + rand(2, 5);
      }
      const tgt = e.wanderTarget;
      const d = dist(e.pos, tgt);
      if (d > 4) {
        const dir = norm({ x: tgt.x - e.pos.x, y: tgt.y - e.pos.y });
        tryMove(e, dir.x * NPC_SPEED * dt, dir.y * NPC_SPEED * dt, w.props);
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

  // Projectiles
  for (const pr of w.projectiles) {
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
      if (circleRectOverlap(pr.pos.x, pr.pos.y, pr.radius, p.rect)) { pr.expireAt = 0; spawnParticles(w, pr.pos, pr.color, 4); break; }
    }
    if (pr.expireAt === 0) continue;
    // hit npcs
    for (const e of w.npcs) {
      if (!e.alive || pr.hitSet.has(e.id)) continue;
      if (dist2(e.pos, pr.pos) < (pr.radius + e.radius) ** 2) {
        damageEntity(w, e, pr.damage);
        pr.hitSet.add(e.id);
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

  // Damage numbers
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
    w.nextArrowAt = rand(ARROW_INTERVAL[0], ARROW_INTERVAL[1]);
  }
  w.nextDiscAt -= dt;
  if (w.nextDiscAt <= 0) {
    trySpawnItem(w, "disc");
    w.nextDiscAt = rand(DISC_INTERVAL[0], DISC_INTERVAL[1]);
  }

  // Banner timeout
  if (w.bannerText && w.time >= w.bannerUntil) w.bannerText = null;

  // Shake decays
  w.shake *= 0.85;

  // Camera
  const camTargetX = Math.max(VW / 2, Math.min(MAP_W - VW / 2, pl.pos.x));
  const camTargetY = Math.max(VH / 2, Math.min(MAP_H - VH / 2, pl.pos.y));
  w.cam.x += (camTargetX - w.cam.x) * Math.min(1, dt * 6);
  w.cam.y += (camTargetY - w.cam.y) * Math.min(1, dt * 6);
}

// API for UI side
export function tryPickupItems(w: World): { arrows: number; discs: number } {
  let a = 0, d = 0;
  const remain: ItemPickup[] = [];
  for (const it of w.items) {
    if (dist2(it.pos, w.player.pos) < (PICKUP_RADIUS + w.player.radius) ** 2) {
      if (it.kind === "arrow") { a++; play("pickupArrow"); }
      else { d++; play("pickupDisc"); }
    } else remain.push(it);
  }
  w.items = remain;
  return { arrows: a, discs: d };
}

export function useArrow(w: World) {
  const { id, shitVariant } = rollStand();
  w.standId = id;
  w.shitVariant = shitVariant;
  w.cdTimers = { m1: 0, a1: 0, a2: 0, a3: 0, a4: 0 };
  w.channel = null;
  const name = STANDS[id].name + (shitVariant ? " (S.H.I.T.!)" : "");
  w.bannerText = "Stand: " + name;
  w.bannerUntil = w.time + 2.5;
  play("rollStand");
  play("standSummon");
}

export function useDisc(w: World) {
  if (w.standId === "none") return;
  w.standId = "none";
  w.shitVariant = false;
  w.channel = null;
  w.bannerText = "Stand discarded";
  w.bannerUntil = w.time + 1.5;
  play("pickupDisc");
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

  // Camera with shake
  const sx = (Math.random() - 0.5) * w.shake;
  const sy = (Math.random() - 0.5) * w.shake;
  const camX = w.cam.x - VW / 2 + sx;
  const camY = w.cam.y - VH / 2 + sy;
  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));

  // Grass background — tiled checker
  const tile = 32;
  const x0 = Math.floor(camX / tile) * tile;
  const y0 = Math.floor(camY / tile) * tile;
  for (let y = y0; y < camY + VH + tile; y += tile) {
    for (let x = x0; x < camX + VW + tile; x += tile) {
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

  // Items
  for (const it of w.items) {
    const bob = Math.sin((w.time - it.bornAt) * 4) * 2;
    const cx = it.pos.x, cy = it.pos.y + bob;
    // soft drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(it.pos.x, it.pos.y + 8, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (it.kind === "arrow") {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      // shaft
      ctx.fillStyle = "#3a2418";
      ctx.fillRect(-10, -1, 16, 3);
      // arrowhead
      ctx.fillStyle = "#caa14a";
      ctx.beginPath();
      ctx.moveTo(6, -6); ctx.lineTo(13, 0); ctx.lineTo(6, 6); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e8c870";
      ctx.beginPath();
      ctx.moveTo(7, -3); ctx.lineTo(11, 0); ctx.lineTo(7, 3); ctx.closePath();
      ctx.fill();
      // fletching
      ctx.fillStyle = "#caa14a";
      ctx.fillRect(-12, -4, 4, 8);
      ctx.fillStyle = "#5a3a1c";
      ctx.fillRect(-12, -1, 4, 2);
      ctx.restore();
    } else {
      // DISC — chrome metallic vinyl with hollow center and "DISC" label
      // outer ring (chrome gradient feel via stacked arcs)
      const grd = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 11);
      grd.addColorStop(0, "#f5f5f8");
      grd.addColorStop(0.55, "#a8acb4");
      grd.addColorStop(1, "#5e636c");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
      // grooves
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(40,40,46,0.5)";
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
      // hollow center (transparent → show grass): draw same color as ground tile beneath approx
      ctx.fillStyle = "#3e8a3a";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      // tiny chrome bevel
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.stroke();
      // "DISC" label
      ctx.save();
      ctx.fillStyle = "#1a1a1f";
      ctx.font = "bold 5px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DISC", cx, cy - 7);
      ctx.restore();
    }
  }

  // Sort props + entities by Y for proper overlap
  type Drawable = { y: number; draw: () => void };
  const drawables: Drawable[] = [];
  for (const p of w.props) {
    drawables.push({ y: p.rect.y + p.rect.h, draw: () => p.draw(ctx, p.rect) });
  }
  // player
  const pl = w.player;
  if (pl.alive) drawables.push({ y: pl.pos.y, draw: () => drawPlayer(ctx, w) });
  for (const e of w.npcs) {
    if (e.alive) drawables.push({ y: e.pos.y, draw: () => drawNpc(ctx, w, e) });
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

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

  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, w: World) {
  const pl = w.player;
  // Stand drawn UNDER player when behind, OVER when in front. We compute pos and z-order.
  const standPos = computeStandPos(w);
  const standInFront = standPos.y >= pl.pos.y;
  if (w.standId !== "none" && !standInFront) drawStand(ctx, w, standPos);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(pl.pos.x, pl.pos.y + 8, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  // stand aura
  if (w.standId !== "none") {
    const auraColor = STANDS[w.standId].color;
    ctx.fillStyle = hexToRgba(auraColor, 0.18 + Math.sin(w.time * 6) * 0.05);
    ctx.beginPath(); ctx.arc(pl.pos.x, pl.pos.y, 16, 0, Math.PI * 2); ctx.fill();
  }
  // body
  const flash = w.time < pl.hitFlashUntil;
  ctx.fillStyle = flash ? "#ffffff" : "#caa14a";
  ctx.fillRect(pl.pos.x - 6, pl.pos.y - 2, 12, 10);
  // head
  ctx.fillStyle = flash ? "#ffffff" : pl.color;
  ctx.fillRect(pl.pos.x - 5, pl.pos.y - 10, 10, 9);
  // eyes (face direction)
  const fx = pl.facing.x, fy = pl.facing.y;
  ctx.fillStyle = "#222";
  ctx.fillRect(pl.pos.x - 3 + Math.sign(fx) * 1, pl.pos.y - 6 + Math.sign(fy) * 1, 2, 2);
  ctx.fillRect(pl.pos.x + 1 + Math.sign(fx) * 1, pl.pos.y - 6 + Math.sign(fy) * 1, 2, 2);
  // hp bar (only if damaged)
  if (pl.hp < pl.maxHp) drawHpBar(ctx, pl.pos.x, pl.pos.y - 16, pl.hp / pl.maxHp);
  if (w.standId !== "none") {
    const standPos = computeStandPos(w);
    if (standPos.y >= pl.pos.y) drawStand(ctx, w, standPos);
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
  else if (id === "rhcp") drawRhcp(ctx, w, pos);
  else if (id === "echoes") drawEchoes(ctx, w, pos);
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
  // Echoes form depends on how many enemies the player has hit/killed (act progression).
  // Act 1: small with tail. Act 2: bigger humanoid. Act 3: white with green accents.
  const act = w.shitVariant ? 3 : (w.kills >= 6 ? 3 : w.kills >= 2 ? 2 : 1);
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

function drawNpc(ctx: CanvasRenderingContext2D, w: World, e: Entity) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(e.pos.x, e.pos.y + 8, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  const flash = w.time < e.hitFlashUntil;
  // body
  ctx.fillStyle = flash ? "#ffffff" : (e.kind === "enemy" ? "#5a1a1a" : "#1d3a7a");
  ctx.fillRect(e.pos.x - 5, e.pos.y - 2, 10, 9);
  // head
  ctx.fillStyle = flash ? "#ffffff" : e.color;
  ctx.fillRect(e.pos.x - 4, e.pos.y - 9, 8, 8);
  // stunned mark
  if (w.time < e.stunUntil) {
    ctx.fillStyle = "#a8e8ff";
    ctx.fillRect(e.pos.x - 1, e.pos.y - 14, 2, 2);
    ctx.fillRect(e.pos.x + 2, e.pos.y - 13, 2, 2);
  }
  if (e.hp < e.maxHp) drawHpBar(ctx, e.pos.x, e.pos.y - 14, e.hp / e.maxHp);
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
  }
}

