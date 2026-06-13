# 🏰 Quiz Quest

A live, Kahoot-style **trivia hero race**. The host shows the board and questions on a
big screen; friends join from their phones and pick a hero. **The faster you answer
correctly, the further your hero runs along the path toward the castle.** Use your
potions wisely and be one of the first to reach the castle.

Supports up to **20 players**.

---

## How it works

- Everyone races along a **60-tile path**. Reaching tile 60 (the castle) finishes the race.
- Each round shows one multiple-choice question. **A correct answer always moves you at
  least one tile**; answer faster to move more:

  | Answer speed | Tiles moved |
  |---|---|
  | 0–3 sec | 5 |
  | 3–6 sec | 4 |
  | 6–9 sec | 3 |
  | 9–12 sec | 2 |
  | 12–15 sec | 1 |

- A wrong answer (or running out of time) keeps you where you are.
- **The game ends as soon as the first three players reach the castle** (or when everyone
  finishes, in a game of fewer than three players). The top three take the podium.

## 🧪 Potions

Every player starts the game holding **all four potions**. Each potion is **single-use** —
once you use it, it disappears for the rest of the game — and you may use **one potion per
round** (between questions). When you've used them all, the potion screen is skipped and
you just keep racing.

| Potion | Effect |
|---|---|
| 🛡️ **Shield** | Blocks the next bad effect. |
| ✨ **Double** | Doubles the tiles you move if you answer correctly. |
| 🎯 **50/50** | Removes two wrong answers from your next question. |
| 🌫️ **Curse** | Gives a rival player only **half the time** on their next question. |

## 🏆 The finish

When the race ends, the host screen celebrates the **winner** with a podium and a victory
toast — and then, for a laugh, shows the **player in last place locked out in the cold**,
sitting outside the winner's pub. Hit **NEW GAME** on the host to instantly restart with
the same players and PIN (positions and potions all reset).

---

## What you need

- A computer to be the **host** (runs the game and shows the board).
- [Node.js](https://nodejs.org) installed on that computer (v18 or newer).
- Phones for the players, all on the **same Wi-Fi** as the host computer.

## Setup (one time)

Open a terminal in this folder and run:

```bash
npm install
```

## Run the game

```bash
npm start
```

You'll see something like:

```
Host screen:  http://localhost:3000/host
Players join: http://localhost:3000/
```

1. On the host computer, open **http://localhost:3000/host** in a browser. A 4-digit
   **PIN** and a QR code appear.
2. Players open the join link on their phones — either scan the QR code (it pre-fills the
   PIN) or go to `http://<host-computer-ip>:3000/` and type the PIN.
3. Each player enters a name and picks a hero, then the host presses **START QUEST**.

> Players must be on the **same Wi-Fi** and use the host computer's local IP address
> (e.g. `http://192.168.1.15:3000/`). `localhost` only works on the host machine itself.

## Deploying online (optional)

The app is a standard Node + Express + Socket.IO server, so it runs on hosts like
[Render](https://render.com):

- **Build command:** `npm install`
- **Start command:** `npm start`
- The server listens on the `PORT` environment variable (Render sets this automatically;
  it falls back to `3000` locally).

Once deployed, share `https://your-app.onrender.com/host` for the host screen and
`https://your-app.onrender.com/` for players.

## Tech

Node.js · Express · Socket.IO · vanilla HTML/CSS/JS (no build step).
