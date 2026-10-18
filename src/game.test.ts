import { describe, expect, it } from "vitest";
import type { UpdateApi } from "@clockwyrks/simple-2d";
import { TICK_DT, RINGS, STAGE_CX, STAGE_CY } from "./constants";
import { debug, game, type KesslerState } from "./game";

const api = (pressed: string[] = []): UpdateApi => ({
  input: {
    value: () => 0,
    pressed: (name: string) => pressed.includes(name),
    pointer: () => ({ x: 0, y: 0, down: false, device: "mouse", buttons: [] }),
    pointerPressed: () => false,
    pointerReleased: () => false,
    pointerSamples: () => [],
    pointerContacts: () => [],
    wheel: () => ({ x: 0, y: 0 }),
  },
  audio: {
    play: () => {},
    loop: () => {},
    stop: () => {},
    looping: () => false,
    setMuted: () => {},
    muted: () => false,
  },
  frame: () => ({ count: 0, timeMs: 0, lastDeltaMs: 1000 / 60 }),
  viewport: () => ({}) as ReturnType<UpdateApi["viewport"]>,
});
const step = (s: KesslerState, count = 1) => {
  let q = s;
  for (let i = 0; i < count; i++) q = game.update(q, api(), TICK_DT);
  return q;
};
const play = () => debug.setScreen(debug.reset({} as KesslerState), "playing");

describe("Kessler simulation", () => {
  it("serves at wave speed and follows the deflector while parked", () => {
    let s = debug.parkBall(play());
    s = debug.setPaddleAngle(s, 180);
    expect(debug.snapshot(s).balls[0]).toMatchObject({
      x: 306,
      y: 500,
      parked: true,
    });
    s = debug.launchBall(s);
    expect(debug.snapshot(s).balls[0].vx).toBeCloseTo(-240);
  });

  it("uses whole ticks regardless of frame subdivision", () => {
    let a = debug.spawnBall(play(), 700, 500, 120, 0);
    const b = game.update(
      game.update(a, api(), TICK_DT / 2),
      api(),
      TICK_DT / 2,
    );
    a = step(a);
    expect(debug.snapshot(b).balls[0].x).toBeCloseTo(
      debug.snapshot(a).balls[0].x,
    );
    expect(b.ticks).toBe(a.ticks);
  });

  it("bounces from the deflector and destroys a ring target on a crossing", () => {
    let s = debug.spawnBall(play(), 500, 696, 0, -240);
    s = step(s);
    expect(debug.snapshot(s).balls[0].vy).toBeCloseTo(240);
    s = debug.clearBalls(s);
    const angle = (15 * Math.PI) / 180;
    s = debug.spawnBall(
      s,
      STAGE_CX + 280 * Math.cos(angle),
      STAGE_CY + 280 * Math.sin(angle),
      240 * Math.cos(angle),
      240 * Math.sin(angle),
    );
    s = step(s);
    expect(s.score).toBe(RINGS[0].destroyScore);
    expect(debug.snapshot(s).rings[0].targets).toHaveLength(RINGS[0].slots - 1);
  });

  it("catches a pod and lets the effect expire", () => {
    let s = debug.spawnPod(play(), "widen", 500, 698);
    s = step(s);
    expect(s.score).toBe(25);
    expect(debug.snapshot(s).paddle.spanDeg).toBe(72);
    s = step(s, 600);
    expect(debug.snapshot(s).paddle.spanDeg).toBe(48);
  });

  it("starts the interstitial when a ball clears the final target", () => {
    let s = debug.clearTargets(play());
    s = debug.spawnTarget(s, 1, 0, 1);
    const angle = (15 * Math.PI) / 180;
    s = debug.spawnBall(
      s,
      STAGE_CX + 280 * Math.cos(angle),
      STAGE_CY + 280 * Math.sin(angle),
      240 * Math.cos(angle),
      240 * Math.sin(angle),
    );
    s = step(s);
    expect(s.screen).toBe("waveclear");
    expect(s.interstitialTicks).toBe(180);
    expect(s.score).toBe(600);
    s = step(s, 180);
    expect(s.screen).toBe("playing");
    expect(s.wave).toBe(2);
    expect(s.balls[0].parked).toBe(true);
  });

  it("spends the shield on the first inward crossing", () => {
    let s = debug.clearBalls(play());
    s = debug.setShield(s, true);
    s = debug.spawnBall(s, 500, 602, 0, -240);
    s = step(s);
    expect(s.shieldActive).toBe(false);
    expect(s.balls[0].vy).toBeGreaterThan(0);
    expect(s.lives).toBe(3);
  });

  it("loses one life and parks a new ball after the final ball burns", () => {
    let s = debug.clearBalls(play());
    s = debug.spawnBall(s, 500, 580, 0, -240);
    s = step(s);
    expect(s.lives).toBe(2);
    expect(s.balls).toHaveLength(1);
    expect(s.balls[0].parked).toBe(true);
  });

  it("pierces a tough target without changing velocity", () => {
    let s = debug.clearBalls(play());
    s = debug.setEffectTicks(s, "pierce", 360);
    const angle = (11.25 * Math.PI) / 180;
    s = debug.spawnBall(
      s,
      STAGE_CX + 350 * Math.cos(angle),
      STAGE_CY + 350 * Math.sin(angle),
      240 * Math.cos(angle),
      240 * Math.sin(angle),
    );
    s = step(s);
    expect(s.score).toBe(RINGS[1].destroyScore);
    expect(s.rings[1].targets[0]).toBeNull();
    expect(s.balls[0].vx).toBeCloseTo(240 * Math.cos(angle));
    expect(s.pierceTicks).toBe(359);
  });
});
