/* Insaniquarium — pure game logic core.
 * No DOM, no canvas, no timers: fully deterministic & unit-testable.
 * Browser: window.InsaniquariumCore · Node: module.exports */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InsaniquariumCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TANK = { W: 960, H: 600, SAND: 46 };
  var DURATION = 300;               // 5 minutes, per the original game
  var COST_FISH = 20;
  var COST_BAG = 25;
  var BAG_SIZE = 25;
  var START_BAGS = 1;
  var MAX_FISH = 12;
  var DEATH_WARNING = 8;            // seconds before a fish dies
  var MAX_ALIENS = 3;
  var LATCH_TIME = 2.5;             // seconds of latching before fish is eaten

  var STAGES = [
    { name: 'hatchling', coin: 1, size: 11, color: '#ffd27a' },
    { name: 'juvenile', coin: 3, size: 15, color: '#ff9d4d' },
    { name: 'adult',    coin: 5, size: 20, color: '#ff5e4d' }
  ];

  function rand(rng, a, b) { return a + rng() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createGame(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var state = {
      time: 0,
      duration: DURATION,
      over: false,
      result: null,          // 'time' | 'fish' | 'stopped'
      rng: rng,
      nextId: 1,
      wallet: 0,             // spendable coins
      totalCollected: 0,     // score: total coins collected
      pellets: START_BAGS * BAG_SIZE,
      fish: [],
      coins: [],
      pelletsWater: [],
      aliens: [],
      alienTimer: rand(rng, 18, 28),
      events: [],
      stats: { coinsCollected: 0, pelletsDropped: 0, pelletsWasted: 0, fishPurchased: 0, fishLost: 0, aliensDefeated: 0 }
    };
    // Two hatchlings at the start (per the original game)
    addFish(state, 0);
    addFish(state, 0);
    return state;
  }

  function addFish(state, stage) {
    var rng = state.rng;
    var f = {
      id: state.nextId++,
      x: rand(rng, 120, TANK.W - 120),
      y: rand(rng, 120, TANK.H - TANK.SAND - 120),
      vx: 0, vy: 0,
      stage: stage || 0,
      age: 0,
      matureAt: rand(rng, 40, 60),
      hunger: 0,
      hungerMax: rand(rng, 30, 40),
      coinTimer: rand(rng, 20, 30),
      wanderT: 0,
      tx: rand(rng, 100, TANK.W - 100),
      ty: rand(rng, 80, TANK.H - TANK.SAND - 80),
      wobble: rand(rng, 0, Math.PI * 2),
      eatenFlash: 0,
      dead: false,
      deathT: 0,
      latched: false,
      targetPellet: null
    };
    state.fish.push(f);
    return f;
  }

  function addCoin(state, x, y, value) {
    state.coins.push({
      id: state.nextId++,
      x: x, y: y,
      vy: rand(state.rng, 34, 52),
      phase: rand(state.rng, 0, Math.PI * 2),
      value: value || 1
    });
  }

  function addPellet(state, x, y) {
    state.pelletsWater.push({
      id: state.nextId++,
      x: clamp(x, 20, TANK.W - 20),
      y: clamp(y, 20, TANK.H - TANK.SAND - 10),
      vy: rand(state.rng, 48, 62)
    });
  }

  function spawnAlien(state) {
    var side = state.rng() < 0.5 ? 'top' : 'side';
    var x, y;
    if (side === 'top') { x = rand(state.rng, 80, TANK.W - 80); y = -30; }
    else { x = state.rng() < 0.5 ? -30 : TANK.W + 30; y = rand(state.rng, 60, TANK.H * 0.5); }
    var hp = 3 + Math.floor(state.time / 90);
    var speed = 58 + Math.min(80, state.time / 3);
    state.aliens.push({
      id: state.nextId++,
      x: x, y: y, vx: 0, vy: 0,
      hp: hp, maxHp: hp,
      speed: speed,
      state: 'chase',
      targetId: null,
      latchT: 0,
      flash: 0,
      wobble: rand(state.rng, 0, Math.PI * 2)
    });
    state.events.push({ type: 'alien-spawn' });
  }

  function aliveFish(state) {
    return state.fish.filter(function (f) { return !f.dead; });
  }

  function killFish(state, f, cause) {
    if (f.dead) return;
    f.dead = true;
    f.deathT = 0;
    f.latched = false;
    state.stats.fishLost++;
    state.events.push({ type: 'fish-die', cause: cause });
  }

  function endGame(state, result) {
    if (state.over) return;
    state.over = true;
    state.result = result;
    state.events.push({ type: 'game-over', result: result });
  }

  function update(state, dt) {
    if (state.over) {
      // still animate dead fish fading out
      for (var i = 0; i < state.fish.length; i++) {
        var fd = state.fish[i];
        if (fd.dead) fd.deathT += dt;
      }
      return;
    }

    state.time += dt;

    var rng = state.rng;
    var i, j, f;

    // ---- fish ----
    for (i = 0; i < state.fish.length; i++) {
      f = state.fish[i];
      if (f.dead) { f.deathT += dt; f.y += 26 * dt; continue; }

      f.age += dt;
      f.hunger += dt;
      f.eatenFlash = Math.max(0, f.eatenFlash - dt);
      f.wobble += dt * 6;

      // maturity
      if (f.stage < STAGES.length - 1 && f.age >= f.matureAt) {
        f.stage++;
        f.matureAt = f.age + rand(rng, 40, 60);
        f.hungerMax = rand(rng, 30, 40); // refresh hunger window with new stage
        state.events.push({ type: 'mature', stage: f.stage });
      }

      // coin production
      f.coinTimer -= dt;
      if (f.coinTimer <= 0) {
        f.coinTimer = rand(rng, 20, 30);
        addCoin(state, f.x, f.y - 8, STAGES[f.stage].coin);
      }

      // hunger death
      if (f.hunger >= f.hungerMax) { killFish(state, f, 'hunger'); continue; }

      // movement
      if (f.latched) {
        f.vx *= 0.8; f.vy *= 0.8;
      } else {
        // eat a pellet if one is targeted
        var pellet = null;
        if (f.targetPellet != null) {
          for (j = 0; j < state.pelletsWater.length; j++) {
            if (state.pelletsWater[j].id === f.targetPellet) { pellet = state.pelletsWater[j]; break; }
          }
          if (!pellet) f.targetPellet = null;
        }
        var speed = 42 + f.stage * 14;
        var tx, ty;
        if (pellet) {
          tx = pellet.x; ty = pellet.y;
        } else {
          f.wanderT -= dt;
          if (f.wanderT <= 0) {
            f.wanderT = rand(rng, 2, 5);
            f.tx = rand(rng, 60, TANK.W - 60);
            f.ty = rand(rng, 50, TANK.H - TANK.SAND - 60);
          }
          tx = f.tx; ty = f.ty;
        }
        var dx = tx - f.x, dy = ty - f.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var desired = { x: (dx / d) * speed, y: (dy / d) * speed };
        f.vx += (desired.x - f.vx) * Math.min(1, dt * 3);
        f.vy += (desired.y - f.vy) * Math.min(1, dt * 3);
        // gentle wobble
        f.vx += Math.sin(f.wobble) * 4 * dt * 60;
        f.vy += Math.cos(f.wobble * 0.7) * 3 * dt * 60;

        f.x += f.vx * dt;
        f.y += f.vy * dt;
        // bounds
        var m = 26;
        if (f.x < m) { f.x = m; f.vx = Math.abs(f.vx); }
        if (f.x > TANK.W - m) { f.x = TANK.W - m; f.vx = -Math.abs(f.vx); }
        if (f.y < m) { f.y = m; f.vy = Math.abs(f.vy); }
        if (f.y > TANK.H - TANK.SAND - m) { f.y = TANK.H - TANK.SAND - m; f.vy = -Math.abs(f.vy); }
      }
    }

    // ---- pellets ----
    for (i = state.pelletsWater.length - 1; i >= 0; i--) {
      var p = state.pelletsWater[i];
      p.y += p.vy * dt;
      var bottom = TANK.H - TANK.SAND - 6;
      if (p.y >= bottom) {
        state.pelletsWater.splice(i, 1);
        state.stats.pelletsWasted++;
        state.events.push({ type: 'pellet-waste' });
        continue;
      }
      // assign nearest alive fish
      var best = null, bestD = Infinity;
      for (j = 0; j < state.fish.length; j++) {
        f = state.fish[j];
        if (f.dead || f.latched) continue;
        var dd = dist(f.x, f.y, p.x, p.y);
        if (dd < bestD) { bestD = dd; best = f; }
      }
      if (best && bestD < 130) {
        best.targetPellet = p.id;
        if (bestD < 18) {
          best.hunger = 0;
          best.eatenFlash = 0.6;
          best.targetPellet = null;
          state.pelletsWater.splice(i, 1);
          state.events.push({ type: 'eat' });
        }
      } else {
        // no fish nearby: pellet drifts to the bottom
        for (j = 0; j < state.fish.length; j++) {
          f = state.fish[j];
          if (!f.dead && f.targetPellet === p.id) f.targetPellet = null;
        }
      }
    }

    // ---- coins ----
    for (i = state.coins.length - 1; i >= 0; i--) {
      var c = state.coins[i];
      c.y += c.vy * dt;
      c.x += Math.sin(state.time * 2 + c.phase) * 14 * dt;
      if (c.y >= TANK.H - TANK.SAND - 8) {
        state.coins.splice(i, 1);
        state.events.push({ type: 'coin-missed' });
      }
    }

    // ---- aliens ----
    var maxAliens = state.time < 120 ? 1 : state.time < 220 ? 2 : MAX_ALIENS;
    state.alienTimer -= dt;
    if (state.alienTimer <= 0 && state.aliens.length < maxAliens) {
      spawnAlien(state);
      state.alienTimer = Math.max(12, rand(rng, 22, 32) - state.time / 25);
    }

    for (i = state.aliens.length - 1; i >= 0; i--) {
      var a = state.aliens[i];
      a.flash = Math.max(0, a.flash - dt);
      a.wobble += dt * 4;

      if (a.state === 'leave') {
        var edgeY = a.y < TANK.H / 2 ? -60 : TANK.H + 60;
        var dy2 = edgeY - a.y;
        var d2 = Math.sqrt(dy2 * dy2) || 1;
        a.vy = (dy2 / d2) * a.speed * 1.4;
        a.vx *= 0.95;
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.y < -70 || a.y > TANK.H + 70 || a.x < -70 || a.x > TANK.W + 70) {
          state.aliens.splice(i, 1);
        }
        continue;
      }

      // find target fish
      var target = null;
      if (a.targetId != null) {
        for (j = 0; j < state.fish.length; j++) {
          if (state.fish[j].id === a.targetId && !state.fish[j].dead) { target = state.fish[j]; break; }
        }
      }
      if (!target) {
        var bd = Infinity;
        for (j = 0; j < state.fish.length; j++) {
          f = state.fish[j];
          if (f.dead) continue;
          var df = dist(a.x, a.y, f.x, f.y);
          if (df < bd) { bd = df; target = f; }
        }
        if (target) { a.targetId = target.id; a.state = 'chase'; }
        else { a.state = 'leave'; continue; }
      }

      if (a.state === 'chase') {
        var dxa = target.x - a.x, dya = target.y - a.y;
        var da = Math.sqrt(dxa * dxa + dya * dya) || 1;
        a.vx += ((dxa / da) * a.speed - a.vx) * Math.min(1, dt * 2.5);
        a.vy += ((dya / da) * a.speed - a.vy) * Math.min(1, dt * 2.5);
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (da < 32) {
          a.state = 'latch';
          a.latchT = 0;
          target.latched = true;
        }
      } else if (a.state === 'latch') {
        a.latchT += dt;
        // stay locked onto fish
        a.x += (target.x - a.x) * Math.min(1, dt * 8);
        a.y += (target.y - a.y) * Math.min(1, dt * 8);
        if (target.dead) {
          a.state = 'chase'; a.targetId = null; a.latchT = 0;
          continue;
        }
        if (a.latchT >= LATCH_TIME) {
          target.latched = false;
          killFish(state, target, 'alien');
          a.state = 'leave'; a.targetId = null;
          state.events.push({ type: 'alien-eats' });
        }
      }
    }

    // unlatch any fish whose alien is gone
    for (i = 0; i < state.fish.length; i++) {
      f = state.fish[i];
      if (f.dead || !f.latched) continue;
      var stillLatched = false;
      for (j = 0; j < state.aliens.length; j++) {
        var aa = state.aliens[j];
        if (aa.state === 'latch' && aa.targetId === f.id) { stillLatched = true; break; }
      }
      if (!stillLatched) f.latched = false;
    }

    // ---- end conditions ----
    if (aliveFish(state).length === 0) { endGame(state, 'fish'); return; }
    if (state.time >= state.duration) { endGame(state, 'time'); return; }
  }

  function clickAt(state, x, y) {
    if (state.over) return { type: 'none' };

    // aliens first (topmost)
    for (var i = state.aliens.length - 1; i >= 0; i--) {
      var a = state.aliens[i];
      var r = 26;
      if (dist(x, y, a.x, a.y) <= r) {
        a.hp--;
        a.flash = 0.18;
        // knockback away from click
        var dx = a.x - x, dy = a.y - y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        a.vx += (dx / d) * 140;
        a.vy += (dy / d) * 140;
        state.events.push({ type: 'alien-hit' });
        if (a.hp <= 0) {
          // drop coins
          var n = 3;
          for (var k = 0; k < n; k++) addCoin(state, a.x + rand(state.rng, -18, 18), a.y + rand(state.rng, -18, 18), 2);
          state.aliens.splice(i, 1);
          state.stats.aliensDefeated++;
          state.events.push({ type: 'alien-die' });
        }
        return { type: 'alien' };
      }
    }

    // coins
    for (i = state.coins.length - 1; i >= 0; i--) {
      var c = state.coins[i];
      if (dist(x, y, c.x, c.y) <= 15) {
        state.coins.splice(i, 1);
        state.wallet += c.value;
        state.totalCollected += c.value;
        state.stats.coinsCollected += c.value;
        state.events.push({ type: 'collect', value: c.value });
        return { type: 'coin', value: c.value };
      }
    }

    // food pellet
    if (state.pellets > 0) {
      state.pellets--;
      state.stats.pelletsDropped++;
      addPellet(state, x, y);
      state.events.push({ type: 'pellet-drop' });
      return { type: 'pellet' };
    }
    state.events.push({ type: 'no-food' });
    return { type: 'no-food' };
  }

  function buyFish(state) {
    if (state.over) return false;
    if (state.wallet < COST_FISH) { state.events.push({ type: 'buy-fail' }); return false; }
    if (aliveFish(state).length >= MAX_FISH) { state.events.push({ type: 'buy-fail' }); return false; }
    state.wallet -= COST_FISH;
    state.stats.fishPurchased++;
    addFish(state, 0);
    state.events.push({ type: 'buy-fish' });
    return true;
  }

  function buyFood(state) {
    if (state.over) return false;
    if (state.wallet < COST_BAG) { state.events.push({ type: 'buy-fail' }); return false; }
    state.wallet -= COST_BAG;
    state.pellets += BAG_SIZE;
    state.events.push({ type: 'buy-bag' });
    return true;
  }

  function stopGame(state) {
    if (state.over) return false;
    endGame(state, 'stopped');
    return true;
  }

  function timeLeft(state) { return Math.max(0, state.duration - state.time); }

  function dangerFrac(f) {
    // 0..1 how close the fish is to dying (for rendering)
    return clamp(f.hunger / f.hungerMax, 0, 1);
  }

  return {
    TANK: TANK,
    DURATION: DURATION,
    COST_FISH: COST_FISH,
    COST_BAG: COST_BAG,
    BAG_SIZE: BAG_SIZE,
    START_BAGS: START_BAGS,
    MAX_FISH: MAX_FISH,
    DEATH_WARNING: DEATH_WARNING,
    LATCH_TIME: LATCH_TIME,
    STAGES: STAGES,
    mulberry32: mulberry32,
    createGame: createGame,
    update: update,
    clickAt: clickAt,
    buyFish: buyFish,
    buyFood: buyFood,
    stopGame: stopGame,
    aliveFish: aliveFish,
    timeLeft: timeLeft,
    dangerFrac: dangerFrac,
    addFish: addFish
  };
});
