'use strict';

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io();

// ── State ─────────────────────────────────────────────────────────────────────
let myRole      = null;   // 'real' | 'decoy' | 'guesser'
let roomCode    = null;
let isHost      = false;
let isDrawing   = false;
let lastX       = 0;
let lastY       = 0;
let canDraw     = false;
let currentColor = '#000000';
let currentSize  = 6;
let myCanvas    = null;
let myCtx       = null;
let isErasing   = false;
let timerAnimFrame = null;

// ── Screen management ─────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // Compact header during the game screen (like the reference games)
  document.querySelector('header').classList.toggle('compact', id === 'screen-game');
}

// ── Security: escape HTML before inserting into the DOM ───────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvasReal  = document.getElementById('canvas-real');
const canvasDecoy = document.getElementById('canvas-decoy');
const ctxReal     = canvasReal.getContext('2d');
const ctxDecoy    = canvasDecoy.getContext('2d');
// canvasDecoy sits on top and receives all pointer events
const eventCanvas = canvasDecoy;

function drawSegment(targetCtx, x0, y0, x1, y1, color, size) {
  targetCtx.beginPath();
  targetCtx.moveTo(x0, y0);
  targetCtx.lineTo(x1, y1);
  targetCtx.strokeStyle = color;
  targetCtx.lineWidth   = size;
  targetCtx.lineCap     = 'round';
  targetCtx.lineJoin    = 'round';
  targetCtx.stroke();
}

function getPos(e) {
  const rect   = eventCanvas.getBoundingClientRect();
  const scaleX = canvasDecoy.width  / rect.width;
  const scaleY = canvasDecoy.height / rect.height;
  const src    = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top)  * scaleY,
  };
}

function onDrawStart(e) {
  if (!canDraw) return;
  e.preventDefault();
  isDrawing = true;
  const { x, y } = getPos(e);
  lastX = x;
  lastY = y;
}

function onDrawMove(e) {
  if (!isDrawing || !canDraw) return;
  e.preventDefault();
  const { x, y } = getPos(e);

  // Draw locally right away (responsive feel for the person drawing)
  if (isErasing) {
    myCtx.save();
    myCtx.globalCompositeOperation = 'destination-out';
    drawSegment(myCtx, lastX, lastY, x, y, 'rgba(0,0,0,1)', currentSize);
    myCtx.restore();
  } else {
    drawSegment(myCtx, lastX, lastY, x, y, currentColor, currentSize);
  }

  // Send to server — server will broadcast to others
  socket.emit('draw-stroke', {
    x0: lastX, y0: lastY,
    x1: x,     y1: y,
    color: currentColor,
    size:  currentSize,
    erase: isErasing,
  });

  lastX = x;
  lastY = y;
}

function onDrawEnd() { isDrawing = false; }

eventCanvas.addEventListener('mousedown',  onDrawStart);
eventCanvas.addEventListener('mousemove',  onDrawMove);
eventCanvas.addEventListener('mouseup',    onDrawEnd);
eventCanvas.addEventListener('mouseleave', onDrawEnd);
eventCanvas.addEventListener('touchstart', onDrawStart, { passive: false });
eventCanvas.addEventListener('touchmove',  onDrawMove,  { passive: false });
eventCanvas.addEventListener('touchend',   onDrawEnd);

// ── Color palette ─────────────────────────────────────────────────────────────
const COLORS = [
  // blacks & whites
  '#000000', '#ffffff',
  // greys
  '#6b7280', '#d1d5db',
  // warm reds & pinks
  '#dc2626', '#f87171', '#e8609a', '#f9a8d4',
  // oranges & yellows
  '#f97316', '#fbbf24', '#facc15',
  // greens
  '#16a34a', '#4ade80', '#84cc16',
  // blues & purples
  '#2563eb', '#60a5fa', '#0ea5e9', '#7c3aed', '#a78bfa',
  // browns
  '#92400e', '#d97706',
];

