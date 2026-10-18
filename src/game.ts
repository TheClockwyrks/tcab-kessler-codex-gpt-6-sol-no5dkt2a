import type {
  Game,
  InitApi,
  UpdateApi,
  RenderApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export const BACKGROUND = "#050d1b";
type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  parked: boolean;
  spawnTick: number;
};
type Pod = { kind: C.PodKind; r: number; angleDeg: number };
type Ring = {
  angleDeg: number;
  speedDegPerSec: number;
  targets: (number | null)[];
};
type Effect = "burst" | "spark" | "burnup";
type Flash = { kind: Effect; x: number; y: number; tick: number; id: number };
export interface KesslerState {
  screen: C.Screen;
  ticks: number;
  accumulator: number;
  wave: number;
  score: number;
  lives: number;
  interstitialTicks: number;
  waveAdvance: boolean;
  podSpawn: boolean;
  nextPod: C.PodKind | "none" | null;
  paddleAngle: number;
  balls: Ball[];
  rings: Ring[];
  pods: Pod[];
  widenTicks: number;
  narrowTicks: number;
  pierceTicks: number;
  shieldActive: boolean;
  menuIndex: number;
  pointerStart: number | null;
  flashes: Flash[];
  nextId: number;
}
export interface KesslerDebugApi {
  reset(s: DeepReadonly<KesslerState>): KesslerState;
  reconcile(s: DeepReadonly<KesslerState>): KesslerState;
  snapshot(s: DeepReadonly<KesslerState>): ReturnType<typeof snapshot>;
  menuItemRect(
    s: DeepReadonly<KesslerState>,
    index: number,
  ): { x: number; y: number; width: number; height: number } | null;
  setScreen(s: DeepReadonly<KesslerState>, name: C.Screen): KesslerState;
  setScore(s: DeepReadonly<KesslerState>, n: number): KesslerState;
  setLives(s: DeepReadonly<KesslerState>, n: number): KesslerState;
  setMenuIndex(s: DeepReadonly<KesslerState>, n: number): KesslerState;
  setInterstitialTicks(s: DeepReadonly<KesslerState>, n: number): KesslerState;
  setWave(s: DeepReadonly<KesslerState>, n: number): KesslerState;
  setPaddleAngle(s: DeepReadonly<KesslerState>, deg: number): KesslerState;
  launchBall(s: DeepReadonly<KesslerState>): KesslerState;
  clearBalls(s: DeepReadonly<KesslerState>): KesslerState;
  spawnBall(
    s: DeepReadonly<KesslerState>,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): KesslerState;
  parkBall(s: DeepReadonly<KesslerState>): KesslerState;
  clearTargets(s: DeepReadonly<KesslerState>): KesslerState;
  spawnTarget(
    s: DeepReadonly<KesslerState>,
    ring: number,
    slot: number,
    hp: number,
  ): KesslerState;
  setRingAngle(
    s: DeepReadonly<KesslerState>,
    ring: number,
    deg: number,
  ): KesslerState;
  setRingSpeed(
    s: DeepReadonly<KesslerState>,
    ring: number,
    degPerSec: number,
  ): KesslerState;
  clearPods(s: DeepReadonly<KesslerState>): KesslerState;
  spawnPod(
    s: DeepReadonly<KesslerState>,
    kind: C.PodKind,
    x: number,
    y: number,
  ): KesslerState;
  setNextPod(
    s: DeepReadonly<KesslerState>,
    kind: C.PodKind | "none",
  ): KesslerState;
  drawPod(s: DeepReadonly<KesslerState>): C.PodKind | null;
  setEffectTicks(
    s: DeepReadonly<KesslerState>,
    kind: "widen" | "narrow" | "pierce",
    ticks: number,
  ): KesslerState;
  setShield(s: DeepReadonly<KesslerState>, active: boolean): KesslerState;
  setWaveAdvance(s: DeepReadonly<KesslerState>, on: boolean): KesslerState;
  setPodSpawn(s: DeepReadonly<KesslerState>, on: boolean): KesslerState;
}
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm = (a: number) => ((a % 360) + 360) % 360;
const diff = (a: number, b: number) => ((a - b + 540) % 360) - 180;
const polar = (r: number, a: number) => ({
  x: C.STAGE_CX + r * Math.cos(rad(a)),
  y: C.STAGE_CY + r * Math.sin(rad(a)),
});
const loc = (x: number, y: number) => ({
  r: Math.hypot(x - C.STAGE_CX, y - C.STAGE_CY),
  a: norm(deg(Math.atan2(y - C.STAGE_CY, x - C.STAGE_CX))),
});
const speed = (w: number) =>
  Math.min(
    C.BALL_SPEED_BASE + C.BALL_SPEED_PER_WAVE * (w - 1),
    C.BALL_SPEED_CAP,
  );
const ringSpeed = (i: number, w: number) => {
  const d = C.RINGS[i];
  return (
    d.orbitSign *
    Math.min(
      d.orbitBaseDegPerSec + d.orbitPerWaveDegPerSec * (w - 1),
      d.orbitCapDegPerSec,
    )
  );
};
const span = (s: DeepReadonly<KesslerState>) =>
  s.widenTicks > 0
    ? C.WIDEN_SPAN_DEG
    : s.narrowTicks > 0
      ? C.NARROW_SPAN_DEG
      : C.DEFLECTOR_BASE_SPAN_DEG;
