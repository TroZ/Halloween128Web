/**
 * Loads the browser scripts into a fresh H128 namespace for headless tests.
 *
 * The scripts are plain (non-module) browser scripts, so they are evaluated
 * in global scope. Each call gives a clean machine state.
 */

export const ROOT = new URL("../../../", import.meta.url);

export const ENGINE = [
  "shared/c128/vic.js",
  "shared/c128/basic-gfx.js",
  "shared/c128/sprites.js",
  "shared/c128/timing.js",
  "shared/c128/sid.js",
];

export const CLASSIC = [...ENGINE, "classic/js/halloween.js"];

// deno-lint-ignore no-explicit-any
export type H128 = any;

/** Small deterministic PRNG so program runs are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LoadOptions {
  /** Seed for Math.random (default 1). */
  seed?: number;
  /** Replace the real-time scheduler with an instant virtual clock (default true). */
  fastClock?: boolean;
}

export function load(files: string[] = CLASSIC, opts: LoadOptions = {}): H128 {
  const { seed = 1, fastClock = true } = opts;
  Math.random = mulberry32(seed);
  const g = globalThis as Record<string, unknown>;
  g.H128 = {};
  for (const f of files) {
    (0, eval)(Deno.readTextFileSync(new URL(f, ROOT)));
  }
  const H = g.H128 as H128;
  if (fastClock && H.sched) {
    H.sched.vt = 0;
    H.sched.tiBase = 0;
    H.sched.cost = (ms: number) => {
      H.sched.vt += ms;
      return Promise.resolve();
    };
  }
  return H;
}

/** Render the current machine state to a 384x272 RGBA buffer. */
export function renderFrame(H: H128): Uint8ClampedArray {
  const img = { data: new Uint8ClampedArray(H.vic.FRAME_W * H.vic.FRAME_H * 4) };
  H.vic.render(img);
  return img.data;
}
