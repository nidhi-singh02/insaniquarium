/* Insaniquarium — tiny WebAudio synth for game SFX. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.InsaniquariumAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ctx = null;
  var muted = false;

  function ensure() {
    if (!ctx) {
      var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, delay, slideTo) {
    var ac = ensure();
    if (!ac || muted) return;
    var t0 = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function play(name) {
    if (muted) return;
    switch (name) {
      case 'collect': tone(880, 0.09, 'triangle', 0.10); tone(1320, 0.12, 'triangle', 0.08, 0.05); break;
      case 'eat': tone(320, 0.10, 'sine', 0.12, 0, 140); break;
      case 'pellet-drop': tone(500, 0.08, 'sine', 0.06, 0, 300); break;
      case 'buy-fish': tone(660, 0.10, 'square', 0.06); tone(990, 0.14, 'square', 0.05, 0.08); break;
      case 'buy-bag': tone(520, 0.08, 'triangle', 0.08); tone(780, 0.10, 'triangle', 0.07, 0.07); break;
      case 'buy-fail': tone(180, 0.16, 'sawtooth', 0.07); break;
      case 'no-food': tone(160, 0.12, 'square', 0.06); break;
      case 'alien-hit': tone(220, 0.07, 'square', 0.10, 0, 120); break;
      case 'alien-die': tone(700, 0.20, 'sawtooth', 0.09, 0, 90); break;
      case 'alien-spawn': tone(140, 0.30, 'sawtooth', 0.05, 0, 90); break;
      case 'fish-die': tone(300, 0.35, 'sine', 0.10, 0, 90); break;
      case 'mature': tone(540, 0.12, 'triangle', 0.08); tone(720, 0.16, 'triangle', 0.08, 0.09); break;
      case 'game-over': tone(520, 0.22, 'triangle', 0.10); tone(390, 0.22, 'triangle', 0.10, 0.22); tone(260, 0.40, 'triangle', 0.10, 0.44); break;
      case 'alien-eats': tone(180, 0.3, 'sawtooth', 0.10, 0, 70); break;
    }
  }

  function setMuted(m) { muted = !!m; }
  function isMuted() { return muted; }

  return { play: play, setMuted: setMuted, isMuted: isMuted, ensure: ensure };
});
