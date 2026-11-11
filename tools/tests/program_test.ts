/**
 * Runs the Classic program headlessly on an instant virtual clock and checks
 * the behaviour of the opening sequence, the random loop and the cleanups.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { load, type H128 } from "./lib/load.ts";

const OPENING = [
  "shifty eyes", "Mountain King", "spider", "flash eyes", "random spooky music",
  "Cheshire pumpkin", "thunder and lightning", "alarm", "eyes up", "eyes down",
  "eyes normal", "ghost", "red blink",
];

interface Step {
  name: string;
  start: number;          // virtual ms
  end: number;
  pupilsShown: boolean;   // sprite 3 switched on during the routine
  ghostColors: number[];
}

class Stop extends Error {}

/** Run the program until `routines` routines have started, recording each one. */
async function runProgram(seed: number, routines: number, check?: (H: H128, step: Step) => void) {
  const H = load(undefined, { seed });
  const steps: Step[] = [];
  let current: Step | null = null;

  const origSprite = H.spr.sprite;
  H.spr.sprite = (n: number, on?: number, color?: number, ...rest: unknown[]) => {
    if (current) {
      if (n === 3 && on) current.pupilsShown = true;
      if (n === 8 && on && color !== undefined) current.ghostColors.push(color);
    }
    return origSprite(n, on, color, ...rest);
  };

  H.initScreen();
  try {
    await H.run((name: string) => {
      if (current) {
        current.end = H.sched.vt;
        check?.(H, current);
      }
      if (steps.length >= routines) throw new Stop();
      current = { name, start: H.sched.vt, end: 0, pupilsShown: false, ghostColors: [] };
      steps.push(current);
    });
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  steps.pop(); // the last one never finished
  return { H, steps };
}

Deno.test("opening sequence runs every routine once, in the original order", async () => {
  const { steps } = await runProgram(1, OPENING.length + 1);
  assertEquals(steps.map((s) => s.name), OPENING);
});

Deno.test("machine is back in a sane state after every routine (200 routines, 3 seeds)", async () => {
  for (const seed of [1, 2, 3]) {
    await runProgram(seed, 200, (H, step) => {
      const where = `seed ${seed}, after "${step.name}"`;
      assertEquals(H.vic.graphicMode, 3, `pumpkin visible again, ${where}`);
      assert(H.vic.sprites[1].on && H.vic.sprites[2].on, `eye rings on, ${where}`);
      assertEquals(H.vic.sprites[1].color, 7, `eyes yellow, ${where}`);
      assert(!H.vic.sprites[3].on && !H.vic.sprites[4].on, `pupils off, ${where}`);
      assertEquals(H.vic.background, 0, `background black, ${where}`);
      // CLEANUP: the witch is always switched back on after the Cheshire pumpkin
      assert(H.vic.sprites[5].on, `witch on, ${where}`);
      assertEquals(H.vic.sprites[1].speed, 0, `eyes not still roaming, ${where}`);
    });
  }
});

Deno.test("CLEANUP: flash eyes still works after Mountain King", async () => {
  const { steps } = await runProgram(1, OPENING.length);
  const mk = steps.findIndex((s) => s.name === "Mountain King");
  const flash = steps.findIndex((s, i) => i > mk && s.name === "flash eyes");
  assert(mk >= 0 && flash > mk);
  assert(steps[flash].pupilsShown, "pupils never flashed: NF was left set by Mountain King");
});

Deno.test("CLEANUP: the ghost is never black (invisible)", async () => {
  const colors: number[] = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const { steps } = await runProgram(seed, 150);
    for (const s of steps) colors.push(...s.ghostColors);
  }
  assert(colors.length > 20, `only ${colors.length} ghosts seen`);
  assert(!colors.includes(1), "ghost colour code 1 (black) was used");
});

Deno.test("random loop eventually picks all 17 routines", async () => {
  const { steps } = await runProgram(7, 400);
  const names = new Set(steps.slice(OPENING.length).map((s) => s.name));
  assertEquals(names.size, 17, `only saw: ${[...names].join(", ")}`);
});

Deno.test("pacing: routine lengths stay close to the VICE-calibrated timing", async () => {
  const { steps } = await runProgram(1, OPENING.length + 1);
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
