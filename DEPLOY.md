# Putting Quiz Quest online (Render)

This makes your game playable from anywhere — players don't need to be on your Wi‑Fi.
No code changes are needed: the app already reads the hosting platform's port and
builds the join link/QR from whatever public URL it's served on.

Two parts: (1) put the code on GitHub, (2) deploy it on Render. Both have free tiers.

---

## Part 1 — Put the project on GitHub (no command line needed)

1. Go to https://github.com and create a free account (or sign in).
2. Click the **+** (top‑right) → **New repository**.
3. Name it `quiz-quest`, leave it **Public**, click **Create repository**.
4. On the new repo page, click **uploading an existing file** (the link in the
   "Quick setup" box).
5. Drag in your project files **except `node_modules`**. You need:
   - `server.js`
   - `package.json`
   - `questions.json`
   - `.gitignore`
   - the whole **`public`** folder (`host.html`, `index.html`, `board.js`,
     `mapdata.js`, `map_bg.jpg`, and `path-picker.html`)
   To upload the `public` folder, drag the folder itself into the upload area (GitHub
   keeps the folder structure).  **Do not upload `node_modules`** — Render installs it.
6. Click **Commit changes**. Your repo now holds the project.

## Part 2 — Deploy on Render

1. Go to https://render.com and sign up (you can sign up **with GitHub**, which makes
   the next step easier).
2. Click **New +** → **Web Service**.
3. Connect your GitHub and pick the **quiz-quest** repository.
4. Fill in the settings (most are auto‑detected):
   - **Runtime / Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
5. Click **Create Web Service**. Render installs dependencies and starts the server
   (first build takes a couple of minutes).
6. When it says **Live**, you'll get a public URL like
   `https://quiz-quest.onrender.com`.

## Playing

- You (host): open `https://quiz-quest.onrender.com/host`
- Players (anywhere): open `https://quiz-quest.onrender.com` and enter the PIN,
  or scan the QR code on the host screen (it already points to the public URL).

---

## Things to know about the free tier

- **It sleeps when idle.** After ~15 minutes with no visitors, the free service spins
  down. The next visit takes ~30–50 seconds to wake it. Tip: open the `/host` page a
  minute before your game so it's awake when players join.
- **WebSockets work** on Render's free tier — that's what the live game uses.
- **Updating the game later:** edit a file on GitHub (or re‑upload it) and commit;
  Render redeploys automatically. To change questions, edit `questions.json` on GitHub.

## Alternatives (same idea)

- **Railway** (railway.app) and **Fly.io** (fly.io) also host Node + WebSocket apps.
  The steps are similar: connect the GitHub repo, build `npm install`, start `npm start`.
- If you ever want it to never sleep, those platforms (and Render) offer cheap paid
  tiers that keep it always on.
