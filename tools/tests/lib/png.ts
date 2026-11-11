/** Minimal PNG read/write helpers (pngjs) for golden-image tests. */
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";

export function writePng(path: URL | string, rgba: Uint8ClampedArray, width: number, height: number, scale = 1) {
  const png = new PNG({ width: width * scale, height: height * scale });
  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < width * scale; x++) {
      const s = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      const d = (y * width * scale + x) * 4;
      for (let k = 0; k < 4; k++) png.data[d + k] = rgba[s + k];
    }
  }
  Deno.writeFileSync(path, PNG.sync.write(png));
}

export function readPng(path: URL | string): { width: number; height: number; data: Uint8Array } {
  const png = PNG.sync.read(Buffer.from(Deno.readFileSync(path)));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}
