/**
 * Named test scenes, shared by the golden-image test and tools/render.ts.
 * Each scene names the scripts to load and sets up machine state.
 */
import { CLASSIC, EXTENDED, type H128 } from "./lib/load.ts";

export interface Scene {
  files: string[];
  setup: (H: H128) => void;
}

export const SCENES: Record<string, Scene> = {
  /** The first frame shown behind the start screen. */
  "classic-start": {
    files: CLASSIC,
    setup: (H) => H.initScreen(),
  },

  /** Every sprite on screen at once: eyes with flashing pupils, witch, both spider frames, ghost. */
  "classic-sprites": {
    files: CLASSIC,
    setup: (H) => {
      H.initScreen();
      H.spr.sprite(3, 1, 11, 0, 0, 0, 1);
      H.spr.sprite(4, 1, 11, 0, 0, 0, 1);
      H.spr.movspr(5, 60, 60);
      H.spr.sprite(6, 1, 13, 0); H.spr.movspr(6, 250, 60);
      H.spr.sprite(7, 1, 13, 0); H.spr.movspr(7, 290, 60);
      H.spr.sprite(8, 1, 2); H.spr.movspr(8, 320, 200);
    },
  },

  /** Cheshire pumpkin: text screen, only the eyes remain. */
  "classic-cheshire": {
    files: CLASSIC,
    setup: (H) => {
      H.initScreen();
      H.gfx.graphic(0);
    },
  },

  /** Extended: cross-eyed at full extent, red eyes with red pupils showing. */
  "extended-cross-eyed": {
    files: EXTENDED,
    setup: (H) => {
      H.initScreen();
      H.spr.movspr(1, 135, 145); H.spr.movspr(3, 135, 145);
      H.spr.movspr(2, 212, 145); H.spr.movspr(4, 212, 145);
      H.spr.sprite(1, 1, 3); H.spr.sprite(2, 1, 3);
      H.spr.sprite(3, 1, 3, 0, 0, 0, 1); H.spr.sprite(4, 1, 3, 0, 0, 0, 1);
    },
  },

  /** Extended: witch flying left and ghost flying right (mirrored shapes), eyes looking at the ghost. */
  "extended-mirrored": {
    files: EXTENDED,
    setup: (H) => {
      H.initScreen();
      H.spr.setData(5, H.spr.mirrorData(H.spr.slot(5)));
      H.spr.movspr(5, 280, 60);
      H.spr.setData(8, H.spr.mirrorData(H.spr.slot(8)));
      H.spr.sprite(8, 1, 2); H.spr.movspr(8, 60, 200);
      H.fx.trackSprite(8);
      for (let j = 0; j < 60; j++) H.vic.stepMotion();
    },
  },
};
