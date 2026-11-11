/**
 * Golden-image tests: render named scenes and compare pixel-for-pixel with
 * tools/tests/golden/*.png. On a mismatch the actual frame is written to
 * tools/tests/output/ for inspection.
 *
 * After an intended visual change, regenerate the goldens with:
 *   deno task golden
 */
import { assert } from "jsr:@std/assert@1";
import { load, renderFrame, ROOT } from "./lib/load.ts";
import { readPng, writePng } from "./lib/png.ts";
import { SCENES } from "./scenes.ts";

const W = 384, H_ = 272;

for (const [name, setup] of Object.entries(SCENES)) {
  Deno.test(`render matches golden: ${name}`, () => {
    const H = load();
    setup(H);
    const actual = renderFrame(H);
    const golden = readPng(new URL(`tools/tests/golden/${name}.png`, ROOT));
    assert(golden.width === W && golden.height === H_, "golden has the wrong size");
    let diff = 0;
    for (let i = 0; i < actual.length; i += 4) {
      if (actual[i] !== golden.data[i] || actual[i + 1] !== golden.data[i + 1] || actual[i + 2] !== golden.data[i + 2]) diff++;
    }
    if (diff) {
      const out = new URL("tools/tests/output/", ROOT);
      Deno.mkdirSync(out, { recursive: true });
      writePng(new URL(`${name}.png`, out), actual, W, H_);
    }
    assert(diff === 0, `${diff} pixels differ; see tools/tests/output/${name}.png (run "deno task golden" if the change is intended)`);
  });
}
