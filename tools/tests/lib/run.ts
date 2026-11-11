/**
 * Runs a version's program headlessly on the instant virtual clock and
 * records each routine, so tests can check behaviour routine by routine.
 */
import { load, type H128 } from "./load.ts";

export const OPENING = [
  "shifty eyes", "Mountain King", "spider", "flash eyes", "random spooky music",
  "Cheshire pumpkin", "thunder and lightning", "alarm", "eyes up", "eyes down",
  "eyes normal", "ghost", "red blink",
];

export interface Step {
  name: string;
  start: number;             // virtual ms
  end: number;
  pupilsShown: boolean;      // sprite 3 switched on during the routine
  ghostColors: number[];
  ghostX: number[];          // every MOVSPR 8 x position
  ghostFacesRight: boolean;  // sprite 8 shape when the routine ended
  eyePath: Array<[number, number]>;  // eye ring 1 positions (de-duplicated)
  eye2Path: Array<[number, number]>; // eye ring 2 positions (de-duplicated)
  eyesTogether: Array<[number, number]>; // [left x, right x] whenever either eye ring moves
  pupilColors: number[];     // colours used when the pupils were switched on
  ringColors: number[];      // colours given to eye ring 1
}

class Stop extends Error {}

export interface RunOptions {
  /** Called when a routine finishes, before the next one starts. */
  check?: (H: H128, step: Step) => void;
  /** Called once after loading, before the program starts. */
  setup?: (H: H128) => void;
}

/** Run the program until `routines` routines have finished; returns exactly those. */
export async function runProgram(files: string[], seed: number, routines: number, opts: RunOptions = {}) {
  const H = load(files, { seed });
  const steps: Step[] = [];
  let current: Step | null = null;

  const origSprite = H.spr.sprite;
  H.spr.sprite = (n: number, on?: number, color?: number, ...rest: unknown[]) => {
    if (current) {
      if (n === 3 && on) { current.pupilsShown = true; if (color !== undefined) current.pupilColors.push(color); }
      if (n === 1 && color !== undefined) current.ringColors.push(color);
      if (n === 8 && on && color !== undefined) current.ghostColors.push(color);
    }
    return origSprite(n, on, color, ...rest);
  };
  const origMovspr = H.spr.movspr;
  H.spr.movspr = (n: number, x: number, y: number) => {
    origMovspr(n, x, y);
    if (!current) return;
    if (n === 8) current.ghostX.push(x);
    if (n === 1) {
      const last = current.eyePath[current.eyePath.length - 1];
      if (!last || last[0] !== x || last[1] !== y) current.eyePath.push([x, y]);
    }
    if (n === 2) {
      const last = current.eye2Path[current.eye2Path.length - 1];
      if (!last || last[0] !== x || last[1] !== y) current.eye2Path.push([x, y]);
    }
    if (n === 1 || n === 2) {
      current.eyesTogether.push([H.vic.sprites[1].x, H.vic.sprites[2].x]);
    }
  };

  const ghostRightData = H.spr.mirrorData ? H.spr.mirrorData(H.spr.SPRITE_DATA.slice(448, 511)) : null;

  H.initScreen();
  opts.setup?.(H);
  try {
    await H.run((name: string) => {
      if (current) {
        current.end = H.sched.vt;
        current.ghostFacesRight = !!ghostRightData &&
          Array.from(H.vic.sprites[8].data).every((v, i) => v === ghostRightData[i]);
        opts.check?.(H, current);
      }
      if (steps.length >= routines) throw new Stop();
      current = {
        name, start: H.sched.vt, end: 0, pupilsShown: false,
        ghostColors: [], ghostX: [], ghostFacesRight: false, eyePath: [],
        eye2Path: [], eyesTogether: [], pupilColors: [], ringColors: [],
      };
      steps.push(current);
    });
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }

  return { H, steps };
}

/** State every routine must leave behind (shared by Classic and Extended). */
export function checkSaneState(H: H128, where: string, assert: (c: boolean, msg: string) => void) {
  assert(H.vic.graphicMode === 3, `pumpkin visible again, ${where}`);
  assert(H.vic.sprites[1].on && H.vic.sprites[2].on, `eye rings on, ${where}`);
  assert(H.vic.sprites[1].color === 7, `eyes yellow, ${where}`);
  assert(!H.vic.sprites[3].on && !H.vic.sprites[4].on, `pupils off, ${where}`);
  assert(H.vic.background === 0, `background black, ${where}`);
  // CLEANUP: the witch is always switched back on after the Cheshire pumpkin
  assert(H.vic.sprites[5].on, `witch on, ${where}`);
  assert(H.vic.sprites[1].speed === 0, `eyes not still roaming, ${where}`);
}
