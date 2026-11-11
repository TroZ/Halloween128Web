/*
 * sprites.js - BASIC 7.0 sprite commands and HALOWEEN's sprite data.
 *
 *   SPRITE n,on,color,priority,xexp,yexp,mode   (omitted args keep their value)
 *   MOVSPR n,x,y            absolute position
 *   MOVSPR n,angle#speed    continuous interrupt-driven motion
 *   RSPPOS(n,what)          0 = x, 1 = y, 2 = speed
 */
(function (H) {
  'use strict';
  const vic = H.vic;

  // Lines 2570-2870: 512 bytes POKEd to 3584-4095 ($0E00-$0FFF) = sprites 1-8.
  // 1-2 eye rings, 3-4 pupils, 5 witch, 6-7 spider frames, 8 ghost.
  const SPRITE_DATA = [
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,254,0,7,255,128,15,135,192,31,3,224,31,3,
    224,31,3,224,31,3,224,15,135,192,7,255,128,1,254,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,254,0,7,255,128,15,135,192,31,3,224,31,3,
    224,31,3,224,31,3,224,15,135,192,7,255,128,1,254,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,120,0,0,252,0,0,252,
    0,0,252,0,0,252,0,0,120,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,120,0,0,252,0,0,252,
    0,0,252,0,0,252,0,0,120,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,1,0,0,3,128,0,15,224,0,3,64,15,255,128,0,127,128,0,29,128,240,62,
    96,255,255,254,240,58,0,0,58,0,0,116,0,0,232,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,8,0,32,9,1,32,9,1,32,9,41,32,9,41,32,4,186,64,2,124,128,1,255,0,0,254,
    0,1,255,0,2,124,128,4,186,64,9,1,32,9,1,32,9,1,32,9,1,32,8,0,32,0,0,0,0,0,0,0,
    0,0,0,0,0,0,16,0,16,18,0,144,18,0,144,18,40,144,18,40,144,9,57,32,4,186,64,3,255,128,0,254,
    0,3,255,128,4,186,64,9,57,32,18,0,144,18,0,144,18,0,144,18,0,144,16,0,16,0,0,0,0,0,0,0,
    0,0,0,0,0,0,31,0,0,63,224,0,127,240,0,125,248,0,108,252,0,111,252,0,63,254,0,28,126,0,15,255,
    0,15,255,128,7,255,128,7,255,192,3,255,240,3,255,254,1,255,252,0,239,30,0,119,128,0,48,192,0,8,32,0,
  ];

  const spr = {
    SPRITE_DATA,
    MOTION_SCALE: 0.5,   // tune to match VICE (witch: MOVSPR 5,90#1)
  };

  /** GOSUB 2550: copy the 64-byte slots into sprites 1-8. */
  spr.loadData = function () {
    for (let n = 1; n <= 8; n++) {
      vic.sprites[n].data.set(SPRITE_DATA.slice((n - 1) * 64, (n - 1) * 64 + 63));
    }
  };

  /** The 63 data bytes of sprite slot n (1-8) as loaded by HALOWEEN. */
  spr.slot = function (n) {
    return SPRITE_DATA.slice((n - 1) * 64, (n - 1) * 64 + 63);
  };

  /** Replace a sprite's shape (like POKEing a different data block). */
  spr.setData = function (n, bytes) {
    vic.sprites[n].data.set(bytes.slice(0, 63));
  };

  /**
   * Left-right mirror of 63-byte sprite data. C128 programs had no hardware flip,
   * so they kept a second, mirrored copy of the shape. Multicolour data is
   * mirrored in bit pairs so colours are kept.
   */
  spr.mirrorData = function (bytes, multicolor = false) {
    const out = new Array(63).fill(0);
    for (let row = 0; row < 21; row++) {
      const v = (bytes[row * 3] << 16) | (bytes[row * 3 + 1] << 8) | bytes[row * 3 + 2];
      let m = 0;
      if (multicolor) {
        for (let p = 0; p < 12; p++) m |= ((v >> (p * 2)) & 3) << ((11 - p) * 2);
      } else {
        for (let b = 0; b < 24; b++) if (v & (1 << b)) m |= 1 << (23 - b);
      }
      out[row * 3] = (m >> 16) & 255;
      out[row * 3 + 1] = (m >> 8) & 255;
      out[row * 3 + 2] = m & 255;
    }
    return out;
  };

  /** SPRITE n,on,color,priority,xexp,yexp,mode */
  spr.sprite = function (n, on, color, prio, xexp, yexp, mode) {
    const s = vic.sprites[n];
    if (on !== undefined) s.on = !!on;
    if (color !== undefined) s.color = (color - 1) & 15;
    if (prio !== undefined) s.behind = !!prio;
    if (xexp !== undefined) s.xexp = !!xexp;
    if (yexp !== undefined) s.yexp = !!yexp;
    if (mode !== undefined) s.multicolor = !!mode;
  };

  /** MOVSPR n,x,y */
  spr.movspr = function (n, x, y) {
    const s = vic.sprites[n];
    s.x = x & 511;
    s.y = y & 255;
  };

  /** MOVSPR n,angle#speed - angle 0 = up, clockwise; speed 0 stops. */
  spr.movsprAngle = function (n, angle, speed) {
    const s = vic.sprites[n];
    const a = angle * Math.PI / 180;
    s.speed = speed;
    // Speed is modelled as MOTION_SCALE pixels per jiffy (1/60 s) per unit of speed.
    s.dx = Math.sin(a) * speed * spr.MOTION_SCALE;
    s.dy = -Math.cos(a) * speed * spr.MOTION_SCALE;
  };

  /** RSPPOS(n, what) */
  spr.rsppos = function (n, what) {
    const s = vic.sprites[n];
    return what === 0 ? Math.floor(s.x) : what === 1 ? Math.floor(s.y) : s.speed;
  };

  H.spr = spr;
})(globalThis.H128 = globalThis.H128 || {});
