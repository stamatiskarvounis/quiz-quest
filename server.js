// Quiz Quest — live multiplayer trivia hero race.
// Host opens /host, players join from phones at / , pick a hero, and race along a
// path to the goal. Correct answers move you forward; the faster you answer the
// more squares you move (see squaresForTime). First hero to the goal wins.

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));

// ---- Race track ----
const PATH_LENGTH = 60;     // blocks 1..60 (your hand-picked spots); reaching 60 = dragon boss. Game ends only when a hero gets here.
const MAX_QUESTIONS = 120;  // safety cap so a stalled game can't run forever

function shuffled(n){ const a=[...Array(n).keys()]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// ---- Special blocks: landing exactly on one arms a modifier for your NEXT question ----
const TRAP_BACK = 3; // wrong answer on a trap block sends you back this many tiles
const MODIFIERS = {
  double:   { good: true,  icon: '🧚', label: 'DOUBLE BLOCKS', desc: 'Correct answer moves you DOUBLE the blocks!' },
  half:     { good: false, icon: '🧙', label: 'HALF BLOCKS',   desc: 'A correct answer moves only HALF the blocks.' },
  trap:     { good: false, icon: '🧙', label: 'TRAP',          desc: 'Answer WRONG and you fall BACK ' + TRAP_BACK + ' blocks!' },
  halftime: { good: false, icon: '🧙', label: 'HALF TIME',     desc: 'Only HALF the time to answer — be quick!' }
};
// 8 special tiles per game, in two hand-picked zones:
//   tiles 10-25 : 2 helps (double) + 2 half-point traps (half)
//   tiles 35-50 : 2 helps (double) + 2 go-back traps (trap)
// Tiles are picked at random (unique) within each zone.
function pickUnique(lo, hi, n) {
  const pool = []; for (let t = lo; t <= hi; t++) pool.push(t);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
function genSpecials() {
  const specials = {};
  // Zone A (10-25): 2 double + 2 half
  const zoneA = pickUnique(10, 25, 4);
  ['double', 'double', 'half', 'half'].forEach((tp, i) => { specials[zoneA[i]] = tp; });
  // Zone B (35-50): 2 double + 2 trap
  const zoneB = pickUnique(35, 50, 4);
  ['double', 'double', 'trap', 'trap'].forEach((tp, i) => { specials[zoneB[i]] = tp; });
  return specials; // { tileNumber: type }
}
function specialsPublic(room) {
  return Object.entries(room.specials || {}).map(([t, type]) =>
    ({ tile: +t, type, good: MODIFIERS[type].good, icon: MODIFIERS[type].icon, label: MODIFIERS[type].label, desc: MODIFIERS[type].desc }));
}
function modInfo(type) { return type ? Object.assign({ type }, MODIFIERS[type]) : null; }

// ---- Potions -----------------------------------------------------------------
// Every player starts the game owning one of each potion. Each potion is
// single-use (consumed when used) and a player may use at most one per round.
const POTIONS = {
  shield: { icon: '🛡️', name: 'Shield', desc: 'Block the next bad effect (trap/curse).' },
  double: { icon: '✨', name: 'Double', desc: 'Double your blocks if you answer correctly.' },
  fifty:  { icon: '🎯', name: '50/50',  desc: 'Remove two wrong answers next question.' },
  curse:  { icon: '🌫️', name: 'Curse',  desc: 'Give a rival HALF time on their next question.' }
};
const ALL_POTIONS = Object.keys(POTIONS);
function freshPotions() { const inv = {}; ALL_POTIONS.forEach(k => inv[k] = true); return inv; } // all owned, unused
function remainingPotions(p) { return ALL_POTIONS.filter(k => p.potions && p.potions[k]); }
function potionsPublic() {
  return Object.entries(POTIONS).map(([key, p]) => ({ key, icon: p.icon, name: p.name, desc: p.desc }));
}
// effects in force for a player THIS question (block modifier + potions + curse), for display
function playerEffects(p) {
  const e = [];
  if (p.active && MODIFIERS[p.active]) e.push(modInfo(p.active));
  if (p.potionActive === 'double' && p.active !== 'double') e.push({ type: 'double', icon: '✨', label: 'DOUBLE', desc: 'Double blocks if correct! (potion)', good: true });
  if (p.potionActive === 'fifty') e.push({ type: 'fifty', icon: '🎯', label: '50/50', desc: 'Two wrong answers removed! (potion)', good: true });
  if (p.shieldUsed) e.push({ type: 'shield', icon: '🛡️', label: 'SHIELD', desc: 'A bad effect was blocked!', good: true });
  if (p.cursed) e.push({ type: 'curse', icon: '🌫️', label: 'CURSED', desc: 'Half time — a rival cursed you!', good: false });
  return e;
}

// ---- Avatars players can choose: 9 total (5 male designs + 4 female), shown 3x3.
// Male designs: warrior/pawn/monk. Female design: archer. (client maps ids to art) ----
const HEROES = [
  'warrior_blue', 'pawn_red', 'monk_yellow', 'warrior_black', 'pawn_purple', // 5 men
  'archer_blue', 'archer_red', 'archer_yellow', 'archer_purple'              // 4 women
];

// ---- Languages players can choose for the questions ----
// English is the base; other languages overlay translations from questions/i18n/.
// Any question without a translation falls back to English automatically.
const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'vi', label: 'Tiếng Việt' }
];

