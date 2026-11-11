/*
 * effects.js - Extended helpers that run once per jiffy (1/60 s).
 *
 * On a real C128 these would be small machine-language routines wedged into
 * the raster interrupt, because BASIC is busy running the current routine.
 * Here they are vic.jiffyHooks.
 *
 *   Witch controller - decides what the witch does each time she leaves the screen.
 *   Eye tracker      - steers the pumpkin's eyes toward a sprite.
 */
(function (H) {
  'use strict';
  const { vic, spr } = H;
  const R = (x) => Math.floor(Math.random() * x) + 1;

  const fx = {};

  // ---------------------------------------------------------------------------
  // Witch (sprite 5)
  //
  // Each time she has flown completely off screen, pick 1-10:
  //   1     stop off screen for as long as a crossing takes, then fly right again
  //   2     face left (mirrored shape) and fly left across the screen
  //   other face right and fly right
  // ---------------------------------------------------------------------------
  const WITCH = 5;
  const WITCH_SPEED = 1;                       // MOVSPR 5,90#1 as in the original

  const witch = fx.witch = {
    right: null,          // sprite data facing right (original)
    left: null,           // mirrored copy
    dir: 1,               // 1 right, -1 left
    wait: 0,              // jiffies left to stay stopped
    wasVisible: false,
    decisions: [],        // last few decisions, for tests / debugging
  };

  /** Jiffies the witch takes to cross the screen edge to edge. */
  fx.witchCrossJiffies = function () {
    return Math.round((vic.DISP_W + 24) / (WITCH_SPEED * spr.MOTION_SCALE));
  };

  function faceWitch(dir) {
    witch.dir = dir;
    spr.setData(WITCH, dir > 0 ? witch.right : witch.left);
  }

  function flyWitch(dir) {
    faceWitch(dir);
    spr.movsprAngle(WITCH, dir > 0 ? 90 : 270, WITCH_SPEED);
  }

  function decideWitch() {
    const r = R(10);
    if (r === 1) {
      spr.movsprAngle(WITCH, 0, 0);
      witch.wait = fx.witchCrossJiffies();
    } else if (r === 2) {
      flyWitch(-1);
    } else {
      flyWitch(1);
    }
    witch.decisions.push(r === 1 ? 'stop' : r === 2 ? 'left' : 'right');
    if (witch.decisions.length > 50) witch.decisions.shift();
  }

  function witchHook() {
    if (witch.wait > 0) {
      if (--witch.wait === 0) flyWitch(1);
      return;
    }
    const vis = vic.spriteInWindow(vic.sprites[WITCH]);
    if (witch.wasVisible && !vis) decideWitch();
    witch.wasVisible = vis;
  }

  /** Replaces line 640 (MOVSPR5,90#1): start the witch and her controller. */
  fx.startWitch = function () {
    witch.right = spr.slot(WITCH);
    witch.left = spr.mirrorData(witch.right);
    witch.wait = 0;
    witch.wasVisible = vic.spriteInWindow(vic.sprites[WITCH]);
    flyWitch(1);
    if (!vic.jiffyHooks.includes(witchHook)) vic.jiffyHooks.push(witchHook);
  };

  // ---------------------------------------------------------------------------
  // Eye tracker
  //
  // Eye rings are sprites 1 and 2 (2 is 97 pixels right of 1); the pupils
  // (3, 4) sit on top of them. The original routines keep the eyes within
  // x 115-135 and y 135-148, centred at 125,145.
  // ---------------------------------------------------------------------------
  const EYES = fx.EYES = { minX: 115, maxX: 135, minY: 135, maxY: 148, homeX: 125, homeY: 145 };
  const EYE_STEP_JIFFIES = 2;      // one pixel per axis every 2 jiffies, about the speed of the original eye moves
  const EYES_MID_X = 160;          // display x between the two eyes
  const EYES_MID_Y = 105;          // display y of the eye centres

  const tracker = fx.tracker = { target: null, tick: 0 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** Eye position that looks toward sprite n, or null while it is off screen. */
  function lookAtSprite(n) {
    const s = vic.sprites[n];
    if (!vic.spriteInWindow(s)) return null;
    const cx = vic.spriteScreenX(s) + (s.xexp ? 24 : 12);
    const cy = (Math.floor(s.y) & 255) - 50 + (s.yexp ? 21 : 10.5);
    const dx = cx - EYES_MID_X, dy = cy - EYES_MID_Y;
    const x = EYES.homeX + clamp(Math.round(dx / 14), EYES.minX - EYES.homeX, EYES.maxX - EYES.homeX);
    const y = dy < 0
      ? EYES.homeY + Math.max(EYES.minY - EYES.homeY, Math.round(dy / 6))
      : EYES.homeY + Math.min(EYES.maxY - EYES.homeY, Math.round(dy / 20));
    return { x, y };
  }

  function placeEyes(x, y) {
    spr.movspr(1, x, y); spr.movspr(3, x, y);
    spr.movspr(2, x + 97, y); spr.movspr(4, x + 97, y);
  }

  function trackerHook() {
    if (!tracker.target) return;
    if (++tracker.tick % EYE_STEP_JIFFIES) return;
    const t = tracker.target();
    if (!t) return;
    const x = spr.rsppos(1, 0), y = spr.rsppos(1, 1);
    const nx = x + Math.sign(t.x - x), ny = y + Math.sign(t.y - y);
    if (nx !== x || ny !== y) placeEyes(nx, ny);
  }

  function ensureTrackerHook() {
    if (!vic.jiffyHooks.includes(trackerHook)) vic.jiffyHooks.push(trackerHook);
  }

  /** Start following sprite n (eyes hold still while it is off screen). */
  fx.trackSprite = function (n) {
    ensureTrackerHook();
    tracker.target = () => lookAtSprite(n);
  };

  /** Steer the eyes back to their centre position. */
  fx.trackHome = function () {
    ensureTrackerHook();
    tracker.target = () => ({ x: EYES.homeX, y: EYES.homeY });
  };

  fx.stopTracking = function () {
    tracker.target = null;
  };

  fx.eyesHome = function () {
    return spr.rsppos(1, 0) === EYES.homeX && spr.rsppos(1, 1) === EYES.homeY;
  };

  /** Snap the eyes to their centre (used if a hidden tab stalled the tracker). */
  fx.placeEyesHome = function () {
    placeEyes(EYES.homeX, EYES.homeY);
  };

  H.fx = fx;
})(globalThis.H128 = globalThis.H128 || {});
