/**
 * Runs the Classic program headlessly on an instant virtual clock and checks
 * the behaviour of the opening sequence, the random loop and the cleanups.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { CLASSIC } from "./lib/load.ts";
import { checkSaneState, OPENING, runProgram } from "./lib/run.ts";

Deno.test("classic: opening sequence runs every routine once, in the original order", async () => {
  const { steps } = await runProgram(CLASSIC, 1, OPENING.length);
  assertEquals(steps.map((s) => s.name), OPENING);
});

Deno.test("classic: machine is back in a sane state after every routine (200 routines, 3 seeds)", async () => {
  for (const seed of [1, 2, 3]) {
    await runProgram(CLASSIC, seed, 200, {
      check: (H, step) => checkSaneState(H, `seed ${seed}, after "${step.name}"`, assert),
    });
  }
});

Deno.test("classic: the witch keeps flying right at a steady speed", async () => {
  const { H } = await runProgram(CLASSIC, 1, 30, {
    check: (H) => assert(H.vic.sprites[5].dx > 0, "witch always moves right in Classic"),
  });
  assertEquals(H.vic.jiffyHooks.length, 0, "Classic installs no jiffy hooks");
});

Deno.test("classic CLEANUP: flash eyes still works after Mountain King", async () => {
  const { steps } = await runProgram(CLASSIC, 1, OPENING.length);
  const mk = steps.findIndex((s) => s.name === "Mountain King");
  const flash = steps.findIndex((s, i) => i > mk && s.name === "flash eyes");
  assert(mk >= 0 && flash > mk);
  assert(steps[flash].pupilsShown, "pupils never flashed: NF was left set by Mountain King");
});

Deno.test("classic CLEANUP: the ghost is never black (invisible)", async () => {
  const colors: number[] = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const { steps } = await runProgram(CLASSIC, seed, 150);
    for (const s of steps) colors.push(...s.ghostColors);
  }
  assert(colors.length > 20, `only ${colors.length} ghosts seen`);
  assert(!colors.includes(1), "ghost colour code 1 (black) was used");
});

Deno.test("classic: random loop eventually picks all 17 routines", async () => {
  const { steps } = await runProgram(CLASSIC, 7, 400);
  const names = new Set(steps.slice(OPENING.length).map((s) => s.name));
  assertEquals(names.size, 17, `only saw: ${[...names].join(", ")}`);
});

Deno.test("classic: routine lengths stay close to the VICE-calibrated timing", async () => {
  const { steps } = await runProgram(CLASSIC, 1, OPENING.length);
  const secs = Object.fromEntries(steps.map((s) => [s.name, (s.end - s.start) / 1000]));
  // Ranges are generous; they catch accidental 2x speed changes, not small tuning.
  const expect: Record<string, [number, number]> = {
    "spider": [12, 24],
    "ghost": [2.2, 4.5],
    "red blink": [0.8, 1.6],
    "random spooky music": [13, 17],
    "Mountain King": [12, 20],
  };
  for (const [name, [lo, hi]] of Object.entries(expect)) {
    assert(secs[name] >= lo && secs[name] <= hi, `${name} took ${secs[name].toFixed(2)} s, expected ${lo}-${hi} s`);
  }
});
