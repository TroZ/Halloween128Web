/** Sprite data and sprite command tests. */
import { assertEquals, assert } from "jsr:@std/assert@1";
import { load, ROOT, ENGINE } from "./lib/load.ts";

/** Parse the DATA statements out of the detokenized BASIC listing. */
function basicSpriteData(): number[] {
  const bas = Deno.readTextFileSync(new URL("docs/HALOWEEN.bas", ROOT)).split(/\r?\n/);
  return bas
    .filter((l) => /^\d+ DATA/.test(l))
    .flatMap((l) => l.replace(/^\d+ DATA ?/, "").split(",").map((s) => Number(s.trim())));
}

Deno.test("sprite data matches the DATA statements in HALOWEEN.bas byte for byte", () => {
  const H = load(ENGINE);
  const expected = basicSpriteData();
  assertEquals(expected.length, 512, "listing should hold 8 x 64 bytes");
  assertEquals(H.spr.SPRITE_DATA, expected);
});

Deno.test("loadData puts each 64-byte slot into the matching sprite", () => {
  const H = load(ENGINE);
  H.spr.loadData();
  const data = basicSpriteData();
  for (let n = 1; n <= 8; n++) {
    assertEquals(Array.from(H.vic.sprites[n].data), data.slice((n - 1) * 64, (n - 1) * 64 + 63), `sprite ${n}`);
  }
});

Deno.test("SPRITE leaves omitted arguments unchanged and maps colour codes 1-16 to 0-15", () => {
  const H = load(ENGINE);
  H.spr.sprite(1, 1, 8, 1, 0, 0, 0);
  H.spr.sprite(1, 1, 3); // like the RED BLINK routine
  const s = H.vic.sprites[1];
  assertEquals(s.on, true);
  assertEquals(s.color, 2, "code 3 = palette 2 (red)");
  assertEquals(s.behind, true, "priority kept from the first call");
});

Deno.test("MOVSPR angle#speed moves right at angle 90 and wraps at x=512", () => {
  const H = load(ENGINE);
  H.spr.movspr(5, 500, 70);
  H.spr.movsprAngle(5, 90, 1);
  const before = H.vic.sprites[5].x;
  for (let i = 0; i < 40; i++) H.vic.stepMotion();
  const s = H.vic.sprites[5];
  const expected = (before + 40 * H.spr.MOTION_SCALE) % 512;
  assert(Math.abs(s.x - expected) < 1e-9, `x=${s.x} expected ${expected}`);
  assert(Math.abs(s.y - 70) < 1e-9, "no vertical drift at 90 degrees");
});

Deno.test("RSPPOS returns whole-number positions", () => {
  const H = load(ENGINE);
  H.spr.movspr(1, 125, 145);
  assertEquals(H.spr.rsppos(1, 0), 125);
  assertEquals(H.spr.rsppos(1, 1), 145);
});