function buildColorPalette() {
  const palette = document.getElementById('color-palette');
  COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color === currentColor ? ' selected' : '');
    swatch.style.background  = color;
    swatch.style.border      = (color === '#ffffff' || color === '#d1d5db') ? '2px solid #4b5563' : '2px solid transparent';
    swatch.title             = color;
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      currentColor = color;
      // Switch back to pencil when a colour is picked
      setErasing(false);
    });
    palette.appendChild(swatch);
  });
}

// ── Brush sizes ───────────────────────────────────────────────────────────────
const BRUSH_SIZES = [
  { size: 2  },
  { size: 6  },
  { size: 14 },
  { size: 28 },
];

function buildBrushSizes() {
  const container = document.getElementById('brush-sizes');
  BRUSH_SIZES.forEach(({ size }, i) => {
    const btn = document.createElement('button');
    btn.className   = 'brush-btn' + (i === 1 ? ' selected' : '');
    btn.dataset.size = size;
    // Visual circle whose diameter scales with the brush size
    const dot = document.createElement('span');
    dot.className = 'brush-dot';
    const dotPx = Math.round(4 + size * 0.9); // min 6px, max ~30px
    dot.style.width  = dotPx + 'px';
    dot.style.height = dotPx + 'px';
    btn.appendChild(dot);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentSize = size;
    });
    container.appendChild(btn);
  });
  // Default to second size
  currentSize = BRUSH_SIZES[1].size;
}

// ── Brush type (pencil / eraser) ──────────────────────────────────────────────────
const SVG_PENCIL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
</svg>`;

const SVG_ERASER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 20H7L3 16l11-11 6 6-3.5 3.5"/>
  <path d="M6.5 17.5l4-4"/>
</svg>`;

const BRUSH_TYPES = [
  { id: 'pencil', label: 'Pencil', svg: SVG_PENCIL, erasing: false },
  { id: 'eraser', label: 'Eraser', svg: SVG_ERASER, erasing: true  },
];

function setErasing(val) {
  isErasing = val;
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.erasing === String(val));
  });
}

function buildBrushTypes() {
  const container = document.getElementById('brush-types');
  BRUSH_TYPES.forEach(({ id, label, svg, erasing }) => {
    const btn = document.createElement('button');
    btn.className        = 'type-btn' + (!erasing ? ' selected' : '');
    btn.dataset.erasing  = String(erasing);
    btn.title            = label;
    btn.innerHTML        = svg;
    btn.addEventListener('click', () => setErasing(erasing));
    container.appendChild(btn);
  });
}

