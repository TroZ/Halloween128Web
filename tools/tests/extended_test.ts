/**
 * Extended version: witch controller, eye tracker, and the updated spider
 * and ghost routines.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { EXTENDED, load } from "./lib/load.ts";
import { checkSaneState, OPENING, runProgram } from "./lib/run.ts";

const EXT_OPENING = [...OPENING, "dizzy", "cross-eyed"];
const EYE_ROUTINES = ["spider", "ghost", "dizzy", "cross-eyed"];

// ---------------------------------------------------------------------------
// Sprite mirroring
// ---------------------------------------------------------------------------

Deno.test("mirrorData flips each 24-pixel row and mirroring twice restores the shape", () => {
  const H = load(EXTENDED);
  const row = [0b10000000, 0, 0b00000011];
  const m = H.spr.mirrorData([...row, ...new Array(60).fill(0)]);
  assertEquals(m.slice(0, 3), [0b11000000, 0, 0b00000001]);
  for (let n = 1; n <= 8; n++) {
    const d = H.spr.slot(n);
    assertEquals(H.spr.mirrorData(H.spr.mirrorData(d)), d, `sprite ${n}`);
  }
});

Deno.test("mirrorData keeps multicolour bit pairs together", () => {
  const H = load(EXTENDED);
  const m = H.spr.mirrorData([0b01101100, 0, 0, ...new Array(60).fill(0)], true);
  // pairs 01 10 11 00 | ... -> reversed order, each pair intact
  assertEquals(m.slice(0, 3), [0, 0, 0b00111001]);
});

// ---------------------------------------------------------------------------
// Witch controller
// ---------------------------------------------------------------------------

/** Step the witch alone for `jiffies`, recording what happens. */
function flyWitch(seed: number, jiffies: number) {
  const H = load(EXTENDED, { seed });
  H.initScreen();
  H.fx.startWitch();
  const s = H.vic.sprites[5];
  const mirrored = H.spr.mirrorData(H.spr.slot(5));
  const log = { leftWhileVisible: 0, rightWhileVisible: 0, stoppedWhileVisible: 0, badFacing: 0, turnsWhileVisible: 0 };
  let lastDx = s.dx;
  for (let j = 0; j < jiffies; j++) {
    H.vic.stepMotion();
    const vis = H.vic.spriteInWindow(s);
    const facesLeft = Array.from(s.data).every((v, i) => v === mirrored[i]);
    if (vis) {
      if (s.speed === 0) log.stoppedWhileVisible++;
      else if (s.dx < 0) log.leftWhileVisible++;
      else log.rightWhileVisible++;
      if (Math.sign(s.dx) !== Math.sign(lastDx) && s.speed > 0 && lastDx !== 0) log.turnsWhileVisible++;
    }
    if (s.speed > 0 && (s.dx < 0) !== facesLeft) log.badFacing++;
    lastDx = s.speed > 0 ? s.dx : lastDx;
  }
  return { H, log, decisions: H.fx.witch.decisions as string[] };
}

Deno.test("witch: stops, turns and changes direction only while off screen", () => {
  for (const seed of [1, 2, 3, 4]) {
    const { log } = flyWitch(seed, 60 * 60 * 20); // 20 minutes
    assertEquals(log.stoppedWhileVisible, 0, `seed ${seed}: stopped on screen`);
    assertEquals(log.turnsWhileVisible, 0, `seed ${seed}: turned around on screen`);
    assertEquals(log.badFacing, 0, `seed ${seed}: shape faced the wrong way`);
  }
});

Deno.test("witch: over time she sometimes stops, sometimes flies left, mostly flies right", () => {
  const all: string[] = [];
  const { H } = flyWitch(5, 0);
  const cross = H.fx.witchCrossJiffies();
  for (const seed of [5, 6, 7, 8, 9, 10]) {
    const { decisions, log } = flyWitch(seed, cross * 60);
    all.push(...decisions);
    assert(log.rightWhileVisible > 0, "flew right on screen");
  }
  const count = (d: string) => all.filter((x) => x === d).length;
  assert(count("stop") > 0, "never stopped");
  assert(count("left") > 0, "never flew left");
  assert(count("right") > count("left") + count("stop"), `right ${count("right")} should dominate`);
});

Deno.test("witch: exactly one decision per lap (no false 'left the screen' at the X wrap)", () => {
  const H = load(EXTENDED, { seed: 1 });
  H.initScreen();
  H.fx.startWitch();
  const rnd = Math.random;
  Math.random = () => 0.5;                 // R(10) = 6: always "fly right"
  const lap = 512 / H.spr.MOTION_SCALE;    // jiffies to go once around all 512 positions
  for (let j = 0; j < lap * 10; j++) H.vic.stepMotion();
  Math.random = rnd;
  assertEquals(H.fx.witch.decisions.length, 10, `decisions: ${H.fx.witch.decisions.length} in 10 laps`);
});

