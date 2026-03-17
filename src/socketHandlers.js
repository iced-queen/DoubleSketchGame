'use strict';

const { rooms, generateRoomCode, getRoomForSocket } = require('./rooms');
const { pickPromptPair } = require('./prompts');

const ROUND_DURATION = 90;   // seconds per round
const STROKE_DELAY_MIN = 500;  // ms — minimum broadcast delay per stroke
const STROKE_DELAY_MAX = 1200; // ms — maximum broadcast delay per stroke

/**
 * Returns a random integer between min and max (inclusive).
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Assigns roles for a new round and picks a prompt pair.
 * Returns { realDrawer, decoyDrawer, guessers }.
 */
function assignRoles(players, usedPromptIndices) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const realDrawer  = shuffled[0].id;
  const decoyDrawer = shuffled[1].id;
  const guessers    = shuffled.slice(2).map(p => p.id);
  const prompt      = pickPromptPair(usedPromptIndices);
  return { realDrawer, decoyDrawer, guessers, prompt };
}

/**
 * Broadcasts the current player list + scores to all in the room.
 */
function broadcastLobby(io, roomCode, room) {
  io.to(roomCode).emit('lobby-update', {
    players:    room.players.map(p => ({ name: p.name, id: p.id })),
    hostId:     room.host,
    roomCode,
  });
}

/**
 * Starts a round: assigns roles, sends prompts privately, kicks off timer.
 */
function startRound(io, roomCode, room) {
  // Clear any previous timer
  if (room.timerInterval) clearInterval(room.timerInterval);

  const { realDrawer, decoyDrawer, guessers, prompt } = assignRoles(room.players, room.usedPromptIndices);
  room.usedPromptIndices.add(prompt.index);

  room.realDrawer     = realDrawer;
  room.decoyDrawer    = decoyDrawer;
  room.guessers       = guessers;
  room.realPrompt     = prompt.real;
  room.decoyPrompt    = prompt.decoy;
  room.phase          = 'drawing';
  room.correctGuesser = null;
  room.timer          = ROUND_DURATION;
  room.strokeBuffer   = [];

  // Tell everyone the round is starting (roles revealed client-side per socket)
  const playerMeta = room.players.map(p => ({
    id:   p.id,
    name: p.name,
    score: room.scores[p.id] || 0,
  }));

  io.to(roomCode).emit('round-start', {
    round:       room.round,
    totalRounds: room.totalRounds,
    players:     playerMeta,
    realDrawer,
    decoyDrawer,
    guessers,
    timer:       ROUND_DURATION,
  });

  // Send prompts privately
  io.to(realDrawer).emit('your-prompt',  { prompt: prompt.real,  role: 'real'  });
  io.to(decoyDrawer).emit('your-prompt', { prompt: prompt.decoy, role: 'decoy' });

  console.log(`[round]      ${roomCode} round ${room.round} — real:"${prompt.real}" decoy:"${prompt.decoy}"`);

  // Countdown timer
  room.timerInterval = setInterval(() => {
    room.timer--;
    io.to(roomCode).emit('timer-tick', { timer: room.timer });

    if (room.timer <= 0) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
      endRound(io, roomCode, room, null);
    }
  }, 1000);
}

/**
 * Ends the current round, calculates scores, emits reveal.
 * @param {string|null} correctGuesserSocketId — null if time ran out
 */
function endRound(io, roomCode, room, correctGuesserSocketId) {
  if (room.phase !== 'drawing') return; // already ended
  room.phase = 'reveal';

  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  // ── Scoring ──────────────────────────────────────────────────────────────
  // Guesser who got it right: +3 pts
  // Real drawer (if someone guessed correctly): +2 pts
  // Decoy drawer (if no one guessed correctly): +3 pts

  if (correctGuesserSocketId) {
    room.scores[correctGuesserSocketId] = (room.scores[correctGuesserSocketId] || 0) + 3;
    room.scores[room.realDrawer]        = (room.scores[room.realDrawer]        || 0) + 2;
  } else {
    room.scores[room.decoyDrawer] = (room.scores[room.decoyDrawer] || 0) + 3;
  }

  const scoreSnapshot = room.players.map(p => ({
    id:    p.id,
    name:  p.name,
    score: room.scores[p.id] || 0,
    delta: (() => {
      if (p.id === correctGuesserSocketId) return '+3';
      if (p.id === room.realDrawer && correctGuesserSocketId) return '+2';
      if (p.id === room.decoyDrawer && !correctGuesserSocketId) return '+3';
      return '+0';
    })(),
  }));

  // Find names for reveal
  const realDrawerName  = room.players.find(p => p.id === room.realDrawer)?.name  || '?';
  const decoyDrawerName = room.players.find(p => p.id === room.decoyDrawer)?.name || '?';
  const correctName     = correctGuesserSocketId
    ? room.players.find(p => p.id === correctGuesserSocketId)?.name || '?'
    : null;

  io.to(roomCode).emit('round-reveal', {
    realPrompt:       room.realPrompt,
    decoyPrompt:      room.decoyPrompt,
    realDrawerName,
    decoyDrawerName,
    correctGuesser:   correctName,
    scores:           scoreSnapshot,
    round:            room.round,
    totalRounds:      room.totalRounds,
  });

  console.log(`[round]      ${roomCode} round ${room.round} ended — guesser: ${correctName || 'none'}`);
}

