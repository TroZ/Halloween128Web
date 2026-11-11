/*
 * vic.js - a tiny model of the C128's 40-column VIC-II video chip.
 *
 * Only what HALOWEEN uses is modelled:
 *   - border / background colour registers
 *   - text mode (GRAPHIC 0, always a blank screen here) and
 *     160x200 multicolour bitmap mode (GRAPHIC 3)
 *   - 8 hardware sprites: hires or multicolour, X/Y expansion,
 *     sprite-to-sprite priority and sprite-behind-bitmap priority
 *   - BASIC 7.0's interrupt-driven sprite motion (MOVSPR n, angle # speed)
 *
 * The rendered frame is 384x272: a 320x200 display window surrounded by border.
 */
(function (H) {
  'use strict';

  // VIC-II palette, indices 0-15 (from docs/colors.txt).
  // NOTE: BASIC 7.0 COLOR / SPRITE commands use codes 1-16, i.e. code - 1.
  const PALETTE = [
    [0, 0, 0],       //  0 black
    [255, 255, 255], //  1 white
    [136, 0, 0],     //  2 red
    [170, 255, 238], //  3 cyan
    [204, 68, 204],  //  4 purple
    [0, 204, 85],    //  5 green
    [0, 0, 170],     //  6 blue
    [238, 238, 119], //  7 yellow
    [221, 136, 85],  //  8 orange
    [102, 68, 0],    //  9 brown
    [255, 119, 119], // 10 light red
    [51, 51, 51],    // 11 dark grey
    [119, 119, 119], // 12 grey
    [170, 255, 102], // 13 light green
    [0, 136, 255],   // 14 light blue
    [187, 187, 187], // 15 light grey
  ];

  const FRAME_W = 384, FRAME_H = 272;
  const DISP_W = 320, DISP_H = 200;
  const DISP_X = 32, DISP_Y = 36;      // display window position inside the frame
  const BM_W = 160, BM_H = 200;        // multicolour bitmap resolution
  const SPR_X0 = 24, SPR_Y0 = 50;      // sprite coordinates of the top-left display pixel

  // Palette packed as 32-bit RGBA (little-endian => 0xAABBGGRR) for fast ImageData writes.
  const PAL32 = PALETTE.map(([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0);

  const vic = {
    PALETTE, FRAME_W, FRAME_H, DISP_W, DISP_H, DISP_X, DISP_Y, BM_W, BM_H,
    border: 0,
    background: 0,
    graphicMode: 0,                         // 0 = text, 3 = multicolour bitmap
    bmSrc: new Uint8Array(BM_W * BM_H),     // colour source (0-3) of each bitmap pixel
    bmCol: new Uint8Array(BM_W * BM_H),     // palette colour of each pixel (sources 1-3)
    sprites: [null],                        // 1-based like BASIC
    spriteMC: [1, 2],                       // shared sprite multicolours ($D025, $D026)
  };

  for (let n = 1; n <= 8; n++) {
    vic.sprites[n] = {
      n, data: new Uint8Array(63),
      on: false, color: 0, behind: false, xexp: false, yexp: false, multicolor: false,
      x: 0, y: 0,             // VIC sprite coordinates (floats while auto-moving)
      speed: 0, dx: 0, dy: 0, // auto motion per 1/60 s
    };
  }

  // Functions run once per jiffy after sprite motion, like extra code wedged into the
  // C128's raster interrupt. Classic registers none; Extended uses them.
  vic.jiffyHooks = [];

  /** Advance BASIC 7.0 interrupt-driven sprite motion by one jiffy (1/60 s). */
  vic.stepMotion = function () {
    for (let n = 1; n <= 8; n++) {
      const s = vic.sprites[n];
      if (s.speed > 0) {
        s.x = (s.x + s.dx + 512) % 512;
        s.y = (s.y + s.dy + 256) % 256;
      }
    }
    for (const hook of vic.jiffyHooks) hook();
  };

  // A PAL raster line has 504 sprite X positions: 488-503 sit just left of 0,
  // and 504-511 never match, so a sprite there is not displayed at all.
  const SPR_X_LINE = 504;
  const SPR_X_HIDDEN = -1000;

  /** Display-window X of a sprite's left edge (handles the X wrap at the left border). */
  vic.spriteScreenX = function (s) {
    let px = Math.floor(s.x) & 511;
    if (px >= SPR_X_LINE) return SPR_X_HIDDEN;
    if (px >= 488) px -= SPR_X_LINE;
    return px - SPR_X0;
  };

  /** True if any part of the sprite's 24x21 box is inside the display window. */
  vic.spriteInWindow = function (s) {
    const w = s.xexp ? 48 : 24, h = s.yexp ? 42 : 21;
    const sx = vic.spriteScreenX(s), sy = (Math.floor(s.y) & 255) - SPR_Y0;
    return sx > -w && sx < DISP_W && sy > -h && sy < DISP_H;
  };

  // Per-frame scratch buffers
  const sprCol = new Int16Array(DISP_W * DISP_H);
  const sprBehind = new Uint8Array(DISP_W * DISP_H);

  function drawSprite(s) {
    const sx = vic.spriteScreenX(s);        // includes X wrap-around at the left edge (PAL)
    const sy = (Math.floor(s.y) & 255) - SPR_Y0;
    const w = s.xexp ? 2 : 1, h = s.yexp ? 2 : 1;
    const mc0 = vic.spriteMC[0], mc1 = vic.spriteMC[1];
    for (let row = 0; row < 21; row++) {
      for (let col = 0; col < 24; col++) {
        const byte = s.data[row * 3 + (col >> 3)];
        let c = -1;
        if (s.multicolor) {
          const pair = (byte >> (6 - ((col & 7) >> 1) * 2)) & 3;
          if (pair === 1) c = mc0; else if (pair === 2) c = s.color; else if (pair === 3) c = mc1;
        } else if ((byte >> (7 - (col & 7))) & 1) {
          c = s.color;
        }
        if (c < 0) continue;
        for (let ey = 0; ey < h; ey++) {
          const y = sy + row * h + ey;
          if (y < 0 || y >= DISP_H) continue;
          for (let ex = 0; ex < w; ex++) {
            const x = sx + col * w + ex;
            if (x < 0 || x >= DISP_W) continue;
            const i = y * DISP_W + x;
            sprCol[i] = c;
            sprBehind[i] = s.behind ? 1 : 0;
          }
        }
      }
    }
  }

  /** Render the current machine state into a 384x272 ImageData. */
  vic.render = function (img) {
    const out = new Uint32Array(img.data.buffer);
    out.fill(PAL32[vic.border]);

    // Sprites: draw 8..1 so lower-numbered sprites win (VIC sprite priority).
    sprCol.fill(-1);
    for (let n = 8; n >= 1; n--) if (vic.sprites[n].on) drawSprite(vic.sprites[n]);

    const bg = vic.background;
    const bitmap = vic.graphicMode === 3;
    for (let y = 0; y < DISP_H; y++) {
      let o = (y + DISP_Y) * FRAME_W + DISP_X;
      const bmRow = y * BM_W;
      const spRow = y * DISP_W;
      for (let x = 0; x < DISP_W; x++, o++) {
        let c = bg, fg = false;
        if (bitmap) {
          const i = bmRow + (x >> 1);
          const src = vic.bmSrc[i];
          if (src !== 0) {
            c = vic.bmCol[i];
            // VIC quirk: multicolour bit pair 01 (source 1) counts as background
            // for sprite priority, only pairs 10 and 11 hide "behind" sprites.
            fg = src >= 2;
          }
        }
        const sc = sprCol[spRow + x];
        if (sc >= 0 && !(fg && sprBehind[spRow + x])) c = sc;
        out[o] = PAL32[c];
      }
    }
  };

  H.vic = vic;
})(globalThis.H128 = globalThis.H128 || {});
