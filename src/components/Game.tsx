import { useEffect, useRef, useState } from "react";
import {
  VW,
  VH,
  createWorld,
  makeInput,
  render,
  update,
  tryPickupItems,
  useArrow,
  useDisc,
  toggleStandActive,
  tryUseDisc,
  teleportToShard,
  closeShardPicker,
  exportSave,
  applySave,
  type InputState,
} from "@/game/engine";
import { STANDS, SHIT_ABILITY } from "@/game/stands";
import { STAND_CODEX } from "@/game/codex";
import { unlockAudio, isSoundEnabled, setSoundEnabled } from "@/game/sound";
import { startMusic, applyMusicSetting } from "@/game/music";
import type { World } from "@/game/engine";

interface UIData {
  standId: keyof typeof STANDS;
  shitVariant: boolean;
  arrows: number;
  discs: number;
  hp: number;
  maxHp: number;
  cd: { m1: number; a1: number; a2: number; a3: number; a4: number };
  banner: string | null;
  banners: { id: number; text: string }[];
  kills: number;
  rage: number;
  rageActive: boolean;
  echoesAct: number;
  timeStopActive: boolean;
  pilotActive: boolean;
  shardPickerOpen: boolean;
  shards: { id: number; pos: { x: number; y: number } }[];
  whiteAlbumBar: number;
  whiteAlbumActive: boolean;
  boingoNearby: boolean;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const inputRef = useRef<InputState>(makeInput());
  const arrowsRef = useRef(0);
  const discsRef = useRef(0);
  const [ui, setUi] = useState<UIData>({
    standId: "none",
    shitVariant: false,
    arrows: 0,
    discs: 0,
    hp: 100,
    maxHp: 100,
    cd: { m1: 0, a1: 0, a2: 0, a3: 0, a4: 0 },
    banner: null,
    banners: [],
    kills: 0,
    rage: 0,
    rageActive: false,
    echoesAct: 1,
    timeStopActive: false,
    pilotActive: false,
    shardPickerOpen: false,
    shards: [],
    whiteAlbumBar: 100,
    whiteAlbumActive: true,
    boingoNearby: false,
  });
  const [boingoOpen, setBoingoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(isSoundEnabled());
  const [showHelp, setShowHelp] = useState<boolean>(true);

  // Joystick state
  const joyRef = useRef<{ active: boolean; baseX: number; baseY: number; pointerId: number | null }>({
    active: false, baseX: 0, baseY: 0, pointerId: null,
  });
  const aimRef = useRef<{ active: boolean; pointerId: number | null }>({ active: false, pointerId: null });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = VW;
    canvas.height = VH;
    worldRef.current = createWorld();

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const STEP = 1 / 60;
    let uiTick = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; }
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      acc += dt;
      while (acc >= STEP) {
        update(worldRef.current!, inputRef.current, STEP);
        // pickups
        const got = tryPickupItems(worldRef.current!);
        if (got.arrows) arrowsRef.current += got.arrows;
        if (got.discs) discsRef.current += got.discs;
        acc -= STEP;
      }
      render(ctx, worldRef.current!);