const copy = (s: DeepReadonly<KesslerState>): KesslerState => ({
  ...s,
  balls: s.balls.map((b) => ({ ...b })),
  rings: s.rings.map((r) => ({ ...r, targets: [...r.targets] })),
  pods: s.pods.map((p) => ({ ...p })),
  flashes: s.flashes.map((f) => ({ ...f })),
});
const filled = (w: number): Ring[] =>
  C.RINGS.map((r, i) => ({
    angleDeg: 0,
    speedDegPerSec: ringSpeed(i, w),
    targets: Array(r.slots).fill(r.hitPoints),
  }));
const boot = (): KesslerState => ({
  screen: "title",
  ticks: 0,
  accumulator: 0,
  wave: C.START_WAVE,
  score: 0,
  lives: C.START_LIVES,
  interstitialTicks: 0,
  waveAdvance: true,
  podSpawn: true,
  nextPod: null,
  paddleAngle: C.DEFLECTOR_START_ANGLE_DEG,
  balls: [],
  rings: filled(1),
  pods: [],
  widenTicks: 0,
  narrowTicks: 0,
  pierceTicks: 0,
  shieldActive: false,
  menuIndex: 0,
  pointerStart: null,
  flashes: [],
  nextId: 0,
});
const parked = (s: KesslerState) => {
  if (s.balls.length >= C.BALL_CAP || s.balls.some((b) => b.parked))
    throw Error("Cannot park ball");
  const p = polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.paddleAngle);
  s.balls.push({ ...p, vx: 0, vy: 0, parked: true, spawnTick: s.ticks });
};
const launch = (s: KesslerState) => {
  const b = s.balls.find((b) => b.parked);
  if (!b) throw Error("No parked ball");
  b.parked = false;
  b.vx = speed(s.wave) * Math.cos(rad(s.paddleAngle));
  b.vy = speed(s.wave) * Math.sin(rad(s.paddleAngle));
};
const flash = (s: KesslerState, kind: Effect, x: number, y: number) =>
  s.flashes.push({ kind, x, y, tick: s.ticks, id: s.nextId++ });
