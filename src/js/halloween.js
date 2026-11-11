/*
 * halloween.js - port of HALOWEEN (Commodore 128 BASIC 7.0, public domain).
 *
 * Every BASIC subroutine is an async function; comments give the original
 * line numbers (see docs/HALOWEEN.bas). Deliberate changes from the original
 * are marked "CLEANUP".
 */
(function (H) {
  'use strict';
  const { vic, gfx, spr, sid, sched } = H;

  // ---- Timing model: estimated cost (ms) of BASIC 7.0 statements at 1 MHz. Tune here. ----
  // Calibrated against VICE: the first estimates ran about twice as fast as the real machine.
  const T = {
    STMT: 4,        // simple assignment / IF / GOSUB
    LOOP: 2.2,      // one pass of an empty FOR D=...:NEXT D
    MOVSPR: 7,
    SPRITE: 7,
    COLOR: 4,
    GRAPHIC: 12,
    SOUND: 6,
    VOL: 3,
    FLASH_MIN: 40,  // CLEANUP: lightning flash held long enough to be seen on any display
  };
  H.timing = T;

  // ---- tiny helpers mirroring BASIC statements ----
  const cost = (ms) => sched.cost(ms);
  const delay = (n) => cost(n * T.LOOP);                       // FOR D=1 TO n:NEXT D
  const R = (x) => Math.floor(Math.random() * x) + 1;          // 550 DEF FN R(X)=INT(RND(1)*X)+1
  const movspr = (n, x, y) => { spr.movspr(n, x, y); return cost(T.MOVSPR); };
  const movsprA = (n, a, s) => { spr.movsprAngle(n, a, s); return cost(T.MOVSPR); };
  const sprite = (...a) => { spr.sprite(...a); return cost(T.SPRITE); };
  const color = (s, c) => { gfx.color(s, c); return cost(T.COLOR); };
  const graphic = (m, c) => { gfx.graphic(m, c); return cost(T.GRAPHIC); };
  const vol = (n) => { sid.setVolume(n); return cost(T.VOL); };
  const sound = async (...a) => { await sid.sound(...a); await cost(T.SOUND); };
  const play = async (s) => { await sid.play(s); await cost(T.STMT); };

  let NF = 0;          // "no flash" flag used by the Mountain King routine

  // ---------------------------------------------------------------------------
  // 100-510: draw the pumpkin.
  // CLEANUP: drawn instantly instead of slowly on screen.
  // ---------------------------------------------------------------------------
  function drawPumpkin() {
    gfx.graphic(1, 1); gfx.graphic(0);                          // 100
    gfx.color(0, 1);                                            // 110 background black
    gfx.color(1, 8);                                            // 120 foreground yellow
    gfx.color(2, 6);                                            // 130 multicolour 1 green
    gfx.color(3, 9);                                            // 140 multicolour 2 orange
    gfx.color(4, 1);                                            // 150 border black
    gfx.clearBitmap();                                          // 160 GRAPHIC3,1 (kept hidden)
    gfx.circle(3, 80, 115, 75, 80);                             // 170 pumpkin outline
    gfx.draw(3, 55, 90, 45, 105);                               // 200-220 left eye
    gfx.draw(3, 45, 105, 70, 115);
    gfx.draw(3, 70, 115, 55, 90);
    gfx.draw(3, 105, 90, 115, 105);                             // 240-260 right eye
    gfx.draw(3, 115, 105, 90, 115);
    gfx.draw(3, 90, 115, 105, 90);
    gfx.draw(3, 80, 110, 73, 130);                              // 290-310 nose
    gfx.draw(3, 73, 130, 87, 130);
    gfx.draw(3, 87, 130, 80, 110);
    gfx.circle(3, 80, 150, 40, 10);                             // 340 mouth
    gfx.paint(3, 80, 50);                                       // 360 fill pumpkin
    for (let x = 8; x <= 65; x += 13) gfx.circle(0, 80, 115, x, 80); // 390-410 bumps
    gfx.circle(0, 80, 30, 60, 30);                              // 440 top cutout
    gfx.circle(2, 105, 40, 30, 30, 270, 320);                   // 470-500 stem
    gfx.circle(2, 100, 35, 18, 18, 250, 330);
    gfx.circle(2, 80, 25, 15, 17, 170, 195);
    gfx.circle(2, 83, 35, 15, 18, 15, 30);
    gfx.paint(2, 80, 35);                                       // 510
  }

  /** 530-640: sprite set-up (synchronous, used for the first frame too). */
  function setupSprites() {
    spr.loadData();                                             // 530 GOSUB 2550
    gfx.color(0, 1); gfx.color(4, 1);                           // 560
    vic.graphicMode = 3;                                        // 570 SCNCLR0:GRAPHIC3,0
    spr.sprite(1, 1, 8, 1, 0, 0, 0); spr.sprite(2, 1, 8, 1, 0, 0, 0);    // 580 eye rings (behind bitmap)
    spr.sprite(3, 0, 11, 0, 0, 0, 0); spr.sprite(4, 0, 11, 0, 0, 0, 0);  // 590 pupils
    spr.movspr(1, 125, 145); spr.movspr(3, 125, 145);           // 600
    spr.movspr(2, 222, 145); spr.movspr(4, 222, 145);           // 610
    spr.sprite(5, 1, 5, 1, 0, 0);                               // 620 witch (behind bitmap)
    spr.movspr(5, 0, 70);                                       // 630
  }

  /** Static first frame shown before the user clicks RUN. */
  H.initScreen = function () {
    drawPumpkin();
    setupSprites();
  };

  // ---------------------------------------------------------------------------
  // Subroutines
  // ---------------------------------------------------------------------------

  // 1030-1120: move eyes left (115) / centre (125) / right (135)
  async function eyesH(x2) {
    const x1 = spr.rsppos(1, 0); await cost(T.STMT);            // 1060
    if (R(3) === 1) await flashEyes();                          // 1070
    const s = x1 > x2 ? -1 : 1;                                 // 1080
    for (let x3 = x1; s > 0 ? x3 <= x2 : x3 >= x2; x3 += s) {   // 1090
      await movspr(1, x3, 145); await movspr(3, x3, 145);       // 1100
      await movspr(2, x3 + 97, 145); await movspr(4, x3 + 97, 145); // 1110
      await cost(T.LOOP);                                       // 1120
    }
  }
  const eyesLeft = () => eyesH(115);                            // 1030
  const eyesCenter = () => eyesH(125);                          // 1040
  const eyesRight = () => eyesH(135);                           // 1050

  // 1150-1240: move eyes up (135) / centre (145) / down (148)
  async function eyesV(y2) {
    const x1 = spr.rsppos(1, 1); await cost(T.STMT);            // 1180
    if (R(3) === 1) await flashEyes();                          // 1190
    const s = x1 > y2 ? -1 : 1;                                 // 1200
    for (let x3 = x1; s > 0 ? x3 <= y2 : x3 >= y2; x3 += s) {   // 1210
      await movspr(1, 125, x3); await movspr(3, 125, x3);       // 1220
      await movspr(2, 125 + 97, x3); await movspr(4, 125 + 97, x3); // 1230
      await cost(T.LOOP);                                       // 1240
    }
  }
  const eyesUp = () => eyesV(135);                              // 1150
  const eyesNormal = () => eyesV(145);                          // 1160
  const eyesDown = () => eyesV(148);                            // 1170

  // 1260-1390: "In the Hall of the Mountain King"
  async function mountainKing(slow) {
    if (slow) { sid.setTempo(10); await play('V1T1U5X0'); }     // 1280 slow (accordion)
    else { sid.setTempo(20); await play('V1T0U5X0'); }          // 1300 faster (piano)
    await eyesLeft(); await resetSounds();                      // 1310
    const P = 'Q O1 G A $B O2 C D O1 $B';                       // 1320
    const P1 = 'O2 H D Q $D O1 A O2 H $D Q C O1 $A 02 H C';     // 1330 ("02" typo kept)
    await play(P); await play(P1); NF = 1; await eyesCenter(); await play(P); // 1340
    await play('O2 Q D G F D O1 $B O2 D W F');                  // 1350
    NF = 0; await flashEyes();                                  // 1360
    await play(P); await play(P1); NF = 1; await eyesRight(); await play(P); // 1370
    await play('O2 Q D $E D C O1 $B A WG');                     // 1380
    await eyesCenter();                                         // 1390
    NF = 0; // CLEANUP: the original leaves NF=1, which disabled FLASH EYES for good
  }

  // 1410-1610: spider drops down, eyes follow it, spider climbs back up chirping
  async function spider() {
    await vol(3); const h = R(250) + 60;                        // 1420
    await movspr(6, h, 0); await movspr(7, h, 0);               // 1430-1440
    await sprite(6, 1, 13, 0); await sprite(7, 0, 13, 0);       // 1450-1460
    for (let x = 0; x <= 190; x += 5) {                         // 1470
      await movspr(6, h, x); await movspr(7, h, x);             // 1480-1490
      await delay(25); await cost(T.LOOP);                      // 1500
    }
    if (h < 190) await eyesLeft();                              // 1510
    else if (h > 225) await eyesRight();                        // 1520
    else await eyesCenter();                                    // 1530
    await cost(1000);                                           // 1540 SLEEP 1
    for (let x = 190; x >= 30; x -= 5) {                        // 1550
      await movspr(6, h, x); await movspr(7, h, x);             // 1560-1570
      await sound(1, 56000 - x * 100, 1);                       // 1580
      if (x & 1) { await sprite(6, 1); await sprite(7, 0); }    // 1590 alternate frames
      else { await sprite(7, 1); await sprite(6, 0); }
      await delay(155); await cost(T.LOOP);                     // 1600
    }
    await eyesCenter();                                         // 1610
  }

  // 1630-1700: flash the pupils
  async function flashEyes() {
    if (NF) return;                                             // 1640
    for (let x = 1; x <= 10; x++) {                             // 1650
      await sprite(3, 1, 11, 0, 0, 0, 1);                       // 1660
      await sprite(4, 1, 11, 0, 0, 0, 1);                       // 1670
      await delay(10);                                          // 1680
      await sprite(3, 0); await sprite(4, 0);                   // 1690
      await cost(T.LOOP);
    }
    NF = 0;                                                     // 1700
  }

  // 1720-1800: random spooky chords for 13 seconds while the eyes wander
  async function randomMusic() {
    sched.resetTI(); await vol(3); const n = R(60000) + 1000; await resetSounds(); // 1730
    const actions = [eyesLeft, eyesCenter, eyesRight, redBlink, eyesUp, eyesNormal, eyesDown];
    while (sched.tiSeconds() < 13) {                            // 1740
      for (let x = 1; x <= 3; x++) await sound(x, R(n) + 600, 100, 0, 0, 0); // 1750-1770
      await actions[R(7) - 1]();                                // 1780
      await delay(200);                                         // 1790
    }
    await eyesCenter();                                         // 1800
  }

  // 1820-1990: Cheshire pumpkin - the pumpkin vanishes, leaving only the eyes
  async function cheshire() {
    await sprite(5, 0);                                         // 1830 witch off
    await graphic(0);                                           // 1840 text screen (blank)
    if (R(3) === 1) {                                           // 1850
      // 1880-1980: roaming eyes
      const d = R(360); sched.resetTI();                        // 1890
      while (sched.tiSeconds() < 6) {                           // 1900
        await movsprA(1, d, 3); await movsprA(2, d, 3);         // 1910
        await sound(1, R(5000) + 1000, 100);                    // 1920
        await sound(2, R(5000) + 1000, 100);                    // 1930
        await sound(3, R(5000) + 1000, 100);                    // 1940
      }
      await movsprA(1, 0, 0); await movsprA(2, 0, 0);           // 1960
      await movspr(1, 125, 145); await movspr(3, 125, 145);     // 1970
      await movspr(2, 125 + 97, 145); await movspr(4, 125 + 97, 145); // 1980
      await sprite(5, 1); // CLEANUP: original never turned the witch back on here
    } else {
      await shiftyEyes();                                       // 1860
      await [eyesUp, eyesNormal, eyesDown][R(3) - 1]();
      await sprite(5, 1);                                       // 1870
    }
    await eyesNormal(); await graphic(3);                       // 1990
  }

  // 2010-2190: thunder and lightning
  async function thunder() {
    await resetSounds();                                        // 2020
    for (let x = 1; x <= 3; x++) {
      await color(0, 2); await color(4, 2); await graphic(0);   // 2030 white flash
      await delay(1); await cost(T.FLASH_MIN);                  // 2040
      await color(0, 1); await color(4, 1); await graphic(3);   // 2050
      await cost(T.FLASH_MIN / 2);                              // CLEANUP: keep flashes distinct
    }
    await vol(15);                                              // 2070
    await sound(1, 25000, 5, 0, 0, 0, 3);                       // 2080 crack
    await sound(2, 10000, 5, 0, 0, 0, 3);                       // 2090
    await sound(3, 60000, 5, 0, 0, 0, 3);                       // 2100
    await vol(5);                                               // 2110
    await sound(1, 100, 100, 1, 20, 10, 3, 4000);               // 2120 rumble
    await sound(2, 110, 100, 2, 20, 90, 3, 4000);               // 2130
    await sound(3, 50, 100, 0, 0, 0, 3, 4000);                  // 2140
    await sound(1, 100, 100, 0, 0, 0, 3);                       // 2150
    for (let x = 5; x >= 0; x--) { await delay(60); await vol(x); } // 2160-2180 fade
  }

  // 2210-2260: alarm
  async function alarm() {
    await resetSounds(); await vol(10);                         // 2220
    for (let x = 1; x <= 5; x++) {                              // 2230
      await sound(1, 30000, 50, 0, 10000, 400, 0);              // 2240
      await sound(2, 26400, 50, 0, 10000, 0, 0);                // 2250
    }
  }

  // 2280-2360: ghost floats across from right to left
  async function ghost() {
    await resetSounds(); await vol(5);                          // 2290
    const v = R(100) + 80; await movspr(8, 350, v);
    // 2300 SPRITE8,1,FN R(16) - CLEANUP: never pick black (1), which made the ghost invisible
    await sprite(8, 1, R(15) + 1);
    await sound(1, 5000, 270, 2, 1000, 240, 3, 100);            // 2310
    await sound(2, 1000, 270, 2, 900, 100, 2, 2600);            // 2320
    await sound(3, 10000, 270, 2, 9000, 240, 1, 100);           // 2330
    for (let x = 340; x >= 0; x--) {                            // 2340
      await movspr(8, x, v); await cost(T.LOOP);                // 2350-2360
    }
  }

  // 2380-2440: shifty eyes
  async function shiftyEyes() {
    const n = R(3) + 1;
    for (let z = 1; z <= n; z++) {                              // 2390
      await eyesLeft(); await eyesCenter(); await eyesRight(); await eyesCenter(); // 2400-2430
    }
  }

  // 2460-2480: reset sounds
  async function resetSounds() {
    for (let x = 1; x <= 3; x++) await sound(x, 0, 0);
  }

  // 2500-2530: red blink
  async function redBlink() {
    await sprite(1, 1, 3); await sprite(2, 1, 3);               // 2510
    await delay(500);                                           // 2520
    await sprite(1, 1, 8); await sprite(2, 1, 8);               // 2530
  }

  // ---------------------------------------------------------------------------
  // Main program
  // ---------------------------------------------------------------------------
  const ROUTINES = [
    ['eyes left', eyesLeft], ['eyes center', eyesCenter], ['eyes right', eyesRight],      // 830-850
    ['Mountain King (slow)', () => mountainKing(true)],                                   // 860
    ['Mountain King', () => mountainKing(false)],                                         // 870
    ['spider', spider], ['flash eyes', flashEyes], ['random spooky music', randomMusic],  // 880-900
    ['Cheshire pumpkin', cheshire], ['thunder and lightning', thunder], ['alarm', alarm], // 910-930
    ['ghost', ghost], ['shifty eyes', shiftyEyes], ['red blink', redBlink],               // 940-960
    ['eyes up', eyesUp], ['eyes normal', eyesNormal], ['eyes down', eyesDown],            // 970-990
  ];

  // 660-790: the opening sequence runs each animation once, in the original order.
  const OPENING = [
    ['shifty eyes', shiftyEyes], ['Mountain King', () => mountainKing(false)],
    ['spider', spider], ['flash eyes', flashEyes], ['random spooky music', randomMusic],
    ['Cheshire pumpkin', cheshire], ['thunder and lightning', thunder], ['alarm', alarm],
    ['eyes up', eyesUp], ['eyes down', eyesDown], ['eyes normal', eyesNormal],
    ['ghost', ghost], ['red blink', redBlink],
  ];

  /** Run the program. onRoutine(name) is called as each routine starts (for the status line). */
  H.run = async function (onRoutine = () => {}) {
    setupSprites();
    spr.movsprAngle(5, 90, 1);                                  // 640 witch flies right
    for (const [name, fn] of OPENING) { onRoutine(name); await fn(); await cost(T.STMT); }
    for (;;) {                                                  // 810-990
      const [name, fn] = ROUTINES[R(17) - 1];
      onRoutine(name);
      await fn();
      await cost(T.STMT);
    }
  };
})(globalThis.H128 = globalThis.H128 || {});