      uiTick++;
      if (uiTick % 4 === 0) {
        const w = worldRef.current!;
        setUi({
          standId: w.standId,
          shitVariant: w.shitVariant,
          arrows: arrowsRef.current,
          discs: discsRef.current,
          hp: Math.max(0, Math.round(w.player.hp)),
          maxHp: w.player.maxHp,
          cd: { ...w.cdTimers },
          banner: w.bannerText,
          banners: w.banners.map((b) => ({ id: b.id, text: b.text })),
          kills: w.kills,
          rage: Math.round(w.rage),
          rageActive: w.time < w.rageUntil,
          echoesAct: w.echoesAct,
          timeStopActive: w.time < w.timeStopUntil,
          pilotActive: w.pilotActive || w.puppetPiloted,
          shardPickerOpen: w.shardPickerOpen,
          shards: w.shards.map((s) => ({ id: s.id, pos: { ...s.pos } })),
          whiteAlbumBar: Math.round(w.whiteAlbumBar),
          whiteAlbumActive: w.whiteAlbumActive,
          boingoNearby: Math.hypot(w.player.pos.x - w.boingo.pos.x, w.player.pos.y - w.boingo.pos.y) < 26,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard for desktop
  useEffect(() => {
    const keys = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      unlockAudio();
      if (keys.has(e.key.toLowerCase())) return; // ignore key-repeat
      keys.add(e.key.toLowerCase());
      const k = e.key.toLowerCase();
      if (k === "1") inputRef.current.pressed.a1 = true;
      if (k === "2") inputRef.current.pressed.a2 = true;
      if (k === "3") inputRef.current.pressed.a3 = true;
      if (k === "4") inputRef.current.pressed.a4 = true;
      if (k === " " || k === "f") {
        inputRef.current.pressed.m1 = true;
        inputRef.current.m1Held = true;
      }
      inputRef.current.sprint = keys.has("shift");
      updateKeyJoy();
    };
    const onUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      const k = e.key.toLowerCase();
      if (k === " " || k === "f") inputRef.current.m1Held = false;
      inputRef.current.sprint = keys.has("shift");
      updateKeyJoy();
    };
    function updateKeyJoy() {
      let x = 0, y = 0;
      if (keys.has("arrowleft") || keys.has("a")) x -= 1;
      if (keys.has("arrowright") || keys.has("d")) x += 1;
      if (keys.has("arrowup") || keys.has("w")) y -= 1;
      if (keys.has("arrowdown") || keys.has("s")) y += 1;
      const m = Math.hypot(x, y);
      if (m > 0) { x /= m; y /= m; inputRef.current.joyActive = true; }
      else inputRef.current.joyActive = false;
      inputRef.current.joy.x = x;
      inputRef.current.joy.y = y;
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  // Joystick handlers (left half of screen)
  const onJoyStart = (e: React.PointerEvent) => {
    e.preventDefault();
    unlockAudio();
    startMusic();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    joyRef.current.active = true;
    joyRef.current.baseX = e.clientX;
    joyRef.current.baseY = e.clientY;
    joyRef.current.pointerId = e.pointerId;
    inputRef.current.joyActive = true;
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (!joyRef.current.active || joyRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - joyRef.current.baseX;
    const dy = e.clientY - joyRef.current.baseY;
    const max = 50;
    const m = Math.hypot(dx, dy);
    const cx = m > max ? (dx / m) * max : dx;
    const cy = m > max ? (dy / m) * max : dy;
    inputRef.current.joy.x = cx / max;
    inputRef.current.joy.y = cy / max;
  };
  const onJoyEnd = (e: React.PointerEvent) => {
    if (joyRef.current.pointerId !== e.pointerId) return;
    joyRef.current.active = false;
    joyRef.current.pointerId = null;
    inputRef.current.joyActive = false;
    inputRef.current.joy.x = 0;
    inputRef.current.joy.y = 0;
  };

  const setAimFromPointer = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    const w = worldRef.current;
    if (!canvas || !w) return;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * VW;
    const sy = ((e.clientY - rect.top) / rect.height) * VH;
    const dx = sx - VW / 2;
    const dy = sy - VH / 2;
    const m = Math.hypot(dx, dy);
    if (m > 8) inputRef.current.aim = { x: dx / m, y: dy / m };
  };
  const onAimStart = (e: React.PointerEvent) => {
    e.preventDefault();
    unlockAudio();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    aimRef.current = { active: true, pointerId: e.pointerId };
    setAimFromPointer(e);
  };
  const onAimMove = (e: React.PointerEvent) => {
    if (!aimRef.current.active || aimRef.current.pointerId !== e.pointerId) return;
    setAimFromPointer(e);
  };
  const onAimEnd = (e: React.PointerEvent) => {
    if (aimRef.current.pointerId !== e.pointerId) return;
    aimRef.current = { active: false, pointerId: null };
    // CRITICAL: clear the aim vector so M1/abilities fall back to auto-aim.
    // Otherwise the last drag direction stays "stuck" forever and M1 swings into empty air.
    inputRef.current.aim = null;
  };

  const press = (key: "m1" | "a1" | "a2" | "a3" | "a4") => () => {
    unlockAudio();
    inputRef.current.pressed[key] = true;
  };
  const m1HoldStart = () => { unlockAudio(); inputRef.current.pressed.m1 = true; inputRef.current.m1Held = true; };
  const m1HoldEnd = () => { inputRef.current.m1Held = false; };

  const onUseArrow = () => {
    if (arrowsRef.current <= 0 || !worldRef.current) return;
    arrowsRef.current--;
    useArrow(worldRef.current);
  };
  const onUseDisc = () => {
    if (discsRef.current <= 0 || !worldRef.current) return;
    if (worldRef.current.standId === "none") return;
    const check = tryUseDisc(worldRef.current);
    if (!check.ok) return;
    discsRef.current--;
    useDisc(worldRef.current);
  };
  const onToggleStand = () => {
    if (!worldRef.current) return;
    unlockAudio();
    toggleStandActive(worldRef.current);
  };

  const SAVE_KEY = "standtest.save.v1";
  const onSave = () => {
    if (!worldRef.current) return;
    const data = exportSave(worldRef.current, arrowsRef.current, discsRef.current);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* quota */ }
  };
  const onLoad = () => {
    if (!worldRef.current) return;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const got = applySave(worldRef.current, data);
      arrowsRef.current = got.arrows;
      discsRef.current = got.discs;
    } catch { /* corrupt */ }
  };

  // Autosave every 30s
  useEffect(() => {
    const id = window.setInterval(() => onSave(), 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stand = STANDS[ui.standId as keyof typeof STANDS];
  const a4 = ui.standId === "echoes" && ui.shitVariant ? SHIT_ABILITY : stand.abilities.a4;
  const abilities = {
    m1: stand.abilities.m1,
    a1: stand.abilities.a1,
    a2: stand.abilities.a2,
    a3: stand.abilities.a3,
    a4,
  };

  const cdFrac = (key: "m1" | "a1" | "a2" | "a3" | "a4") => {
    const ab = abilities[key];
    if (!ab.cooldown) return 0;
    return Math.min(1, ui.cd[key] / ab.cooldown);
  };

  const standColor = stand.color;

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-[100dvh] overflow-hidden select-none touch-none"
      style={{ background: "#000", fontFamily: "monospace" }}
    >
      {/* Canvas — scaled to fit portrait */}
      <div className="absolute inset-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          style={{
            width: "min(100vw, calc(100dvh * 0.5625))",
            height: "min(100dvh, calc(100vw * 1.7777))",
            imageRendering: "pixelated",
            background: "#3e8a3a",
          }}
        />
      </div>

      {/* Top bar — title + HP + inventory */}
      <div className="absolute top-0 left-0 right-0 px-3 pt-3 flex flex-col gap-2 pointer-events-none z-30">
        <div className="flex items-center justify-between">
          <div className="text-white text-sm font-bold tracking-wider drop-shadow">STAND TEST</div>
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={onUseArrow}
              className="bg-black/60 border border-white/30 rounded px-2 py-1 flex items-center gap-1 text-white text-xs"
            >
              <span style={{ color: "#caa14a" }}>➤</span>
              <span>Arrow {ui.arrows}</span>
            </button>
            <button
              onClick={onUseDisc}
              className="bg-black/60 border border-white/30 rounded px-2 py-1 flex items-center gap-1 text-white text-xs"
            >
              <span style={{ color: "#cfd2d8" }}>◎</span>
              <span>DISC {ui.discs}</span>
            </button>
            <button
              onClick={() => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); applyMusicSetting(n); }}
              className="bg-black/60 border border-white/30 rounded px-2 py-1 text-white text-xs"
              title="Toggle sound"
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
            <button
              onClick={onSave}
              className="bg-black/60 border border-white/30 rounded px-2 py-1 text-white text-[10px]"
              title="Save game"
            >Save</button>
            <button
              onClick={onLoad}
              className="bg-black/60 border border-white/30 rounded px-2 py-1 text-white text-[10px]"
              title="Load saved game"
            >Load</button>
          </div>
        </div>
        {/* HP bar */}
        <div className="bg-black/60 border border-white/30 rounded h-3 overflow-hidden w-40">
          <div
            className="h-full transition-[width]"
            style={{
              width: `${(ui.hp / ui.maxHp) * 100}%`,
              background: ui.hp / ui.maxHp > 0.5 ? "#5fd16a" : ui.hp / ui.maxHp > 0.25 ? "#e0c34a" : "#d04848",
            }}
          />
        </div>
        {/* Kill counter */}
        <div className="text-[10px] text-white/80 self-start">Kills: {ui.kills}</div>
        {/* Stand label */}
        <div
          className="text-xs px-2 py-0.5 rounded self-start font-bold"
          style={{ background: "rgba(0,0,0,0.6)", color: standColor, border: `1px solid ${standColor}` }}
        >
          {stand.name}{ui.standId === "echoes" && ui.shitVariant ? " (S.H.I.T.)" : ""}
        </div>
        {/* Piloting chip — under the stand name (per user spec) */}
        {ui.pilotActive && (
          <div className="px-2 py-0.5 rounded text-[10px] font-bold self-start"
               style={{ background: "rgba(0,0,0,0.7)", color: standColor, border: `1px solid ${standColor}` }}>
            🎮 PILOTING
          </div>
        )}
        {ui.standId === "ebony_devil" && (
          <div className="bg-black/60 border border-white/30 rounded h-2 overflow-hidden w-32">
            <div
              className="h-full transition-[width]"
              style={{ width: `${ui.rage}%`, background: ui.rageActive ? "#ff3d3d" : "#d04848" }}
            />
          </div>
        )}
        {ui.standId === "purple_haze" && ui.cleanslyActive && (
          <div className="flex items-center gap-1 self-start">
            <div className="bg-black/60 border border-white/30 rounded h-2 overflow-hidden w-32">
              <div className="h-full transition-[width]" style={{ width: `${ui.cleanslyFrac * 100}%`, background: "#ff6bd1" }} />
            </div>
            <span className="text-[9px] text-white/80 font-bold">VIOLENCE</span>
          </div>
        )}
        {ui.standId === "white_album" && (
          <div className="flex items-center gap-1 self-start">
            <div className="bg-black/60 border border-white/30 rounded h-2 overflow-hidden w-32">
              <div
                className="h-full transition-[width]"
                style={{
                  width: `${ui.whiteAlbumBar}%`,
                  background: ui.whiteAlbumActive ? "#bff5ff" : "#5b6a8c",
                }}
              />
            </div>
            <span className="text-[9px] text-white/80 font-bold">
              {ui.whiteAlbumActive ? "SUIT" : "COOL"}
            </span>
          </div>
        )}
      </div>

      {/* Banners — stacked so multiple notifications never overlap */}
      {ui.banners.length > 0 && (
        <div className="absolute top-1/3 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none">
          {ui.banners.slice(-5).map((b) => (
            <div
              key={b.id}
              className="px-4 py-2 rounded text-sm font-bold"
              style={{ background: "rgba(0,0,0,0.75)", color: standColor, border: `2px solid ${standColor}` }}
            >
              {b.text}
            </div>
          ))}
        </div>
      )}

      {/* Help / controls */}
      {showHelp && (
        <div className="absolute inset-x-3 top-24 bg-black/75 border border-white/30 rounded p-3 text-white text-[11px] z-30 pointer-events-auto"
             onClick={() => setShowHelp(false)}>
          <div className="font-bold mb-1 text-sm">How to play (tap to close)</div>
          <div>• Drag the LEFT half to move (or WASD).</div>
          <div>• Tap M1 / 1-4 to attack (or Space, 1-4). Hold M1 to auto-repeat.</div>
          <div>• M1 auto-aims at the closest NPC. 1-4 lock onto the closest enemy.</div>
          <div>• Pick up <span style={{color:"#caa14a"}}>Arrows</span> to roll a stand. <span style={{color:"#cfd2d8"}}>DISCs</span> remove your stand.</div>
          <div>• Tap "Stand: ON/OFF" to dismiss/resummon your stand.</div>
          <div>• Hostile NPCs (red) only attack after you provoke them. You slowly regen out of combat.</div>
        </div>
      )}
      {!showHelp && (
        <button
          onClick={() => setShowHelp(true)}
          className="absolute top-24 right-3 bg-black/60 border border-white/30 rounded px-2 py-1 text-white text-[10px] z-30"
        >
          ?
        </button>
      )}

      {/* Joystick area (left half, bottom) */}
      <div
        className="absolute left-0 bottom-0 w-1/2 h-1/2"
        style={{ touchAction: "none" }}
        onPointerDown={onJoyStart}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyEnd}
        onPointerCancel={onJoyEnd}
      >
        {joyRef.current.active && (
          <>
            <div
              className="absolute rounded-full border-2 border-white/40 bg-white/10"
              style={{
                width: 110, height: 110,
                left: joyRef.current.baseX - 55,
                top: joyRef.current.baseY - 55,
                pointerEvents: "none",
              }}
            />
            <div
              className="absolute rounded-full bg-white/60"
              style={{
                width: 50, height: 50,
                left: joyRef.current.baseX - 25 + inputRef.current.joy.x * 30,
                top: joyRef.current.baseY - 25 + inputRef.current.joy.y * 30,
                pointerEvents: "none",
              }}
            />
          </>
        )}
      </div>

