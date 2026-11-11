/**
 * SOUND / PLAY timing tests. These run without Web Audio (sid.ctx is null),
 * so they check the BASIC-level timing and blocking behaviour, not the audio.
 */
import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import { load, ENGINE } from "./lib/load.ts";

const JIFFY = 1000 / 60;

Deno.test("SOUND waits for the previous sound on the same voice to finish", async () => {
  const H = load(ENGINE);
  await H.sid.sound(1, 1000, 60);
  assertAlmostEquals(H.sched.vt, 0, 1e-6, "first sound starts immediately");
  await H.sid.sound(1, 1000, 60);
  assertAlmostEquals(H.sched.vt, 60 * JIFFY, 1e-6, "second sound waited one second");
});

Deno.test("SOUND on a different voice does not wait", async () => {
  const H = load(ENGINE);
  await H.sid.sound(1, 1000, 60);
  await H.sid.sound(2, 1000, 60);
  assertAlmostEquals(H.sched.vt, 0, 1e-6);
});

Deno.test("SOUND v,0,0 silences the voice immediately", async () => {
  const H = load(ENGINE);
  await H.sid.sound(1, 1000, 600);
  await H.sid.sound(1, 0, 0);
  assertAlmostEquals(H.sched.vt, 0, 1e-6, "did not wait for the 10 s sound");
  await H.sid.sound(1, 1000, 10);
  assertAlmostEquals(H.sched.vt, 0, 1e-6, "voice is free again");
});

Deno.test("sweep: ALARM siren rises 10000 -> 30000 in steps of 400 over 50 jiffies", () => {
  const H = load(ENGINE);
  const f = H.sid.sweep(30000, 50, 0, 10000, 400);
  assertEquals(f.length, 50);
  assertEquals(f[0], 10000);
  assertEquals(f[49], 29600);
});

Deno.test("sweep: direction 1 falls and wraps back to the start frequency", () => {
  const H = load(ENGINE);
  assertEquals(H.sid.sweep(100, 10, 1, 20, 10), [100, 90, 80, 70, 60, 50, 40, 30, 20, 100]);
});

Deno.test("sweep: direction 2 oscillates between min and freq", () => {
  const H = load(ENGINE);
  assertEquals(H.sid.sweep(110, 4, 2, 20, 90), [20, 110, 20, 110]);
});

Deno.test("PLAY: TEMPO 20 quarter notes, returns when the last note starts", async () => {
  const H = load(ENGINE);
  H.sid.setTempo(20);
  await H.sid.play("V1 T0 Q C D E F");
  const quarterMs = (19.22 / 20 / 4) * 1000;
  assertAlmostEquals(H.sched.vt, 3 * quarterMs, 1e-6);
});

Deno.test("PLAY: note length persists, '.' dots only the next note, stray digits are ignored", async () => {
  const H = load(ENGINE);
  H.sid.setTempo(10);
  await H.sid.play("V1 H .C 02 C C");   // dotted half, half, then the final note starts
  const halfMs = (19.22 / 10 / 2) * 1000;
  assertAlmostEquals(H.sched.vt, 1.5 * halfMs + halfMs, 1e-6);
  assertEquals(H.sid.playState.octave, 4, "\"02\" (zero-two) did not change the octave");
});

Deno.test("PLAY: U sets the volume and O persists across PLAY statements", async () => {
  const H = load(ENGINE);
  await H.sid.play("V1T1U5X0");
  assertEquals(H.sid.volume, 5);
  await H.sid.play("O2");
  await H.sid.play("C");
  assertEquals(H.sid.playState.octave, 2);
});