Deno.test("witch: a stop lasts as long as one screen crossing", () => {
  const H = load(EXTENDED, { seed: 1 });
  H.initScreen();
  H.fx.startWitch();
  const cross = H.fx.witchCrossJiffies();
  assertEquals(cross, Math.round((320 + 24) / H.spr.MOTION_SCALE));
  // Force the "stop" case: Math.random -> 0 makes R(10) return 1.
  const s = H.vic.sprites[5];
  H.spr.movspr(5, 330, 70);
  H.fx.witch.wasVisible = true;
  const rnd = Math.random;
  Math.random = () => 0;
  let j = 0;
  while (H.vic.spriteInWindow(s)) { H.vic.stepMotion(); j++; }
  H.vic.stepMotion();
  Math.random = rnd;
  assertEquals(s.speed, 0, "stopped after leaving the screen");
  let stopped = 1;
  while (s.speed === 0 && stopped < cross * 2) { H.vic.stepMotion(); stopped++; }
  assert(Math.abs(stopped - cross) <= 2, `stopped for ${stopped} jiffies, expected ${cross}`);
  assert(s.dx > 0, "then flies right");
  assert(j < 100);
});

// ---------------------------------------------------------------------------
// Eye tracker and the updated routines
// ---------------------------------------------------------------------------

Deno.test("eye tracker: follows a sprite within the eyes' normal range and pupils move with the rings", () => {
  const H = load(EXTENDED);
  H.initScreen();
  const E = H.fx.EYES;
  H.spr.sprite(8, 1, 2);
  for (const [x, y, wantX, wantY] of [[30, 60, -1, -1], [320, 60, 1, -1], [30, 230, -1, 1], [180, 120, 0, -1]]) {
    H.spr.movspr(8, x, y);
    H.fx.trackSprite(8);
    for (let j = 0; j < 120; j++) H.vic.stepMotion();
    const ex = H.spr.rsppos(1, 0), ey = H.spr.rsppos(1, 1);
    assert(ex >= E.minX && ex <= E.maxX && ey >= E.minY && ey <= E.maxY, `eyes out of range at ${ex},${ey}`);
    if (wantX) assert(Math.sign(ex - E.homeX) === wantX, `looking ${wantX < 0 ? "left" : "right"} at x=${x} (eyes x=${ex})`);
    if (wantY) assert(Math.sign(ey - E.homeY) === wantY, `looking ${wantY < 0 ? "up" : "down"} at y=${y} (eyes y=${ey})`);
    assertEquals([H.spr.rsppos(3, 0), H.spr.rsppos(3, 1)], [ex, ey], "left pupil on its ring");
    assertEquals([H.spr.rsppos(2, 0), H.spr.rsppos(4, 0)], [ex + 97, ex + 97], "right eye 97 px to the right");
  }
});

Deno.test("eye tracker: holds still while the target is off screen", () => {
  const H = load(EXTENDED);
  H.initScreen();
  H.spr.movspr(8, 350, 100);   // off the right edge
  H.fx.trackSprite(8);
  for (let j = 0; j < 120; j++) H.vic.stepMotion();
  assert(H.fx.eyesHome(), "eyes moved toward an invisible ghost");
});

Deno.test("extended: opening runs the original routines in order, then the new ones", async () => {
  const { steps } = await runProgram(EXTENDED, 1, EXT_OPENING.length);
  assertEquals(steps.map((s) => s.name), EXT_OPENING);
});

Deno.test("extended: random loop eventually picks all 19 routines", async () => {
  const { steps } = await runProgram(EXTENDED, 7, 400);
  const names = new Set(steps.slice(EXT_OPENING.length).map((s) => s.name));
  assertEquals(names.size, 19, `only saw: ${[...names].join(", ")}`);
});

Deno.test("extended: machine is back in a sane state after every routine, eyes centred (200 routines, 3 seeds)", async () => {
  for (const seed of [1, 2, 3]) {
    await runProgram(EXTENDED, seed, 200, {
      check: (H, step) => {
        const where = `seed ${seed}, after "${step.name}"`;
        checkSaneState(H, where, assert);
        assertEquals(H.vic.sprites[2].x, H.vic.sprites[1].x + 97, `right eye 97 px right of the left eye, ${where}`);
        assertEquals([H.vic.sprites[3].x, H.vic.sprites[4].x], [H.vic.sprites[1].x, H.vic.sprites[2].x], `pupils on their rings, ${where}`);
        if (EYE_ROUTINES.includes(step.name)) {
          assert(H.fx.eyesHome(), `eyes back in the centre, ${where}`);
          assertEquals(H.fx.tracker.target, null, `tracker stopped, ${where}`);
        }
      },
    });
  }
});

Deno.test("extended: the eyes follow the spider while it climbs (they look up)", async () => {
  const { steps, H } = await runProgram(EXTENDED, 1, OPENING.length);
  const spider = steps.find((s) => s.name === "spider")!;
  const minY = Math.min(...spider.eyePath.map(([, y]) => y));
  assert(minY < H.fx.EYES.homeY - 3, `eyes never looked up at the climbing spider (min y ${minY})`);
});

