/** BASIC 7.0 graphics command tests (DRAW, CIRCLE, PAINT, COLOR). */
import { assertEquals, assert } from "jsr:@std/assert@1";
import { load, ENGINE, CLASSIC } from "./lib/load.ts";

const src = (H: ReturnType<typeof load>, x: number, y: number) => H.vic.bmSrc[y * 160 + x];

function countSource(H: ReturnType<typeof load>, s: number): number {
  let n = 0;
  for (const v of H.vic.bmSrc) if (v === s) n++;
  return n;
}

Deno.test("DRAW plots both end points", () => {
  const H = load(ENGINE);
  H.gfx.draw(3, 10, 10, 30, 20);
  assertEquals(src(H, 10, 10), 3);
  assertEquals(src(H, 30, 20), 3);
});

Deno.test("COLOR uses BASIC codes 1-16 and drives border/background registers", () => {
  const H = load(ENGINE);
  H.gfx.color(0, 2);
  H.gfx.color(4, 3);
  assertEquals(H.vic.background, 1, "code 2 = white");
  assertEquals(H.vic.border, 2, "code 3 = red");
});

Deno.test("PAINT fills the inside of a closed circle and nothing outside it", () => {
  const H = load(ENGINE);
  H.gfx.circle(3, 80, 100, 20, 20);
  H.gfx.paint(3, 80, 100);
  assertEquals(src(H, 80, 100), 3, "centre filled");
  assertEquals(src(H, 80, 50), 0, "outside untouched");
  assertEquals(src(H, 5, 5), 0, "corner untouched");
});

Deno.test("PAINT mode 0 paints over other colour sources and stops only at its own", () => {
  const H = load(ENGINE);
  H.gfx.circle(2, 80, 100, 20, 20);   // boundary in source 2
  H.gfx.draw(3, 70, 100, 90, 100);    // a source-3 line inside
  H.gfx.paint(2, 80, 95);
  assertEquals(src(H, 80, 100), 2, "source-3 line inside was painted over");
  assertEquals(src(H, 80, 50), 0, "fill stayed inside the source-2 boundary");
});

Deno.test("pumpkin stem fill stays inside the stem (no leak through rounding gaps)", () => {
  const H = load(CLASSIC);
  H.initScreen();
  const green = countSource(H, 2);
  assert(green > 50 && green < 600, `stem has ${green} pixels; a leak would fill thousands`);
  // Nothing green below the lid line
  for (let y = 70; y < 200; y++) for (let x = 0; x < 160; x++) {
    assert(src(H, x, y) !== 2, `unexpected stem pixel at ${x},${y}`);
  }
});

Deno.test("pumpkin body is filled orange and the eye holes stay black", () => {
  const H = load(CLASSIC);
  H.initScreen();
  assertEquals(src(H, 80, 50), 3, "PAINT start point");
  assertEquals(src(H, 26, 115), 3, "left side of the body (between the ribs at x=20 and x=33)");
  assertEquals(src(H, 58, 105), 0, "inside left eye");
  assertEquals(src(H, 102, 105), 0, "inside right eye");
  assertEquals(src(H, 80, 125), 0, "inside nose");
  assertEquals(src(H, 80, 150), 0, "inside mouth");
});
