# Insaniquarium 🐠

A small browser aquarium game. Feed your fish, collect the coins they drop, and smash aliens before they eat your tank. Each run lasts 5 minutes; your score is the total coins collected.

Plain HTML, CSS and JavaScript — no build step, no dependencies.

## Run it

### Option 1: open the file

Clone the repo and open `index.html` in any modern browser:

```bash
git clone https://github.com/nidhi-singh02/insaniquarium.git
cd insaniquarium
open index.html        # macOS
# xdg-open index.html  # Linux
# start index.html     # Windows
```

### Option 2: local web server

If your browser blocks local files, serve the folder and visit the printed URL:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or, with Node.js:

```bash
npx serve .
```

## How to play

- **Click** anywhere in the tank to drop a food pellet; the nearest fish swims over to eat it.
- **Click coins** to collect them before they sink and disappear.
- **Click aliens** repeatedly to smash them before they eat a fish.
- **Buy Fish** (20 coins) adds a hatchling. **Buy Bag** (25 coins) adds 25 pellets.
- Hatchlings grow into juveniles, then adults. Fish that go hungry for too long die.
- The run ends when the 5 minutes are up or every fish is gone.

### Keyboard shortcuts

| Key     | Action          |
| ------- | --------------- |
| `F`     | Buy a food bag  |
| `N`     | Buy a fish      |
| `Space` | Stop the game   |

## Run the tests

The core game logic has unit tests that use Node's built-in test runner (Node.js 18 or newer):

```bash
node --test tests/core.test.js
```

## Project layout

```
index.html        page markup and HUD
css/style.css     styles
js/core.js        game logic (no DOM; also loaded by the tests)
js/render.js      canvas drawing
js/audio.js       sound effects
js/main.js        input, game loop and UI wiring
tests/            unit tests for js/core.js
```