// ---- Load question categories (questions/*.json) + translations (questions/i18n/) ----
const QUESTION_TIME_SEC = 15;
function loadCategories() {
  const dir = path.join(__dirname, 'questions');
  const cats = {};
  fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'dragon.json').forEach(f => {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    cats[f.replace('.json', '')] = { name: d.name, emoji: d.emoji || '', questions: d.questions, tr: {}, nameTr: {} };
  });
  // overlay translations: questions/i18n/<category>.<lang>.json  (parallel by index)
  const i18nDir = path.join(dir, 'i18n');
  if (fs.existsSync(i18nDir)) {
    fs.readdirSync(i18nDir).filter(f => f.endsWith('.json')).forEach(f => {
      const m = f.match(/^(.+)\.([a-z]{2})\.json$/);
      if (!m) return;
      const key = m[1], lang = m[2];
      if (!cats[key]) return;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(i18nDir, f), 'utf8'));
        cats[key].tr[lang] = d.questions || [];
        if (d.name) cats[key].nameTr[lang] = d.name;
      } catch (e) { console.error('Bad translation file', f, e.message); }
    });
  }
  return cats;
}

// ---- Dragon boss: extra-hard questions keyed by category (questions/dragon.json) ----
let DRAGON = {};
try { DRAGON = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions', 'dragon.json'), 'utf8')); }
catch (e) { console.error('Could not load dragon questions:', e.message); }
const DRAGON_CATS = Object.keys(DRAGON).filter(k => Array.isArray(DRAGON[k]) && DRAGON[k].length);

// The category a player did WORST in (lowest accuracy), restricted to categories that
// actually have dragon questions. Falls back to a random dragon category if no data.
function weakestCategory(p, inPlay) {
  const stats = p.catStats || {};
  const pool = DRAGON_CATS.filter(k => !inPlay || inPlay.indexOf(k) >= 0);
  const cats = pool.length ? pool : DRAGON_CATS;
  let worst = null, worstAcc = 2, worstTotal = -1;
  cats.forEach(k => {
    const s = stats[k];
    if (!s || !s.total) return;
    const acc = s.correct / s.total;
    if (acc < worstAcc || (acc === worstAcc && s.total > worstTotal)) { worst = k; worstAcc = acc; worstTotal = s.total; }
  });
  return worst || cats[Math.floor(Math.random() * cats.length)];
}

// Build the question payload in a given language (falls back to English per-question).
function localizedPayload(room, lang) {
  const src = room.currentSrc, perm = room.currentPerm;
  const c = room.cats[src.catKey];
  let q = src.q, opts = src.options, catName = c.name;
  if (lang && lang !== 'en' && c.tr[lang] && c.tr[lang][src.idx]) {
    const t = c.tr[lang][src.idx];
    if (t && t.q && Array.isArray(t.options) && t.options.length === 4) { q = t.q; opts = t.options; }
    if (c.nameTr[lang]) catName = c.nameTr[lang];
  }
  return {
    index: room.qnum - 1, q, options: perm.map(i => opts[i]),
    time: room.questionTime, cat: (c.emoji + ' ' + catName).trim()
  };
}

const rooms = {}; // pin -> room

function makePin() {
  let pin;
  do { pin = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms[pin]);
  return pin;
}

const COLORS = ['#ff4d2e','#1ea7ff','#38c93f','#f0a93a','#9c4dff','#00d6c2',
                '#ff5fa2','#ffd23f','#7bd1ff','#b07a3a'];

function publicPlayers(room) {
  return Object.values(room.players).map(p => ({
    id: p.id, name: p.name, position: p.position,
    score: p.score, color: p.color, hero: p.hero, connected: p.connected,
    finishRank: p.finishRank || null
  }));
}

function sortedStandings(room) {
  return publicPlayers(room).sort((a, b) =>
    (a.finishRank || 99) - (b.finishRank || 99) || b.position - a.position || b.score - a.score);
}

function broadcastBoard(pin, fromMap) {
  const room = rooms[pin];
  if (!room) return;
  const players = publicPlayers(room).map(p => ({
    ...p,
    from: (fromMap && fromMap[p.id] != null) ? fromMap[p.id] : p.position
  }));
  io.to(pin).emit('board', { players, pathLength: room.pathLength, animate: !!fromMap });
}

function broadcastLobby(pin) {
  const room = rooms[pin];
  if (!room) return;
  io.to(room.hostId).emit('lobbyUpdate', { players: publicPlayers(room) });
  broadcastBoard(pin); // phones also get the map
}

// Faster correct answer = more squares. A CORRECT answer ALWAYS moves at least 1
// block, no matter how slow — only wrong/no answer scores 0 (handled in revealResults).
// Based on a 15-second reference; scales if questionTime changes.
//   0-3 sec   -> 5 blocks
//   3-6 sec   -> 4 blocks
//   6-9 sec   -> 3 blocks
//   9-12 sec  -> 2 blocks
//   12-15 sec -> 1 block
function squaresForTime(elapsedMs, totalMs) {
  const refSec = (elapsedMs / totalMs) * 15; // seconds on a 15s scale
  if (refSec <= 3) return 5;
  if (refSec <= 6) return 4;
  if (refSec <= 9) return 3;
  if (refSec <= 12) return 2;
  return 1;
}

io.on('connection', (socket) => {

  // ---- HOST creates a room ----
  socket.on('createRoom', () => {
    const cats = loadCategories();
    const pin = makePin();
    rooms[pin] = {
      pin,
      hostId: socket.id,
      players: {},
      cats,                            // all available categories
      selected: Object.keys(cats),     // host's chosen categories (default: all)
      questions: [],                   // built from selected cats on first question
      title: 'Quiz Quest',
      questionTime: QUESTION_TIME_SEC * 1000,
      order: [],
      orderPos: -1,
      qnum: 0,            // how many questions have been asked
      currentQ: null,
      state: 'lobby',
      answers: {},
      questionStart: 0,
      pathLength: PATH_LENGTH,
      specials: genSpecials()
    };
    socket.join(pin);
    socket.emit('roomCreated', {
      pin,
      title: rooms[pin].title,
      categories: Object.entries(cats).map(([key, c]) =>
        ({ key, name: c.name, emoji: c.emoji, count: c.questions.length })),
      languages: LANGS,
      pathLength: PATH_LENGTH,
      questionTime: rooms[pin].questionTime,
      specials: specialsPublic(rooms[pin])
    });
  });

  // ---- HOST toggles question categories in the lobby ----
  socket.on('setCategories', ({ pin, cats }) => {
    const room = rooms[pin];
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    const valid = (cats || []).filter(k => room.cats[k]);
    if (valid.length) room.selected = valid;
  });

  // ---- HOST starts a brand-new game with the SAME players & PIN ----
  // Resets positions/scores/potions, rolls fresh special blocks, and
  // drops everyone back to the lobby so the host can press START again.
  socket.on('restartGame', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostId !== socket.id) return;
    room.cats = loadCategories();          // reload questions (picks up any new ones)
    room.selected = room.selected.filter(k => room.cats[k]);
    if (!room.selected.length) room.selected = Object.keys(room.cats);
    room.questions = [];
    room.order = []; room.orderPos = -1;
    room.qnum = 0; room.currentQ = null; room.currentSrc = null; room.currentPerm = null;
    room.state = 'lobby'; room.answers = {}; room.questionStart = 0;
    room.finishedCount = 0;
    room.specials = genSpecials();
    room.dragon = null;
    Object.values(room.players).forEach(p => {
      p.position = 0; p.score = 0; p.finishRank = null;
      p.pending = null; p.active = null; p.potionActive = null; p.armedPotion = null;
      p.cursed = false; p.shieldUsed = false; p.hide = null;
      p.incomingCurse = false; p.usedThisRound = false; p.potions = freshPotions();
      p.streak = 0; p.catStats = {};
      p.effectiveTotal = room.questionTime;
    });
    // tell host + players to return to the lobby with fresh data
    io.to(room.hostId).emit('gameReset', {
      specials: specialsPublic(room),
      categories: Object.entries(room.cats).map(([key, c]) =>
        ({ key, name: c.name, emoji: c.emoji, count: c.questions.length })),
      pathLength: room.pathLength
    });
    Object.values(room.players).forEach(p =>
      io.to(p.id).emit('gameReset', {
        specials: specialsPublic(room), pathLength: room.pathLength,
        inventory: remainingPotions(p)
      }));
    broadcastLobby(pin);
  });

  // ---- PLAYER joins (name + chosen language) ----
  socket.on('joinRoom', ({ pin, name, lang }) => {
    const room = rooms[pin];
    if (!room) return socket.emit('joinError', 'Game not found. Check the PIN.');
    if (room.state !== 'lobby') return socket.emit('joinError', 'Game already started.');
    if (Object.keys(room.players).length >= 20) return socket.emit('joinError', 'Game is full (20 players).');
    name = String(name || '').trim().slice(0, 16) || 'Player';
    const langCode = LANGS.some(l => l.code === lang) ? lang : 'en';

    const idx = Object.keys(room.players).length;
    room.players[socket.id] = {
      id: socket.id, name, position: 0, score: 0,
      color: COLORS[idx % COLORS.length],
      hero: HEROES[idx % HEROES.length], connected: true, lang: langCode,
      pending: null, active: null, effectiveTotal: room.questionTime,
      armedPotion: null, incomingCurse: false, usedThisRound: false, potions: freshPotions(),
      streak: 0, catStats: {}
    };
    socket.join(pin);
    socket.data.pin = pin;
    socket.emit('joined', { pin, name, id: socket.id, color: room.players[socket.id].color, heroes: HEROES,
      specials: specialsPublic(room), potions: potionsPublic(), inventory: remainingPotions(room.players[socket.id]) });
    broadcastLobby(pin);
  });

  // ---- PLAYER changes language (lobby only) ----
  socket.on('setLang', ({ pin, lang }) => {
    const room = rooms[pin];
    if (!room || !room.players[socket.id]) return;
    if (LANGS.some(l => l.code === lang)) room.players[socket.id].lang = lang;
  });

  // ---- PLAYER uses a potion they own (between questions, one per round) ----
  socket.on('usePotion', ({ pin, potion, targetId }) => {
    const room = rooms[pin];
    if (!room || !room.players[socket.id]) return;
    if (room.state === 'question') return;          // only between questions
    const p = room.players[socket.id];
    if (p.finishRank || p.usedThisRound) return;    // one potion per round
    if (!POTIONS[potion] || !p.potions[potion]) return; // must still own it (unused)
    if (potion === 'curse') {
      const t = room.players[targetId];
      if (!t || t.id === p.id || t.finishRank) return;
      p.potions[potion] = false; p.usedThisRound = true; t.incomingCurse = true;
      socket.emit('potionUsed', { armed: 'curse', targetName: t.name, inventory: remainingPotions(p) });
    } else {
      p.potions[potion] = false; p.usedThisRound = true; p.armedPotion = potion;
      socket.emit('potionUsed', { armed: potion, inventory: remainingPotions(p) });
    }
  });

  // ---- PLAYER picks a hero ----
  socket.on('chooseHero', ({ pin, hero }) => {
    const room = rooms[pin];
    if (!room || !room.players[socket.id]) return;
    if (HEROES.includes(hero)) room.players[socket.id].hero = hero;
    socket.emit('heroConfirmed', { hero: room.players[socket.id].hero });
    broadcastLobby(pin);
  });

  // ---- HOST starts / next question ----
  socket.on('nextQuestion', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostId !== socket.id) return;
    if (room.qnum >= MAX_QUESTIONS) return endGame(pin); // safety cap only

    // first question: build the pool from the host's selected categories
    if (room.qnum === 0) {
      room.questions = room.selected.flatMap(k =>
        room.cats[k].questions.map((q, i) => ({ ...q, catKey: k, idx: i })));
      room.order = shuffled(room.questions.length);
      room.orderPos = -1;
    }

    // pick the next question; reshuffle and loop when the pool is exhausted
    room.orderPos++;
    if (room.orderPos >= room.order.length) { room.order = shuffled(room.questions.length); room.orderPos = 0; }
    room.qnum++;
    const src = room.questions[room.order[room.orderPos]];
    // shuffle the answer positions every time, so the correct option's slot is random.
    // The same shuffle is applied across every language, so the correct index lines up.
    const perm = shuffled(4);
    room.currentSrc = src;
    room.currentPerm = perm;
    room.currentQ = { correct: perm.indexOf(src.correct), options: perm.map(i => src.options[i]) };
    room.state = 'question';
    room.answers = {};
    room.questionStart = Date.now();

    // arm each player's effects for THIS question: block modifier + potions + curse
    const cIdx = room.currentQ.correct;
    Object.values(room.players).forEach(p => {
      let active = p.pending || null;            // modifier from the block they're standing on
      let cursed = !!p.incomingCurse, shieldUsed = false;
      if (p.armedPotion === 'shield') {          // shield cancels a bad block AND a curse
        if (active && MODIFIERS[active] && !MODIFIERS[active].good) { active = null; shieldUsed = true; }
        if (cursed) { cursed = false; shieldUsed = true; }
      }
      p.active = active;
      p.potionActive = (p.armedPotion === 'double' || p.armedPotion === 'fifty') ? p.armedPotion : null;
      p.cursed = cursed;
      p.shieldUsed = shieldUsed;
      // 50/50: choose two wrong option indices to hide on this player's phone
      p.hide = null;
      if (p.potionActive === 'fifty') {
        const wrong = [0, 1, 2, 3].filter(i => i !== cIdx);
        for (let i = wrong.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [wrong[i], wrong[j]] = [wrong[j], wrong[i]]; }
        p.hide = [wrong[0], wrong[1]];
      }
      const half = (active === 'halftime') || cursed;
      p.effectiveTotal = half ? Math.round(room.questionTime / 2) : room.questionTime;
      // consume armed items
      p.pending = null; p.armedPotion = null; p.incomingCurse = false; p.usedThisRound = false;
    });

    // host screen is the shared projector → always English; lists every player's effects
    const hostPayload = localizedPayload(room, 'en');
    hostPayload.modifiers = Object.values(room.players).flatMap(p =>
      playerEffects(p).map(e => Object.assign({ id: p.id, name: p.name, color: p.color, hero: p.hero }, e)));
    io.to(room.hostId).emit('showQuestion', hostPayload);
    Object.values(room.players).forEach(p => {
      const payload = localizedPayload(room, p.lang || 'en');
      payload.time = p.effectiveTotal;
      payload.effects = playerEffects(p);
      payload.hide = p.hide || null;
      io.to(p.id).emit('answerNow', payload);
    });
  });

  // ---- PLAYER answers ----
  socket.on('submitAnswer', ({ pin, choice }) => {
    const room = rooms[pin];
    if (!room || room.state !== 'question' || !room.players[socket.id]) return;
    if (room.answers[socket.id]) return;
    const elapsed = Date.now() - room.questionStart;
    // half-time players are locked out once their (shorter) clock runs out
    const cap = (room.players[socket.id].effectiveTotal || room.questionTime) + 400; // small latency grace
    if (elapsed > cap) return;
    room.answers[socket.id] = { choice, elapsed };
    socket.emit('answerReceived');
    io.to(room.hostId).emit('answerCount', {
      answered: Object.keys(room.answers).length,
      total: Object.keys(room.players).length
    });
  });

  // ---- HOST reveals results ----
  socket.on('endQuestion', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostId !== socket.id || room.state !== 'question') return;
    revealResults(pin);
  });

  function revealResults(pin) {
    const room = rooms[pin];
    const q = room.currentQ;
    room.state = 'results';
    room.finishedCount = room.finishedCount || 0;

    const results = [];
    const fromMap = {};
    const newFinishers = []; // players who reached the castle THIS round
    Object.values(room.players).forEach(p => {
      const ans = room.answers[p.id];
      const correct = ans && ans.choice === q.correct;
      const mod = p.active; // modifier in force for THIS question
      let moved = 0, before = p.position;
      fromMap[p.id] = before;
      if (!p.finishRank) {
        if (correct) {
          const base = squaresForTime(ans.elapsed, p.effectiveTotal || room.questionTime);
          moved = base;
          if (mod === 'double' || p.potionActive === 'double') moved *= 2;
          else if (mod === 'half') moved = Math.ceil(moved / 2);
          p.position = Math.min(p.position + moved, PATH_LENGTH);
          p.score += moved * 100;
          if (p.position >= PATH_LENGTH) newFinishers.push({ p, elapsed: ans.elapsed });
        } else if (mod === 'trap') {
          // wrong/no answer on a trap block → fall back
          moved = -Math.min(TRAP_BACK, p.position - 1);
          p.position = Math.max(1, p.position - TRAP_BACK);
        }
        // correct-answer streak (resets on a wrong/missed answer)
        p.streak = correct ? (p.streak || 0) + 1 : 0;
        // per-category record (used to pick the dragon's question later)
        const ck = room.currentSrc && room.currentSrc.catKey;
        if (ck) {
          p.catStats = p.catStats || {};
          const cs = p.catStats[ck] = p.catStats[ck] || { correct: 0, total: 0 };
          cs.total++; if (correct) cs.correct++;
        }
      }
      results.push({ p, ans, correct, moved, before, usedMod: mod });
    });

    // live ranking (place of N) by finish order, then tile, then score
    const ranking = publicPlayers(room).sort((a, b) =>
      (a.finishRank || 99) - (b.finishRank || 99) || b.position - a.position || b.score - a.score)
      .map(o => o.id);
    const totalPlayers = ranking.length;

    // same-round arrivals at the castle: faster answer takes the higher rank
    newFinishers.sort((a, b) => a.elapsed - b.elapsed)
      .forEach(f => { f.p.finishRank = ++room.finishedCount; });

    // arm modifiers for the NEXT question: anyone now standing exactly on a special tile
    Object.values(room.players).forEach(p => {
      p.pending = (!p.finishRank && room.specials[p.position]) ? room.specials[p.position] : null;
    });

    const out = results.map(({ p, ans, correct, moved, before, usedMod }) => {
      // rivals the player could curse (everyone else still racing)
      const others = Object.values(room.players)
        .filter(o => o.id !== p.id && !o.finishRank)
        .map(o => ({ id: o.id, name: o.name, hero: o.hero }));
      io.to(p.id).emit('yourResult', {
        correct, moved, before, after: p.position,
        reachedGoal: !!p.finishRank, finishRank: p.finishRank || null,
        pathLength: PATH_LENGTH, correctIndex: q.correct, score: p.score,
        usedModifier: modInfo(usedMod),     // what affected this answer
        nextModifier: modInfo(p.pending),   // what awaits next question (landed on a block)
        others, inventory: remainingPotions(p),   // for the potion screen
        rank: ranking.indexOf(p.id) + 1, totalPlayers, streak: p.streak || 0   // player metrics
      });
      return {
        id: p.id, name: p.name, color: p.color, hero: p.hero,
        choice: ans ? ans.choice : null, correct,
        moved, before, after: p.position,
        reachedGoal: !!p.finishRank, finishRank: p.finishRank || null, score: p.score,
        nextModifier: modInfo(p.pending)
      };
    });

    const dist = q.options.map(() => 0);
    Object.values(room.answers).forEach(a => { if (a.choice != null) dist[a.choice]++; });

    // who just landed on a special block → announce on the host for everyone
    const landed = out.filter(r => r.nextModifier).map(r =>
      Object.assign({ id: r.id, name: r.name, color: r.color, hero: r.hero }, r.nextModifier));

    io.to(room.hostId).emit('questionResults', {
      correctIndex: q.correct,
      distribution: dist,
      results: out.sort((a, b) => (a.finishRank || 99) - (b.finishRank || 99) || b.after - a.after),
      players: publicPlayers(room),
      pathLength: PATH_LENGTH,
      landed
    });
    broadcastBoard(pin, fromMap); // animate heroes walking from old to new tile

    // The game ends as soon as the first 3 players reach the castle.
    // (With fewer than 3 players, it ends when everyone has finished.)
    const total = Object.keys(room.players).length;
    const spots = Math.min(3, total);
    const finished = room.finishedCount;
    if (finished >= spots) {
      // let the final walk animation play out on the host before the celebration
      const maxMoved = Math.max(0, ...out.map(r => r.moved));
      endGame(pin, Math.min(7000, maxMoved * 560 + 2200));
    }
  }

  function endGame(pin, delayMs) {
    const room = rooms[pin];
    room.state = 'over';
    const standings = sortedStandings(room);
    // the loser = last place, only when there's a distinct last player to mock gently
    const loser = standings.length >= 2 ? standings[standings.length - 1] : null;
    setTimeout(() => {
      if (!rooms[pin]) return; // host left in the meantime
      io.to(pin).emit('gameOver', { winner: standings[0] || null, loser, standings });
    }, delayMs || 0);
  }

  // ===== Dragon boss fight (only the 1st-place champion faces it) =====
  socket.on('startDragon', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== 'over' || room.dragon) return;     // only once, after the race ends
    const standings = sortedStandings(room);
    const champ = standings[0];
    const champPlayer = champ && room.players[champ.id];
    if (!champPlayer) return;
    const inPlay = (room.selected && room.selected.length) ? room.selected : Object.keys(room.cats);
    const cat = weakestCategory(champPlayer, inPlay);
    const pool = DRAGON[cat] || [];
    if (!pool.length) return;
    const src = pool[Math.floor(Math.random() * pool.length)];
    const perm = shuffled(4);
    const options = perm.map(i => src.options[i]);
    const catLabel = (room.cats[cat] && room.cats[cat].name) || cat;
    room.dragon = {
      championId: champ.id, championName: champPlayer.name, championHero: champPlayer.hero,
      cat, catLabel, q: src.q, options, correctIndex: perm.indexOf(src.correct),
      helpUsed: false, votes: {}, answered: false
    };
    const others = Object.keys(room.players).length - 1;
    io.to(room.hostId).emit('dragonStart', { role: 'host',
      champion: { name: champPlayer.name, hero: champPlayer.hero }, cat: catLabel, q: src.q, options });
    Object.values(room.players).forEach(p => {
      if (p.id === champ.id) {
        io.to(p.id).emit('dragonStart', { role: 'champion', cat: catLabel, q: src.q, options, canHelp: others > 0 });
      } else {
        io.to(p.id).emit('dragonStart', { role: 'watch',
          champion: { name: champPlayer.name, hero: champPlayer.hero }, cat: catLabel });
      }
    });
  });

  // champion uses the single lifeline → open voting for the other players
  socket.on('dragonAskHelp', ({ pin }) => {
    const room = rooms[pin]; const d = room && room.dragon;
    if (!d || d.answered || socket.id !== d.championId || d.helpUsed) return;
    d.helpUsed = true;
    Object.values(room.players).forEach(p => {
      if (p.id !== d.championId) io.to(p.id).emit('dragonVoteOpen', { q: d.q, options: d.options });
    });
    io.to(room.hostId).emit('dragonHelpOpen', {});
    io.to(d.championId).emit('dragonHelpOpen', {});
  });

  // a non-champion casts a vote (advisory)
  socket.on('dragonVote', ({ pin, choice }) => {
    const room = rooms[pin]; const d = room && room.dragon;
    if (!d || !d.helpUsed || d.answered) return;
    if (socket.id === d.championId || !room.players[socket.id]) return;
    if (typeof choice !== 'number' || choice < 0 || choice > 3) return;
    d.votes[socket.id] = choice;
    const counts = [0, 0, 0, 0];
    Object.values(d.votes).forEach(c => { counts[c]++; });
    const tally = { counts, total: Object.keys(d.votes).length, voters: Object.keys(room.players).length - 1 };
    io.to(room.hostId).emit('dragonTally', tally);
    io.to(d.championId).emit('dragonTally', tally);
  });

  // champion commits to a final answer (untimed)
  socket.on('dragonAnswer', ({ pin, choice }) => {
    const room = rooms[pin]; const d = room && room.dragon;
    if (!d || d.answered || socket.id !== d.championId) return;
    if (typeof choice !== 'number') return;
    d.answered = true;
    io.to(pin).emit('dragonResult', {
      correct: choice === d.correctIndex, correctIndex: d.correctIndex, chosen: choice,
      champion: { name: d.championName, hero: d.championHero }, cat: d.catLabel
    });
  });

  socket.on('disconnect', () => {
    const pin = socket.data.pin;
    if (pin && rooms[pin] && rooms[pin].players[socket.id]) {
      rooms[pin].players[socket.id].connected = false;
      broadcastLobby(pin);
    }
    for (const [p, room] of Object.entries(rooms)) {
      if (room.hostId === socket.id) {
        io.to(p).emit('hostLeft');
        delete rooms[p];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  Quiz Quest is running!');
  console.log('  Host screen:  http://localhost:' + PORT + '/host');
  console.log('  Players join: http://localhost:' + PORT + '/');
  console.log('  (Players on the same Wi-Fi use your computer\'s');
  console.log('   local IP instead of localhost, e.g. http://192.168.x.x:' + PORT + ')');
  console.log('========================================\n');
});
