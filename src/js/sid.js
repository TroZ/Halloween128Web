/*
 * sid.js - an approximate SID (C128 sound chip) built on Web Audio,
 * plus the BASIC 7.0 sound commands HALOWEEN uses:
 *
 *   VOL n
 *   SOUND voice,freq,dur[,dir,min,step,wave,pulse]
 *   TEMPO n
 *   PLAY "string"
 *
 * Frequencies are SID register values, durations are jiffies (1/60 s).
 * Like BASIC 7.0, SOUND / PLAY wait for the voice to finish its previous
 * sound before starting a new one, and return once the new sound has started.
 */
(function (H) {
  'use strict';
  const sched = H.sched;

  const SID_CLOCK = 985248;                       // PAL C128 (VICE screenshot ran at 50 fps)
  const regToHz = (r) => (r * SID_CLOCK) / 16777216;
  const JIFFY_MS = 1000 / 60;
  const VOICE_LEVEL = 0.22;                       // per-voice level before master volume
  const NOISE_LEVEL = 0.5;                        // noise is louder per unit amplitude

  // SID envelope rates in ms (decay / release are 3x attack).
  const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];

  // BASIC 7.0 default PLAY envelopes T0-T9: attack, decay, sustain, release, wave, pulse width
  // wave: 0 triangle, 1 sawtooth, 2 pulse, 3 noise
  const ENVELOPES = [
    [0, 9, 0, 0, 2, 1536],  // 0 piano
    [12, 0, 12, 0, 1, 0],   // 1 accordion
    [0, 0, 15, 0, 0, 0],    // 2 calliope
    [0, 5, 5, 0, 3, 0],     // 3 drum
    [9, 4, 4, 0, 0, 0],     // 4 flute
    [0, 9, 2, 1, 1, 0],     // 5 guitar
    [0, 9, 0, 0, 2, 512],   // 6 harpsichord
    [0, 9, 9, 0, 2, 2048],  // 7 organ
    [8, 9, 4, 1, 2, 512],   // 8 trumpet
    [0, 9, 0, 0, 0, 0],     // 9 xylophone
  ];

  const sid = {
    ctx: null,
    master: null,
    volume: 15,
    muted: false,
    tempo: 8,
    voices: [null, { busyUntil: 0 }, { busyUntil: 0 }, { busyUntil: 0 }],
    playState: { voice: 1, octave: 4, env: 0, len: 0.25 },
  };

  let noiseBuffer = null;
  const pulseWaves = new Map();

  /** Must be called from a user gesture (browser autoplay rules). */
  sid.init = function () {
    if (sid.ctx) return sid.ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (sid.ctx = new AC());
    sid.master = ctx.createGain();
    sid.master.connect(ctx.destination);
    applyVolume();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx.resume();
  };

  /** Audio-clock time corresponding to the program's current virtual time. */
  function audioNow() {
    const ahead = Math.max(0, sched.vt - performance.now()) / 1000;
    return sid.ctx.currentTime + ahead + 0.02;
  }

  function applyVolume() {
    if (!sid.ctx) return;
    const v = sid.muted ? 0 : sid.volume / 15;
    sid.master.gain.setValueAtTime(v, audioNow());
  }

  /** VOL n */
  sid.setVolume = function (n) {
    sid.volume = Math.max(0, Math.min(15, n | 0));
    applyVolume();
  };

  sid.setMuted = function (m) {
    sid.muted = m;
    applyVolume();
  };

  function pulseWave(pw) {
    const duty = Math.max(1, Math.min(4095, pw || 2048)) / 4096;
    const key = Math.round(duty * 64);
    if (pulseWaves.has(key)) return pulseWaves.get(key);
    const N = 64;
    const real = new Float32Array(N), imag = new Float32Array(N);
    for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * (key / 64));
    const w = sid.ctx.createPeriodicWave(real, imag);
    pulseWaves.set(key, w);
    return w;
  }

  /**
   * Start a tone on a voice.
   * freqs: array of SID frequency values, one per jiffy (last one holds).
   * env:   function(gainParam, t0, durSec) that schedules the amplitude.
   */
  function startTone(v, wave, pw, freqs, durSec, env) {
    const voice = sid.voices[v];
    const ctx = sid.ctx;
    if (!ctx) return;
    const t0 = audioNow();
    if (voice.src) { try { voice.src.stop(t0); } catch (e) { /* already stopped */ } }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.connect(sid.master);

    let src, param, toParam;
    if (wave === 3) {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      param = src.playbackRate;
      // SID noise generator updates 16 times per oscillator period
      toParam = (f) => Math.max(0.0005, (regToHz(f) * 16) / ctx.sampleRate);
    } else {
      src = ctx.createOscillator();
      if (wave === 0) src.type = 'triangle';
      else if (wave === 1) src.type = 'sawtooth';
      else src.setPeriodicWave(pulseWave(pw));
      param = src.frequency;
      toParam = (f) => regToHz(f);
    }
    for (let j = 0; j < freqs.length; j++) param.setValueAtTime(toParam(freqs[j]), t0 + j / 60);
    src.connect(g);
    const level = wave === 3 ? NOISE_LEVEL : VOICE_LEVEL;
    const end = env(g.gain, t0, durSec, level);
    src.start(t0);
    src.stop(end + 0.05);
    src.onended = () => { g.disconnect(); if (voice.src === src) voice.src = null; };
    voice.src = src;
  }

  function stopVoice(v) {
    const voice = sid.voices[v];
    voice.busyUntil = sched.vt;
    if (voice.src && sid.ctx) {
      try { voice.src.stop(audioNow()); } catch (e) { /* ignore */ }
      voice.src = null;
    }
  }

  function sweep(freq, dur, dir, min, step) {
    const out = [];
    const n = Math.max(1, dur);
    if (!step) { out.push(freq); return out; }
    let f = dir === 1 ? freq : min;
    let up = true;
    for (let j = 0; j < n; j++) {
      out.push(f);
      if (dir === 0) { f += step; if (f > freq) f = min; }
      else if (dir === 1) { f -= step; if (f < min) f = freq; }
      else {
        if (up) { f += step; if (f >= freq) { f = freq; up = false; } }
        else { f -= step; if (f <= min) { f = min; up = true; } }
      }
    }
    return out;
  }

  /** SOUND voice,freq,dur[,dir,min,step,wave,pulse]  (async: waits for a busy voice) */
  sid.sound = async function (v, freq, dur, dir = 0, min = 0, step = 0, wave = 2, pw = 2048) {
    if (dur === 0) { stopVoice(v); return; }   // SOUND v,0,0 = silence the voice
    const voice = sid.voices[v];
    await sched.until(voice.busyUntil);
    const durSec = dur / 60;
    voice.busyUntil = sched.vt + dur * JIFFY_MS;
    if (freq === 0) return;
    startTone(v, wave, pw, sweep(freq, dur, dir, min, step), durSec, (gain, t0, d, level) => {
      gain.setValueAtTime(level, t0);
      gain.setValueAtTime(level, t0 + d);
      gain.linearRampToValueAtTime(0, t0 + d + 0.006);
      return t0 + d + 0.006;
    });
  };

  /** TEMPO n */
  sid.setTempo = function (n) { sid.tempo = Math.max(1, n); };

  const NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteToReg(octave, semi) {
    const hz = 440 * Math.pow(2, octave - 4 + (semi - 9) / 12);
    return (hz * 16777216) / SID_CLOCK;
  }

  async function playNote(reg, lenFrac, dotted) {
    const st = sid.playState;
    const voice = sid.voices[st.voice];
    await sched.until(voice.busyUntil);
    // A whole note lasts 19.22 / TEMPO seconds.
    const durSec = (19.22 / sid.tempo) * lenFrac * (dotted ? 1.5 : 1);
    voice.busyUntil = sched.vt + durSec * 1000;
    if (reg === null) return; // rest
    const [a, d, s, r, wave, pw] = ENVELOPES[st.env] || ENVELOPES[0];
    startTone(st.voice, wave, pw, [reg], durSec, (gain, t0, dur, level) => {
      const at = ATTACK_MS[a] / 1000, dt = (ATTACK_MS[d] * 3) / 1000, rt = (ATTACK_MS[r] * 3) / 1000;
      const sus = (s / 15) * level;
      const gateOff = t0 + dur;
      gain.setValueAtTime(0, t0);
      if (at < dur) {
        gain.linearRampToValueAtTime(level, t0 + at);
        gain.setTargetAtTime(sus, t0 + at, dt / 4);
      } else {
        gain.linearRampToValueAtTime(level * (dur / at), gateOff);
      }
      gain.setTargetAtTime(0, gateOff, Math.max(0.004, rt / 4));
      return gateOff + Math.max(0.02, rt);
    });
  }

  /** PLAY "string" (async) */
  sid.play = async function (str) {
    const st = sid.playState;
    const s = str.toUpperCase();
    let acc = 0, dotted = false;
    let i = 0;
    const readNum = () => {
      let n = '';
      while (i < s.length && s[i] >= '0' && s[i] <= '9') n += s[i++];
      return n === '' ? 0 : parseInt(n, 10);
    };
    while (i < s.length) {
      const c = s[i++];
      switch (c) {
        case 'V': st.voice = Math.max(1, Math.min(3, readNum())); break;
        case 'O': st.octave = Math.max(0, Math.min(6, readNum())); break;
        case 'T': st.env = Math.max(0, Math.min(9, readNum())); break;
        case 'U': sid.setVolume(readNum()); break;
        case 'X': readNum(); break;                 // filter on/off: not modelled
        case 'W': st.len = 1; break;
        case 'H': st.len = 1 / 2; break;
        case 'Q': st.len = 1 / 4; break;
        case 'I': st.len = 1 / 8; break;
        case 'S': st.len = 1 / 16; break;
        case '.': dotted = true; break;
        case '#': acc = 1; break;
        case '$': acc = -1; break;
        case 'R': await playNote(null, st.len, dotted); dotted = false; acc = 0; break;
        case 'M': {
          const t = Math.max(...sid.voices.slice(1).map((v) => v.busyUntil));
          await sched.until(t);
          break;
        }
        default:
          if (c in NOTE_SEMI) {
            await playNote(noteToReg(st.octave, NOTE_SEMI[c] + acc), st.len, dotted);
            dotted = false; acc = 0;
          }
          // anything else (spaces, stray digits such as the "02" typo in line 1330) is ignored
      }
    }
  };

  /** Silence everything and forget queued timing (used when restarting). */
  sid.reset = function () {
    for (let v = 1; v <= 3; v++) stopVoice(v);
  };

  H.sid = sid;
})(globalThis.H128 = globalThis.H128 || {});