      {/* Aim area: drag the right half to aim; buttons use this direction, otherwise auto-aim picks a nearby target. */}
      <div
        className="absolute right-0 top-0 w-1/2 h-full z-10"
        style={{ touchAction: "none" }}
        onPointerDown={onAimStart}
        onPointerMove={onAimMove}
        onPointerUp={onAimEnd}
        onPointerCancel={onAimEnd}
      />

      {/* Ability buttons (right side) */}
      <div className="absolute right-2 bottom-3 flex flex-col items-end gap-2 pointer-events-none z-20">
        <div className="flex gap-2">
          <AbilityBtn label="1" name={abilities.a1.name} damage={abilities.a1.damage} color={abilities.a1.color} cdFrac={cdFrac("a1")} disabled={ui.standId === "none" || abilities.a1.name === "-"} onPress={press("a1")} />
          <AbilityBtn label="2" name={abilities.a2.name} damage={abilities.a2.damage} color={abilities.a2.color} cdFrac={cdFrac("a2")} disabled={ui.standId === "none" || abilities.a2.name === "-"} onPress={press("a2")} />
        </div>
        <div className="flex gap-2">
          <AbilityBtn label="3" name={abilities.a3.name} damage={abilities.a3.damage} color={abilities.a3.color} cdFrac={cdFrac("a3")} disabled={ui.standId === "none" || abilities.a3.name === "-"} onPress={press("a3")} />
          <AbilityBtn label="4" name={abilities.a4.name} damage={abilities.a4.damage} color={abilities.a4.color} cdFrac={cdFrac("a4")} disabled={ui.standId === "none" || abilities.a4.name === "-" || (ui.standId === "ebony_devil" && ui.rage < 100 && !ui.rageActive)} onPress={press("a4")} />
        </div>
        <AbilityBtn label="M1" name={abilities.m1.name} damage={abilities.m1.damage} color={abilities.m1.color} cdFrac={cdFrac("m1")} big onPress={press("m1")} onHoldStart={m1HoldStart} onHoldEnd={m1HoldEnd} />
        {ui.standId !== "none" && (
          <button
            onClick={onToggleStand}
            className="bg-black/70 border border-white/40 rounded px-2 py-1 text-white text-[10px] pointer-events-auto"
            style={{ touchAction: "none" }}
          >
            Stand: ON/OFF
          </button>
        )}
      </div>