const menuRect = (s: DeepReadonly<KesslerState>, i: number) => {
  const count = s.screen === "title" ? 2 : s.screen === "paused" ? 2 : 0;
  if (i < 0 || i >= count) return null;
  return {
    x: 330,
    y: (s.screen === "title" ? 640 : 574) + i * 78,
    width: 340,
    height: 62,
  };
};
const integer = (n: number, min: number) => {
  if (!Number.isInteger(n) || n < min) throw Error("Invalid integer");
};
const ringIndex = (n: number) => {
  integer(n, 1);
  if (n > 3) throw Error("Invalid ring");
  return n - 1;
};
const kindCheck = (k: string) => {
  if (!C.POD_KINDS.includes(k as C.PodKind)) throw Error("Invalid pod kind");
};
const snapshot = (s: DeepReadonly<KesslerState>) => ({
  screen: s.screen,
  ticks: s.ticks,
  wave: s.wave,
  score: s.score,
  lives: s.lives,
  interstitialTicks: s.interstitialTicks,
  waveAdvance: s.waveAdvance,
  podSpawn: s.podSpawn,
  nextPod: s.nextPod,
  paddle: { angleDeg: s.paddleAngle, spanDeg: span(s) },
  balls: s.balls.map((b) => ({
    x: b.x,
    y: b.y,
    vx: b.vx,
    vy: b.vy,
    parked: b.parked,
    piercing: s.pierceTicks > 0,
  })),
  rings: s.rings.map((r) => ({
    angleDeg: r.angleDeg,
    speedDegPerSec: r.speedDegPerSec,
    targets: r.targets.flatMap((hp, slot) =>
      hp === null ? [] : [{ slot, hp }],
    ),
  })),
  pods: s.pods.map((p) => ({ kind: p.kind, ...polar(p.r, p.angleDeg) })),
  effects: {
    widenTicks: s.widenTicks,
    narrowTicks: s.narrowTicks,
    pierceTicks: s.pierceTicks,
    shieldActive: s.shieldActive,
  },
  menu: { index: s.menuIndex },
});
const randomPod = () => {
  if (Math.random() >= C.POD_DROP_CHANCE) return null;
  const v = Math.random();
  let sum = 0;
  for (const row of C.POD_KIND_TABLE) {
    sum += row.probability;
    if (v < sum) return row.kind;
  }
  return C.POD_KIND_TABLE[C.POD_KIND_TABLE.length - 1].kind;
};
export const debug: KesslerDebugApi = {
  reset: () => boot(),
  reconcile: (s) => copy(s),
  snapshot,
  menuItemRect: menuRect,
  setScreen: (s, name) => {
    if (!C.SCREENS.includes(name)) throw Error("Invalid screen");
    return { ...copy(s), screen: name };
  },
  setScore: (s, n) => {
    integer(n, 0);
    return { ...copy(s), score: n };
  },
  setLives: (s, n) => {
    integer(n, 0);
    return { ...copy(s), lives: n };
  },
  setMenuIndex: (s, n) => {
    if (!menuRect(s, n)) throw Error("Invalid menu index");
    return { ...copy(s), menuIndex: n };
  },
  setInterstitialTicks: (s, n) => {
    integer(n, 0);
    return { ...copy(s), interstitialTicks: n };
  },
  setWave: (s, n) => {
    integer(n, 1);
    const q = copy(s);
    q.wave = n;
    q.rings.forEach((r, i) => (r.speedDegPerSec = ringSpeed(i, n)));
    return q;
  },
  setPaddleAngle: (s, d) => {
    if (!Number.isFinite(d)) throw Error("Invalid angle");
    const q = copy(s);
    q.paddleAngle = norm(d);
    q.balls
      .filter((b) => b.parked)
      .forEach((b) =>
        Object.assign(b, polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, q.paddleAngle)),
      );
    return q;
  },
  launchBall: (s) => {
    const q = copy(s);
    launch(q);
    return q;
  },
  clearBalls: (s) => ({ ...copy(s), balls: [] }),
  spawnBall: (s, x, y, vx, vy) => {
    if (s.balls.length >= C.BALL_CAP) throw Error("Ball cap");
    if (![x, y, vx, vy].every(Number.isFinite)) throw Error("Invalid ball");
    const q = copy(s);
    q.balls.push({ x, y, vx, vy, parked: false, spawnTick: q.ticks });
    return q;
  },
  parkBall: (s) => {
    const q = copy(s);
    parked(q);
    return q;
  },
  clearTargets: (s) => {
    const q = copy(s);
    q.rings.forEach((r) => r.targets.fill(null));
    return q;
  },
  spawnTarget: (s, ring, slot, hp) => {
    const i = ringIndex(ring);
    integer(slot, 0);
    integer(hp, 1);
    if (slot >= C.RINGS[i].slots) throw Error("Invalid slot");
    const q = copy(s);
    q.rings[i].targets[slot] = hp;
    return q;
  },
  setRingAngle: (s, ring, d) => {
    const i = ringIndex(ring);
    if (!Number.isFinite(d)) throw Error("Invalid angle");
    const q = copy(s);
    q.rings[i].angleDeg = norm(d);
    return q;
  },
  setRingSpeed: (s, ring, d) => {
    const i = ringIndex(ring);
    if (!Number.isFinite(d)) throw Error("Invalid speed");
    const q = copy(s);
    q.rings[i].speedDegPerSec = d;
    return q;
  },
  clearPods: (s) => ({ ...copy(s), pods: [] }),
  spawnPod: (s, kind, x, y) => {
    kindCheck(kind);
    if (![x, y].every(Number.isFinite)) throw Error("Invalid pod");
    const q = copy(s);
    const p = loc(x, y);
    q.pods.push({ kind, r: p.r, angleDeg: p.a });
    return q;
  },
  setNextPod: (s, kind) => {
    if (kind !== "none") kindCheck(kind);
    return { ...copy(s), nextPod: kind };
  },
  drawPod: () => randomPod(),
  setEffectTicks: (s, kind, ticks) => {
    integer(ticks, 0);
    if (!["widen", "narrow", "pierce"].includes(kind))
      throw Error("Invalid effect");
    const q = copy(s);
    if (kind === "widen") {
      q.widenTicks = ticks;
      if (ticks) q.narrowTicks = 0;
    } else if (kind === "narrow") {
      q.narrowTicks = ticks;
      if (ticks) q.widenTicks = 0;
    } else q.pierceTicks = ticks;
    return q;
  },
  setShield: (s, active) => {
    if (typeof active !== "boolean") throw Error("Invalid shield state");
    return { ...copy(s), shieldActive: active };
  },
  setWaveAdvance: (s, on) => {
    if (typeof on !== "boolean") throw Error("Invalid wave switch");
    return { ...copy(s), waveAdvance: on };
  },
  setPodSpawn: (s, on) => {
    if (typeof on !== "boolean") throw Error("Invalid pod switch");
    return { ...copy(s), podSpawn: on };
  },
};
const targetAt = (ring: Ring, i: number, a: number) => {
  const d = C.RINGS[i];
  const relative = norm(a - ring.angleDeg);
  const slot = Math.floor(relative / d.slotWidthDeg) % d.slots;
  const within = relative - slot * d.slotWidthDeg;
  return within >= C.STRUCTURAL_GAP_DEG &&
    within <= C.STRUCTURAL_GAP_DEG + d.targetArcDeg &&
    ring.targets[slot] !== null
    ? slot
    : null;
};
const reflect = (b: Ball, face: boolean, ringVelocity = 0) => {
  const p = loc(b.x, b.y),
    nx = Math.cos(rad(p.a)),
    ny = Math.sin(rad(p.a)),
    tx = -ny,
    ty = nx;
  const axis = face ? b.vx * nx + b.vy * ny : b.vx * tx + b.vy * ty;
  let vx = b.vx - 2 * axis * (face ? nx : tx),
    vy = b.vy - 2 * axis * (face ? ny : ty);
  vx += ringVelocity * tx;
  vy += ringVelocity * ty;
  const before = Math.hypot(b.vx, b.vy),
    after = Math.hypot(vx, vy) || 1;
  vx *= before / after;
  vy *= before / after;
  const dir = deg(Math.atan2(vy, vx));
  const phi = diff(dir, p.a);
  const near = Math.abs(phi) <= 90 ? p.a : p.a + 180;
  const skew = diff(dir, near);
  const a =
    dir - Math.sign(skew) * Math.min(C.ORBITAL_DECAY_DEG, Math.abs(skew));
  b.vx = before * Math.cos(rad(a));
  b.vy = before * Math.sin(rad(a));
};
const bounce = (s: KesslerState, b: Ball) => {
  const p = loc(b.x, b.y),
    nx = Math.cos(rad(p.a)),
    ny = Math.sin(rad(p.a));
  const dot = b.vx * nx + b.vy * ny;
  let a =
    deg(Math.atan2(b.vy - 2 * dot * ny, b.vx - 2 * dot * nx)) +
    C.ENGLISH_DEG_PER_OFFSET_DEG * diff(p.a, s.paddleAngle);
  a =
    p.a +
    Math.max(-C.BOUNCE_CLAMP_DEG, Math.min(C.BOUNCE_CLAMP_DEG, diff(a, p.a)));
  b.vx = speed(s.wave) * Math.cos(rad(a));
  b.vy = speed(s.wave) * Math.sin(rad(a));
};
const totalTargets = (s: KesslerState) =>
  s.rings.reduce(
    (sum, r) => sum + r.targets.filter((h) => h !== null).length,
    0,
  );
