# 🐍🪜 Quiz Snakes & Ladders

A live, Kahoot-style quiz played on a Snakes & Ladders board. The host shows the
board and questions on a big screen; friends join from their phones. **The faster
you answer correctly, the more squares you move (1–6).** Land on a 🪜 ladder to
climb, a 🐍 snake to slide back down. First player to square **100** wins.

Supports up to **20 players**.

---

## What you need
- A computer to be the **host** (runs the game + shows the board).
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
2. Players open the join URL on their phones. Two ways:
   - Scan the QR code on the host screen (it pre-fills the PIN), **or**
   - Go to the join URL and type the PIN + their name.
   - On phones, use the host computer's **local IP** instead of `localhost`,
     e.g. `http://192.168.1.42:3000`. (Find it with `ipconfig` on Windows or
     `ifconfig`/System Settings on Mac. The terminal also reminds you.)
3. When everyone's in, the host clicks **Start Game**.
4. For each question: players tap an answer on their phone. The host clicks
   **Show Results** (or the timer runs out) to reveal the correct answer and move
   the tokens. Then **Next Question**.
5. First to square 100 — or the highest after the last question — wins. 🏆

## How it plays
- Each player picks a **hero** at the start. Heroes race along a path to the 🏰 goal.
- Wrong answer → you don't move.
- Correct answer → you move forward **1 to 6 tiles** based on how fast you answered
  (timer is 15 seconds per question):

  | Answered within | Tiles moved |
  |---|---|
  | 0–2 sec | 6 |
  | 2–4 sec | 5 |
  | 4–6 sec | 4 |
  | 6–8 sec | 3 |
  | 8–10 sec | 2 |
  | 10–15 sec | 1 |

- Answers are colour-coded by element — 🔥 Fire, 💧 Water, 🍃 Leaf, 🪨 Earth —
  each with a pixel-art symbol. First hero to reach the goal wins.

## Customising the questions
Edit **`questions.json`**. Each question has:

```json
{
  "q": "Your question text?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 1
}
```

`correct` is the index of the right answer (0 = first option, 1 = second, etc.).
You can have 2, 3, or 4 options. Change `questionTime` (seconds) to give more or
less time per question. Restart the server after editing.

## Changing the path / heroes
Near the top of **`server.js`**: `PATH_LENGTH` sets how many tiles long the race is
(default 30 — longer = more questions to win). `HEROES` is the list of hero emojis
players can pick. Restart the server after editing.

---

Made for playing with friends — have fun!
