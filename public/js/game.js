'use strict';

const socket = io();

// state
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

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelector('header').classList.toggle('compact', id === 'screen-game');
}

// sanitize user strings before injecting into innerHTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const canvasReal  = document.getElementById('canvas-real');
const canvasDecoy = document.getElementById('canvas-decoy');
const ctxReal     = canvasReal.getContext('2d');
const ctxDecoy    = canvasDecoy.getContext('2d');
const eventCanvas = canvasDecoy; // decoy is on top and catches pointer events

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

  // draw locally first for instant feedback
  if (isErasing) {
    myCtx.save();
    myCtx.globalCompositeOperation = 'destination-out';
    drawSegment(myCtx, lastX, lastY, x, y, 'rgba(0,0,0,1)', currentSize);
    myCtx.restore();
  } else {
    drawSegment(myCtx, lastX, lastY, x, y, currentColor, currentSize);
  }

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

const COLORS = [
  '#000000', '#ffffff',
  '#6b7280', '#d1d5db',
  '#dc2626', '#f87171', '#e8609a', '#f9a8d4',
  '#f97316', '#fbbf24', '#facc15',
  '#16a34a', '#4ade80', '#84cc16',
  '#2563eb', '#60a5fa', '#0ea5e9', '#7c3aed', '#a78bfa',
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
      setErasing(false); // picking a colour switches back to pencil
    });
    palette.appendChild(swatch);
  });
}

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
    const dot = document.createElement('span');
    dot.className = 'brush-dot';
    const dotPx = Math.round(4 + size * 0.9);
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
  currentSize = BRUSH_SIZES[1].size;
}

// brush type toggle
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

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

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

function setupGameScreen(data) {
  const { round, totalRounds, realDrawer, decoyDrawer, timer, players } = data;

  document.getElementById('game-round').textContent = `Round ${round} / ${totalRounds}`;

  const timerEl = document.getElementById('timer-display');
  timerEl.textContent = formatTimer(timer);
  timerEl.classList.remove('urgent');
  if (timerAnimFrame !== null) { cancelAnimationFrame(timerAnimFrame); timerAnimFrame = null; }
  timerEl.style.color = '';

  ctxReal.clearRect(0, 0, canvasReal.width, canvasReal.height);
  ctxDecoy.clearRect(0, 0, canvasDecoy.width, canvasDecoy.height);
  isErasing = false;
  setErasing(false);
  document.getElementById('guess-feed').innerHTML = '';

  if      (socket.id === realDrawer)  myRole = 'real';
  else if (socket.id === decoyDrawer) myRole = 'decoy';
  else                                myRole = 'guesser';

  canDraw  = myRole === 'real' || myRole === 'decoy';
  myCanvas = myRole === 'real'  ? canvasReal  : myRole === 'decoy' ? canvasDecoy : null;
  myCtx    = myRole === 'real'  ? ctxReal     : myRole === 'decoy' ? ctxDecoy    : null;

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

  document.getElementById('drawing-tools').classList.toggle('hidden', !canDraw);
  document.getElementById('guess-area').classList.toggle('hidden', canDraw);

  // re-enable guess input in case it was locked after a correct guess last round
  const guessInput = document.getElementById('guess-input');
  const guessBtn   = document.getElementById('submit-guess-btn');
  guessInput.value    = '';
  guessInput.disabled = false;
  guessBtn.disabled   = false;

  const promptBox = document.getElementById('prompt-box');
  promptBox.classList.add('hidden');
  promptBox.classList.toggle('decoy', myRole === 'decoy');
  document.getElementById('prompt-text').textContent = '';

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

// socket events

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

// white → orange → red over the last 20 seconds
function timerColor(t) {
  if (t >= 20) return [255, 255, 254];
  if (t >= 10) {
    const f = (20 - t) / 10;
    return [
      Math.round(255 + (249 - 255) * f),
      Math.round(255 + (115 - 255) * f),
      Math.round(254 + (22  - 254) * f),
    ];
  }
  const f = (10 - t) / 10;
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
  const onWaiting = document.getElementById('screen-waiting').classList.contains('active');
  const errEl = document.getElementById(onWaiting ? 'waiting-error' : 'lobby-error');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
});

// button wiring

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

// init
buildColorPalette();
buildBrushSizes();
buildBrushTypes();