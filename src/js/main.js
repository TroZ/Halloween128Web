/*
 * main.js - page bootstrap: canvas rendering loop, start overlay, controls.
 */
(function (H) {
  'use strict';
  const { vic, sid, sched } = H;

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(vic.FRAME_W, vic.FRAME_H);
  const overlay = document.getElementById('start');
  const status = document.getElementById('status');
  const muteBtn = document.getElementById('mute');
  const fullBtn = document.getElementById('fullscreen');

  // Draw the static pumpkin as the first frame, behind the start overlay.
  H.initScreen();
  vic.render(img);
  ctx.putImageData(img, 0, 0);

  // Render loop + 60 Hz sprite motion (BASIC 7.0 moves sprites in its IRQ).
  let motionTime = 0;
  function frame(t) {
    if (!motionTime) motionTime = t;
    let steps = 0;
    while (t - motionTime >= 1000 / 60 && steps < 10) {
      vic.stepMotion();
      motionTime += 1000 / 60;
      steps++;
    }
    if (t - motionTime > 1000) motionTime = t;   // after a hidden tab, don't fast-forward
    vic.render(img);
    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(frame);
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    overlay.hidden = true;
    sid.init();
    sched.start();
    requestAnimationFrame(frame);
    H.run((name) => { status.textContent = name; }).catch((e) => {
      console.error(e);
      status.textContent = 'error: ' + e.message;
    });
  }
  overlay.addEventListener('click', start);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') start(); });

  function setMuted(m) {
    sid.setMuted(m);
    muteBtn.textContent = m ? 'Unmute' : 'Mute';
    muteBtn.setAttribute('aria-pressed', String(m));
  }
  muteBtn.addEventListener('click', () => setMuted(!sid.muted));

  fullBtn.addEventListener('click', () => {
    const el = document.getElementById('monitor');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  });

  document.addEventListener('keydown', (e) => {
    if (!started && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start(); }
    else if (e.key === 'm' || e.key === 'M') setMuted(!sid.muted);
    else if (e.key === 'f' || e.key === 'F') fullBtn.click();
  });
})(globalThis.H128);