// ── Timer display ─────────────────────────────────────────────────────────────
function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ── Guess feed ────────────────────────────────────────────────────────────────
function addGuessEntry(guesserName, guess, correct) {
  const feed  = document.getElementById('guess-feed');
  const entry = document.createElement('div');
  entry.className = 'guess-entry' + (correct ? ' correct' : '');
  entry.innerHTML =
    `<span class="guesser-name">${escapeHtml(guesserName)}</span>: ${escapeHtml(guess)}`
    + (correct ? ' ✓' : '');
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

// ── Waiting room helpers ──────────────────────────────────────────────────────
function buildWaitingPlayerList(players, hostId) {
  const list = document.getElementById('waiting-player-list');
  list.innerHTML = '';
  players.forEach(p => {
    const pill  = document.createElement('div');
    pill.className = 'player-pill';
    const crown = p.id === hostId ? '<span class="host-crown">♔ </span>' : '';
    pill.innerHTML = crown + escapeHtml(p.name);
    list.appendChild(pill);
  });

  const count  = players.length;
  const status = document.getElementById('waiting-status');
  status.textContent = count < 3
    ? `Waiting for more players… (${count}/3 minimum, 10 max)`
    : `${count} player${count > 1 ? 's' : ''} ready!`;

  const startBtn = document.getElementById('start-btn');
  if (isHost && count >= 3) {
    startBtn.classList.remove('hidden');
  } else {
    startBtn.classList.add('hidden');
  }
}

// ── Game screen setup ─────────────────────────────────────────────────────────
function setupGameScreen(data) {
  const { round, totalRounds, realDrawer, decoyDrawer, timer, players } = data;

  document.getElementById('game-round').textContent = `Round ${round} / ${totalRounds}`;

  const timerEl = document.getElementById('timer-display');
  timerEl.textContent = formatTimer(timer);
  timerEl.classList.remove('urgent');
  if (timerAnimFrame !== null) { cancelAnimationFrame(timerAnimFrame); timerAnimFrame = null; }
  timerEl.style.color = '';

  // Clear both canvas layers and guess feed for the new round
  ctxReal.clearRect(0, 0, canvasReal.width, canvasReal.height);
  ctxDecoy.clearRect(0, 0, canvasDecoy.width, canvasDecoy.height);
  isErasing = false;
  setErasing(false);
  document.getElementById('guess-feed').innerHTML = '';

  // Determine this client's role
  if      (socket.id === realDrawer)  myRole = 'real';
  else if (socket.id === decoyDrawer) myRole = 'decoy';
  else                                myRole = 'guesser';

  canDraw  = myRole === 'real' || myRole === 'decoy';
  myCanvas = myRole === 'real'  ? canvasReal  : myRole === 'decoy' ? canvasDecoy : null;
  myCtx    = myRole === 'real'  ? ctxReal     : myRole === 'decoy' ? ctxDecoy    : null;

  // Role badge
  const badge = document.getElementById('role-badge');
  if (myRole === 'real') {
    badge.textContent = 'Real Drawer';
    badge.className   = 'role-badge real-drawer';
  } else if (myRole === 'decoy') {
    badge.textContent = 'Decoy Drawer';
    badge.className   = 'role-badge decoy-drawer';
  } else {
    badge.textContent = 'Guesser';
    badge.className   = 'role-badge guesser';
  }

  // Show drawing tools for drawers, guess input for guessers
  document.getElementById('drawing-tools').classList.toggle('hidden', !canDraw);
  document.getElementById('guess-area').classList.toggle('hidden', canDraw);

  // Re-enable guess input (may have been disabled after a correct guess last round)
  const guessInput = document.getElementById('guess-input');
  const guessBtn   = document.getElementById('submit-guess-btn');
  guessInput.value    = '';
  guessInput.disabled = false;
  guessBtn.disabled   = false;

  // Prompt box hidden until server privately sends the prompt
  const promptBox = document.getElementById('prompt-box');
  promptBox.classList.add('hidden');
  promptBox.classList.toggle('decoy', myRole === 'decoy');
  document.getElementById('prompt-text').textContent = '';

  // Scores sidebar
  buildScoreList(players, realDrawer, decoyDrawer);

  showScreen('screen-game');
}

function buildScoreList(players, realDrawerId, decoyDrawerId) {
  const container = document.getElementById('player-scores');
  container.innerHTML = '';
  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'score-row';
    let nameClass = '';
    if (p.id === realDrawerId)  nameClass = 'name-real';
    else if (p.id === decoyDrawerId) nameClass = 'name-decoy';
    row.innerHTML =
      `<span class="${nameClass}">${escapeHtml(p.name)}</span><span class="score-val">${p.score}</span>`;
    container.appendChild(row);
  });
}

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on('room-created', ({ roomCode: code }) => {
  roomCode = code;
  isHost   = true;
  const el = document.getElementById('display-room-code');
  el.textContent = code;
  el.addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => {
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 1500);
    });
  });
  showScreen('screen-waiting');
});

socket.on('joined-room', ({ roomCode: code }) => {
  roomCode = code;
  isHost   = false;
  const el = document.getElementById('display-room-code');
  el.textContent = code;
  el.addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => {
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 1500);
    });
  });
  showScreen('screen-waiting');
});

socket.on('lobby-update', ({ players, hostId }) => {
  isHost = socket.id === hostId;
  buildWaitingPlayerList(players, hostId);
});

socket.on('round-start', (data) => {
  setupGameScreen(data);
});

socket.on('your-prompt', ({ prompt }) => {
  document.getElementById('prompt-text').textContent = prompt.toUpperCase();
  document.getElementById('prompt-box').classList.remove('hidden');
});

