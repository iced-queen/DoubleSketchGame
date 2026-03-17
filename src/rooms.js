'use strict';

// ── In-memory game state ──────────────────────────────────────────────────────
//
// rooms[roomCode] = {
//   players:        [ { id: socketId, name: string }, ... ],  // 3–10 players
//   host:           socketId,           // player who can press Start
//   scores:         { socketId: number },
//   round:          number,             // starts at 1
//   totalRounds:    number,             // chosen at room creation
//   phase:          string,             // 'waiting' | 'drawing' | 'reveal' | 'gameover'
//   realDrawer:     socketId,
//   decoyDrawer:    socketId,
//   guessers:       socketId[],
//   realPrompt:     string,
//   decoyPrompt:    string,
//   timer:          number,             // seconds remaining
//   timerInterval:  NodeJS interval,
//   strokeBuffer:   array,              // pending strokes not yet broadcast
//   correctGuesser: socketId | null,    // first guesser to guess correctly
// }
//

const rooms = {};

/**
 * Generates a unique 5-character room code using only unambiguous characters
 * so the code is easy to share verbally (no 0/O, 1/I/L).
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(
      { length: 5 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (rooms[code]); // retry on the rare collision
  return code;
}

/**
 * Returns the room object for the given socket, or null if not in a room.
 */
function getRoomForSocket(socket) {
  const code = socket.data.roomCode;
  return code ? rooms[code] : null;
}

module.exports = { rooms, generateRoomCode, getRoomForSocket };
