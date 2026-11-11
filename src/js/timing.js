/*
 * timing.js - virtual clock for the ported BASIC program.
 *
 * The original paces itself with BASIC execution speed and empty
 * FOR D=1 TO n:NEXT loops. Each ported statement "costs" an estimated number
 * of milliseconds; the program sleeps whenever its virtual time gets ahead of
 * real time. This keeps animation speed close to a 1 MHz C128.
 */
(function (H) {
  'use strict';

  const MAX_LAG_MS = 100;   // never try to "catch up" more than this (e.g. after a hidden tab)

  const now = () => performance.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const sched = {
    vt: 0,          // virtual time in ms (performance.now() timebase)
    tiBase: 0,      // TI$ reset point
    paused: false,

    start() {
      this.vt = now();
      this.tiBase = this.vt;
    },

    /** Spend `ms` of virtual time, sleeping if we are ahead of real time. */
    async cost(ms) {
      this.vt += ms;
      const t = now();
      if (this.vt < t - MAX_LAG_MS) this.vt = t - MAX_LAG_MS;
      const ahead = this.vt - t;
      if (ahead > 2) await sleep(ahead);
      while (this.paused) await sleep(50);
    },

    /** Wait until virtual time `t`. */
    async until(t) {
      await this.cost(Math.max(0, t - this.vt));
    },

    /** TI$="000000" */
    resetTI() { this.tiBase = this.vt; },

    /** VAL(TI$) for values under one minute: whole seconds since reset. */
    tiSeconds() { return Math.floor((this.vt - this.tiBase) / 1000); },
  };

  H.sched = sched;
})(globalThis.H128 = globalThis.H128 || {});
