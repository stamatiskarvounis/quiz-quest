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

// ---- Hero races players can choose (client maps these ids to pixel avatars) ----
const HEROES = ['human','elf','darkelf','dwarf','orc','halfling','mage','knight'];

// ---- Load questions ----
function loadQuestions() {
  const raw = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  return JSON.parse(raw);
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
    score: p.score, color: p.color, hero: p.hero, connected: p.connected
  }));
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

// Faster correct answer = more squares (1..6).
// Based on a 15-second reference; scales if questionTime changes.
// Blocks earned by a CORRECT answer, based on how fast (15-second timer).
// Wrong answer or no answer = 0 blocks (handled in revealResults).
//   0-3 sec  -> 5 blocks
//   3-5 sec  -> 4 blocks
//   5-7 sec  -> 3 blocks
//   7-9 sec  -> 2 blocks
//   9-15 sec -> 0 blocks
function squaresForTime(elapsedMs, totalMs) {
  const refSec = (elapsedMs / totalMs) * 15; // seconds on a 15s scale
  if (refSec <= 3) return 5;
  if (refSec <= 5) return 4;
  if (refSec <= 7) return 3;
  if (refSec <= 9) return 2;
  return 0;
}

io.on('connection', (socket) => {

  // ---- HOST creates a room ----
  socket.on('createRoom', () => {
    const data = loadQuestions();
    const pin = makePin();
    rooms[pin] = {
      pin,
      hostId: socket.id,
      players: {},
      questions: data.questions,
      title: data.title || 'Quiz',
      questionTime: (data.questionTime || 15) * 1000,
      order: shuffled(data.questions.length), // shuffled play order, reshuffled when exhausted
      orderPos: -1,
      qnum: 0,            // how many questions have been asked
      currentQ: null,
      state: 'lobby',
      answers: {},
      questionStart: 0,
      pathLength: PATH_LENGTH
    };
    socket.join(pin);
    socket.emit('roomCreated', {
      pin,
      title: rooms[pin].title,
      total: rooms[pin].questions.length,
      pathLength: PATH_LENGTH,
      questionTime: rooms[pin].questionTime
    });
  });

  // ---- PLAYER joins (name) ----
  socket.on('joinRoom', ({ pin, name }) => {
    const room = rooms[pin];
    if (!room) return socket.emit('joinError', 'Game not found. Check the PIN.');
    if (room.state !== 'lobby') return socket.emit('joinError', 'Game already started.');
    if (Object.keys(room.players).length >= 20) return socket.emit('joinError', 'Game is full (20 players).');
    name = String(name || '').trim().slice(0, 16) || 'Player';

    const idx = Object.keys(room.players).length;
    room.players[socket.id] = {
      id: socket.id, name, position: 0, score: 0,
      color: COLORS[idx % COLORS.length],
      hero: HEROES[idx % HEROES.length], connected: true
    };
    socket.join(pin);
    socket.data.pin = pin;
    socket.emit('joined', { pin, name, id: socket.id, color: room.players[socket.id].color, heroes: HEROES });
    broadcastLobby(pin);
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

    // pick the next question; reshuffle and loop when the pool is exhausted
    room.orderPos++;
    if (room.orderPos >= room.order.length) { room.order = shuffled(room.questions.length); room.orderPos = 0; }
    room.qnum++;
    const q = room.questions[room.order[room.orderPos]];
    room.currentQ = q;
    room.state = 'question';
    room.answers = {};
    room.questionStart = Date.now();

    const payload = { index: room.qnum - 1, q: q.q, options: q.options, time: room.questionTime };
    io.to(room.hostId).emit('showQuestion', payload);
    Object.keys(room.players).forEach(pid => io.to(pid).emit('answerNow', payload));
  });

  // ---- PLAYER answers ----
  socket.on('submitAnswer', ({ pin, choice }) => {
    const room = rooms[pin];
    if (!room || room.state !== 'question' || !room.players[socket.id]) return;
    if (room.answers[socket.id]) return;
    const elapsed = Date.now() - room.questionStart;
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

    const results = [];
    const fromMap = {};
    Object.values(room.players).forEach(p => {
      const ans = room.answers[p.id];
      const correct = ans && ans.choice === q.correct;
      let moved = 0, before = p.position;
      fromMap[p.id] = before;
      if (correct) {
        moved = squaresForTime(ans.elapsed, room.questionTime);
        p.position = Math.min(p.position + moved, PATH_LENGTH);
        p.score += moved * 100;
      }
      const reachedGoal = p.position >= PATH_LENGTH;
      results.push({
        id: p.id, name: p.name, color: p.color, hero: p.hero,
        choice: ans ? ans.choice : null, correct,
        moved, before, after: p.position, reachedGoal, score: p.score
      });
      io.to(p.id).emit('yourResult', {
        correct, moved, before, after: p.position, reachedGoal,
        pathLength: PATH_LENGTH, correctIndex: q.correct, score: p.score
      });
    });

    const dist = q.options.map(() => 0);
    Object.values(room.answers).forEach(a => { if (a.choice != null) dist[a.choice]++; });

    io.to(room.hostId).emit('questionResults', {
      correctIndex: q.correct,
      distribution: dist,
      results: results.sort((a, b) => b.after - a.after),
      players: publicPlayers(room),
      pathLength: PATH_LENGTH
    });
    broadcastBoard(pin, fromMap); // animate heroes walking from old to new tile

    const winner = Object.values(room.players).find(p => p.position >= PATH_LENGTH);
    if (winner) {
      room.state = 'over';
      io.to(pin).emit('gameOver', {
        winner: { name: winner.name, color: winner.color, hero: winner.hero },
        standings: publicPlayers(room).sort((a, b) => b.position - a.position || b.score - a.score)
      });
    }
  }

  function endGame(pin) {
    const room = rooms[pin];
    room.state = 'over';
    const standings = publicPlayers(room).sort((a, b) => b.position - a.position || b.score - a.score);
    io.to(pin).emit('gameOver', { winner: standings[0] || null, standings });
  }

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