const transition = (s: KesslerState, to: C.Screen, api: UpdateApi) => {
  const old = s.screen;
  s.screen = to;
  s.menuIndex = to === "title" && old === "howto" ? 1 : 0;
  const prev =
    old === "title" || old === "howto"
      ? "title"
      : old === "gameover"
        ? null
        : "play";
  const next =
    to === "title" || to === "howto"
      ? "title"
      : to === "gameover"
        ? null
        : "play";
  if (prev !== next) {
    if (prev) api.audio.stop(prev === "title" ? "music-title" : "music-play");
    if (next) api.audio.loop(next === "title" ? "music-title" : "music-play");
  }
};
const newSession = (s: KesslerState) => {
  const q = boot();
  q.screen = "playing";
  q.ticks = s.ticks;
  q.accumulator = s.accumulator;
  parked(q);
  return q;
};
const tick = (s: KesslerState, api: UpdateApi, left: number, right: number) => {
  s.ticks++;
  s.flashes = s.flashes.filter((f) => s.ticks - f.tick < 42);
  if (s.screen === "waveclear") {
    s.interstitialTicks = Math.max(0, s.interstitialTicks - 1);
    if (s.interstitialTicks === 0) {
      s.wave++;
      s.rings = filled(s.wave);
      parked(s);
      transition(s, "playing", api);
    }
    return;
  }
  if (s.screen !== "playing") return;
  s.paddleAngle = norm(
    s.paddleAngle + (right - left) * C.DEFLECTOR_TURN_DEG_PER_SEC * C.TICK_DT,
  );
  for (const b of s.balls)
    if (b.parked)
      Object.assign(b, polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.paddleAngle));
  s.rings.forEach(
    (r) => (r.angleDeg = norm(r.angleDeg + r.speedDegPerSec * C.TICK_DT)),
  );
  s.widenTicks = Math.max(0, s.widenTicks - 1);
  s.narrowTicks = Math.max(0, s.narrowTicks - 1);
  s.pierceTicks = Math.max(0, s.pierceTicks - 1);
  const pods: Pod[] = [];
  for (const pod of s.pods) {
    const prev = pod.r;
    pod.r -= C.POD_FALL_SPEED * C.TICK_DT;
    if (
      prev > C.DEFLECTOR_POD_CATCH_RADIUS &&
      pod.r <= C.DEFLECTOR_POD_CATCH_RADIUS &&
      Math.abs(diff(pod.angleDeg, s.paddleAngle)) <= span(s) / 2
    ) {
      s.score += C.POD_CATCH_SCORE;
      api.audio.play(
        pod.kind === "narrow" ? C.CUES.podCatchNarrow : C.CUES.podCatch,
      );
      if (pod.kind === "widen") {
        s.widenTicks = C.WIDEN_DURATION_TICKS;
        s.narrowTicks = 0;
      } else if (pod.kind === "narrow") {
        s.narrowTicks = C.NARROW_DURATION_TICKS;
        s.widenTicks = 0;
      } else if (pod.kind === "pierce") s.pierceTicks = C.PIERCE_DURATION_TICKS;
      else if (pod.kind === "shield") s.shieldActive = true;
      else
        for (const off of [C.MULTIBALL_OFFSET_DEG, -C.MULTIBALL_OFFSET_DEG]) {
          if (s.balls.length >= C.BALL_CAP) break;
          const p = polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.paddleAngle),
            a = rad(s.paddleAngle + off);
          s.balls.push({
            ...p,
            vx: speed(s.wave) * Math.cos(a),
            vy: speed(s.wave) * Math.sin(a),
            parked: false,
            spawnTick: s.ticks,
          });
        }
      continue;
    }
    if (pod.r <= C.BURNUP_RADIUS) {
      const p = polar(pod.r, pod.angleDeg);
      flash(s, "burnup", p.x, p.y);
      api.audio.play(C.CUES.podBurn);
      continue;
    }
    pods.push(pod);
  }
  s.pods = pods;
  let burned = false;
  const survivors: Ball[] = [];
  for (const ball of s.balls) {
    if (ball.parked) {
      survivors.push(ball);
      continue;
    }
    const prev = loc(ball.x, ball.y);
    ball.x += ball.vx * C.TICK_DT;
    ball.y += ball.vy * C.TICK_DT;
    const now = loc(ball.x, ball.y),
      nx = Math.cos(rad(now.a)),
      ny = Math.sin(rad(now.a)),
      radial = ball.vx * nx + ball.vy * ny;
    let contact = false;
    for (let i = 0; i < 3; i++) {
      const d = C.RINGS[i],
        ring = s.rings[i];
      let face = false;
      let slot: number | null = null;
      if (
        (prev.r < d.innerContactRadius && now.r >= d.innerContactRadius) ||
        (prev.r > d.outerContactRadius && now.r <= d.outerContactRadius)
      ) {
        slot = targetAt(ring, i, now.a);
        face = slot !== null;
      }
      if (
        !face &&
        now.r >= d.innerContactRadius &&
        now.r <= d.outerContactRadius
      ) {
        const before = targetAt(
          {
            ...ring,
            angleDeg: norm(ring.angleDeg - ring.speedDegPerSec * C.TICK_DT),
          },
          i,
          prev.a,
        );
        const after = targetAt(ring, i, now.a);
        if (before === null && after !== null) {
          slot = after;
        }
      }
      if (slot === null) continue;
      const hp = ring.targets[slot]!;
      const destroy = s.pierceTicks > 0 || hp <= 1;
      if (destroy) {
        ring.targets[slot] = null;
        s.score += d.destroyScore;
        const a = norm(
            ring.angleDeg +
              slot * d.slotWidthDeg +
              C.STRUCTURAL_GAP_DEG +
              d.targetArcDeg / 2,
          ),
          p = polar(d.midRadius, a);
        flash(s, "burst", p.x, p.y);
        api.audio.play(C.CUES.targetBreak);
        if (s.podSpawn) {
          const draw =
            s.nextPod === null
              ? randomPod()
              : s.nextPod === "none"
                ? null
                : s.nextPod;
          s.nextPod = null;
          if (draw) s.pods.push({ kind: draw, r: d.midRadius, angleDeg: a });
        }
        if (s.waveAdvance && totalTargets(s) === 0) {
          s.score += C.WAVE_CLEAR_BONUS_PER_WAVE * s.wave;
          s.balls = [];
          s.pods = [];
          s.widenTicks = s.narrowTicks = s.pierceTicks = 0;
          s.shieldActive = false;
          s.interstitialTicks = C.WAVECLEAR_TICKS;
          api.audio.play(C.CUES.waveClear);
          transition(s, "waveclear", api);
          return;
        }
      } else {
        ring.targets[slot] = hp - 1;
        s.score += C.HIT_SCORE;
        api.audio.play(C.CUES.targetHit);
      }
      if (s.pierceTicks === 0) {
        reflect(
          ball,
          face,
          C.RING_KICK_FACTOR * rad(ring.speedDegPerSec) * now.r,
        );
        contact = true;
      }
      break;
    }
    if (
      !contact &&
      prev.r > C.DEFLECTOR_BALL_CONTACT_RADIUS &&
      now.r <= C.DEFLECTOR_BALL_CONTACT_RADIUS &&
      radial < 0 &&
      Math.abs(diff(now.a, s.paddleAngle)) <= span(s) / 2
    ) {
      bounce(s, ball);
      flash(s, "spark", ball.x, ball.y);
      api.audio.play(C.CUES.paddleBounce);
      contact = true;
    }
    if (
      !contact &&
      s.shieldActive &&
      prev.r > C.SHIELD_CONTACT_RADIUS &&
      now.r <= C.SHIELD_CONTACT_RADIUS &&
      radial < 0
    ) {
      reflect(ball, true);
      s.shieldActive = false;
      flash(s, "spark", ball.x, ball.y);
      api.audio.play(C.CUES.shieldReflect);
      contact = true;
    }
    if (
      !contact &&
      prev.r < C.FIELD_CONTACT_RADIUS &&
      now.r >= C.FIELD_CONTACT_RADIUS &&
      radial > 0
    ) {
      reflect(ball, true);
      flash(s, "spark", ball.x, ball.y);
      api.audio.play(C.CUES.fieldBounce);
      contact = true;
    }
    if (!contact && now.r <= C.BURNUP_RADIUS) {
      flash(s, "burnup", ball.x, ball.y);
      api.audio.play(C.CUES.ballLost);
      burned = true;
    } else survivors.push(ball);
  }
  s.balls = survivors;
  if (burned && s.balls.length === 0) {
    s.lives = Math.max(0, s.lives - 1);
    s.pods = [];
    s.widenTicks = s.narrowTicks = s.pierceTicks = 0;
    s.shieldActive = false;
    if (s.lives) {
      parked(s);
    } else {
      api.audio.play(C.CUES.gameOver);
      transition(s, "gameover", api);
    }
  }
};
const sprites: {
  planet?: ImageBitmap;
  pods: Partial<Record<C.PodKind, ImageBitmap>>;
  balls: ImageBitmap[];
} = { pods: {}, balls: [] };
const systems: Partial<Record<Effect, ParticleSystem>> = {};
const players = new Map<
  number,
  { player: ParticleCanvasPlayer; born: number }
