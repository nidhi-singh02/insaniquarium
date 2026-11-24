/* Insaniquarium — core logic tests (node:test) */
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../js/core.js');

function seeded() { return Core.mulberry32(42); }

test('createGame starts with 2 hatchlings and one bag of pellets', () => {
  const s = Core.createGame({ rng: seeded() });
  assert.strictEqual(s.fish.length, 2);
  assert.strictEqual(s.fish[0].stage, 0);
  assert.strictEqual(s.pellets, Core.START_BAGS * Core.BAG_SIZE);
  assert.strictEqual(s.wallet, 0);
  assert.strictEqual(s.over, false);
});

test('click drops a pellet and decrements pellets', () => {
  const s = Core.createGame({ rng: seeded() });
  const before = s.pellets;
  const r = Core.clickAt(s, 480, 300);
  assert.strictEqual(r.type, 'pellet');
  assert.strictEqual(s.pellets, before - 1);
  assert.strictEqual(s.pelletsWater.length, 1);
});

test('clicking with no pellets returns no-food', () => {
  const s = Core.createGame({ rng: seeded() });
  s.pellets = 0;
  const r = Core.clickAt(s, 480, 300);
  assert.strictEqual(r.type, 'no-food');
});

test('coin click collects coins into wallet and score', () => {
  const s = Core.createGame({ rng: seeded() });
  s.coins.push({ id: 999, x: 100, y: 100, vy: 0, phase: 0, value: 3 });
  const r = Core.clickAt(s, 100, 100);
  assert.strictEqual(r.type, 'coin');
  assert.strictEqual(r.value, 3);
  assert.strictEqual(s.wallet, 3);
  assert.strictEqual(s.totalCollected, 3);
});

test('fish produce coins over time', () => {
  const s = Core.createGame({ rng: seeded() });
  s.fish[0].coinTimer = 0.01;
  Core.update(s, 0.05);
  assert.ok(s.coins.length > 0);
});

test('fish starve and the game ends when all are dead', () => {
  const s = Core.createGame({ rng: seeded() });
  s.fish.forEach(f => { f.hunger = f.hungerMax; });
  Core.update(s, 0.05);
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.result, 'fish');
});

test('game ends at time limit', () => {
  const s = Core.createGame({ rng: seeded() });
  s.time = Core.DURATION - 0.01;
  Core.update(s, 0.05);
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.result, 'time');
});

test('buyFish spends coins and adds a hatchling', () => {
  const s = Core.createGame({ rng: seeded() });
  s.wallet = 25;
  assert.strictEqual(Core.buyFish(s), true);
  assert.strictEqual(s.wallet, 5);
  assert.strictEqual(s.fish.length, 3);
});

test('buyFish fails without enough coins', () => {
  const s = Core.createGame({ rng: seeded() });
  s.wallet = 0;
  assert.strictEqual(Core.buyFish(s), false);
});

test('buyFood adds a bag of pellets', () => {
  const s = Core.createGame({ rng: seeded() });
  s.wallet = 30;
  const before = s.pellets;
  assert.strictEqual(Core.buyFood(s), true);
  assert.strictEqual(s.pellets, before + Core.BAG_SIZE);
});

test('stopGame ends the run early', () => {
  const s = Core.createGame({ rng: seeded() });
  assert.strictEqual(Core.stopGame(s), true);
  assert.strictEqual(s.result, 'stopped');
});

test('alien spawns after its timer and can be smashed', () => {
  const s = Core.createGame({ rng: seeded() });
  s.alienTimer = 0.01;
  Core.update(s, 0.05);
  assert.strictEqual(s.aliens.length, 1);
  const a = s.aliens[0];
  const hpBefore = a.hp;
  const r = Core.clickAt(s, a.x, a.y);
  assert.strictEqual(r.type, 'alien');
  assert.strictEqual(a.hp, hpBefore - 1);
});

test('update is safe after game over', () => {
  const s = Core.createGame({ rng: seeded() });
  Core.stopGame(s);
  assert.doesNotThrow(() => Core.update(s, 0.05));
});