// Strokes arrive here: immediate for the other drawer, delayed for guessers
socket.on('stroke', ({ x0, y0, x1, y1, color, size, layer, erase }) => {
  const targetCtx = layer === 'real' ? ctxReal : ctxDecoy;
  if (erase) {
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'destination-out';
    drawSegment(targetCtx, x0, y0, x1, y1, 'rgba(0,0,0,1)', size);
    targetCtx.restore();
  } else {
    drawSegment(targetCtx, x0, y0, x1, y1, color, size);
  }
});

socket.on('canvas-cleared', ({ layer }) => {
  const targetCtx    = layer === 'real' ? ctxReal    : ctxDecoy;
  const targetCanvas = layer === 'real' ? canvasReal : canvasDecoy;
  targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
});

socket.on('guess-made', ({ guesserName, guess, correct }) => {
  addGuessEntry(guesserName, guess, correct);
  if (correct) {
    document.getElementById('submit-guess-btn').disabled = true;
    document.getElementById('guess-input').disabled = true;
  }
});

// Returns [r,g,b] for a timer value: white (t≥20) → orange (t=10) → red (t=0)
function timerColor(t) {
  if (t >= 20) return [255, 255, 254];
  if (t >= 10) {
    const f = (20 - t) / 10; // 0 at 20s, 1 at 10s
    return [
      Math.round(255 + (249 - 255) * f),
      Math.round(255 + (115 - 255) * f),
      Math.round(254 + (22  - 254) * f),
    ];
  }
  const f = (10 - t) / 10; // 0 at 10s, 1 at 0s
  return [
    Math.round(249 + (239 - 249) * f),
    Math.round(115 + (68  - 115) * f),
    Math.round(22  + (68  - 22)  * f),
  ];
}

socket.on('timer-tick', ({ timer }) => {
  const el = document.getElementById('timer-display');
  el.textContent = formatTimer(timer);

  if (timerAnimFrame !== null) { cancelAnimationFrame(timerAnimFrame); timerAnimFrame = null; }

  if (timer > 20) {
    el.style.color = '';
    return;
  }

  // Smoothly animate from timerColor(timer) → timerColor(timer-1) at ~60fps
  const [fr, fg, fb] = timerColor(timer);
  const [tr, tg, tb] = timerColor(timer - 1);
  const startTime = performance.now();
  const DURATION = 950;

  function animate(now) {
    const p = Math.min((now - startTime) / DURATION, 1);
    const r = Math.round(fr + (tr - fr) * p);
    const g = Math.round(fg + (tg - fg) * p);
    const b = Math.round(fb + (tb - fb) * p);
    el.style.color = `rgb(${r},${g},${b})`;
    if (p < 1) timerAnimFrame = requestAnimationFrame(animate);
    else timerAnimFrame = null;
  }
  timerAnimFrame = requestAnimationFrame(animate);
});

socket.on('round-reveal', (data) => {
  const {
    realPrompt, decoyPrompt,
    realDrawerName, decoyDrawerName,
    correctGuesser, scores, round, totalRounds,
  } = data;

  document.getElementById('reveal-round').textContent   = `Round ${round} / ${totalRounds}`;
  document.getElementById('reveal-real-prompt').textContent  = realPrompt;
  document.getElementById('reveal-decoy-prompt').textContent = decoyPrompt;
  document.getElementById('reveal-real-drawer').textContent  = `drawn by ${realDrawerName}`;
  document.getElementById('reveal-decoy-drawer').textContent = `drawn by ${decoyDrawerName}`;

  const resultEl = document.getElementById('reveal-result-text');
  resultEl.textContent = correctGuesser
    ? `${correctGuesser} guessed it correctly!`
    : `No one guessed it — the decoy wins this round!`;

  const scoreList = document.getElementById('reveal-scores');
  scoreList.innerHTML = '';
  scores.forEach(p => {
    const row = document.createElement('div');
    row.className = 'score-row-reveal';
    let nameClass = '';
    if (p.name === realDrawerName)       nameClass = 'name-real';
    else if (p.name === decoyDrawerName) nameClass = 'name-decoy';
    row.innerHTML =
      `<span class="${nameClass}">${escapeHtml(p.name)}</span>`
      + `<span class="score-delta">${escapeHtml(p.delta)}</span>`
      + `<span class="score-val">${p.score} pts</span>`;
    scoreList.appendChild(row);
  });

  const nextBtn     = document.getElementById('next-round-btn');
  const waitingText = document.getElementById('next-round-waiting');
  nextBtn.textContent = round >= totalRounds ? 'See Final Scores →' : 'Next Round →';
  nextBtn.disabled = false;
  nextBtn.classList.remove('hidden');
  waitingText.textContent = '';

  showScreen('screen-reveal');
});

