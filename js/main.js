/* Insaniquarium — browser wiring: canvas loop, input, HUD, overlays. */
(function () {
  'use strict';

  var Core = window.InsaniquariumCore;
  var Render = window.InsaniquariumRender;
  var Audio = window.InsaniquariumAudio;

  var canvas = document.getElementById('tank');
  var ctx = canvas.getContext('2d');
  var ui = {
    startScreen: document.getElementById('startScreen'),
    overScreen: document.getElementById('overScreen'),
    playBtn: document.getElementById('playBtn'),
    againBtn: document.getElementById('againBtn'),
    menuBtn: document.getElementById('menuBtn'),
    stopBtn: document.getElementById('stopBtn'),
    buyFishBtn: document.getElementById('buyFishBtn'),
    buyFoodBtn: document.getElementById('buyFoodBtn'),
    muteBtn: document.getElementById('muteBtn'),
    coinEl: document.getElementById('coinCount'),
    pelletEl: document.getElementById('pelletCount'),
    timeEl: document.getElementById('timeLeft'),
    fishEl: document.getElementById('fishCount'),
    overTitle: document.getElementById('overTitle'),
    overScore: document.getElementById('overScore'),
    overDetail: document.getElementById('overDetail'),
    bestList: document.getElementById('bestList'),
    toast: document.getElementById('toast'),
    hint: document.getElementById('hint')
  };

  var TANK = Core.TANK;
  var state = null;
  var running = false;
  var lastTs = 0;
  var bubbles = [];
  var floatTexts = [];
  var toastTimer = null;

  // ---------- sizing ----------
  function resize() {
    var wrap = canvas.parentElement;
    var rect = wrap.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var scale = Math.min(rect.width / TANK.W, (window.innerHeight * 0.72) / TANK.H);
    canvas.width = Math.round(TANK.W * scale * dpr);
    canvas.height = Math.round(TANK.H * scale * dpr);
    canvas.style.width = Math.round(TANK.W * scale) + 'px';
    canvas.style.height = Math.round(TANK.H * scale) + 'px';
    ctx.setTransform(canvas.width / TANK.W, 0, 0, canvas.height / TANK.H, 0, 0);
  }
  window.addEventListener('resize', resize);

  function toLogical(evt) {
    var rect = canvas.getBoundingClientRect();
    var cx = (evt.clientX - rect.left) / rect.width * TANK.W;
    var cy = (evt.clientY - rect.top) / rect.height * TANK.H;
    return { x: cx, y: cy };
  }

  // ---------- best scores ----------
  var BEST_KEY = 'insaniquarium-best-v1';
  function loadBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || []; } catch (e) { return []; }
  }
  function saveBest(score, result) {
    var best = loadBest();
    best.push({ score: score, result: result, date: new Date().toLocaleDateString() });
    best.sort(function (a, b) { return b.score - a.score; });
    best = best.slice(0, 5);
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) {}
    return best;
  }

  // ---------- toast / hints ----------
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.classList.remove('show'); }, 1600);
  }

  function floatText(x, y, text, color, size) {
    floatTexts.push({ x: x, y: y, text: text, color: color || '#ffd76a', size: size || 20, age: 0 });
  }

  // ---------- bubbles ----------
  function spawnBubble() {
    bubbles.push({
      x: Math.random() * TANK.W,
      y: TANK.H - 30 + Math.random() * 20,
      r: 1.5 + Math.random() * 3.5,
      vy: 18 + Math.random() * 26,
      alpha: 0.15 + Math.random() * 0.3,
      wob: Math.random() * Math.PI * 2
    });
  }

  // ---------- HUD ----------
  function fmtTime(s) {
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function updateHUD() {
    if (!state) return;
    ui.coinEl.textContent = state.wallet;
    ui.pelletEl.textContent = state.pellets;
    ui.timeEl.textContent = fmtTime(Core.timeLeft(state));
    ui.fishEl.textContent = Core.aliveFish(state).length;
    ui.buyFishBtn.disabled = state.wallet < Core.COST_FISH || Core.aliveFish(state).length >= Core.MAX_FISH;
    ui.buyFoodBtn.disabled = state.wallet < Core.COST_BAG;
  }

  // ---------- game flow ----------
  function startGame() {
    state = Core.createGame({});
    running = true;
    bubbles = [];
    floatTexts = [];
    ui.startScreen.classList.add('hidden');
    ui.overScreen.classList.add('hidden');
    ui.hint.classList.add('hidden');
    lastTs = performance.now();
    Audio.ensure();
  }

  function endGameUI() {
    running = false;
    var best = saveBest(state.totalCollected, state.result);
    var titleMap = {
      time: 'Time\'s up!',
      fish: 'The tank is empty…',
      stopped: 'Game stopped'
    };
    ui.overTitle.textContent = titleMap[state.result] || 'Game over';
    ui.overScore.textContent = state.totalCollected;
    var detailMap = {
      time: 'You collected coins across the whole tank.',
      fish: 'All fish died — feeding is survival.',
      stopped: 'You ended the run early.'
    };
    ui.overDetail.textContent = detailMap[state.result] || '';
    ui.bestList.innerHTML = best.map(function (b, i) {
      return '<li><span class="rank">' + (i + 1) + '</span><span class="pts">' + b.score + '</span><span class="when">' + b.date + '</span></li>';
    }).join('');
    ui.overScreen.classList.remove('hidden');
    ui.hint.classList.add('hidden');
    Audio.play('game-over');
  }

  // ---------- events ----------
  function drainEvents() {
    if (!state) return;
    var evs = state.events.slice();
    state.events.length = 0;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.type) {
        case 'collect':
          Audio.play('collect');
          break;
        case 'eat': Audio.play('eat'); break;
        case 'pellet-drop': Audio.play('pellet-drop'); break;
        case 'buy-fish': Audio.play('buy-fish'); toast('Hatchling joined the tank!'); break;
        case 'buy-bag': Audio.play('buy-bag'); toast('+25 pellets'); break;
        case 'buy-fail': Audio.play('buy-fail'); toast('Not enough coins!'); break;
        case 'no-food': Audio.play('no-food'); toast('Out of pellets — buy a bag!'); break;
        case 'alien-spawn': Audio.play('alien-spawn'); break;
        case 'alien-hit': Audio.play('alien-hit'); break;
        case 'alien-die': Audio.play('alien-die'); break;
        case 'alien-eats': Audio.play('alien-eats'); toast('A fish was eaten by an alien!'); break;
        case 'fish-die': Audio.play('fish-die'); toast(e.cause === 'hunger' ? 'A fish starved!' : 'A fish was eaten!'); break;
        case 'mature': Audio.play('mature'); break;
        case 'game-over': endGameUI(); break;
      }
    }
  }

  // ---------- loop ----------
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!running || !state) return;
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;

    Core.update(state, dt);

    // bubbles
    if (Math.random() < dt * 6) spawnBubble();
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      b.y -= b.vy * dt;
      b.x += Math.sin(ts * 0.001 + b.wob) * 12 * dt;
      if (b.y < -10) bubbles.splice(i, 1);
    }

    // floating texts
    for (i = floatTexts.length - 1; i >= 0; i--) {
      floatTexts[i].age += dt;
      if (floatTexts[i].age > 1.2) floatTexts.splice(i, 1);
    }

    // floating collect text is added in click handler
    drainEvents();
    updateHUD();

    Render.render(ctx, state, ts / 1000, bubbles, floatTexts);
  }

  // ---------- input ----------
  canvas.addEventListener('pointerdown', function (evt) {
    if (!running || !state || state.over) return;
    var p = toLogical(evt);
    var result = Core.clickAt(state, p.x, p.y);
    if (result.type === 'coin') {
      floatText(p.x, p.y, '+' + result.value, '#ffd76a', 22);
    } else if (result.type === 'pellet') {
      floatText(p.x, p.y, '·', '#f3e2c7', 16);
    }
    drainEvents();
    updateHUD();
  });

  ui.playBtn.addEventListener('click', startGame);
  ui.againBtn.addEventListener('click', startGame);
  ui.menuBtn.addEventListener('click', function () {
    running = false;
    ui.overScreen.classList.add('hidden');
    ui.startScreen.classList.remove('hidden');
  });
  ui.stopBtn.addEventListener('click', function () {
    if (!running || !state) return;
    Core.stopGame(state);
    drainEvents();
    updateHUD();
  });
  ui.buyFishBtn.addEventListener('click', function () {
    if (!running || !state) return;
    Core.buyFish(state);
    drainEvents();
    updateHUD();
  });
  ui.buyFoodBtn.addEventListener('click', function () {
    if (!running || !state) return;
    Core.buyFood(state);
    drainEvents();
    updateHUD();
  });

  // mute toggle
  var muted = false;
  try { muted = localStorage.getItem('insaniquarium-muted') === '1'; } catch (e) {}
  Audio.setMuted(muted);
  function syncMuteBtn() { ui.muteBtn.textContent = muted ? '🔇' : '🔊'; }
  ui.muteBtn.addEventListener('click', function () {
    muted = !muted;
    Audio.setMuted(muted);
    try { localStorage.setItem('insaniquarium-muted', muted ? '1' : '0'); } catch (e) {}
    syncMuteBtn();
  });
  syncMuteBtn();

  // keyboard shortcuts
  window.addEventListener('keydown', function (evt) {
    if (evt.key === ' ') { evt.preventDefault(); if (running && state) Core.stopGame(state), drainEvents(), updateHUD(); }
    if (evt.key === 'f' || evt.key === 'F') { if (running && state) Core.buyFood(state), drainEvents(), updateHUD(); }
    if (evt.key === 'n' || evt.key === 'N') { if (running && state) Core.buyFish(state), drainEvents(), updateHUD(); }
  });

  // ---------- boot ----------
  resize();
  requestAnimationFrame(frame);

  // expose for debugging/testing
  window.__game = {
    getState: function () { return state; },
    getRunning: function () { return running; },
    start: startGame
  };
})();
