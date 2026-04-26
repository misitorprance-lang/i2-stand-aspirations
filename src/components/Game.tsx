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
  type InputState,
} from "@/game/engine";
import { STANDS, SHIT_ABILITY } from "@/game/stands";
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
  kills: number;
  rage: number;
  rageActive: boolean;
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
    kills: 0,
    rage: 0,
    rageActive: false,
  });
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
          kills: w.kills,
          rage: Math.round(w.rage),
          rageActive: w.time < w.rageUntil,
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
  };

  const press = (key: "m1" | "a1" | "a2" | "a3" | "a4") => () => {
    unlockAudio();
    inputRef.current.pressed[key] = true;
  };

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
        {ui.standId === "ebony_devil" && (
          <div className="bg-black/60 border border-white/30 rounded h-2 overflow-hidden w-32">
            <div
              className="h-full transition-[width]"
              style={{ width: `${ui.rage}%`, background: ui.rageActive ? "#ff3d3d" : "#d04848" }}
            />
          </div>
        )}
      </div>

      {/* Banner */}
      {ui.banner && (
        <div className="absolute top-1/3 left-0 right-0 flex justify-center pointer-events-none">
          <div
            className="px-4 py-2 rounded text-sm font-bold"
            style={{ background: "rgba(0,0,0,0.75)", color: standColor, border: `2px solid ${standColor}` }}
          >
            {ui.banner}
          </div>
        </div>
      )}

      {/* Help / controls */}
      {showHelp && (
        <div className="absolute inset-x-3 top-24 bg-black/75 border border-white/30 rounded p-3 text-white text-[11px] z-30 pointer-events-auto"
             onClick={() => setShowHelp(false)}>
          <div className="font-bold mb-1 text-sm">How to play (tap to close)</div>
          <div>• Drag the LEFT half to move (or WASD).</div>
          <div>• Tap M1 / 1-4 to attack (or Space, 1-4).</div>
          <div>• Pick up <span style={{color:"#caa14a"}}>Arrows</span> to roll a stand.</div>
          <div>• Pick up <span style={{color:"#cfd2d8"}}>DISCs</span> to remove your current stand.</div>
          <div>• Hostile NPCs (red) only attack after you provoke them.</div>
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
        <AbilityBtn label="M1" name={abilities.m1.name} damage={abilities.m1.damage} color={abilities.m1.color} cdFrac={cdFrac("m1")} big onPress={press("m1")} />
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
    </div>
  );
}

function AbilityBtn({
  label, name, damage, color, cdFrac, onPress, disabled, big,
}: {
  label: string;
  name: string;
  damage: number;
  color: string;
  cdFrac: number;
  onPress: () => void;
  disabled?: boolean;
  big?: boolean;
}) {
  const size = big ? 76 : 56;
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); if (!disabled) onPress(); }}
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
