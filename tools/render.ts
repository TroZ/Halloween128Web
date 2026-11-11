/**
 * Render test scenes to PNG.
 *
 *   deno task render                 -> tools/tests/output/<scene>.png (2x, for viewing)
 *   deno task render classic-start   -> just that scene
 *   deno task golden                 -> overwrite tools/tests/golden/*.png (1x)
 *
 * Only regenerate goldens after checking that a visual change is intended.
 */
import { load, renderFrame, ROOT } from "./tests/lib/load.ts";
import { writePng } from "./tests/lib/png.ts";
import { SCENES } from "./tests/scenes.ts";

const args = Deno.args.filter((a) => !a.startsWith("--"));
const golden = Deno.args.includes("--update-golden");
const names = args.length ? args : Object.keys(SCENES);

const dir = new URL(golden ? "tools/tests/golden/" : "tools/tests/output/", ROOT);
Deno.mkdirSync(dir, { recursive: true });

for (const name of names) {
  const scene = SCENES[name];
  if (!scene) {
    console.error(`unknown scene "${name}". Available: ${Object.keys(SCENES).join(", ")}`);
    Deno.exit(1);
  }
  const H = load(scene.files);
  scene.setup(H);
  const file = new URL(`${name}.png`, dir);
  writePng(file, renderFrame(H), H.vic.FRAME_W, H.vic.FRAME_H, golden ? 1 : 2);
  console.log(`wrote ${decodeURIComponent(file.pathname).replace(/^\/([A-Za-z]:)/, "$1")}`);
}