      {/* Pilot / Time Stop status chips */}
      {(ui.pilotActive || ui.timeStopActive) && (
        <div className="absolute top-24 left-3 flex flex-col gap-1 z-30 pointer-events-none">
          {ui.timeStopActive && (
            <div className="px-2 py-0.5 rounded text-[10px] font-bold"
                 style={{ background: "rgba(0,0,0,0.7)", color: "#dcd6ff", border: "1px solid #dcd6ff" }}>
              ⏱ TIME STOPPED
            </div>
          )}
          {ui.pilotActive && (
            <div className="px-2 py-0.5 rounded text-[10px] font-bold"
                 style={{ background: "rgba(0,0,0,0.7)", color: "#cfd6e3", border: "1px solid #cfd6e3" }}>
              🎮 PILOTING
            </div>
          )}
        </div>
      )}

      {/* Shard picker (Hanged Man teleport) */}
      {ui.shardPickerOpen && worldRef.current && (
        <div className="absolute inset-0 bg-black/60 z-40 flex items-center justify-center p-6"
             onClick={() => { if (worldRef.current) closeShardPicker(worldRef.current); }}>
          <div className="bg-black/80 border border-white/40 rounded p-4 max-w-xs w-full"
               onClick={(e) => e.stopPropagation()}>
            <div className="text-white text-sm font-bold mb-2">Teleport to shard</div>
            {ui.shards.length === 0 ? (
              <div className="text-white/70 text-xs">No active shards.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {ui.shards.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => { if (worldRef.current) teleportToShard(worldRef.current, s.id); }}
                    className="bg-white/10 hover:bg-white/20 border border-white/30 rounded px-3 py-2 text-white text-xs text-left"
                  >
                    Shard #{i + 1} — ({Math.round(s.pos.x)}, {Math.round(s.pos.y)})
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { if (worldRef.current) closeShardPicker(worldRef.current); }}
              className="mt-3 w-full bg-white/10 border border-white/30 rounded px-3 py-1 text-white text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Boingo proximity prompt */}
      {ui.boingoNearby && !boingoOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[40%] z-30 pointer-events-auto">
          <button
            onClick={() => setBoingoOpen(true)}
            className="px-3 py-1.5 rounded-md text-[11px] font-bold text-white animate-pulse"
            style={{
              background: "linear-gradient(180deg, #3a1a5a, #1a0a2a)",
              border: "2px solid #ba8cff",
              boxShadow: "0 0 12px rgba(186,140,255,0.6)",
            }}
          >
            📖 Talk to Boingo
          </button>
        </div>
      )}

      {/* Boingo modal — purple book of prophecy */}
      {boingoOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto"
          style={{ background: "rgba(8,4,18,0.85)" }}
          onClick={() => setBoingoOpen(false)}
        >
          <div
            className="relative max-w-sm w-full rounded-lg overflow-hidden"
            style={{
              background: "linear-gradient(180deg,#2a0e4a 0%,#1a0930 100%)",
              border: "3px solid #ba8cff",
              boxShadow: "0 0 24px rgba(186,140,255,0.5), inset 0 0 24px rgba(60,20,120,0.6)",
              fontFamily: "monospace",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Book spine accent */}
            <div
              className="absolute left-0 top-0 bottom-0 w-2"
              style={{ background: "linear-gradient(180deg,#ba8cff,#5a2c8a)" }}
            />
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-purple-300/30">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📖</span>
                <div>
                  <div className="text-[10px] text-purple-200/70 tracking-widest">BOINGO'S BOOK</div>
                  <div className="text-sm font-bold text-purple-100">Prophecies & Pointers</div>
                </div>
              </div>
              <button
                onClick={() => setBoingoOpen(false)}
                className="text-purple-200/70 hover:text-white text-lg leading-none px-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-4 py-3 max-h-[70vh] overflow-y-auto text-[11px] text-purple-50/95 leading-relaxed">
              {/* Boingo speech */}
              <div
                className="rounded-md px-3 py-2 mb-3"
                style={{ background: "rgba(186,140,255,0.12)", border: "1px dashed rgba(186,140,255,0.4)" }}
              >
                <div className="text-[10px] font-bold text-purple-200/80 mb-1">Boingo says…</div>
                <div className="italic text-purple-100/90">
                  "M-my book showed me you'd come… here, this is how you survive!"
                </div>
              </div>

              {/* Basics */}
              <div className="mb-3">
                <div className="text-[10px] font-bold tracking-widest text-purple-200/80 mb-1">★ BASICS</div>
                <ul className="space-y-0.5">
                  <li>• Drag the LEFT half to move (or WASD).</li>
                  <li>• Drag the RIGHT half to aim. Release to auto-aim.</li>
                  <li>• Tap M1 / 1-4 (or Space, 1-4) to attack.</li>
                  <li>• Hold M1 to auto-repeat.</li>
                  <li>• Pick up <span style={{ color: "#caa14a" }}>Arrows</span> to roll a stand.</li>
                  <li>• <span style={{ color: "#cfd2d8" }}>DISCs</span> remove your current stand.</li>
                  <li>• Hostile NPCs (red) only attack if provoked.</li>
                </ul>
              </div>

              {/* Current stand details */}
              {ui.standId !== "none" && STAND_CODEX[ui.standId as Exclude<typeof ui.standId, "none">] && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold tracking-widest text-purple-200/80 mb-1">
                    ★ YOUR STAND — <span style={{ color: standColor }}>{stand.name}</span>
                  </div>
                  <div
                    className="rounded-md px-3 py-2 mb-2"
                    style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${standColor}55` }}
                  >
                    <div className="text-[10px] italic text-purple-200/80 mb-1">
                      {STAND_CODEX[ui.standId as Exclude<typeof ui.standId, "none">].model.description}
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {(["m1", "a1", "a2", "a3", "a4"] as const).map((k) => {
                      const ab = abilities[k];
                      const codexNote =
                        STAND_CODEX[ui.standId as Exclude<typeof ui.standId, "none">].moves[k].notes;
                      return (
                        <li key={k} className="flex gap-2">
                          <span
                            className="font-bold w-7 text-center rounded text-[10px] py-0.5 shrink-0"
                            style={{ background: `${ab.color}33`, color: ab.color, border: `1px solid ${ab.color}66` }}
                          >
                            {k.toUpperCase()}
                          </span>
                          <div>
                            <div className="font-bold text-purple-100">
                              {ab.name}
                              {ab.damage > 0 && (
                                <span className="text-purple-200/60 font-normal"> · {ab.damage} dmg</span>
                              )}
                              {ab.cooldown > 0 && (
                                <span className="text-purple-200/60 font-normal"> · {ab.cooldown}s</span>
                              )}
                            </div>
                            <div className="text-purple-200/80 text-[10px]">{codexNote}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {ui.standId === "none" && (
                <div
                  className="rounded-md px-3 py-2"
                  style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(186,140,255,0.4)" }}
                >
                  <div className="text-[10px] font-bold text-purple-200/80 mb-1">★ NO STAND YET</div>
                  <div>
                    Find a glowing <span style={{ color: "#caa14a" }}>Arrow</span> on the ground and use it from
                    the top bar to roll for a stand!
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-purple-300/30 flex justify-between items-center">
              <span className="text-[9px] text-purple-200/60 italic">Page rustles strangely…</span>
              <button
                onClick={() => setBoingoOpen(false)}
                className="px-3 py-1 rounded text-[10px] font-bold text-white"
                style={{ background: "#5a2c8a", border: "1px solid #ba8cff" }}
              >
                Close book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AbilityBtn({
  label, name, damage, color, cdFrac, onPress, disabled, big, onHoldStart, onHoldEnd,
}: {
  label: string;
  name: string;
  damage: number;
  color: string;
  cdFrac: number;
  onPress: () => void;
  disabled?: boolean;
  big?: boolean;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
}) {
  const size = big ? 76 : 56;
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); if (disabled) return; onPress(); onHoldStart?.(); }}
      onPointerUp={() => { onHoldEnd?.(); }}
      onPointerCancel={() => { onHoldEnd?.(); }}
      onPointerLeave={() => { onHoldEnd?.(); }}
      disabled={disabled}
      className="relative rounded-full flex flex-col items-center justify-center font-bold text-white pointer-events-auto"
      style={{
        width: size, height: size,
        background: disabled ? "rgba(60,60,60,0.5)" : `radial-gradient(circle, ${color}66, rgba(0,0,0,0.7))`,
        border: `2px solid ${disabled ? "rgba(255,255,255,0.2)" : color}`,
        opacity: disabled ? 0.5 : 1,
        touchAction: "none",
        WebkitUserSelect: "none",
      }}
    >
      <span style={{ fontSize: big ? 16 : 14 }}>{label}</span>
      <span style={{ fontSize: 8, opacity: 0.85, lineHeight: 1, marginTop: 2, maxWidth: size - 8, textAlign: "center" }}>
        {disabled ? "—" : `${damage}`}
      </span>
      {/* Cooldown overlay */}
      {cdFrac > 0 && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(rgba(0,0,0,0.65) ${cdFrac * 360}deg, transparent 0deg)`,
            pointerEvents: "none",
          }}
        />
      )}
    </button>
  );
}