socket.on('game-over', ({ scores, totalPlayers }) => {
  const container = document.getElementById('final-scores');
  container.innerHTML = '';
  scores.forEach((p, i) => {
    const row   = document.createElement('div');
    row.className = 'final-score-row';
    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
    row.innerHTML =
      `<span>${medal}${escapeHtml(p.name)}</span>`
      + `<span class="final-score-val">${p.score} pts</span>`;
    container.appendChild(row);
  });

  // Everyone sees the button; after clicking it shows a waiting counter
  const playAgainBtn  = document.getElementById('play-again-btn');
  const playAgainWait = document.getElementById('play-again-wait');
  playAgainBtn.disabled = false;
  playAgainBtn.classList.remove('hidden');
  playAgainWait.textContent = '';
  playAgainWait.classList.add('hidden');

  showScreen('screen-gameover');
});

socket.on('play-again-voted', ({ readyCount, totalCount }) => {
  const playAgainWait = document.getElementById('play-again-wait');
  playAgainWait.textContent = `Waiting for other players… (${readyCount} / ${totalCount} ready)`;
  playAgainWait.classList.remove('hidden');
});

socket.on('next-round-voted', ({ readyCount, totalCount }) => {
  document.getElementById('next-round-waiting').textContent =
    `Waiting for other players… (${readyCount} / ${totalCount} ready)`;
});

socket.on('back-to-lobby', () => {
  // Reset play-again button state for the next game-over
  const playAgainBtn = document.getElementById('play-again-btn');
  playAgainBtn.disabled = false;
  playAgainBtn.classList.add('hidden');
  document.getElementById('play-again-wait').classList.add('hidden');
  showScreen('screen-waiting');
});

socket.on('player-left', ({ players, hostId }) => {
  isHost = socket.id === hostId;
  buildWaitingPlayerList(players, hostId);
});

socket.on('error-message', (msg) => {
  // Route to whichever error element is on the currently active screen
  const onWaiting = document.getElementById('screen-waiting').classList.contains('active');
  const errEl = document.getElementById(onWaiting ? 'waiting-error' : 'lobby-error');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
});

// ── Button wiring ─────────────────────────────────────────────────────────────

document.getElementById('create-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) return;
  document.getElementById('lobby-error').classList.add('hidden');
  socket.emit('create-room', { playerName: name, totalRounds: 5 });
});

document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!name || !code) return;
  document.getElementById('lobby-error').classList.add('hidden');
  socket.emit('join-room', { playerName: name, roomCode: code });
});

document.getElementById('room-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('join-btn').click();
});

document.getElementById('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('create-btn').click();
});

document.getElementById('start-btn').addEventListener('click', () => {
  socket.emit('start-game');
});

document.getElementById('submit-guess-btn').addEventListener('click', () => {
  const input = document.getElementById('guess-input');
  const guess = input.value.trim();
  if (!guess) return;
  socket.emit('submit-guess', { guess });
  input.value = '';
});

document.getElementById('guess-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('submit-guess-btn').click();
});

document.getElementById('next-round-btn').addEventListener('click', () => {
  const btn = document.getElementById('next-round-btn');
  btn.disabled = true;
  document.getElementById('next-round-waiting').textContent = 'Waiting for other players…';
  socket.emit('next-round');
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  document.getElementById('play-again-btn').disabled = true;
  document.getElementById('play-again-wait').textContent = 'Waiting for other players…';
  document.getElementById('play-again-wait').classList.remove('hidden');
  socket.emit('play-again');
});

document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
  location.reload();
});

// ── Init ──────────────────────────────────────────────────────────────────────
buildColorPalette();
buildBrushSizes();
buildBrushTypes();