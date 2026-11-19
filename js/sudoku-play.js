(function () {
  'use strict';

  const E = window.SudokuEngine;
  const G = window.SudokuGenerator;
  const BoardView = window.SudokuBoard;
  if (!E || !G || !BoardView) throw new Error('数独实战所需模块未加载');

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const KEYS = {
    session: 'sudoku.play.session.v1',
    stats: 'sudoku.play.stats.v1',
    settings: 'sudoku.play.settings.v1',
  };
  const SESSION_VERSION = 1;
  const DAILY_DIFFICULTY = 'medium';

  const els = {
    board: $('#playBoard'),
    playKicker: $('#playKicker'),
    playTitle: $('#playTitle'),
    playTimer: $('#playTimer'),
    fillCount: $('#fillCount'),
    conflictCount: $('#conflictCount'),
    hintCount: $('#hintCount'),
    bestTime: $('#bestTime'),
    boardVeil: $('#boardVeil'),
    veilStart: $('#veilStart'),
    pauseVeil: $('#pauseVeil'),
    resumeBtn: $('#resumeBtn'),
    pauseBtn: $('#pauseBtn'),
    pauseLabel: $('#pauseLabel'),
    pauseGlyph: $('#pauseGlyph'),
    newGameBtn: $('#newGameBtn'),
    dailyNav: $('#dailyNav'),
    clueMeta: $('#clueMeta'),
    sourceMeta: $('#sourceMeta'),
    exportBtn: $('#exportBtn'),
    restartBtn: $('#restartBtn'),
    modeDigit: $('#modeDigit'),
    modeNote: $('#modeNote'),
    numberPad: $('#numberPad'),
    undoBtn: $('#undoBtn'),
    eraseBtn: $('#eraseBtn'),
    checkBtn: $('#checkBtn'),
    hintBtn: $('#hintBtn'),
    hintPanel: $('#hintPanel'),
    hintLevel: $('#hintLevel'),
    hintTitle: $('#hintTitle'),
    hintText: $('#hintText'),
    hintNext: $('#hintNext'),
    closeHint: $('#closeHint'),
    totalDone: $('#totalDone'),
    streakDays: $('#streakDays'),
    dailyStatus: $('#dailyStatus'),
    startModal: $('#startModal'),
    closeStart: $('#closeStart'),
    resumeCard: $('#resumeCard'),
    resumeTitle: $('#resumeTitle'),
    resumeMeta: $('#resumeMeta'),
    dailyStart: $('#dailyStart'),
    dailyDate: $('#dailyDate'),
    dailyHint: $('#dailyHint'),
    startDifficulties: $('#startDifficulties'),
    startStats: $('#startStats'),
    resetStats: $('#resetStats'),
    resultModal: $('#resultModal'),
    closeResult: $('#closeResult'),
    resultTitle: $('#resultTitle'),
    resultTime: $('#resultTime'),
    resultSub: $('#resultSub'),
    resultStats: $('#resultStats'),
    againBtn: $('#againBtn'),
    reviewBtn: $('#reviewBtn'),
    downloadCard: $('#downloadCard'),
    copyShare: $('#copyShare'),
    exportResult: $('#exportResult'),
    toast: $('#toast'),
  };

  const state = {
    session: null,
    stats: loadStats(),
    settings: loadSettings(),
    selected: -1,
    conflicts: new Set(),
    hint: null,
    activeModal: null,
    lastFocus: null,
    ticker: null,
    saveTimer: null,
    lastTickSave: 0,
    busy: false,
  };

  const boardView = new BoardView(els.board, {
    onCellClick(index) {
      selectCell(index);
    },
  });

  /* ------------------------------- utilities -------------------------------- */
  const pad2 = (n) => String(n).padStart(2, '0');

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  }

  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function dateLabel(date = new Date()) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}\n${weekdays[date.getDay()]}`;
  }

  function isYesterday(previous, current) {
    if (!previous) return false;
    const d = new Date(`${previous}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return localDateKey(d) === current;
  }

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function difficultyById(id) {
    return G.difficultyById(id);
  }

  function getBest(difficultyId) {
    const item = state.stats.perDifficulty[difficultyId];
    return item && item.bestMs ? item.bestMs : null;
  }

  function getCompleted(difficultyId) {
    const item = state.stats.perDifficulty[difficultyId];
    return item ? item.completed : 0;
  }

  function countFilled(grid) {
    return grid.reduce((n, v) => n + (v ? 1 : 0), 0);
  }

  function emptyCount(grid) {
    return 81 - countFilled(grid);
  }

  function findFirstEmpty(grid) {
    for (let i = 0; i < 81; i++) if (!grid[i]) return i;
    return -1;
  }

  function isPlaying() {
    return Boolean(state.session) && state.session.status === 'playing' && !state.activeModal;
  }

  /* --------------------------------- storage -------------------------------- */
  function defaultStats() {
    const perDifficulty = {};
    G.DIFFICULTIES.forEach((difficulty) => {
      perDifficulty[difficulty.id] = { completed: 0, bestMs: null, hints: 0 };
    });
    return {
      version: 1,
      completed: 0,
      hints: 0,
      perDifficulty,
      daily: {
        lastDate: null,
        streak: 0,
        bestStreak: 0,
        lastMs: null,
        lastHints: null,
      },
    };
  }

  function loadStats() {
    const base = defaultStats();
    try {
      const raw = window.localStorage.getItem(KEYS.stats);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return base;
      base.completed = Number(parsed.completed) || 0;
      base.hints = Number(parsed.hints) || 0;
      G.DIFFICULTIES.forEach((difficulty) => {
        const item = parsed.perDifficulty && parsed.perDifficulty[difficulty.id];
        if (item) {
          base.perDifficulty[difficulty.id] = {
            completed: Number(item.completed) || 0,
            bestMs: Number(item.bestMs) || null,
            hints: Number(item.hints) || 0,
          };
        }
      });
      if (parsed.daily) {
        base.daily = {
          lastDate: parsed.daily.lastDate || null,
          streak: Number(parsed.daily.streak) || 0,
          bestStreak: Number(parsed.daily.bestStreak) || 0,
          lastMs: Number(parsed.daily.lastMs) || null,
          lastHints: parsed.daily.lastHints == null ? null : Number(parsed.daily.lastHints),
        };
      }
      return base;
    } catch (error) {
      return base;
    }
  }

  function saveStats() {
    try { window.localStorage.setItem(KEYS.stats, JSON.stringify(state.stats)); } catch (error) { /* ignore */ }
  }

  function loadSettings() {
    const base = { mode: 'digit' };
    try {
      const parsed = JSON.parse(window.localStorage.getItem(KEYS.settings) || '{}');
      if (parsed.mode === 'note' || parsed.mode === 'digit') base.mode = parsed.mode;
    } catch (error) { /* ignore */ }
    return base;
  }

  function saveSettings() {
    try { window.localStorage.setItem(KEYS.settings, JSON.stringify(state.settings)); } catch (error) { /* ignore */ }
  }

  function sanitizeSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.grid) || !Array.isArray(snapshot.notes)) return null;
    if (snapshot.grid.length !== 81 || snapshot.notes.length !== 81) return null;
    return {
      grid: snapshot.grid.map((v) => Number(v) || 0),
      notes: snapshot.notes.map((v) => Number(v) || 0),
      selected: Number.isInteger(snapshot.selected) ? snapshot.selected : -1,
    };
  }

  function loadSession() {
    try {
      const raw = window.localStorage.getItem(KEYS.session);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SESSION_VERSION || !parsed.puzzle) return null;
      const givens = Array.from(E.parsePuzzle(parsed.puzzle));
      if (!Array.isArray(parsed.grid) || parsed.grid.length !== 81) return null;
      const grid = parsed.grid.map((v) => Number(v) || 0);
      for (let i = 0; i < 81; i++) if (givens[i]) grid[i] = givens[i];
      const notes = Array.isArray(parsed.notes) && parsed.notes.length === 81
        ? parsed.notes.map((v) => Number(v) || 0)
        : new Array(81).fill(0);
      for (let i = 0; i < 81; i++) if (grid[i]) notes[i] = 0;
      const difficulty = difficultyById(parsed.difficulty && parsed.difficulty.id);
      let elapsedMs = Number(parsed.elapsedMs) || 0;
      let status = parsed.status === 'completed' ? 'completed' : parsed.status === 'playing' ? 'playing' : 'paused';
      if (status === 'playing' && parsed.runningSince) {
        elapsedMs += Math.max(0, Math.min(Date.now() - Number(parsed.runningSince), 12 * 3600 * 1000));
      }
      if (status === 'playing') status = 'paused';
      if (status === 'completed' && !E.isSolved(Uint8Array.from(grid))) status = 'paused';
      const undo = Array.isArray(parsed.undo)
        ? parsed.undo.map(sanitizeSnapshot).filter(Boolean).slice(-100)
        : [];
      return {
        version: SESSION_VERSION,
        puzzle: parsed.puzzle,
        id: parsed.id || `SD-${difficulty.id.toUpperCase()}`,
        seed: Number(parsed.seed) || null,
        difficulty: { id: difficulty.id, name: difficulty.name },
        daily: Boolean(parsed.daily),
        dailyKey: parsed.dailyKey || null,
        givens,
        grid,
        notes,
        elapsedMs,
        timerStarted: Boolean(parsed.timerStarted),
        runningSince: null,
        status,
        hintsUsed: Number(parsed.hintsUsed) || 0,
        undo,
        createdAt: parsed.createdAt || new Date().toISOString(),
        completedAt: parsed.completedAt || null,
      };
    } catch (error) {
      return null;
    }
  }

  function saveSession() {
    clearTimeout(state.saveTimer);
    if (!state.session) {
      try { window.localStorage.removeItem(KEYS.session); } catch (error) { /* ignore */ }
      return;
    }
    try {
      window.localStorage.setItem(KEYS.session, JSON.stringify(state.session));
    } catch (error) { /* ignore */ }
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveSession, 120);
  }

  /* --------------------------------- modals --------------------------------- */
  function openModal(modal, focusSelector) {
    state.lastFocus = document.activeElement;
    state.activeModal = modal;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const preferred = focusSelector ? modal.querySelector(focusSelector) : null;
      const target = preferred || modal.querySelector('button:not(:disabled)');
      if (target) target.focus();
    });
  }

  function closeModal(options = {}) {
    const modal = state.activeModal;
    if (!modal) return;
    modal.hidden = true;
    state.activeModal = null;
    document.body.style.overflow = '';
    if (options.restoreFocus !== false && state.lastFocus && typeof state.lastFocus.focus === 'function') {
      state.lastFocus.focus();
    }
  }

  function trapFocus(event) {
    if (!state.activeModal || event.key !== 'Tab') return;
    const focusable = $$('button:not(:disabled), a[href], input, [tabindex]:not([tabindex="-1"])', state.activeModal)
      .filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* --------------------------------- timer ---------------------------------- */
  function elapsedNow() {
    if (!state.session) return 0;
    return state.session.elapsedMs
      + (state.session.runningSince ? Math.max(0, Date.now() - state.session.runningSince) : 0);
  }

  function updateTimerDisplay() {
    els.playTimer.textContent = formatTime(elapsedNow());
  }

  function startTicker() {
    if (!state.session || state.session.status !== 'playing' || !state.session.timerStarted) return;
    if (!state.session.runningSince) state.session.runningSince = Date.now();
    if (state.ticker) return;
    state.ticker = setInterval(() => {
      updateTimerDisplay();
      if (Date.now() - state.lastTickSave > 5000) {
        state.lastTickSave = Date.now();
        saveSession();
      }
    }, 250);
    updateTimerDisplay();
  }

  function stopTicker() {
    clearInterval(state.ticker);
    state.ticker = null;
  }

  function commitTimer() {
    if (!state.session) return;
    if (state.session.runningSince) {
      state.session.elapsedMs += Math.max(0, Date.now() - state.session.runningSince);
      state.session.runningSince = null;
    }
    stopTicker();
    updateTimerDisplay();
  }

  function startTimerIfNeeded() {
    if (!state.session || state.session.status !== 'playing') return;
    if (!state.session.timerStarted) {
      state.session.timerStarted = true;
      state.lastTickSave = Date.now();
      startTicker();
      updateControls();
      scheduleSave();
    }
  }

  function pauseGame(silent = false) {
    if (!state.session || state.session.status !== 'playing') return;
    commitTimer();
    state.session.status = 'paused';
    state.hint = null;
    els.hintPanel.hidden = true;
    renderBoard();
    if (!silent) showToast('已暂停');
    updatePauseVeil();
    updateControls();
    scheduleSave();
  }

  function focusSelectedCell() {
    if (state.session && state.selected >= 0) {
      requestAnimationFrame(() => boardView.focusCell(state.selected));
    }
  }

  function resumeGame() {
    if (!state.session || state.session.status !== 'paused') return;
    state.session.status = 'playing';
    updatePauseVeil();
    startTicker();
    updateControls();
    focusSelectedCell();
    scheduleSave();
  }

  function togglePause() {
    if (!state.session) return;
    if (state.session.status === 'completed') {
      showResult(state.session.elapsedMs);
      return;
    }
    if (state.session.status === 'paused') resumeGame();
    else if (state.session.timerStarted) pauseGame();
    else showToast('先填一格，计时就会开始');
  }

  /* ------------------------------- game state -------------------------------- */
  function pushUndo() {
    if (!state.session) return;
    state.session.undo.push({
      grid: state.session.grid.slice(),
      notes: state.session.notes.slice(),
      selected: state.selected,
    });
    if (state.session.undo.length > 100) state.session.undo.shift();
  }

  function computeConflicts(grid) {
    const conflicts = new Set();
    E.UNITS.forEach((unit) => {
      const seen = new Map();
      unit.cells.forEach((idx) => {
        const value = grid[idx];
        if (!value) return;
        if (seen.has(value)) {
          conflicts.add(seen.get(value));
          conflicts.add(idx);
        } else {
          seen.set(value, idx);
        }
      });
    });
    return conflicts;
  }

  function updateConflicts() {
    state.conflicts = state.session ? computeConflicts(state.session.grid) : new Set();
  }

  function selectedPeerSet() {
    if (state.selected < 0) return new Set();
    return new Set(E.PEERS[state.selected]);
  }

  function selectedSameSet() {
    if (!state.session || state.selected < 0) return new Set();
    const value = state.session.grid[state.selected];
    if (!value) return new Set();
    const set = new Set();
    state.session.grid.forEach((v, idx) => {
      if (v === value) set.add(idx);
    });
    return set;
  }

  function hintAreaSet() {
    const area = new Set();
    if (!state.hint) return area;
    (state.hint.step.highlights.units || []).forEach((unit) => unit.cells.forEach((idx) => area.add(idx)));
    return area;
  }

  function hintFocusSet() {
    if (!state.hint || state.hint.stage < 2) return new Set();
    return new Set(state.hint.step.highlights.focus || []);
  }

  function renderBoard() {
    if (!state.session) {
      boardView.render({
        grid: new Array(81).fill(0),
        givens: new Array(81).fill(0),
        cands: new Uint16Array(81),
        activeIndex: -1,
        highlights: {},
      });
      return;
    }
    const highlights = {
      selected: state.selected >= 0 ? [state.selected] : [],
      peer: selectedPeerSet(),
      same: selectedSameSet(),
      conflict: state.conflicts,
      hint: hintFocusSet(),
      'hint-area': hintAreaSet(),
    };
    boardView.render({
      grid: state.session.grid,
      givens: state.session.givens,
      cands: state.session.notes,
      activeIndex: state.selected,
      highlights,
    });
  }

  function renderNumberPad() {
    const buttons = $$('.num-key', els.numberPad);
    const disabled = !state.session || state.session.status !== 'playing' || Boolean(state.activeModal);
    buttons.forEach((button) => {
      const digit = Number(button.dataset.digit);
      const used = state.session ? state.session.grid.filter((v) => v === digit).length : 0;
      const left = Math.max(0, 9 - used);
      button.querySelector('.num-left').textContent = left ? `${left}` : '✓';
      button.classList.toggle('is-done', left === 0);
      button.disabled = disabled;
    });
  }

  function updatePauseVeil() {
    const paused = Boolean(state.session) && state.session.status === 'paused';
    els.pauseVeil.hidden = !paused;
    els.boardVeil.hidden = Boolean(state.session);
  }

  function updateControls() {
    const has = Boolean(state.session);
    const playing = has && state.session.status === 'playing' && !state.activeModal;
    const completed = has && state.session.status === 'completed';
    const paused = has && state.session.status === 'paused';
    const started = has && state.session.timerStarted;

    els.pauseBtn.disabled = !has || (!completed && !paused && !started);
    els.pauseLabel.textContent = completed ? '成绩' : paused ? '继续' : '暂停';
    els.pauseGlyph.textContent = completed ? '★' : paused ? '▶' : 'Ⅱ';

    els.undoBtn.disabled = !playing || !state.session.undo.length;
    els.eraseBtn.disabled = !playing;
    els.checkBtn.disabled = !playing;
    els.hintBtn.disabled = !playing;
    els.exportBtn.disabled = !has;
    els.restartBtn.disabled = !has;
    els.modeDigit.disabled = !playing;
    els.modeNote.disabled = !playing;

    els.modeDigit.classList.toggle('is-active', state.settings.mode === 'digit');
    els.modeNote.classList.toggle('is-active', state.settings.mode === 'note');
    els.modeDigit.setAttribute('aria-pressed', String(state.settings.mode === 'digit'));
    els.modeNote.setAttribute('aria-pressed', String(state.settings.mode === 'note'));

    const hintStage = state.hint ? state.hint.stage : 0;
    els.hintBtn.textContent = hintStage === 1 ? '再提示' : hintStage === 2 ? '应用提示' : '提示';
    renderNumberPad();
    updatePauseVeil();
  }

  function updateStatsBar() {
    if (!state.session) {
      els.fillCount.textContent = '0 / 81';
      els.conflictCount.textContent = '0';
      els.hintCount.textContent = '0';
      els.bestTime.textContent = '—';
      return;
    }
    els.fillCount.textContent = `${countFilled(state.session.grid)} / 81`;
    els.conflictCount.textContent = String(state.conflicts.size);
    els.hintCount.textContent = String(state.session.hintsUsed);
    const best = getBest(state.session.difficulty.id);
    els.bestTime.textContent = best ? formatTime(best) : '—';
  }

  function updateSideStats() {
    els.totalDone.textContent = String(state.stats.completed || 0);
    els.streakDays.textContent = `${state.stats.daily.streak || 0} 天`;
    const today = localDateKey();
    if (state.stats.daily.lastDate === today && state.stats.daily.lastMs) {
      els.dailyStatus.textContent = `完成 · ${formatTime(state.stats.daily.lastMs)}`;
    } else {
      els.dailyStatus.textContent = '未完成';
    }
  }

  function renderGameMeta() {
    if (!state.session) {
      els.playKicker.textContent = 'PRACTICE MODE';
      els.playTitle.textContent = '准备开局';
      els.clueMeta.textContent = '—';
      els.sourceMeta.textContent = '—';
      return;
    }
    const givens = state.session.givens.reduce((n, v) => n + (v ? 1 : 0), 0);
    const empties = 81 - givens;
    els.playKicker.textContent = state.session.daily
      ? `DAILY · ${state.session.dailyKey}`
      : `PRACTICE · ${state.session.id}`;
    els.playTitle.textContent = state.session.daily
      ? `每日一题 · ${state.session.difficulty.name}`
      : `${state.session.difficulty.name} · 随机题`;
    els.clueMeta.textContent = `${givens} 个已知数 · ${empties} 个空格`;
    els.sourceMeta.textContent = state.session.daily ? '每日一题' : `#${state.session.id}`;
  }

  function renderAll() {
    updateConflicts();
    renderGameMeta();
    renderBoard();
    updateStatsBar();
    updateControls();
    updateSideStats();
    updateTimerDisplay();
    if (state.hint) renderHintPanel();
    else els.hintPanel.hidden = true;
  }

  /* ------------------------------- selection/input --------------------------- */
  function selectCell(index) {
    if (!state.session) {
      openStartModal();
      return;
    }
    if (state.session.status === 'paused') {
      showToast('先继续这一局');
      return;
    }
    if (state.session.status === 'completed') return;
    state.selected = index;
    renderBoard();
    boardView.focusCell(index);
  }

  function moveSelection(deltaRow, deltaCol) {
    if (!isPlaying()) return;
    let index = state.selected;
    if (index < 0) index = findFirstEmpty(state.session.grid);
    if (index < 0) index = 0;
    const r = Math.min(8, Math.max(0, Math.floor(index / 9) + deltaRow));
    const c = Math.min(8, Math.max(0, (index % 9) + deltaCol));
    selectCell(r * 9 + c);
  }

  function ensureSelected() {
    if (!state.session) return -1;
    if (state.selected >= 0) return state.selected;
    const first = findFirstEmpty(state.session.grid);
    state.selected = first >= 0 ? first : -1;
    return state.selected;
  }

  function clearHint() {
    if (!state.hint) return;
    state.hint = null;
    els.hintPanel.hidden = true;
    renderBoard();
    updateControls();
  }

  function inputDigit(digit) {
    if (!isPlaying()) return;
    const idx = ensureSelected();
    if (idx < 0) return;
    if (state.session.givens[idx]) {
      showToast('这是已知数，不能修改');
      return;
    }

    const isNote = state.settings.mode === 'note';
    if (isNote) {
      if (state.session.grid[idx]) {
        showToast('先擦除已填数字，再记笔记');
        return;
      }
      pushUndo();
      state.session.notes[idx] ^= E.BITS[digit];
      clearHint();
      startTimerIfNeeded();
      scheduleSave();
      renderBoard();
      updateStatsBar();
      updateControls();
      return;
    }

    if (state.session.grid[idx] === digit) {
      pushUndo();
      state.session.grid[idx] = 0;
      state.session.notes[idx] = 0;
      clearHint();
      startTimerIfNeeded();
      updateConflicts();
      renderAll();
      scheduleSave();
      return;
    }

    pushUndo();
    clearHint();
    state.session.grid[idx] = digit;
    state.session.notes[idx] = 0;
    for (const peer of E.PEERS[idx]) {
      state.session.notes[peer] &= ~E.BITS[digit];
    }
    startTimerIfNeeded();
    updateConflicts();
    renderAll();
    scheduleSave();
    checkComplete();
  }

  function eraseCell() {
    if (!isPlaying()) return;
    const idx = ensureSelected();
    if (idx < 0 || state.session.givens[idx]) return;
    if (!state.session.grid[idx] && !state.session.notes[idx]) return;
    pushUndo();
    state.session.grid[idx] = 0;
    state.session.notes[idx] = 0;
    clearHint();
    startTimerIfNeeded();
    updateConflicts();
    renderAll();
    scheduleSave();
  }

  function undoMove() {
    if (!isPlaying() || !state.session.undo.length) return;
    const snapshot = state.session.undo.pop();
    state.session.grid = snapshot.grid.slice();
    state.session.notes = snapshot.notes.slice();
    state.selected = snapshot.selected;
    clearHint();
    updateConflicts();
    renderAll();
    scheduleSave();
  }

  function setMode(mode) {
    if (!state.session || state.session.status !== 'playing') return;
    if (mode !== 'digit' && mode !== 'note') return;
    state.settings.mode = mode;
    saveSettings();
    updateControls();
  }

  function checkBoard() {
    if (!isPlaying()) return;
    updateConflicts();
    if (state.conflicts.size) {
      showToast(`有 ${state.conflicts.size} 个格子存在冲突`);
      const first = state.conflicts.values().next().value;
      if (Number.isInteger(first)) selectCell(first);
      return;
    }
    const empties = emptyCount(state.session.grid);
    if (empties) {
      showToast(`目前没有冲突，还剩 ${empties} 格`);
      return;
    }
    finishGame();
  }

  function checkComplete() {
    if (!state.session || state.session.status === 'completed') return;
    if (emptyCount(state.session.grid) === 0 && state.conflicts.size === 0) finishGame();
  }

  /* ---------------------------------- hints --------------------------------- */
  function hintUnitNames(step) {
    const units = (step.highlights.units || []).slice(0, 2);
    if (!units.length) return '高亮格';
    return units.map((unit) => E.unitName(unit)).join('、');
  }

  function requestHint() {
    if (!isPlaying()) return;
    updateConflicts();
    if (state.conflicts.size) {
      showToast('先处理盘面冲突，再看提示');
      return;
    }
    let step;
    try {
      const parsed = E.parsePuzzle(state.session.grid.join(''));
      if (!E.solveGrid(parsed)) {
        showToast('当前填法已经无解，先撤销几步再提示');
        return;
      }
      step = E.nextStep(state.session.grid.join(''));
    } catch (error) {
      showToast(error.message || '当前盘面暂时无法分析');
      return;
    }
    if (!step) {
      showToast('盘面已经完成');
      return;
    }
    startTimerIfNeeded();
    state.session.hintsUsed += 1;
    state.hint = { step, stage: 1 };
    renderHintPanel();
    renderBoard();
    updateStatsBar();
    updateControls();
    scheduleSave();
  }

  function advanceHint() {
    if (!state.hint) { requestHint(); return; }
    if (state.hint.stage === 1) {
      state.hint.stage = 2;
      renderHintPanel();
      renderBoard();
      updateControls();
      return;
    }
    if (state.hint.stage === 2) applyHint();
  }

  function applyHint() {
    if (!state.hint || !isPlaying()) return;
    const step = state.hint.step;
    pushUndo();
    let message = '';
    if (step.action.type === 'place') {
      const idx = step.action.idx;
      if (!state.session.givens[idx]) {
        state.session.grid[idx] = step.action.value;
        state.session.notes[idx] = 0;
        for (const peer of E.PEERS[idx]) state.session.notes[peer] &= ~E.BITS[step.action.value];
        state.selected = idx;
        message = `已填入 ${E.CELL(idx)} = ${step.action.value}`;
      }
    } else {
      let changed = 0;
      step.action.changes.forEach((change) => {
        const before = state.session.notes[change.idx];
        state.session.notes[change.idx] &= ~change.values.reduce((mask, value) => mask | E.BITS[value], 0);
        if (before !== state.session.notes[change.idx]) changed++;
      });
      message = changed ? `已清理 ${changed} 格的相关笔记` : '这一步的候选已经比较干净了';
    }
    state.hint = null;
    els.hintPanel.hidden = true;
    startTimerIfNeeded();
    updateConflicts();
    renderAll();
    scheduleSave();
    showToast(message);
    checkComplete();
  }

  function renderHintPanel() {
    if (!state.hint) {
      els.hintPanel.hidden = true;
      return;
    }
    const { step, stage } = state.hint;
    const bars = $$('.hint-progress i', els.hintPanel);
    bars.forEach((bar, index) => bar.classList.toggle('is-on', index < stage));
    els.hintLevel.textContent = `提示 ${stage} / 3`;
    if (stage === 1) {
      els.hintTitle.textContent = `先看${hintUnitNames(step)}`;
      els.hintText.textContent = '线索就在高亮区域里。再点一次提示，会说明用了什么技巧；第三次才会替你落子。';
      els.hintNext.textContent = '再提示一点';
    } else {
      els.hintTitle.textContent = step.technique;
      els.hintText.textContent = `${step.title}。${step.summary}`;
      els.hintNext.textContent = '应用这一步';
    }
    els.hintPanel.hidden = false;
  }

  /* --------------------------------- start flow ------------------------------ */
  function renderStartModal() {
    const resumable = state.session && state.session.status !== 'completed';
    els.resumeCard.hidden = !resumable;
    els.closeStart.hidden = !state.session;
    if (resumable) {
      const filled = countFilled(state.session.grid);
      els.resumeTitle.textContent = `继续 · ${state.session.difficulty.name}`;
      els.resumeMeta.textContent = `${filled} / 81 已填 · 用时 ${formatTime(state.session.elapsedMs)}`;
    }

    const today = localDateKey();
    els.dailyDate.textContent = dateLabel();
    if (state.stats.daily.lastDate === today && state.stats.daily.lastMs) {
      els.dailyHint.textContent = `今日已完成 ${formatTime(state.stats.daily.lastMs)} · 连续 ${state.stats.daily.streak} 天`;
    } else if (state.stats.daily.streak) {
      els.dailyHint.textContent = `已连续 ${state.stats.daily.streak} 天，今天还没完成。`;
    } else {
      els.dailyHint.textContent = '同一天同一道题，完成后累计连续打卡。';
    }

    els.startDifficulties.innerHTML = G.DIFFICULTIES.map((difficulty) => {
      const best = getBest(difficulty.id);
      const completed = getCompleted(difficulty.id);
      return `
        <button class="start-diff" type="button" data-start-diff="${difficulty.id}">
          <span class="start-diff-top"><b>${escapeHtml(difficulty.name)}</b><span>约 ${difficulty.target} 线索</span></span>
          <small>${best ? `最佳 ${formatTime(best)} · 已完成 ${completed} 局` : `尚未完成 · 约 ${difficulty.target} 个已知数`}</small>
        </button>`;
    }).join('');

    els.startStats.innerHTML = `已完成 <b>${state.stats.completed || 0}</b> 局 · 累计提示 <b>${state.stats.hints || 0}</b> 次 · 连续打卡 <b>${state.stats.daily.streak || 0}</b> 天`;
  }

  function openStartModal(options = {}) {
    if (state.session && state.session.status === 'playing' && options.pause !== false) pauseGame(true);
    renderStartModal();
    openModal(els.startModal, state.session && state.session.status !== 'completed' ? '#resumeCard' : '#dailyStart');
    updateControls();
  }

  function closeStartModal() {
    if (!state.session) return;
    closeModal();
    updateControls();
  }

  function startNewGame(options = {}) {
    if (state.busy) return;
    const difficulty = difficultyById(options.difficulty || DAILY_DIFFICULTY);
    const daily = Boolean(options.daily);
    const today = localDateKey();
    state.busy = true;
    stopTicker();
    try {
      const seed = daily ? hashString(`sudoku-daily-${today}-${difficulty.id}`) : undefined;
      const generated = G.generatePuzzle({ difficulty: difficulty.id, seed });
      const givens = Array.from(E.parsePuzzle(generated.puzzle));
      const grid = givens.slice();
      state.session = {
        version: SESSION_VERSION,
        puzzle: generated.puzzle,
        id: generated.id,
        seed: generated.seed,
        difficulty: { id: difficulty.id, name: difficulty.name },
        daily,
        dailyKey: daily ? today : null,
        givens,
        grid,
        notes: new Array(81).fill(0),
        elapsedMs: 0,
        timerStarted: false,
        runningSince: null,
        status: 'playing',
        hintsUsed: 0,
        undo: [],
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      state.selected = findFirstEmpty(grid);
      state.conflicts = new Set();
      state.hint = null;
      state.settings.mode = 'digit';
      saveSettings();
      els.hintPanel.hidden = true;
      closeModal({ restoreFocus: false });
      saveSession();
      renderAll();
      updateControls();
      renderStartModal();
      window.scrollTo({ top: 0, behavior: 'auto' });
      const first = state.selected;
      if (first >= 0) requestAnimationFrame(() => boardView.focusCell(first));
      showToast(daily ? '每日一题已开始' : `${difficulty.name}随机题已开始`);
    } catch (error) {
      showToast(error.message || '生成题目失败，请重试');
    } finally {
      state.busy = false;
    }
  }

  function continueSavedGame() {
    if (!state.session || state.session.status === 'completed') return;
    closeModal({ restoreFocus: false });
    if (state.session.status === 'paused') resumeGame();
    else {
      state.session.status = 'playing';
      updatePauseVeil();
      updateControls();
    }
    updateConflicts();
    renderAll();
    focusSelectedCell();
    scheduleSave();
  }

  function restartCurrent() {
    if (!state.session) return;
    const difficulty = state.session.difficulty.id;
    const daily = state.session.daily;
    if (daily) {
      startNewGame({ difficulty, daily: true });
    } else {
      startNewGame({ difficulty, daily: false });
    }
  }

  /* -------------------------------- completion ------------------------------- */
  function updateStatsAfterWin(finalMs) {
    const difficulty = state.session.difficulty.id;
    const item = state.stats.perDifficulty[difficulty] || { completed: 0, bestMs: null, hints: 0 };
    item.completed += 1;
    item.hints += state.session.hintsUsed;
    if (!item.bestMs || finalMs < item.bestMs) item.bestMs = finalMs;
    state.stats.perDifficulty[difficulty] = item;
    state.stats.completed += 1;
    state.stats.hints += state.session.hintsUsed;

    if (state.session.daily) {
      const date = state.session.dailyKey || localDateKey();
      if (state.stats.daily.lastDate !== date) {
        if (state.stats.daily.lastDate && isYesterday(state.stats.daily.lastDate, date)) {
          state.stats.daily.streak += 1;
        } else {
          state.stats.daily.streak = 1;
        }
        state.stats.daily.lastDate = date;
        state.stats.daily.bestStreak = Math.max(state.stats.daily.bestStreak, state.stats.daily.streak);
      }
      state.stats.daily.lastMs = finalMs;
      state.stats.daily.lastHints = state.session.hintsUsed;
    }
    saveStats();
  }

  function finishGame() {
    if (!state.session || state.session.status === 'completed') return;
    commitTimer();
    const finalMs = state.session.elapsedMs;
    state.session.status = 'completed';
    state.session.completedAt = new Date().toISOString();
    updateStatsAfterWin(finalMs);
    saveSession();
    updateConflicts();
    renderAll();
    showResult(finalMs);
  }

  function showResult(finalMs) {
    const s = state.session;
    const best = getBest(s.difficulty.id);
    els.resultTitle.textContent = s.daily ? '每日一题完成。' : '完成。';
    els.resultTime.textContent = formatTime(finalMs);
    els.resultSub.textContent = `${s.difficulty.name} · ${s.givens.filter(Boolean).length} 个已知数 · ${s.daily ? `每日一题 ${s.dailyKey}` : `#${s.id}`}`;
    const thirdLabel = s.daily ? '连续打卡' : '个人最佳';
    const thirdValue = s.daily ? `${state.stats.daily.streak} 天` : best ? formatTime(best) : '—';
    els.resultStats.innerHTML = `
      <div><span>难度</span><b>${escapeHtml(s.difficulty.name)}</b></div>
      <div><span>提示</span><b>${s.hintsUsed} 次</b></div>
      <div><span>${thirdLabel}</span><b>${thirdValue}</b></div>`;
    els.reviewBtn.href = `sudoku.html?p=${encodeURIComponent(s.puzzle)}`;
    openModal(els.resultModal, '#againBtn');
    updateSideStats();
  }

  /* ---------------------------------- share --------------------------------- */
  async function copyText(text, message) {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (error) { /* fallback */ }
    }
    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        textarea.remove();
      } catch (error) { /* ignore */ }
    }
    showToast(copied ? message : '复制失败，请手动选择文本');
  }

  function shareText() {
    if (!state.session) return '';
    const s = state.session;
    const time = formatTime(s.status === 'completed' ? s.elapsedMs : elapsedNow());
    return [
      `数独 · ${s.difficulty.name}`,
      s.daily ? `每日一题 ${s.dailyKey}` : `#${s.id}`,
      `用时 ${time} · 提示 ${s.hintsUsed} 次`,
      'https://berlin-blog.github.io/sudoku-play.html',
    ].join('\n');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function drawMiniBoard(ctx, grid, x, y, size) {
    const cell = size / 9;
    ctx.fillStyle = '#f7f1e5';
    ctx.fillRect(x, y, size, size);
    for (let i = 0; i <= 9; i++) {
      const strong = i % 3 === 0;
      ctx.beginPath();
      ctx.strokeStyle = strong ? '#3a362d' : '#d3cab8';
      ctx.lineWidth = strong ? 2.5 : 1;
      const px = Math.round(x + i * cell) + 0.5;
      const py = Math.round(y + i * cell) + 0.5;
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + size);
      ctx.moveTo(x, py);
      ctx.lineTo(x + size, py);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0b756f';
    ctx.font = `600 ${Math.round(cell * 0.52)}px Georgia, "Times New Roman", serif`;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const value = grid[r * 9 + c];
        if (value) ctx.fillText(String(value), x + (c + 0.5) * cell, y + (r + 0.5) * cell + 1);
      }
    }
    ctx.strokeStyle = '#3a362d';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function buildShareCard() {
    return new Promise((resolve, reject) => {
      if (!state.session) { reject(new Error('没有可分享的成绩')); return; }
      const s = state.session;
      const solution = E.solveGrid(E.parsePuzzle(s.puzzle));
      if (!solution) { reject(new Error('成绩卡生成失败')); return; }
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 1080, 1080);
      bg.addColorStop(0, '#141019');
      bg.addColorStop(0.58, '#19131f');
      bg.addColorStop(1, '#24192f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1080, 1080);
      ctx.strokeStyle = '#3a3048';
      ctx.lineWidth = 1;
      ctx.strokeRect(32, 32, 1016, 1016);

      ctx.fillStyle = '#d9ad5b';
      ctx.font = '500 17px "SFMono-Regular", Consolas, monospace';
      ctx.fillText('SUDOKU / PLAY ROOM', 82, 95);
      ctx.fillStyle = '#f3eee3';
      ctx.font = '600 44px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText(`数独 · ${s.difficulty.name}`, 82, 168);
      ctx.fillStyle = '#91899e';
      ctx.font = '18px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText(s.daily ? `每日一题 · ${s.dailyKey}` : `#${s.id}`, 82, 204);

      ctx.fillStyle = '#f2c878';
      ctx.font = '400 101px Georgia, "Times New Roman", serif';
      ctx.fillText(formatTime(s.elapsedMs), 80, 395);
      ctx.fillStyle = '#8e8798';
      ctx.font = '16px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('完成用时', 84, 430);

      ctx.fillStyle = '#d2c9db';
      ctx.font = '22px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText(`${s.givens.filter(Boolean).length} 个已知数  ·  ${s.hintsUsed} 次提示`, 84, 505);
      ctx.fillStyle = s.daily ? '#76d5c2' : '#b9a7ef';
      ctx.font = '18px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText(s.daily ? `连续打卡 ${state.stats.daily.streak} 天` : '随机挑战完成', 84, 545);

      ctx.fillStyle = '#777081';
      ctx.font = 'italic 21px Georgia, "Times New Roman", serif';
      ctx.fillText('先做出来，再回头看懂。', 84, 650);

      drawMiniBoard(ctx, solution, 612, 300, 380);

      ctx.fillStyle = '#6f6878';
      ctx.font = '14px "SFMono-Regular", Consolas, monospace';
      ctx.fillText('berlin-blog.github.io/sudoku-play.html', 82, 1008);
      ctx.fillStyle = '#d9ad5b';
      ctx.font = '500 13px "SFMono-Regular", Consolas, monospace';
      ctx.fillText('PUZZLE COMPLETE', 800, 1008);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('成绩卡生成失败'));
      }, 'image/png');
    });
  }

  async function downloadShareCard() {
    if (!state.session || state.session.status !== 'completed') return;
    els.downloadCard.disabled = true;
    try {
      const blob = await buildShareCard();
      const date = localDateKey().replace(/-/g, '');
      const id = String(state.session.id).replace(/[^A-Za-z0-9-]/g, '');
      downloadBlob(blob, `sudoku-result-${date}-${id}.png`);
      showToast('成绩卡已下载');
    } catch (error) {
      showToast(error.message || '成绩卡生成失败');
    } finally {
      els.downloadCard.disabled = false;
    }
  }

  function buildExportText() {
    const s = state.session;
    const solution = s.status === 'completed' ? E.solveGrid(E.parsePuzzle(s.puzzle)) : null;
    const lines = [
      '数独实战 · 题目导出',
      `题目：${s.daily ? '每日一题' : '随机题'} · ${s.difficulty.name}`,
      `编号：${s.id}`,
      `难度：${s.difficulty.name}`,
      `来源：${s.daily ? `每日一题 ${s.dailyKey}` : '随机生成'}`,
      `线索：${s.givens.filter(Boolean).length} 个已知数 / ${81 - s.givens.filter(Boolean).length} 个空格`,
      `本局状态：${s.status === 'completed' ? '已完成' : '未完成'}`,
      `本局用时：${formatTime(s.status === 'completed' ? s.elapsedMs : elapsedNow())}`,
      `提示次数：${s.hintsUsed}`,
      '',
      '【题面】0 表示空格',
      ...gridRows(s.givens),
    ];
    if (s.status === 'completed') {
      lines.push('', '【答案】', ...gridRows(solution));
    } else {
      lines.push('', '【答案】', '完成这一局后再导出，就会附带答案。');
    }
    lines.push('', '由「数独实战」导出 · https://berlin-blog.github.io/sudoku-play.html');
    return `\ufeff${lines.join('\r\n')}`;
  }

  function gridRows(grid) {
    const rows = [];
    for (let r = 0; r < 9; r++) rows.push(grid.slice(r * 9, r * 9 + 9).map((v) => v || 0).join(''));
    return rows;
  }

  function exportPuzzle() {
    if (!state.session) return;
    const date = localDateKey().replace(/-/g, '');
    const id = String(state.session.id).replace(/[^A-Za-z0-9-]/g, '');
    const blob = new Blob([buildExportText()], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `sudoku-play-${date}-${id}.txt`);
    showToast('题目与答案已导出');
  }

  /* -------------------------------- number pad ------------------------------- */
  function buildNumberPad() {
    els.numberPad.innerHTML = Array.from({ length: 9 }, (_, i) => {
      const digit = i + 1;
      return `<button class="num-key" type="button" data-digit="${digit}" aria-label="填入 ${digit}">
        <span class="num">${digit}</span><span class="num-left">9</span>
      </button>`;
    }).join('');
  }

  /* ---------------------------------- events --------------------------------- */
  function bindEvents() {
    els.numberPad.addEventListener('click', (event) => {
      const key = event.target.closest('.num-key');
      if (key) inputDigit(Number(key.dataset.digit));
    });

    els.modeDigit.addEventListener('click', () => setMode('digit'));
    els.modeNote.addEventListener('click', () => setMode('note'));
    els.undoBtn.addEventListener('click', undoMove);
    els.eraseBtn.addEventListener('click', eraseCell);
    els.checkBtn.addEventListener('click', checkBoard);
    els.hintBtn.addEventListener('click', () => state.hint ? advanceHint() : requestHint());
    els.hintNext.addEventListener('click', advanceHint);
    els.closeHint.addEventListener('click', clearHint);

    els.pauseBtn.addEventListener('click', togglePause);
    els.resumeBtn.addEventListener('click', resumeGame);
    els.newGameBtn.addEventListener('click', () => openStartModal());
    els.dailyNav.addEventListener('click', () => openStartModal());
    els.veilStart.addEventListener('click', () => openStartModal());
    els.restartBtn.addEventListener('click', restartCurrent);
    els.exportBtn.addEventListener('click', exportPuzzle);

    els.startDifficulties.addEventListener('click', (event) => {
      const button = event.target.closest('[data-start-diff]');
      if (button) startNewGame({ difficulty: button.dataset.startDiff, daily: false });
    });
    els.dailyStart.addEventListener('click', () => startNewGame({ difficulty: DAILY_DIFFICULTY, daily: true }));
    els.resumeCard.addEventListener('click', continueSavedGame);
    els.closeStart.addEventListener('click', closeStartModal);
    els.startModal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-start]') && state.session) closeStartModal();
    });
    els.resetStats.addEventListener('click', () => {
      if (!window.confirm('清空本地成绩和连续打卡记录？当前未完成的一局不会删除。')) return;
      state.stats = defaultStats();
      saveStats();
      renderStartModal();
      updateSideStats();
      updateStatsBar();
      showToast('本地成绩已清空');
    });

    els.closeResult.addEventListener('click', () => closeModal());
    els.resultModal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-result]')) closeModal();
    });
    els.againBtn.addEventListener('click', () => {
      closeModal({ restoreFocus: false });
      openStartModal({ pause: false });
    });
    els.downloadCard.addEventListener('click', downloadShareCard);
    els.copyShare.addEventListener('click', () => copyText(shareText(), '成绩已复制'));
    els.exportResult.addEventListener('click', exportPuzzle);

    document.addEventListener('keydown', (event) => {
      if (state.activeModal) {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (state.activeModal === els.startModal) closeStartModal();
          else closeModal();
        } else {
          trapFocus(event);
        }
        return;
      }
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.code === 'Space' && (tag === 'BUTTON' || tag === 'A')) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoMove();
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        inputDigit(Number(event.key));
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        eraseCell();
        return;
      }
      if (event.key === 'ArrowUp') { event.preventDefault(); moveSelection(-1, 0); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); moveSelection(1, 0); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelection(0, -1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); moveSelection(0, 1); }
      else if (event.key.toLowerCase() === 'n') { event.preventDefault(); setMode(state.settings.mode === 'digit' ? 'note' : 'digit'); }
      else if (event.key.toLowerCase() === 'h') { event.preventDefault(); state.hint ? advanceHint() : requestHint(); }
      else if (event.code === 'Space') { event.preventDefault(); togglePause(); }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.session && state.session.status === 'playing' && state.session.timerStarted) {
        pauseGame(true);
      }
    });

    window.addEventListener('pagehide', () => {
      if (!state.session) return;
      if (state.session.runningSince) {
        state.session.elapsedMs += Math.max(0, Date.now() - state.session.runningSince);
        state.session.runningSince = null;
      }
      saveSession();
    });
  }

  /* ----------------------------------- init ---------------------------------- */
  function init() {
    buildNumberPad();
    bindEvents();
    state.session = loadSession();
    if (state.session) {
      state.selected = state.session.status === 'completed'
        ? -1
        : (findFirstEmpty(state.session.grid) >= 0 ? findFirstEmpty(state.session.grid) : state.selected);
      state.session.status = state.session.status === 'completed' ? 'completed' : 'paused';
      updateConflicts();
      renderAll();
    } else {
      state.selected = -1;
      renderAll();
    }
    renderStartModal();
    updateControls();
    openStartModal({ pause: false });
  }

  init();
})();