Deno.test("extended: ghost crosses both ways, faces its direction, and the eyes follow it", async () => {
  let rightward = 0, leftward = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { steps, H } = await runProgram(EXTENDED, seed, 120);
    for (const g of steps.filter((s) => s.name === "ghost")) {
      const first = g.ghostX[0], last = g.ghostX[g.ghostX.length - 1];
      const toRight = last > first;
      if (toRight) rightward++; else leftward++;
      assertEquals(g.ghostFacesRight, toRight, "ghost shape faces its direction of travel");
      assert(!H.vic.spriteInWindow({ ...H.vic.sprites[8], x: last }), "ghost ends fully off screen");
      const xs = g.eyePath.map(([x]) => x);
      const lookedLeft = Math.min(...xs) < H.fx.EYES.homeX, lookedRight = Math.max(...xs) > H.fx.EYES.homeX;
      assert(lookedLeft && lookedRight, `eyes followed the ghost across (x range ${Math.min(...xs)}-${Math.max(...xs)})`);
    }
  }
  assert(rightward > 3 && leftward > 3, `ghost directions: ${rightward} right, ${leftward} left`);
});

// ---------------------------------------------------------------------------
// Dizzy and cross-eyed
// ---------------------------------------------------------------------------

/** Run the opening and return the named routine's recorded step. */
async function openingStep(seed: number, name: string) {
  const { steps, H } = await runProgram(EXTENDED, seed, EXT_OPENING.length);
  return { step: steps.find((s) => s.name === name)!, H };
}

Deno.test("dizzy: spirals out over 5 turns, circles 5 more at full size, both directions", async () => {
  const directions = new Set<number>();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { step, H } = await openingStep(seed, "dizzy");
    const E = H.fx.EYES;
    const path = step.eyePath;
    const dx = path.map(([x]) => x - E.homeX);
    // ~10 revolutions: count the times x swings from left of centre to right of centre
    let swings = 0, side = 0;
    for (const d of dx) {
      const s = Math.sign(d);
      if (s !== 0 && s !== side) { if (side === -1 && s === 1) swings++; side = s; }
    }
    // clockwise swings left->right at the top, anticlockwise at the bottom; either way about once a turn
    assert(swings >= 9 && swings <= 11, `seed ${seed}: ${swings} turns, expected about 10`);
    assertEquals(Math.min(...dx), E.minX - E.homeX, "reaches the left extent");
    assertEquals(Math.max(...dx), E.maxX - E.homeX, "reaches the right extent");
    assertEquals(Math.min(...path.map(([, y]) => y)), E.minY, "reaches the top extent");
    assertEquals(Math.max(...path.map(([, y]) => y)), E.maxY, "reaches the bottom extent");
    // the first part of the spiral stays near the centre
    const early = dx.slice(0, Math.floor(dx.length * 0.12));
    assert(Math.max(...early.map(Math.abs)) <= 4, "spiral starts small");
    directions.add(Math.sign(dx.find((d) => d !== 0)!));
    // ends centred, with red flashing pupils
    assertEquals(path[path.length - 1], [E.homeX, E.homeY], "snaps back to the centre");
    assert(step.pupilColors.length >= 4 && step.pupilColors.every((c) => c === 3), `pupils flashed red: ${step.pupilColors}`);
    const secs = (step.end - step.start) / 1000;
    assert(secs >= 10.9 && secs <= 12.5, `dizzy took ${secs.toFixed(2)} s`);
  }
  assertEquals(directions.size, 2, "both clockwise and anticlockwise were seen");
});

Deno.test("cross-eyed: eyes meet in the middle, go red, flash red pupils, then return", async () => {
  const { step, H } = await openingStep(1, "cross-eyed");
  const E = H.fx.EYES;
  const crossed = step.eyesTogether.some(([l, r]) => l === E.maxX && r === E.minX + 97);
  assert(crossed, "left eye reached 135 while the right eye reached 212");
  assert(step.eyePath.every(([x]) => x >= E.homeX), "left eye only moves right (toward the middle)");
  assert(step.eye2Path.every(([x]) => x <= E.homeX + 97), "right eye only moves left (toward the middle)");
  assertEquals(step.ringColors, [3, 8], "eyes turn red, then yellow again");
  assert(step.pupilColors.length >= 8 && step.pupilColors.every((c) => c === 3), `pupils flashed red: ${step.pupilColors}`);
  assertEquals(step.eyePath[step.eyePath.length - 1], [E.homeX, E.homeY], "left eye back at the centre");
  assertEquals(step.eye2Path[step.eye2Path.length - 1], [E.homeX + 97, E.homeY], "right eye back at the centre");
  const secs = (step.end - step.start) / 1000;
  assert(secs >= 8 && secs <= 9, `cross-eyed took ${secs.toFixed(2)} s, expected about 3+2+2+1`);
});

Deno.test("extended: spider and ghost keep the Classic pacing", async () => {
  const { steps } = await runProgram(EXTENDED, 1, OPENING.length);
  const secs = Object.fromEntries(steps.map((s) => [s.name, (s.end - s.start) / 1000]));
  assert(secs["spider"] >= 12 && secs["spider"] <= 25, `spider took ${secs["spider"]} s`);
  assert(secs["ghost"] >= 2.2 && secs["ghost"] <= 5.5, `ghost took ${secs["ghost"]} s`);
});
