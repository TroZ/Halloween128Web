/*
 * basic-gfx.js - BASIC 7.0 bitmap graphics commands on top of vic.js.
 *
 *   GRAPHIC mode[,clear]   COLOR source,code   SCNCLR
 *   DRAW source,x0,y0 TO x1,y1
 *   CIRCLE source,x,y,xr[,yr[,sa[,ea[,rotation[,inc]]]]]
 *   PAINT source,x,y[,mode]
 *
 * In multicolour mode (GRAPHIC 3) coordinates are 0-159 x 0-199.
 * Colour sources: 0 background, 1 foreground, 2 multicolour 1, 3 multicolour 2, 4 border.
 */
(function (H) {
  'use strict';
  const vic = H.vic;
  const W = vic.BM_W, Hh = vic.BM_H;

  // Palette colour currently assigned to each colour source (BASIC defaults).
  const regs = [11, 1, 2, 4, 13];

  const gfx = {};

  /** COLOR source, code  (code is 1-16 as in BASIC 7.0) */
  gfx.color = function (src, code) {
    const c = (code - 1) & 15;
    regs[src] = c;
    if (src === 0) vic.background = c;
    if (src === 4) vic.border = c;
  };

  /** GRAPHIC mode[,clear] - modes 0 (text) and 3 (multicolour) are displayed; 1 is treated as bitmap. */
  gfx.graphic = function (mode, clear) {
    if (clear) gfx.clearBitmap();
    vic.graphicMode = mode === 0 ? 0 : 3;
  };

  gfx.clearBitmap = function () {
    vic.bmSrc.fill(0);
    vic.bmCol.fill(0);
  };

  /** SCNCLR mode: text screen is always blank in this port, so only bitmap modes clear. */
  gfx.scnclr = function (mode) {
    if (mode === 1 || mode === 3) gfx.clearBitmap();
  };

  function plot(x, y, src) {
    if (x < 0 || y < 0 || x >= W || y >= Hh) return;
    const i = y * W + x;
    vic.bmSrc[i] = src;
    vic.bmCol[i] = src === 0 ? 0 : regs[src];
  }
  gfx.plot = (src, x, y) => plot(Math.round(x), Math.round(y), src);

  /** DRAW source, x0,y0 TO x1,y1 (Bresenham line). */
  gfx.draw = function (src, x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      plot(x0, y0, src);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  /**
   * CIRCLE source,x,y,xr,yr,sa,ea,rot,inc
   * Like the ROM, the shape is drawn as straight segments every `inc` degrees
   * (default 2). Angle 0 is 12 o'clock and angles increase clockwise.
   */
  gfx.circle = function (src, xc, yc, xr, yr = xr, sa = 0, ea = 360, rot = 0, inc = 2) {
    if (ea < sa) ea += 360;
    const rad = Math.PI / 180;
    const cr = Math.cos(rot * rad), sr = Math.sin(rot * rad);
    const pt = (a) => {
      const ex = xr * Math.sin(a * rad), ey = -yr * Math.cos(a * rad);
      return [xc + ex * cr - ey * sr, yc + ex * sr + ey * cr];
    };
    let [px, py] = pt(sa);
    for (let a = sa + inc; ; a += inc) {
      if (a > ea) a = ea;
      const [nx, ny] = pt(a);
      gfx.draw(src, px, py, nx, ny);
      px = nx; py = ny;
      if (a >= ea) break;
    }
  };

  /**
   * PAINT source,x,y[,mode]
   * mode 0 (default): fill until pixels of the painting source are reached.
   * mode 1: fill until any non-background pixel is reached.
   * 4-connected scanline flood fill.
   */
  gfx.paint = function (src, x, y, mode = 0) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= Hh) return;
    const s = vic.bmSrc;
    const isBoundary = mode === 1 ? (i) => s[i] !== 0 : (i) => s[i] === src;
    const done = new Uint8Array(W * Hh);
    if (isBoundary(y * W + x)) return;
    const stack = [[x, y]];
    while (stack.length) {
      let [cx, cy] = stack.pop();
      let i = cy * W + cx;
      if (done[i] || isBoundary(i)) continue;
      // walk left to the span start
      while (cx > 0 && !isBoundary(i - 1) && !done[i - 1]) { cx--; i--; }
      let upOpen = false, downOpen = false;
      for (; cx < W && !isBoundary(i) && !done[i]; cx++, i++) {
        done[i] = 1;
        plot(cx, cy, src);
        if (cy > 0) {
          const u = i - W, open = !isBoundary(u) && !done[u];
          if (open && !upOpen) stack.push([cx, cy - 1]);
          upOpen = open;
        }
        if (cy < Hh - 1) {
          const d = i + W, open = !isBoundary(d) && !done[d];
          if (open && !downOpen) stack.push([cx, cy + 1]);
          downOpen = open;
        }
      }
    }
  };

  H.gfx = gfx;
})(globalThis.H128 = globalThis.H128 || {});
