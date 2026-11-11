/**
 * Named test scenes, shared by the golden-image test and tools/render.ts.
 * Each scene sets up machine state on a freshly loaded H128.
 */
import type { H128 } from "./lib/load.ts";

export const SCENES: Record<string, (H: H128) => void> = {
  /** The first frame shown behind the start screen. */
  "classic-start": (H) => {
    H.initScreen();
  },

  /** Every sprite on screen at once: eyes with flashing pupils, witch, both spider frames, ghost. */
  "classic-sprites": (H) => {
    H.initScreen();
    H.spr.sprite(3, 1, 11, 0, 0, 0, 1);
    H.spr.sprite(4, 1, 11, 0, 0, 0, 1);
    H.spr.movspr(5, 60, 60);
    H.spr.sprite(6, 1, 13, 0); H.spr.movspr(6, 250, 60);
    H.spr.sprite(7, 1, 13, 0); H.spr.movspr(7, 290, 60);
    H.spr.sprite(8, 1, 2); H.spr.movspr(8, 320, 200);
  },

  /** Cheshire pumpkin: text screen, only the eyes remain. */
  "classic-cheshire": (H) => {
    H.initScreen();
    H.gfx.graphic(0);
  },
};
