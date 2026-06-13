# Quiz Quest — project handoff / context prompt

Paste this whole document into the new chat as your first message, and **attach the
project zip** (`quiz-quest-celebration.zip`, the latest build — it contains the full
working game). Also attach your current map image if you want it changed.

---

## What this project is

**Quiz Quest** is a live multiplayer trivia game (Kahoot‑style) with a board‑game twist:
the host shows a big map screen, players join from their phones, and each correct answer
moves their hero forward along a winding path on the map. The **faster** you answer
correctly, the **more blocks** you move. First hero to reach the end (the dragon) wins.

- **Stack:** Node.js + Express + Socket.IO (server), plain HTML/CSS/vanilla JS (clients).
  No build step, no framework. Map + heroes are rendered with SVG inside the page.
- **Deployment:** Live on Render (free tier) as a Web Service. Code is in a GitHub repo;
  the project files sit in a subfolder named `Quiz-Quest 14`, and Render's **Root
  Directory** is set to `Quiz-Quest 14`, Build `npm install`, Start `npm start`.
  Public URL: `https://quiz-quest-06xf.onrender.com` ( `/host` for the host screen, `/`
  for players). Free tier sleeps after ~15 min idle (cold start ~30–50s).

## File structure

```
Quiz-Quest/
├── server.js          # Express + Socket.IO game server (all game logic + state)
├── package.json       # start: node server.js ; deps express + socket.io ; engines node>=18
├── questions.json     # 75 expert trivia questions + questionTime (15s)
├── README.md, DEPLOY.md, .gitignore
└── public/
    ├── host.html      # host big-screen UI (lobby, question, results map, celebration)
    ├── index.html     # player phone UI (join, pick race, answer, result)
    ├── board.js       # THE RENDERER: draws the map image + animated hero tokens + camera
    ├── mapdata.js      # const MAPDATA = { img, w, h, pts:[...60 normalized path points] }
    ├── map_bg.jpg      # the board background — an AI-generated illustrated isometric map
    └── path-picker.html# helper tool: click along the map to generate path points
```

## How the map + movement currently work (important)

- The board is a **single illustrated image** (`map_bg.jpg`, ~1900×985) used as a
  background. The path the heroes walk is defined as **60 normalized (0–1) points** in
  `mapdata.js` (`MAPDATA.pts`). These were hand-traced on the real map with
  `path-picker.html` (open it via the server, click along the road, it outputs the points).
- `board.js` builds an SVG whose `<image>` is the map; hero **tokens** are original
  hand-drawn SVG characters (function `character()`), each with a **name tag** and a
  **colored ring**. They move between the path points with `requestAnimationFrame`.
- There is a **follow-camera**: during the movement animation the SVG `viewBox` zooms in
  on the cluster of players and pans to follow them, then **zooms out to the whole map**
  for an overview before the "Next Question" button appears. Key functions in `board.js`:
  `renderBoardAnimated`, `frameViewBox`, `setVB`, `lerpVB`, `easeIO`, `drawOverlay`.
- Tunables in `board.js`: `HS` (hero scale, 1.7), `PER_TILE` (ms per block, 380),
  `ZOOMOUT` (ms, 950). The result text/answer HUD is an HTML overlay (`drawOverlay`).

## Game rules (in server.js)

- **Track length:** `PATH_LENGTH = 60` blocks (block 60 = the dragon = win). Game ends
  ONLY when a hero reaches block 60 (or a safety cap `MAX_QUESTIONS = 120`).
- **Movement per correct answer** (`squaresForTime`, on a 15s timer):
  0–3s → **5 blocks**, 3–5s → 4, 5–7s → 3, 7–9s → 2, 9–15s → **0**. Wrong/no answer → 0.
- **Questions:** shuffled per game; when the pool is exhausted it reshuffles and loops,
  so it never runs out. 75 questions in `questions.json` (expert difficulty,
  4 options each, `correct` is the 0-based index).
- **Heroes / races:** 8 selectable races (human, elf, darkelf, dwarf, orc, halfling, mage,
  knight). No points/score shown — position on the route is the only ranking.
- **End screen:** host shows a celebration with a 1st/2nd/3rd **podium**, confetti, and a
  NEW GAME button; each phone shows the winner + that player's own finishing place.
- **Socket events:** createRoom, joined (sends player id), chooseHero, lobbyUpdate,
  board (drives the map; includes each player's `from` position so the client can animate
  the walk), nextQuestion, showQuestion/answerNow, submitAnswer, answerCount,
  questionResults, gameOver.

## What I want to work on next (the goal)

1. **Make the map visually stunning.** Right now it's a static illustrated image with SVG
   tokens on top. I want it to feel premium — e.g. animated/atmospheric (shimmering water,
   glowing lava, drifting clouds, particles, lighting/vignette, parallax depth), and overall
   more "wow".
2. **Make the players and their movement very, very smooth and "gamy."** The heroes are
   currently flat hand-drawn SVG figures. I want buttery 60fps movement with real game
   juice: smooth easing, a proper walk cycle, bob/squash‑and‑stretch, soft shadows, dust
   puffs when they move, a little landing bounce, maybe sound effects, and characters that
   look like a real game.

### Suggested direction (open to better ideas)
- For truly smooth, juicy sprites and particle effects, consider rendering the board with
  **PixiJS** (WebGL, loaded from a CDN — no install, works on the current server) layered
  over the map image, instead of SVG. Keep the server/Socket.IO and the 60-point path
  exactly as they are — only the client rendering in `board.js` changes.
- For real character sprites with walk cycles, the **Kenney "Roguelike Characters"** pack
  (CC0, free) is a good fit; I can download it and drop the spritesheet into the project.
- The path points and movement math must keep working — heroes still travel `MAPDATA.pts`
  from block 1 to 60, animated when the server sends a `board` event with `from`/`to`.

### Important constraints / notes
- The new assistant **cannot preview WebGL/Three/Pixi output** directly, so we verify by me
  running it in the browser and sending screenshots. Build carefully and in small steps.
- Everything must stay deploy-friendly on Render (no build step ideally; CDN scripts are
  fine: cdnjs / jsdelivr / unpkg).
- I will run it locally with `npm start` (open `http://localhost:3000/host`) and also on
  the live Render URL.

**Please start by reviewing the attached `quiz-quest-celebration.zip`, then propose a plan
for (1) a stunning animated map and (2) very smooth, gamy hero movement — and let's build
it step by step.**