>();
function playParticles(
  s: DeepReadonly<KesslerState>,
  ctx: CanvasRenderingContext2D,
  dt: number,
) {
  const matrix = ctx.getTransform();
  for (const f of s.flashes) {
    const system = systems[f.kind];
    if (!system) continue;
    let item = players.get(f.id);
    if (!item) {
      item = {
        player: new ParticleCanvasPlayer(system, ctx, {
          clear: false,
          pixelRadius: f.kind === "burst" ? 7 : 5,
          composite: "lighter",
        }),
        born: f.tick,
      };
      players.set(f.id, item);
    }
    ctx.save();
    const p = new DOMPoint(f.x, f.y).matrixTransform(matrix);
    ctx.setTransform(
      1,
      0,
      0,
      1,
      p.x - ctx.canvas.width / 2,
      p.y - ctx.canvas.height / 2,
    );
    item.player.update(s.screen === "playing" ? dt : 0);
    ctx.restore();
  }
  for (const id of players.keys())
    if (!s.flashes.some((f) => f.id === id)) players.delete(id);
}
const ringColors = ["#61dce8", "#b4a4ff", "#f1b576"];
const starPoints = Array.from({ length: 210 }, (_, i) => {
  const q = (i * 137.508) % 360,
    r = 80 + ((i * 151.79) % 414);
  return {
    ...polar(r, q),
    alpha: 0.1 + ((i * 37) % 10) / 35,
    size: i % 17 === 0 ? 2 : 1,
  };
});
function arc(
  ctx: CanvasRenderingContext2D,
  r: number,
  start: number,
  end: number,
) {
  ctx.beginPath();
  ctx.arc(C.STAGE_CX, C.STAGE_CY, r, rad(start), rad(end));
}
function field(ctx: CanvasRenderingContext2D, s: DeepReadonly<KesslerState>) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  for (const p of starPoints) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = "#d7f5ff";
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  const glow = ctx.createRadialGradient(500, 500, 60, 500, 500, 490);
  glow.addColorStop(0, "#20456033");
  glow.addColorStop(0.7, "#0b203422");
  glow.addColorStop(1, "#050d1b00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#68cce866";
  arc(ctx, C.FIELD_RADIUS, 0, 360);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 12]);
  ctx.strokeStyle = "#68cce833";
  arc(ctx, C.FIELD_RADIUS - 9, 0, 360);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 2; i >= 0; i--) {
    const d = C.RINGS[i],
      ring = s.rings[i];
    ctx.lineWidth = 1;
    ctx.strokeStyle = ringColors[i] + "28";
    for (const r of [d.innerRadius, d.outerRadius]) {
      arc(ctx, r, 0, 360);
      ctx.stroke();
    }
    for (let k = 0; k < d.slots; k++) {
      const hp = ring.targets[k];
      if (hp === null) continue;
      const start = ring.angleDeg + k * d.slotWidthDeg + C.STRUCTURAL_GAP_DEG,
        end = start + d.targetArcDeg;
      ctx.lineWidth = d.outerRadius - d.innerRadius - 4;
      ctx.lineCap = "butt";
      ctx.strokeStyle = hp < d.hitPoints ? "#607582" : ringColors[i];
      ctx.shadowColor = ringColors[i];
      ctx.shadowBlur = hp < d.hitPoints ? 0 : 10;
      arc(ctx, d.midRadius, start, end);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = hp < d.hitPoints ? "#e7a073" : "#efffff99";
      arc(ctx, d.outerRadius - 3, start + 1, end - 1);
      ctx.stroke();
      if (hp < d.hitPoints) {
        ctx.strokeStyle = "#ff9e6d";
        arc(ctx, d.midRadius, start + 4, end - 4);
        ctx.stroke();
      }
    }
  }
  if (s.shieldActive) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#8ef7d9";
    ctx.shadowColor = "#8ef7d9";
    ctx.shadowBlur = 18;
    arc(ctx, C.SHIELD_RADIUS, 0, 360);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (sprites.planet)
    ctx.drawImage(
      sprites.planet,
      500 - C.PLANET_SPRITE_SIZE / 2,
      500 - C.PLANET_SPRITE_SIZE / 2,
    );
  ctx.lineWidth = C.DEFLECTOR_TRACK_OUTER - C.DEFLECTOR_TRACK_INNER;
  ctx.strokeStyle = "#143443";
  arc(ctx, (C.DEFLECTOR_TRACK_INNER + C.DEFLECTOR_TRACK_OUTER) / 2, 0, 360);
  ctx.stroke();
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.strokeStyle =
    s.widenTicks > 0 ? "#8df5d7" : s.narrowTicks > 0 ? "#f5a370" : "#8ee9ef";
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 22;
  arc(
    ctx,
    (C.DEFLECTOR_TRACK_INNER + C.DEFLECTOR_TRACK_OUTER) / 2,
    s.paddleAngle - span(s) / 2,
    s.paddleAngle + span(s) / 2,
  );
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  arc(
    ctx,
    C.DEFLECTOR_TRACK_OUTER - 2,
    s.paddleAngle - span(s) / 2 + 2,
    s.paddleAngle + span(s) / 2 - 2,
  );
  ctx.stroke();
  ctx.lineCap = "butt";
  for (const b of s.balls) {
    const frame =
      Math.floor((s.ticks - b.spawnTick) / C.BALL_FRAME_TICKS) %
      C.BALL_SPIN_FRAMES;
    if (sprites.balls[frame]) {
      ctx.shadowColor = s.pierceTicks > 0 ? "#ef7bff" : "#a9f9ff";
      ctx.shadowBlur = 16;
      ctx.drawImage(
        sprites.balls[frame],
        b.x - C.BALL_SPRITE_SIZE / 2,
        b.y - C.BALL_SPRITE_SIZE / 2,
      );
      ctx.shadowBlur = 0;
    }
  }
  for (const p of s.pods) {
    const a = polar(p.r, p.angleDeg),
      img = sprites.pods[p.kind];
    if (img)
      ctx.drawImage(
        img,
        a.x - C.POD_SPRITE_SIZE / 2,
        a.y - C.POD_SPRITE_SIZE / 2,
      );
  }
}
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color = "#e5faff",
  align: CanvasTextAlign = "center",
  weight = "600",
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}
function hud(ctx: CanvasRenderingContext2D, s: DeepReadonly<KesslerState>) {
  ctx.fillStyle = "#071624d9";
  ctx.fillRect(22, 20, 956, 68);
  ctx.strokeStyle = "#6fe5e755";
  ctx.strokeRect(22, 20, 956, 68);
  label(ctx, "K / KESSLER", 48, 62, 24, "#9bf2f1", "left", "800");
  label(
    ctx,
    `SCORE  ${String(s.score).padStart(6, "0")}`,
    390,
    62,
    23,
    "#ffffff",
  );
  label(ctx, `WAVE ${s.wave}`, 704, 62, 22, "#eacfa5");
  label(ctx, `LIVES ${s.lives}`, 935, 62, 22, "#ffa887", "right");
  let x = 35;
  for (const [name, ticks] of [
    ["WIDE", s.widenTicks],
    ["NARROW", s.narrowTicks],
    ["PIERCE", s.pierceTicks],
  ] as const) {
    if (ticks > 0) {
      label(
        ctx,
        `${name} ${Math.ceil(ticks / C.TICK_HZ)}s`,
        x,
        963,
        16,
        "#a9eeef",
        "left",
      );
      x += 155;
    }
  }
  if (s.shieldActive) label(ctx, "SHIELD READY", x, 963, 16, "#9ef7d4", "left");
}
function menu(
  ctx: CanvasRenderingContext2D,
  s: DeepReadonly<KesslerState>,
  items: readonly string[],
) {
  items.forEach((item, i) => {
    const r = menuRect(s, i)!;
    ctx.fillStyle = s.menuIndex === i ? "#2a7b8fcf" : "#0b2333d9";
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.strokeStyle = s.menuIndex === i ? "#a5faff" : "#496779";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    label(
      ctx,
      item,
      500,
      r.y + 41,
      25,
      s.menuIndex === i ? "#ffffff" : "#bad3dc",
    );
  });
}
function overlay(ctx: CanvasRenderingContext2D, s: DeepReadonly<KesslerState>) {
  if (s.screen === "playing") return;
  ctx.fillStyle = "rgba(3,11,21,.69)";
  ctx.fillRect(0, 0, 1000, 1000);
  if (s.screen === "title") {
    label(ctx, "ORBITAL DEMOLITION / 01", 500, 246, 18, "#71beca");
    label(ctx, C.TITLE_TEXT, 500, 391, 102, "#f2fbff", "center", "800");
    label(
      ctx,
      "Sweep the debris. Save the world below.",
      500,
      442,
      22,
      "#9ec3d0",
    );
    menu(ctx, s, C.TITLE_ITEMS);
    label(
      ctx,
      "A / D  TO ORBIT   •   SPACE  TO LAUNCH",
      500,
      907,
      17,
      "#7ea6b3",
    );
  } else if (s.screen === "howto") {
    label(ctx, "HOW TO PLAY", 500, 229, 62);
    const lines = [
      "Circle the planet with A / D or the arrow keys.",
      "Launch with SPACE. Meet the ball and steer its bounce.",
      "Miss it and it burns up. Lose your last ball, lose a life.",
      "Break derelicts for points. Clear all three rings for a new wave.",
      "Catch falling salvage for a wider paddle, a shield,",
      "piercing shots, or more balls. Watch out for narrow pods.",
      "Menus: UP / DOWN or W / S, then ENTER / SPACE.",
      "ESC or P pauses. ESC returns from this screen.",
    ];
    lines.forEach((line, i) =>
      label(
        ctx,
        line,
        500,
        315 + i * 64,
        i >= 6 ? 21 : 25,
        i >= 6 ? "#8dc6cf" : "#dcecf0",
      ),
    );
  } else if (s.screen === "paused") {
    label(ctx, "PAUSED", 500, 386, 75);
    menu(ctx, s, C.PAUSE_ITEMS);
  } else if (s.screen === "waveclear") {
    label(ctx, `WAVE ${s.wave} CLEARED`, 500, 448, 67, "#f8e3b6");
    label(
      ctx,
      `+${C.WAVE_CLEAR_BONUS_PER_WAVE * s.wave} BONUS`,
      500,
      507,
      29,
      "#9ce9e6",
    );
  } else {
    label(ctx, C.GAMEOVER_TEXT, 500, 392, 74, "#ffbcaa");
    label(ctx, `FINAL SCORE  ${s.score}`, 500, 480, 30);
    label(ctx, `WAVE REACHED  ${s.wave}`, 500, 531, 24, "#9fcad5");
    label(ctx, "PRESS ENTER OR SPACE", 500, 730, 21, "#a6d9e1");
  }
}
export const game: Game<KesslerState, KesslerDebugApi> = {
  async initialize(api: InitApi<KesslerState>) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    const jobs: Promise<unknown>[] = [];
    for (const cue of Object.values(C.CUES))
      jobs.push(api.audio.load(cue, C.CUE_PATHS[cue]));
    jobs.push(
      api.audio.load("music-title", C.BED_PATHS.title),
      api.audio.load("music-play", C.BED_PATHS.play),
    );
    jobs.push(
      api.assets
        .loadImage(C.SPRITE_PATHS.planet)
        .then((v) => (sprites.planet = v)),
    );
    for (const kind of C.POD_KINDS)
      jobs.push(
        api.assets
          .loadImage(C.SPRITE_PATHS.pods[kind])
          .then((v) => (sprites.pods[kind] = v)),
      );
    for (let i = 0; i < C.BALL_SPIN_FRAMES; i++)
      jobs.push(
        api.assets
          .loadImage(C.SPRITE_PATHS.ball[i])
          .then((v) => (sprites.balls[i] = v)),
      );
    for (const kind of ["burst", "spark", "burnup"] as const)
      jobs.push(
        api.assets
          .load(C.PARTICLE_PATHS[kind])
          .then(
            async (v) =>
              (systems[kind] = JSON.parse(await v.text()) as ParticleSystem),
          ),
      );
    await Promise.all(jobs);
    for (const [name, get] of Object.entries({
      screen: (s: DeepReadonly<KesslerState>) => s.screen,
      score: (s: DeepReadonly<KesslerState>) => s.score,
      lives: (s: DeepReadonly<KesslerState>) => s.lives,
      wave: (s: DeepReadonly<KesslerState>) => s.wave,
      paddle: (s: DeepReadonly<KesslerState>) =>
        `${s.paddleAngle.toFixed(1)}° / ${span(s)}°`,
      balls: (s: DeepReadonly<KesslerState>) => s.balls.length,
      targets: (s: DeepReadonly<KesslerState>) =>
        s.rings.reduce(
          (n, r) => n + r.targets.filter((v) => v !== null).length,
          0,
        ),
      pods: (s: DeepReadonly<KesslerState>) => s.pods.length,
      widen: (s: DeepReadonly<KesslerState>) => s.widenTicks,
      narrow: (s: DeepReadonly<KesslerState>) => s.narrowTicks,
      pierce: (s: DeepReadonly<KesslerState>) => s.pierceTicks,
      shield: (s: DeepReadonly<KesslerState>) => s.shieldActive,
    }))
      api.diagnostics.register(name, get);
    return [boot(), debug];
  },
  update(state: DeepReadonly<KesslerState>, api: UpdateApi, dt: number) {
    let s = copy(state);
    const original = s.screen;
    const press = (a: C.ActionName) => api.input.pressed(a);
    const choice = (index: number) => {
      api.audio.play(C.CUES.menuSelect);
      if (original === "title") {
        if (index === 0) {
          s = newSession(s);
          transition(s, "playing", api);
        } else transition(s, "howto", api);
      } else if (original === "paused") {
        if (index === 0) transition(s, "playing", api);
        else {
          s = boot();
          transition(s, "title", api);
        }
      }
    };
    if (original === "title" || original === "paused") {
      const up = press("up"),
        down = press("down");
      if (up || down) {
        s.menuIndex = (s.menuIndex + (up ? -1 : 1) + 2) % 2;
        api.audio.play(C.CUES.menuMove);
      }
      const pointer = api.input.pointer();
      for (let i = 0; i < 2; i++) {
        const r = menuRect(s, i)!;
        if (
          pointer.x >= r.x &&
          pointer.x <= r.x + r.width &&
          pointer.y >= r.y &&
          pointer.y <= r.y + r.height &&
          s.menuIndex !== i
        ) {
          s.menuIndex = i;
          api.audio.play(C.CUES.menuMove);
        }
      }
      for (const sample of api.input.pointerSamples()) {
        if (!sample.primary) continue;
        const idx = [0, 1].find((i) => {
          const r = menuRect(s, i)!;
          return (
            sample.x >= r.x &&
            sample.x <= r.x + r.width &&
            sample.y >= r.y &&
            sample.y <= r.y + r.height
          );
        });
        if (sample.type === "down") s.pointerStart = idx ?? null;
        if (sample.type === "up") {
          if (idx !== undefined && idx === s.pointerStart) choice(idx);
          s.pointerStart = null;
        }
      }
      if (press("confirm")) choice(s.menuIndex);
      else if (original === "paused" && (press("back") || press("pause")))
        transition(s, "playing", api);
    } else if (original === "howto") {
      if (press("confirm") || press("back")) transition(s, "title", api);
    } else if (original === "gameover") {
      if (press("confirm")) {
        s = boot();
        transition(s, "title", api);
      }
    } else if (original === "playing") {
      if (press("back") || press("pause")) transition(s, "paused", api);
      else if (press("launch") && s.balls.some((b) => b.parked)) launch(s);
    }
    s.accumulator += Math.max(0, dt);
    let steps = Math.floor((s.accumulator + 1e-10) / C.TICK_DT);
    s.accumulator -= steps * C.TICK_DT;
    while (steps-- > 0)
      tick(
        s,
        api,
        original === "playing" && s.screen === "playing"
          ? api.input.value("left")
          : 0,
        original === "playing" && s.screen === "playing"
          ? api.input.value("right")
          : 0,
      );
    const bed =
      s.screen === "title" || s.screen === "howto"
        ? "music-title"
        : s.screen === "gameover"
          ? null
          : "music-play";
    if (bed && !api.audio.looping(bed)) api.audio.loop(bed);
    if (bed !== "music-title") api.audio.stop("music-title");
    if (bed !== "music-play") api.audio.stop("music-play");
    return s;
  },
  render(state: DeepReadonly<KesslerState>, api: RenderApi) {
    const ctx = api.ctx;
    field(ctx, state);
    hud(ctx, state);
    playParticles(state, ctx, api.frame().lastDeltaMs / 1000);
    overlay(ctx, state);
  },
};
