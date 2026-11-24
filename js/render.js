/* Insaniquarium — canvas renderer. Pure drawing, reads core state. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.InsaniquariumRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TANK = { W: 960, H: 600, SAND: 46 };

  function parseColor(c) {
    if (c.charAt(0) === '#') {
      var v = parseInt(c.slice(1), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var m = c.match(/(\d+(?:\.\d+)?)/g);
    if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
    return [0, 0, 0];
  }
  function lerpColor(c1, c2, t) {
    var a = parseColor(c1), b = parseColor(c2);
    var ar = a[0], ag = a[1], ab = a[2], br = b[0], bg = b[1], bb = b[2];
    var r = Math.round(ar + (br - ar) * t);
    var g = Math.round(ag + (bg - ag) * t);
    var bl = Math.round(ab + (bb - ab) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function drawBackground(ctx, t) {
    var g = ctx.createLinearGradient(0, 0, 0, TANK.H);
    g.addColorStop(0, '#0d3a4d');
    g.addColorStop(0.45, '#0a2c3e');
    g.addColorStop(1, '#04101c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TANK.W, TANK.H);

    // light rays
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#bfefff';
    for (var i = 0; i < 4; i++) {
      var x = 120 + i * 240 + Math.sin(t * 0.13 + i * 1.7) * 40;
      ctx.beginPath();
      ctx.moveTo(x, -20);
      ctx.lineTo(x + 90, -20);
      ctx.lineTo(x + 210, TANK.H);
      ctx.lineTo(x + 40, TANK.H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSand(ctx, t) {
    ctx.fillStyle = '#8a6d4f';
    ctx.beginPath();
    ctx.moveTo(0, TANK.H);
    ctx.lineTo(0, TANK.H - TANK.SAND + 10);
    for (var x = 0; x <= TANK.W; x += 48) {
      ctx.lineTo(x, TANK.H - TANK.SAND + 8 + Math.sin(x * 0.02 + 1.3) * 7);
    }
    ctx.lineTo(TANK.W, TANK.H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (var i = 0; i < 40; i++) {
      var sx = (i * 97) % TANK.W;
      var sy = TANK.H - TANK.SAND + 16 + ((i * 53) % 26);
      ctx.fillRect(sx, sy, 3, 2);
    }
  }

  function drawKelp(ctx, t) {
    var strands = [
      { x: 36, h: 150, sway: 0.9, phase: 0.0, w: 9 },
      { x: 74, h: 110, sway: 1.3, phase: 1.2, w: 7 },
      { x: TANK.W - 40, h: 170, sway: 1.1, phase: 2.4, w: 9 },
      { x: TANK.W - 82, h: 120, sway: 0.8, phase: 3.6, w: 7 }
    ];
    for (var i = 0; i < strands.length; i++) {
      var s = strands[i];
      var baseY = TANK.H - TANK.SAND + 6;
      ctx.strokeStyle = 'rgba(38, 110, 82, 0.85)';
      ctx.lineWidth = s.w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x, baseY);
      for (var k = 1; k <= 6; k++) {
        var yy = baseY - (s.h * k / 6);
        var xx = s.x + Math.sin(t * s.sway + s.phase + k * 0.9) * (10 + k * 5);
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
  }

  function drawBubbles(ctx, bubbles) {
    ctx.save();
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      ctx.globalAlpha = b.alpha;
      ctx.strokeStyle = '#bfe6ff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCoin(ctx, c, t) {
    var r = 9 + Math.sin(t * 6 + c.phase) * 1.5;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = '#f5c542';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a6410'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#8a6410';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 0.5);
    ctx.restore();
  }

  function drawPellet(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(0.4);
    ctx.fillStyle = '#f3e2c7';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b99a6b'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function fishColor(stage, danger, eatenFlash) {
    var base = ['#ffd27a', '#ff9d4d', '#ff5e4d'][stage];
    // danger: lerp toward pale/ghostly
    var col = lerpColor(base, '#d8e6e0', danger * 0.85);
    if (eatenFlash > 0) col = lerpColor(col, '#ffffff', eatenFlash * 0.9);
    return col;
  }

  function drawFish(ctx, f, t) {
    var size = [11, 15, 20][f.stage];
    var danger = f.dead ? 0 : Math.max(0, (f.hunger / f.hungerMax - 0.8) / 0.2); // only in final 20%
    var col = fishColor(f.stage, danger, f.eatenFlash);
    var wiggle = Math.sin(f.wobble) * 0.35;
    var alpha = f.dead ? Math.max(0, 1 - f.deathT / 2.5) : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(f.x, f.y);
    var facing = f.vx < -1 ? -1 : 1;
    ctx.scale(facing, 1);

    // tail
    ctx.fillStyle = lerpColor(col, '#000000', 0.25);
    ctx.beginPath();
    ctx.moveTo(-size * 0.9, 0);
    ctx.lineTo(-size * 1.75, -size * 0.62 + wiggle * 6);
    ctx.lineTo(-size * 1.75, size * 0.62 + wiggle * 6);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.25, size * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // belly shade
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(size * 0.15, size * 0.32, size * 0.8, size * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // stripes (juvenile/adult)
    if (f.stage >= 1) {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2.2;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * size * 0.5, -size * 0.55);
        ctx.lineTo(i * size * 0.5, size * 0.55);
        ctx.stroke();
      }
    }

    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(size * 0.55, -size * 0.14, size * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#101418';
    ctx.beginPath(); ctx.arc(size * 0.62, -size * 0.14, size * 0.11, 0, Math.PI * 2); ctx.fill();

    // hunger warning shimmer
    if (!f.dead && danger > 0) {
      ctx.strokeStyle = 'rgba(255,80,60,' + (0.35 + 0.3 * Math.sin(t * 10)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.4, size * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawAlien(ctx, a, t) {
    var wob = Math.sin(a.wobble) * 0.5;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.sin(a.wobble * 0.6) * 0.3);

    var body = a.flash > 0 ? '#ffffff' : '#5b2a86';
    var rim = a.flash > 0 ? '#ffffff' : '#8a4fc0';

    // tentacles
    ctx.strokeStyle = a.flash > 0 ? '#ffffff' : '#3d1d5c';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 6, 10);
      var sw = Math.sin(a.wobble * 1.6 + i) * 8;
      ctx.quadraticCurveTo(i * 7 + sw, 26, i * 9 + sw * 1.6, 40);
      ctx.stroke();
    }

    // body
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -2, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.stroke();

    // spikes
    ctx.fillStyle = rim;
    for (i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 8 - 4, -14);
      ctx.lineTo(i * 8, -26 - Math.abs(i) * -2);
      ctx.lineTo(i * 8 + 4, -14);
      ctx.closePath();
      ctx.fill();
    }

    // eyes
    var glow = 0.5 + 0.5 * Math.sin(t * 5 + a.id);
    ctx.fillStyle = 'rgba(255,60,50,' + (0.75 + 0.25 * glow) + ')';
    ctx.beginPath(); ctx.arc(-7, -4, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -4, 3.4, 0, Math.PI * 2); ctx.fill();

    // hp pips
    if (a.hp < a.maxHp) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (i = 0; i < a.hp; i++) {
        ctx.beginPath(); ctx.arc(-((a.maxHp - 1) * 5) + i * 10, -34, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawFloatingText(ctx, texts) {
    for (var i = 0; i < texts.length; i++) {
      var ft = texts[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - ft.age / 1.2);
      ctx.fillStyle = ft.color;
      ctx.font = 'bold ' + ft.size + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y - ft.age * 34);
      ctx.restore();
    }
  }

  function drawVignette(ctx) {
    var g = ctx.createRadialGradient(TANK.W / 2, TANK.H / 2, TANK.H * 0.35, TANK.W / 2, TANK.H / 2, TANK.H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TANK.W, TANK.H);
  }

  function render(ctx, state, t, bubbles, floatTexts) {
    ctx.clearRect(0, 0, TANK.W, TANK.H);
    drawBackground(ctx, t);
    drawKelp(ctx, t);
    drawSand(ctx, t);
    drawBubbles(ctx, bubbles);

    // coins behind fish
    for (var i = 0; i < state.coins.length; i++) drawCoin(ctx, state.coins[i], t);
    for (i = 0; i < state.pelletsWater.length; i++) drawPellet(ctx, state.pelletsWater[i]);
    for (i = 0; i < state.fish.length; i++) drawFish(ctx, state.fish[i], t);
    for (i = 0; i < state.aliens.length; i++) drawAlien(ctx, state.aliens[i], t);

    drawFloatingText(ctx, floatTexts);
    drawVignette(ctx);
  }

  return { render: render, TANK: TANK };
});