/**
 * Registers all Socket.IO game event handlers on the given server instance.
 * @param {import('socket.io').Server} io
 */
function registerHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[connect]    ${socket.id}`);

    // ── create-room ───────────────────────────────────────────────────────────
    socket.on('create-room', ({ playerName, totalRounds }) => {
      if (!playerName || typeof playerName !== 'string') return;
      const name = playerName.trim().slice(0, 20);
      if (!name) return;

      const rounds = (Number.isInteger(totalRounds) && totalRounds >= 1 && totalRounds <= 20)
        ? totalRounds : 5;

      const roomCode = generateRoomCode();

      rooms[roomCode] = {
        players:           [{ id: socket.id, name }],
        host:              socket.id,
        scores:            { [socket.id]: 0 },
        round:             1,
        totalRounds:       rounds,
        phase:             'waiting',
        realDrawer:        null,
        decoyDrawer:       null,
        guessers:          [],
        realPrompt:        null,
        decoyPrompt:       null,
        timer:             ROUND_DURATION,
        timerInterval:     null,
        strokeBuffer:      [],
        correctGuesser:    null,
        usedPromptIndices: new Set(),
        nextRoundVotes:    new Set(),
        playAgainVotes:    new Set(),
      };

      socket.join(roomCode);
      socket.data.roomCode   = roomCode;
      socket.data.playerName = name;

      socket.emit('room-created', { roomCode });
      broadcastLobby(io, roomCode, rooms[roomCode]);
      console.log(`[room]       ${roomCode} created by "${name}"`);
    });

    // ── join-room ─────────────────────────────────────────────────────────────
    socket.on('join-room', ({ playerName, roomCode }) => {
      if (!playerName || !roomCode) return;
      const name = playerName.trim().slice(0, 20);
      const code = roomCode.trim().toUpperCase().slice(0, 5);
      if (!name || code.length !== 5) return;

      const room = rooms[code];

      if (!room) {
        socket.emit('error-message', 'Room not found. Double-check the code.');
        return;
      }
      if (room.phase !== 'waiting') {
        socket.emit('error-message', 'This game has already started.');
        return;
      }
      if (room.players.length >= 10) {
        socket.emit('error-message', 'This room is full (max 10 players).');
        return;
      }

      room.players.push({ id: socket.id, name });
      room.scores[socket.id] = 0;

      socket.join(code);
      socket.data.roomCode   = code;
      socket.data.playerName = name;

      socket.emit('joined-room', { roomCode: code });
      broadcastLobby(io, code, room);
      console.log(`[room]       ${code} — "${name}" joined (${room.players.length} players)`);
    });

    // ── start-game ────────────────────────────────────────────────────────────
    socket.on('start-game', () => {
      const room = getRoomForSocket(socket);
      if (!room) return;
      if (socket.id !== room.host) {
        socket.emit('error-message', 'Only the host can start the game.');
        return;
      }
      if (room.phase !== 'waiting') return;
      if (room.players.length < 3) {
        socket.emit('error-message', 'Need at least 3 players to start.');
        return;
      }

      room.phase = 'drawing';
      const roomCode = socket.data.roomCode;
      startRound(io, roomCode, room);
    });

    // ── draw-stroke ───────────────────────────────────────────────────────────
    // Receives a stroke segment from a drawer and broadcasts it to everyone
    // else after a small random delay (anti-early-guess mechanic).
    socket.on('draw-stroke', (strokeData) => {
      const room = getRoomForSocket(socket);
      if (!room || room.phase !== 'drawing') return;
      if (socket.id !== room.realDrawer && socket.id !== room.decoyDrawer) return;

      // Validate stroke data shape to prevent injection
      if (!strokeData || typeof strokeData !== 'object') return;
      const { x0, y0, x1, y1, color, size, erase } = strokeData;
      if (
        typeof x0 !== 'number' || typeof y0 !== 'number' ||
        typeof x1 !== 'number' || typeof y1 !== 'number' ||
        typeof size !== 'number'
      ) return;

      // Color is required and must be a valid hex when not erasing
      if (!erase && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) return;
      // Clamp size to reasonable range
      const clampedSize = Math.max(1, Math.min(size, 60));
      const layer = socket.id === room.realDrawer ? 'real' : 'decoy';
      const safeStroke = { x0, y0, x1, y1, size: clampedSize, layer, erase: !!erase };
      if (!erase) safeStroke.color = color;
      const delay = randInt(STROKE_DELAY_MIN, STROKE_DELAY_MAX);
      const roomCode = socket.data.roomCode;
      const room2 = rooms[roomCode]; // alias to avoid closure confusion

      // The other drawer sees strokes immediately (they're a co-conspirator).
      // Guessers see strokes with a delay (anti-early-guess mechanic).
      const otherDrawer = socket.id === room.realDrawer ? room.decoyDrawer : room.realDrawer;

      // Immediate to the other drawer
      if (otherDrawer) {
        const otherSocket = io.sockets.sockets.get(otherDrawer);
        if (otherSocket) otherSocket.emit('stroke', safeStroke);
      }

      // Delayed to guessers
      setTimeout(() => {
        if (!rooms[roomCode] || rooms[roomCode].phase !== 'drawing') return;
        room2.guessers.forEach(guesserId => {
          const gs = io.sockets.sockets.get(guesserId);
          if (gs) gs.emit('stroke', safeStroke);
        });
      }, delay);
    });

    // ── clear-canvas ──────────────────────────────────────────────────────────
    socket.on('clear-canvas', () => {
      const room = getRoomForSocket(socket);
      if (!room || room.phase !== 'drawing') return;
      if (socket.id !== room.realDrawer && socket.id !== room.decoyDrawer) return;
      const roomCode = socket.data.roomCode;
      const layer = socket.id === room.realDrawer ? 'real' : 'decoy';
      // Use socket.to so the sender (who already cleared locally) doesn't get a redundant event
      socket.to(roomCode).emit('canvas-cleared', { layer });
    });

    // ── submit-guess ──────────────────────────────────────────────────────────
    socket.on('submit-guess', ({ guess }) => {
      const room = getRoomForSocket(socket);
      if (!room || room.phase !== 'drawing') return;
      if (!room.guessers.includes(socket.id)) return;

      if (!guess || typeof guess !== 'string') return;
      const trimmed = guess.trim().toLowerCase().slice(0, 100);
      if (!trimmed) return;

      const correct = trimmed === room.realPrompt.toLowerCase();
      const roomCode = socket.data.roomCode;

      // Broadcast the guess attempt to everyone (so others can see guesses live)
      io.to(roomCode).emit('guess-made', {
        guesserName: socket.data.playerName,
        guess:       trimmed,
        correct,
      });

      if (correct) {
        endRound(io, roomCode, room, socket.id);
      }
    });

    // ── next-round ────────────────────────────────────────────────────────────
    // All players must vote to advance to the next round.
    socket.on('next-round', () => {
      const room = getRoomForSocket(socket);
      if (!room || room.phase !== 'reveal') return;
      if (room.nextRoundVotes.has(socket.id)) return; // ignore double-clicks

      const roomCode = socket.data.roomCode;
      room.nextRoundVotes.add(socket.id);

      const readyCount = room.nextRoundVotes.size;
      const totalCount = room.players.length;

      io.to(roomCode).emit('next-round-voted', { readyCount, totalCount });

      if (readyCount >= totalCount) {
        room.nextRoundVotes.clear();
        if (room.round >= room.totalRounds) {
          // Game over
          room.phase = 'gameover';
          room.playAgainVotes = new Set();
          const finalScores = room.players
            .map(p => ({ name: p.name, score: room.scores[p.id] || 0 }))
            .sort((a, b) => b.score - a.score);
          io.to(roomCode).emit('game-over', { scores: finalScores, totalPlayers: room.players.length });
          console.log(`[room]       ${roomCode} — game over`);
        } else {
          room.round++;
          startRound(io, roomCode, room);
        }
      }
    });

    // ── play-again ────────────────────────────────────────────────────────────
    // All currently connected players must vote before the game restarts.
    socket.on('play-again', () => {
      const room = getRoomForSocket(socket);
      if (!room || room.phase !== 'gameover') return;
      if (room.playAgainVotes.has(socket.id)) return; // ignore double-clicks

      const roomCode = socket.data.roomCode;
      room.playAgainVotes.add(socket.id);

      const readyCount = room.playAgainVotes.size;
      const totalCount = room.players.length;

      // Tell everyone the current vote tally
      io.to(roomCode).emit('play-again-voted', { readyCount, totalCount });

      if (readyCount >= totalCount) {
        // All in — reset and return to lobby
        room.playAgainVotes.clear();
        room.nextRoundVotes    = new Set();
        room.round             = 1;
        room.scores            = {};
        room.usedPromptIndices = new Set();
        room.players.forEach(p => { room.scores[p.id] = 0; });

        broadcastLobby(io, roomCode, room);
        room.phase = 'waiting';
        io.to(roomCode).emit('back-to-lobby');
        console.log(`[room]       ${roomCode} — play again, back to lobby`);
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const code       = socket.data.roomCode;
      const playerName = socket.data.playerName;

      if (!code || !rooms[code]) {
        console.log(`[disconnect] ${socket.id}`);
        return;
      }

      const room = rooms[code];

      // Remove from player list and any pending votes
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.scores[socket.id];
      room.nextRoundVotes?.delete(socket.id);
      room.playAgainVotes?.delete(socket.id);

      console.log(`[disconnect] "${playerName}" left room ${code} (${room.players.length} remaining)`);

      // If someone leaves mid-reveal, handle vote unblock or early game-over
      if (room.phase === 'reveal' && room.players.length > 0) {
        if (room.players.length < 3) {
          // Not enough players to continue — end the game now
          room.nextRoundVotes.clear();
          room.phase = 'gameover';
          room.playAgainVotes = new Set();
          const finalScores = room.players
            .map(p => ({ name: p.name, score: room.scores[p.id] || 0 }))
            .sort((a, b) => b.score - a.score);
          io.to(code).emit('game-over', { scores: finalScores, totalPlayers: room.players.length });
          console.log(`[room]       ${code} — game over (too few players during reveal)`);
          return;
        }
        // Check if remaining players have all voted
        if (room.nextRoundVotes.size >= room.players.length) {
          room.nextRoundVotes.clear();
          if (room.round >= room.totalRounds) {
            room.phase = 'gameover';
            room.playAgainVotes = new Set();
            const finalScores = room.players
              .map(p => ({ name: p.name, score: room.scores[p.id] || 0 }))
              .sort((a, b) => b.score - a.score);
            io.to(code).emit('game-over', { scores: finalScores, totalPlayers: room.players.length });
            console.log(`[room]       ${code} — game over (triggered by disconnect unblock)`);
          } else {
            room.round++;
            startRound(io, code, room);
          }
          return;
        }
        // Update vote tally for remaining players
        io.to(code).emit('next-round-voted', {
          readyCount: room.nextRoundVotes.size,
          totalCount: room.players.length,
        });
      }

      // If someone leaves mid-gameover and the remaining voters are now all ready, unblock
      if (room.phase === 'gameover' && room.players.length > 0 &&
          room.playAgainVotes.size >= room.players.length) {
        room.playAgainVotes.clear();
        room.nextRoundVotes    = new Set();
        room.round             = 1;
        room.scores            = {};
        room.usedPromptIndices = new Set();
        room.players.forEach(p => { room.scores[p.id] = 0; });
        broadcastLobby(io, code, room);
        room.phase = 'waiting';
        io.to(code).emit('back-to-lobby');
        console.log(`[room]       ${code} — play again triggered by disconnect unblock`);
        return;
      }

      // If room is now empty, clean up
      if (room.players.length === 0) {
        if (room.timerInterval) clearInterval(room.timerInterval);
        delete rooms[code];
        console.log(`[room]       ${code} closed — empty`);
        return;
      }

      // If the host left, assign a new host
      if (room.host === socket.id) {
        room.host = room.players[0].id;
        console.log(`[room]       ${code} — new host: "${room.players[0].name}"`);
      }

      // Notify remaining players
      io.to(code).emit('player-left', {
        name:    playerName,
        players: room.players.map(p => ({ name: p.name, id: p.id })),
        hostId:  room.host,
      });

      // If in drawing phase and we no longer have enough players, end the round
      if (room.phase === 'drawing' && room.players.length < 3) {
        endRound(io, code, room, null);
      }
    });
  });
}

module.exports = { registerHandlers };
