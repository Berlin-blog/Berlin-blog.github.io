(function () {
  'use strict';

  const E = window.SudokuEngine;
  const G = window.SudokuGenerator;
  const BoardView = window.SudokuBoard;
  if (!E) throw new Error('SudokuEngine 未加载');
  if (!G) throw new Error('SudokuGenerator 未加载');
  if (!BoardView) throw new Error('SudokuBoard 未加载');

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const els = {
    board: $('#board'),
    boardPanel: $('.board-panel'),
    reasonPanel: $('.reason-panel'),
    puzzleKicker: $('#puzzleKicker'),
    puzzleName: $('#puzzleName'),
    presetTabs: $('#presetTabs'),
    statusPill: $('#statusPill'),
    liveBadge: $('#liveBadge'),
    cyclePreset: $('#cyclePreset'),
    candidatesToggle: $('#candidatesToggle'),
    randomBtn: $('#randomBtn'),
    exportBtn: $('#exportBtn'),
    openEditor: $('#openEditor'),
    reasonBody: $('#reasonBody'),
    progressFill: $('#progressFill'),
    progressText: $('#progressText'),
    prevBtn: $('#prevBtn'),
    playBtn: $('#playBtn'),
    playIcon: $('#playIcon'),
    playLabel: $('#playLabel'),
    nextBtn: $('#nextBtn'),
    jumpBtn: $('#jumpBtn'),
    speedSelect: $('#speedSelect'),
    panelPrev: $('#panelPrev'),
    panelNext: $('#panelNext'),
    toReason: $('#toReason'),
    toBoard: $('#toBoard'),
    editorModal: $('#editorModal'),
    editorGrid: $('#editorGrid'),
    editorPresets: $('#editorPresets'),
    editorError: $('#editorError'),
    pasteInput: $('#pasteInput'),
    submitEditor: $('#submitEditor'),
    clearEditor: $('#clearEditor'),
    closeEditor: $('#closeEditor'),
    cancelEditor: $('#cancelEditor'),
    generatorModal: $('#generatorModal'),
    closeGenerator: $('#closeGenerator'),
    difficultyGrid: $('#difficultyGrid'),
    generateBtn: $('#generateBtn'),
    generationResult: $('#generationResult'),
    exportModal: $('#exportModal'),
    closeExport: $('#closeExport'),
    exportSummary: $('#exportSummary'),
    exportFormats: $('#exportFormats'),
    exportPreview: $('#exportPreview'),
    exportAnswer: $('#exportAnswer'),
    exportAnswerLabel: $('#exportAnswerLabel'),
    exportSteps: $('#exportSteps'),
    exportStepsOption: $('#exportStepsOption'),
    copyPuzzle: $('#copyPuzzle'),
    downloadExport: $('#downloadExport'),
    toast: $('#toast'),
  };

  const state = {
    presetIndex: 1,
    puzzle: null,
    meta: null,
    result: null,
    cursor: -1,
    playing: false,
    timer: null,
    speed: 1600,
    showCandidates: true,
    activeModal: null,
    lastFocus: null,
    generated: null,
    genDifficulty: 'medium',
    genBusy: false,
    exportFormat: 'txt',
  };

  const boardView = new BoardView(els.board);

  const EXPORT_FORMATS = {
    txt: {
      extension: 'txt',
      name: 'TXT',
      label: '纯文本',
      description: '题面、答案、可选的分步解析',
    },
    csv: {
      extension: 'csv',
      name: 'CSV',
      label: '表格',
      description: '9×9 双表，可用 Excel 打开',
    },
    png: {
      extension: 'png',
      name: 'PNG',
      label: '题面卡片',
      description: '适合打印或分享的高清图',
    },
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function cellName(idx) {
    return E.CELL(idx);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('is-visible'), 2500);
  }

  function stopPlayback() {
    state.playing = false;
    clearTimeout(state.timer);
    state.timer = null;
    updateTransport();
  }

  function scheduleNext() {
    clearTimeout(state.timer);
    if (!state.playing) return;
    state.timer = setTimeout(() => {
      if (!state.playing) return;
      if (state.cursor < state.result.steps.length - 1) {
        goToStep(state.cursor + 1, { keepPlaying: true });
        scheduleNext();
      } else {
        state.playing = false;
        updateTransport();
        showToast('演示完成。可以回看任意一步。');
      }
    }, state.speed);
  }

  function togglePlayback() {
    if (!state.result || !state.result.steps.length) return;
    if (state.playing) {
      stopPlayback();
      return;
    }
    if (state.cursor >= state.result.steps.length - 1) {
      state.cursor = -1;
      renderBoard();
      renderProgress();
    }
    state.playing = true;
    if (state.cursor < 0) {
      goToStep(0, { keepPlaying: true });
    } else {
      updateTransport();
    }
    scheduleNext();
  }

  function goToStep(index, options = {}) {
    if (!state.result) return;
    const max = state.result.steps.length - 1;
    const next = Math.max(-1, Math.min(max, index));
    if (!options.keepPlaying) stopPlayback();
    state.cursor = next;
    renderBoard();
    renderReason();
    renderProgress();
    updateTransport();
    updateStatus();
    if (next >= max && state.playing) {
      state.playing = false;
      clearTimeout(state.timer);
      state.timer = null;
      updateTransport();
    }
  }

  function nextStep() {
    if (!state.result) return;
    if (state.cursor >= state.result.steps.length - 1) return;
    goToStep(state.cursor + 1);
  }

  function prevStep() {
    if (!state.result || state.cursor < 0) return;
    goToStep(state.cursor - 1);
  }

  function jumpToNewTechnique() {
    if (!state.result) return;
    const steps = state.result.steps;
    if (!steps.length) return;
    const start = state.cursor;
    if (start < 0) {
      const advancedIndex = steps.findIndex((s) => !['唯一候选', '隐性唯一'].includes(s.technique));
      if (advancedIndex === -1) {
        showToast('这盘只用基础技巧，没有更进阶的步骤。');
        return;
      }
      goToStep(advancedIndex);
      showToast(`跳到第一个进阶技巧：${steps[advancedIndex].technique}`);
      return;
    }
    const seen = new Set();
    for (let i = 0; i <= start; i++) seen.add(steps[i].technique);
    const found = steps.findIndex((s, i) => i > start && !seen.has(s.technique));
    if (found === -1) {
      showToast('后面没有新的技巧类型了。');
      return;
    }
    goToStep(found);
    showToast(`下一种技巧：${steps[found].technique}`);
  }

  function updateStatus() {
    if (!els.statusPill || !state.result) return;
    const label = els.statusPill.querySelector('span');
    els.statusPill.classList.remove('is-live', 'is-done');
    const atEnd = state.cursor >= state.result.steps.length - 1;
    if (atEnd) {
      els.statusPill.classList.add('is-done');
      label.textContent = '已解开';
    } else if (state.cursor >= 0) {
      els.statusPill.classList.add('is-live');
      label.textContent = '推理中';
    } else {
      label.textContent = '待推理';
    }
    if (els.liveBadge) {
      const badgeText = els.liveBadge.querySelector('span');
      if (badgeText) badgeText.textContent = atEnd ? 'DONE' : state.cursor >= 0 ? 'LIVE' : 'READY';
    }
    document.body.classList.toggle('is-solved', atEnd);
  }

  function updateTransport() {
    if (!state.result) return;
    const total = state.result.steps.length;
    const atEnd = state.cursor >= total - 1;
    els.prevBtn.disabled = state.cursor < 0;
    els.nextBtn.disabled = atEnd;
    if (els.panelPrev) els.panelPrev.disabled = state.cursor < 0;
    if (els.panelNext) els.panelNext.disabled = atEnd;
    els.nextBtn.innerHTML = state.cursor < 0
      ? '开始第 1 步 <span aria-hidden="true">→</span>'
      : '下一步 <span aria-hidden="true">→</span>';
    els.playIcon.textContent = state.playing ? 'Ⅱ' : '▶';
    els.playLabel.textContent = state.playing
      ? '暂停'
      : state.cursor < 0
        ? '开始推理'
        : atEnd
          ? '重新演示'
          : '播放';
    els.playBtn.setAttribute('aria-label', state.playing ? '暂停演示' : '播放推理过程');
    els.jumpBtn.disabled = total <= 1;
  }

  function renderProgress() {
    if (!state.result) return;
    const total = state.result.steps.length;
    const done = state.cursor + 1;
    els.progressFill.style.width = total ? `${(done / total) * 100}%` : '0%';
    els.progressText.textContent = `${done} / ${total}`;
  }

  function unitCellSet(step) {
    const set = new Set();
    if (!step || !step.highlights || !step.highlights.units) return set;
    step.highlights.units.forEach((unit) => unit.cells.forEach((idx) => set.add(idx)));
    return set;
  }

  function renderBoard() {
    if (!state.result || !state.puzzle) return;
    const step = state.cursor >= 0 ? state.result.steps[state.cursor] : null;
    const grid = step ? step.afterGrid : state.result.initialGrid;
    const cands = step ? step.afterCands : E.computeCandidates(Uint8Array.from(state.result.initialGrid));
    const givens = state.result.initialGrid;
    const unitCells = unitCellSet(step);
    const focus = new Set(step ? step.highlights.focus : []);
    const evidence = new Set(step ? step.highlights.evidence : []);
    const targets = new Set(step ? step.highlights.targets : []);
    const inspect = new Set(step ? step.highlights.inspect : []);
    const ghost = new Map();
    if (step && step.action.type === 'eliminate') {
      step.action.changes.forEach((change) => {
        if (!ghost.has(change.idx)) ghost.set(change.idx, new Set());
        change.values.forEach((v) => ghost.get(change.idx).add(v));
      });
    }

    boardView.render({
      grid,
      givens,
      cands,
      ghost,
      activeIndex: -1,
      highlights: {
        'unit-hint': unitCells,
        inspect,
        evidence,
        target: targets,
        focus,
      },
    });
    boardView.setNotesVisible(state.showCandidates);
    els.board.dataset.step = String(state.cursor + 1);
  }

  function techniqueList() {
    if (!state.result) return [];
    const list = [];
    const map = new Map();
    state.result.steps.forEach((step, index) => {
      if (!map.has(step.technique)) {
        const item = {
          technique: step.technique,
          en: step.techniqueEn,
          tone: step.tone,
          count: 0,
          first: index,
        };
        map.set(step.technique, item);
        list.push(item);
      }
      map.get(step.technique).count++;
    });
    return list;
  }

  function renderIntro() {
    const stats = state.result.stats;
    const techniques = techniqueList();
    const meta = state.meta || {};
    const preset = meta.preset;
    const custom = meta.type === 'custom';
    const random = meta.type === 'random';
    const givens = stats.givens;
    const total = stats.totalSteps;
    const pure = stats.logicalSteps;
    const fallback = stats.fallbackSteps;
    const lede = random
      ? `这是随机生成的${meta.difficulty.name}题，编号 ${meta.id}：${givens} 个已知数，拆成 ${total} 步。可以开始推理，也可以从右上角导出。`
      : meta.fromPlay
        ? `这是从实战模式带回来的题：${givens} 个已知数，拆成 ${total} 步。对照刚才的做法，看看哪些结构可以更快看出来。`
        : custom
          ? `这是你录入的题：${givens} 个已知数，拆成 ${total} 步。先看候选数，再跟着证据走。`
          : preset
          ? `${preset.note} 共 ${givens} 个已知数，会拆成 ${total} 步。`
          : `这盘题有 ${givens} 个已知数，会拆成 ${total} 步。`;
    const warningHtml = state.result.warnings.length
      ? `<div class="warning-box"><span aria-hidden="true">△</span><span>${escapeHtml(state.result.warnings.join(' '))}</span></div>`
      : '';
    const chips = techniques.map((t) => `
      <button class="tech-chip tone-${t.tone}" type="button" data-step="${t.first}" title="跳到 ${escapeHtml(t.technique)} 的第一次出现">
        <i aria-hidden="true"></i><span>${escapeHtml(t.technique)}</span><b>${t.count}</b>
      </button>`).join('');

    els.reasonBody.innerHTML = `
      <div class="intro">
        <span class="intro-index" aria-hidden="true">01</span>
        <h3>先看懂，<br>再<em>填下。</em></h3>
        <p class="intro-lede">${escapeHtml(lede)}</p>
        <div class="intro-rule" aria-hidden="true"></div>
        <div class="intro-stats">
          <span><b>${givens}</b>个已知数</span>
          <span><b>${total}</b>步推理</span>
          <span class="${fallback ? '' : 'pure'}"><b>${pure}</b>${fallback ? '步纯逻辑' : '步全部纯逻辑'}</span>
          ${fallback ? `<span><b>${fallback}</b>步分支兜底</span>` : ''}
        </div>
        ${warningHtml}
        <div class="plan-label"><span>这盘会用到的技巧</span><span>点击可跳转</span></div>
        <div class="technique-grid">${chips}</div>
        <button class="btn btn-primary intro-start" id="introStart" type="button">开始第 1 步 <span aria-hidden="true">→</span></button>
        <p class="intro-hint">也可以按 <kbd>空格</kbd> 自动播放，或按 <kbd>→</kbd> 一步步看。</p>
        <blockquote class="intro-quote">先问这一格能填什么，<br>再问这个数该落在哪。</blockquote>
        <div class="intro-bottom">
          <div class="reading-head"><span>读盘小抄</span><span>颜色对应关系</span></div>
          <div class="reading-row"><i class="read-dot read-focus" aria-hidden="true"></i><p><b>金色格</b>是这一步正在处理的结论。</p></div>
          <div class="reading-row"><i class="read-dot read-evidence" aria-hidden="true"></i><p><b>青色格</b>是支持结论的已知数或线索。</p></div>
          <div class="reading-row"><i class="read-dot read-removed" aria-hidden="true"></i><p><b>红色删除线</b>是被排除的候选数，不是盘面数字。</p></div>
        </div>
      </div>`;
  }

  function resultText(step) {
    if (step.action.type === 'place') {
      return `<strong>${cellName(step.action.idx)} = ${step.action.value}</strong><span> · 填入 1 格</span>`;
    }
    const values = step.action.changes.reduce((n, c) => n + c.values.length, 0);
    const cells = new Set(step.action.changes.map((c) => c.idx)).size;
    return `<strong>删除 ${values} 个候选</strong><span> · 涉及 ${cells} 格</span>`;
  }

  function renderHistory() {
    const current = state.cursor;
    const items = state.result.steps.map((step) => {
      const cls = [
        'history-btn',
        `tone-${step.tone}`,
        step.index - 1 === current ? 'is-current' : '',
        step.index - 1 > current ? 'is-future' : '',
      ].filter(Boolean).join(' ');
      return `<li class="history-item">
        <button class="${cls}" type="button" data-index="${step.index - 1}" aria-current="${step.index - 1 === current ? 'step' : 'false'}">
          <span class="history-no">${pad2(step.index)}</span>
          <span class="history-dot" aria-hidden="true"></span>
          <span class="history-text"><b>${escapeHtml(step.technique)}</b><span>${escapeHtml(step.title)}</span></span>
        </button>
      </li>`;
    }).join('');
    return `<div class="history-block">
      <div class="history-head"><h4>全程推理链</h4><span>${Math.max(0, current + 1)} / ${state.result.steps.length} 已展开</span></div>
      <ol class="history-list">${items}</ol>
    </div>`;
  }

  function scrollHistoryToCurrent() {
    const list = $('.history-list', els.reasonBody);
    const active = list && $('.history-btn.is-current', list);
    if (!list || !active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < listRect.top || activeRect.bottom > listRect.bottom) {
      list.scrollTop += activeRect.top - listRect.top - listRect.height / 2 + activeRect.height / 2;
    }
  }

  function renderStep() {
    const step = state.result.steps[state.cursor];
    if (!step) { renderIntro(); return; }
    const total = state.result.steps.length;
    const atEnd = state.cursor === total - 1;
    const fallback = !step.pure;
    const chain = step.chain.map((item, i) => `
      <div class="chain-item">
        <span class="chain-no" aria-hidden="true">${pad2(i + 1)}</span>
        <div>
          <span class="chain-label">${escapeHtml(item.k)}</span>
          <p class="chain-text">${escapeHtml(item.t)}</p>
        </div>
      </div>`).join('');

    const finish = atEnd ? `
      <div class="finish-banner">
        <span aria-hidden="true">✓</span>
        <span>推理完成。共 <b>${total}</b> 步，${state.result.stats.fallbackSteps ? `其中 ${state.result.stats.fallbackSteps} 步是分支验证兜底` : '全部由逻辑技巧推出'}。</span>
      </div>` : '';

    els.reasonBody.innerHTML = `
      <div class="step-view tone-${step.tone}">
        ${finish}
        <div class="step-meta">
          <span class="step-count">STEP <b>${pad2(step.index)}</b> / ${pad2(total)}</span>
          <span class="technique-pill">${escapeHtml(step.technique)} <em>${escapeHtml(step.techniqueEn)}</em></span>
        </div>
        <h3 class="step-title">${escapeHtml(step.title)}</h3>
        <p class="step-summary">${escapeHtml(step.summary)}</p>
        <div class="step-result">
          <span class="result-label">本步结果</span>
          <span class="result-value">${resultText(step)}</span>
        </div>
        <div class="chain">${chain}</div>
        <div class="principle">
          <span class="principle-label">为什么这样做</span>
          <p>${escapeHtml(step.principle)}</p>
        </div>
        ${renderHistory()}
        ${fallback ? '<p class="intro-hint" style="margin-top:12px;text-align:left;color:#a88d60">这一步是兜底分支验证，不是纯逻辑技巧。</p>' : ''}
      </div>`;

    requestAnimationFrame(scrollHistoryToCurrent);
  }

  function renderReason() {
    if (!state.result) return;
    if (state.cursor < 0) renderIntro();
    else renderStep();
  }

  function renderTabs() {
    els.presetTabs.innerHTML = E.PRESETS.map((preset, index) => `
      <button class="preset-tab ${index === state.presetIndex ? 'is-active' : ''}" type="button" role="tab"
        aria-selected="${index === state.presetIndex}" data-preset="${index}">
        ${escapeHtml(preset.name)}<small>${escapeHtml(preset.difficulty)}</small>
      </button>`).join('');
  }

  function currentTitle(meta) {
    if (meta && meta.fromPlay) return '实战复盘';
    if (meta && meta.type === 'random') return `随机题 · ${meta.difficulty.name}`;
    const preset = meta && meta.preset;
    if (!preset) return '自定义题目';
    if (preset.id === 'starter') return '热身题';
    if (preset.id === 'expert') return '全技巧挑战';
    return `${preset.name}练习`;
  }

  function loadPuzzle(puzzle, meta, preparedResult) {
    let result;
    try {
      result = preparedResult || E.solvePuzzle(puzzle);
    } catch (error) {
      showToast(error.message || '这道题暂时无法求解。');
      throw error;
    }
    stopPlayback();
    state.puzzle = puzzle;
    state.meta = meta;
    state.result = result;
    state.cursor = -1;
    state.presetIndex = meta && meta.type === 'preset' ? meta.presetIndex : -1;
    if (meta && meta.type !== 'preset' && !meta.createdAt) meta.createdAt = new Date().toISOString();
    if (meta && meta.type === 'preset') {
      els.puzzleKicker.textContent = `PUZZLE ${pad2(meta.presetIndex + 1)} / ${pad2(E.PRESETS.length)} · ${meta.preset.difficulty}`;
    } else if (meta && meta.type === 'random') {
      els.puzzleKicker.textContent = `RANDOM PUZZLE · ${meta.difficulty.name} · ${meta.id}`;
    } else if (meta && meta.fromPlay) {
      els.puzzleKicker.textContent = 'REVIEW · 实战复盘';
    } else {
      els.puzzleKicker.textContent = 'CUSTOM PUZZLE · 自定义';
    }
    els.puzzleName.textContent = currentTitle(meta);
    if (els.exportBtn) els.exportBtn.disabled = false;
    renderTabs();
    renderBoard();
    renderReason();
    renderProgress();
    updateTransport();
    updateStatus();
    if (result.warnings.length) showToast(result.warnings[0]);
  }

  function loadPreset(index, options = {}) {
    const preset = E.PRESETS[index];
    if (!preset) return;
    try {
      loadPuzzle(preset.puzzle, { type: 'preset', preset, presetIndex: index });
      if (options.toast !== false) showToast(`已载入「${preset.name}」示例`);
    } catch (error) {
      // loadPuzzle 已经处理提示
    }
  }

  function cyclePreset() {
    const next = state.presetIndex < 0 ? 0 : (state.presetIndex + 1) % E.PRESETS.length;
    loadPreset(next);
  }

  function setCandidates(show) {
    state.showCandidates = show;
    boardView.setNotesVisible(show);
    els.candidatesToggle.classList.toggle('is-on', show);
    els.candidatesToggle.setAttribute('aria-pressed', String(show));
  }

  /* -------------------------------- generator ------------------------------- */
  function buildDifficultyGrid() {
    els.difficultyGrid.innerHTML = G.DIFFICULTIES.map((difficulty) => `
      <button class="difficulty-card tone-${difficulty.tone}" type="button" role="radio"
        aria-checked="false" data-difficulty="${difficulty.id}">
        <span class="diff-top"><b>${escapeHtml(difficulty.name)}</b><span class="diff-count">约 ${difficulty.target} 线索</span></span>
        <p>${escapeHtml(difficulty.description)}</p>
      </button>`).join('');
    renderDifficultySelection();
  }

  function renderDifficultySelection() {
    $$('.difficulty-card', els.difficultyGrid).forEach((card) => {
      const active = card.dataset.difficulty === state.genDifficulty;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-checked', String(active));
      card.disabled = state.genBusy;
    });
  }

  function renderGenerationEmpty(message) {
    els.generationResult.innerHTML = `
      <div class="gen-empty">
        <span class="gen-empty-mark" aria-hidden="true">9 × 9</span>
        <p>${message || '选好难度，生成第一道随机题。'}</p>
        <span>生成后会在这里预览题面与推理统计。</span>
      </div>`;
  }

  function renderGenerationBusy() {
    els.generationResult.innerHTML = `
      <div class="gen-busy">
        <span class="spinner" aria-hidden="true"></span>
        <p>正在生成题目</p>
        <small>挖空并逐格验证唯一解，同时计算推理链…</small>
      </div>`;
  }

  function buildMiniBoard(grid, mount) {
    if (!mount) return;
    mount.innerHTML = '';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'gen-cell';
        if (c === 2 || c === 5) cell.classList.add('bR');
        if (r === 2 || r === 5) cell.classList.add('bB');
        const value = grid[r * 9 + c];
        cell.textContent = value ? String(value) : '';
        mount.appendChild(cell);
      }
    }
  }

  function renderGenerationResult() {
    const gen = state.generated;
    if (!gen) { renderGenerationEmpty(); return; }
    const techniques = gen.techniques.map((item) => `
      <span class="gen-tech tone-${item.tone}"><i aria-hidden="true"></i>${escapeHtml(item.technique)}<b>${item.count}</b></span>`).join('');
    const fallbackText = gen.stats.fallbackSteps
      ? `<span style="color:#d7b06b">${gen.stats.fallbackSteps} 步分支兜底</span>`
      : '<span style="color:#7ed8c5">全部纯逻辑</span>';
    els.generationResult.innerHTML = `
      <div class="gen-result-view">
        <div>
          <div class="gen-board-frame"><div class="gen-board" id="genBoardPreview" aria-label="随机题题面"></div></div>
          <div class="gen-board-caption"><span>${gen.clues} 个已知数</span><span>UNIQUE</span></div>
        </div>
        <div class="gen-info">
          <p class="kicker">GENERATED · ${escapeHtml(gen.id)}</p>
          <h3>${escapeHtml(gen.difficulty.name)} · ${gen.clues} 个已知数</h3>
          <p>${escapeHtml(gen.difficulty.description)}</p>
          <div class="gen-stats">
            <span><b>${gen.stats.totalSteps}</b>步推理</span>
            <span><b>${gen.stats.logicalSteps}</b>步纯逻辑</span>
            <span>${fallbackText}</span>
            <span>唯一解</span>
          </div>
          <div class="gen-techs">${techniques}</div>
          <div class="gen-actions">
            <button class="btn btn-primary" id="useGenerated" type="button">开始推理 <span aria-hidden="true">→</span></button>
            <button class="btn btn-ghost" id="exportGenerated" type="button">直接导出</button>
            <button class="btn btn-quiet" id="regenGenerated" type="button">换一道 ↻</button>
          </div>
        </div>
      </div>`;
    buildMiniBoard(gen.analysis.initialGrid, $('#genBoardPreview', els.generationResult));
  }

  function openGenerator() {
    if (!els.difficultyGrid.children.length) buildDifficultyGrid();
    renderDifficultySelection();
    if (state.generated) renderGenerationResult();
    else renderGenerationEmpty();
    openModal(els.generatorModal);
  }

  function selectGeneratorDifficulty(id) {
    if (state.genBusy) return;
    const difficulty = G.difficultyById(id);
    state.genDifficulty = difficulty.id;
    state.generated = null;
    renderDifficultySelection();
    renderGenerationEmpty();
  }

  function generateRandom() {
    if (state.genBusy) return;
    state.genBusy = true;
    renderDifficultySelection();
    els.generateBtn.disabled = true;
    els.generateBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:1.5px"></span> 生成中…';
    renderGenerationBusy();
    setTimeout(() => {
      try {
        const gen = G.generatePuzzle({ difficulty: state.genDifficulty });
        state.generated = gen;
        renderGenerationResult();
        showToast(`已生成 ${gen.difficulty.name}题 · ${gen.clues} 个已知数`);
        if (window.matchMedia && window.matchMedia('(max-width: 620px)').matches) {
          setTimeout(() => {
            const card = els.generatorModal.querySelector('.modal-card');
            if (!card) return;
            const top = els.generationResult.getBoundingClientRect().top - card.getBoundingClientRect().top + card.scrollTop - 10;
            card.scrollTo({ top, behavior: 'smooth' });
          }, 80);
        }
      } catch (error) {
        state.generated = null;
        renderGenerationEmpty(error.message || '生成失败，请再试一次。');
        showToast('生成失败，请再试一次');
      } finally {
        state.genBusy = false;
        els.generateBtn.disabled = false;
        els.generateBtn.innerHTML = '<span aria-hidden="true">✦</span> 生成题目';
        renderDifficultySelection();
      }
    }, 90);
  }

  function useGenerated(gen, exportNow) {
    if (!gen) return;
    const meta = {
      type: 'random',
      difficulty: gen.difficulty,
      id: gen.id,
      seed: gen.seed,
      createdAt: new Date().toISOString(),
    };
    closeActiveModal({ restoreFocus: false });
    loadPuzzle(gen.puzzle, meta, gen.analysis);
    showToast(`随机题已载入 · ${gen.stats.totalSteps} 步推理`);
    if (exportNow) {
      requestAnimationFrame(() => {
        if (els.exportBtn) els.exportBtn.focus();
        openExport();
      });
    } else {
      requestAnimationFrame(() => els.playBtn.focus());
    }
  }

  /* --------------------------------- export --------------------------------- */
  function exportInfo() {
    const meta = state.meta || {};
    const preset = meta.preset;
    const difficulty = meta.type === 'random'
      ? meta.difficulty.name
      : preset
        ? preset.difficulty
        : '自定义';
    const key = meta.type === 'random'
      ? meta.difficulty.id
      : preset
        ? preset.id
        : 'custom';
    const id = meta.id || (preset ? `PRESET-${preset.id.toUpperCase()}` : 'CUSTOM');
    const source = meta.type === 'random'
      ? '随机生成'
      : meta.type === 'preset'
        ? '内置示例'
        : '手动录入';
    return {
      meta,
      preset,
      difficulty,
      key,
      id,
      source,
      title: currentTitle(meta),
      createdAt: meta.createdAt || new Date().toISOString(),
    };
  }

  function formatDateTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatGrid(grid) {
    const rows = [];
    for (let r = 0; r < 9; r++) {
      rows.push(grid.slice(r * 9, r * 9 + 9).map((v) => v || 0).join(''));
    }
    return rows;
  }

  function techniqueLine() {
    return Object.entries(state.result.stats.techniqueCounts)
      .map(([name, count]) => `${name} ${count}`)
      .join(' · ');
  }

  function buildTextExport() {
    const info = exportInfo();
    const stats = state.result.stats;
    const includeAnswer = els.exportAnswer.checked;
    const includeSteps = els.exportSteps.checked;
    const lines = [
      '数独推理台 · Sudoku Reasoning Lab',
      `题目：${info.title}`,
      `编号：${info.id}`,
      `难度：${info.difficulty}`,
      `线索：${stats.givens} 个已知数 / ${stats.empties} 个空格`,
      `推理：${stats.totalSteps} 步（纯逻辑 ${stats.logicalSteps}，分支验证 ${stats.fallbackSteps}）`,
      `唯一解：${state.result.warnings.length ? '否（多解）' : '是'}`,
      `来源：${info.source}`,
      `记录时间：${formatDateTime(new Date(info.createdAt))}`,
      `导出时间：${formatDateTime(new Date())}`,
      '',
      '【题面】0 表示空格',
      ...formatGrid(state.result.initialGrid),
    ];

    if (includeAnswer) {
      lines.push('', '【答案】', ...formatGrid(state.result.solution));
    }
    if (includeSteps) {
      lines.push('', '【分步解析】');
      state.result.steps.forEach((step) => {
        lines.push(`${pad2(step.index)}. [${step.technique}] ${step.title}`);
        step.chain.forEach((item) => lines.push(`    ${item.k}：${item.t}`));
      });
    }

    lines.push(
      '',
      `技巧分布：${techniqueLine() || '无'}`,
      '',
      '由「数独推理台」生成 · https://berlin-blog.github.io/sudoku.html',
    );
    return `\ufeff${lines.join('\r\n')}`;
  }

  function csvEscape(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function buildCsvExport() {
    const info = exportInfo();
    const stats = state.result.stats;
    const includeAnswer = els.exportAnswer.checked;
    const rows = [
      ['数独推理台导出'],
      ['题目', info.title],
      ['编号', info.id],
      ['难度', info.difficulty],
      ['线索数', stats.givens],
      ['空格数', stats.empties],
      ['推理步数', stats.totalSteps],
      ['唯一解', state.result.warnings.length ? '否' : '是'],
      ['来源', info.source],
      [],
      ['类型', '行', 1, 2, 3, 4, 5, 6, 7, 8, 9],
    ];
    formatGrid(state.result.initialGrid).forEach((row, index) => {
      rows.push(['题目', index + 1, ...row.split('')]);
    });
    if (includeAnswer) {
      rows.push([]);
      rows.push(['类型', '行', 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      formatGrid(state.result.solution).forEach((row, index) => {
        rows.push(['答案', index + 1, ...row.split('')]);
      });
    }
    return `\ufeff${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}`;
  }

  function drawBoardOnCanvas(ctx, grid, x, y, size, answer) {
    const cell = size / 9;
    ctx.fillStyle = '#fbf7ed';
    ctx.fillRect(x, y, size, size);

    for (let i = 0; i <= 9; i++) {
      const strong = i % 3 === 0;
      ctx.beginPath();
      ctx.strokeStyle = strong ? '#3a362d' : '#d2c9b7';
      ctx.lineWidth = strong ? 3 : 1;
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
    ctx.fillStyle = answer ? '#0b756f' : '#24231d';
    ctx.font = `600 ${Math.round(cell * 0.55)}px Georgia, "Times New Roman", serif`;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const value = grid[r * 9 + c];
        if (value) ctx.fillText(String(value), x + (c + 0.5) * cell, y + (r + 0.5) * cell + 1);
      }
    }

    ctx.strokeStyle = '#3a362d';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function buildPngExport() {
    return new Promise((resolve, reject) => {
      const info = exportInfo();
      const stats = state.result.stats;
      const includeAnswer = els.exportAnswer.checked;
      const width = 1080;
      const height = includeAnswer ? 1810 : 1240;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#d9d0be';
      ctx.lineWidth = 1;
      ctx.strokeRect(34, 34, width - 68, height - 68);

      ctx.fillStyle = '#b57b1e';
      ctx.font = '500 17px "SFMono-Regular", Consolas, monospace';
      ctx.fillText('SUDOKU / REASONING LAB', 110, 92);

      ctx.fillStyle = '#25231d';
      ctx.font = '600 52px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText(`数独 · ${info.difficulty}`, 110, 158);

      ctx.fillStyle = '#786e5b';
      ctx.font = '19px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText(`#${info.id}  ·  ${stats.givens} 个已知数  ·  ${state.result.warnings.length ? '多个解' : '唯一解'}`, 110, 199);

      ctx.strokeStyle = '#d9d0be';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(110, 230);
      ctx.lineTo(970, 230);
      ctx.stroke();

      drawBoardOnCanvas(ctx, state.result.initialGrid, 160, 268, 760, false);

      if (includeAnswer) {
        ctx.fillStyle = '#25231d';
        ctx.font = '600 30px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('答案', 110, 1112);
        ctx.fillStyle = '#8a806d';
        ctx.font = '15px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('用于核对，不建议边看边填。', 182, 1108);
        drawBoardOnCanvas(ctx, state.result.solution, 250, 1150, 580, true);
        ctx.fillStyle = '#8a806d';
        ctx.font = '14px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('由「数独推理台」生成 · berlin-blog.github.io/sudoku.html', 110, 1780);
      } else {
        ctx.fillStyle = '#8a806d';
        ctx.font = '14px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('由「数独推理台」生成 · berlin-blog.github.io/sudoku.html', 110, 1142);
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片生成失败。'));
      }, 'image/png');
    });
  }

  function exportFileName(extension) {
    const info = exportInfo();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const id = String(info.id || 'CUSTOM').replace(/[^A-Za-z0-9-]/g, '') || 'CUSTOM';
    const key = String(info.key || 'custom').replace(/[^A-Za-z0-9-]/g, '') || 'custom';
    return `sudoku-${date}-${key}-${id}.${extension}`;
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

  function buildExportFormats() {
    els.exportFormats.innerHTML = Object.entries(EXPORT_FORMATS).map(([id, format]) => `
      <button class="export-format" type="button" role="radio" aria-checked="false" data-format="${id}">
        <span class="ext">.${format.extension}</span>
        <b>${format.name} · ${format.label}</b>
        <span>${format.description}</span>
      </button>`).join('');
  }

  function updateExportUI() {
    const format = EXPORT_FORMATS[state.exportFormat];
    const file = exportFileName(format.extension);
    const includeAnswer = els.exportAnswer.checked;
    const includeSteps = els.exportSteps.checked;
    $$('.export-format', els.exportFormats).forEach((button) => {
      const active = button.dataset.format === state.exportFormat;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
    els.exportAnswerLabel.textContent = state.exportFormat === 'png' ? '附带答案图' : '包含答案';
    els.exportStepsOption.hidden = state.exportFormat !== 'txt';
    const parts = [file];
    if (state.exportFormat === 'txt') {
      parts.push(includeAnswer ? '题面 + 答案' : '仅题面');
      if (includeSteps) parts.push('含分步解析');
    } else if (state.exportFormat === 'csv') {
      parts.push(includeAnswer ? '题目表 + 答案表' : '仅题目表');
      parts.push('Excel 可直接打开');
    } else {
      parts.push(includeAnswer ? '1080 × 1810 px，附答案图' : '1080 × 1240 px');
    }
    els.exportPreview.textContent = parts.join(' · ');
    els.downloadExport.textContent = `下载 .${format.extension}`;
    els.exportSteps.disabled = state.exportFormat !== 'txt';
  }

  function openExport() {
    if (!state.result) {
      showToast('还没有可导出的题目。');
      return;
    }
    const info = exportInfo();
    const stats = state.result.stats;
    els.exportSummary.innerHTML = `
      <div>
        <p class="kicker">${escapeHtml(info.id)}</p>
        <h3>${escapeHtml(info.title)}</h3>
      </div>
      <div class="export-summary-meta">
        <span>${stats.givens} 线索</span>
        <span>${stats.totalSteps} 步</span>
        <span>${state.result.warnings.length ? '多解' : '唯一解'}</span>
      </div>`;
    if (!els.exportFormats.children.length) buildExportFormats();
    updateExportUI();
    openModal(els.exportModal);
  }

  async function copyText(text) {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (error) { /* 继续尝试兼容复制 */ }
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
      } catch (error) { /* 忽略，下面统一提示 */ }
    }
    showToast(copied ? '已复制 81 字符题面' : '复制失败，请手动选择题面');
  }

  async function downloadExport() {
    if (!state.result) return;
    const format = EXPORT_FORMATS[state.exportFormat];
    const filename = exportFileName(format.extension);
    els.downloadExport.disabled = true;
    const oldLabel = els.downloadExport.textContent;
    els.downloadExport.textContent = '导出中…';
    try {
      if (state.exportFormat === 'txt') {
        downloadBlob(new Blob([buildTextExport()], { type: 'text/plain;charset=utf-8' }), filename);
      } else if (state.exportFormat === 'csv') {
        downloadBlob(new Blob([buildCsvExport()], { type: 'text/csv;charset=utf-8' }), filename);
      } else {
        const blob = await buildPngExport();
        downloadBlob(blob, filename);
      }
      showToast(`已导出 ${filename}`);
    } catch (error) {
      showToast(error.message || '导出失败，请重试');
    } finally {
      els.downloadExport.disabled = false;
      els.downloadExport.textContent = oldLabel;
      updateExportUI();
    }
  }

  /* --------------------------------- editor --------------------------------- */
  function buildEditorGrid() {
    const frag = document.createDocumentFragment();
    for (let idx = 0; idx < 81; idx++) {
      const input = document.createElement('input');
      input.className = 'editor-cell';
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 1;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.index = idx;
      input.setAttribute('aria-label', `第${Math.floor(idx / 9) + 1}行第${(idx % 9) + 1}列`);
      const r = Math.floor(idx / 9);
      const c = idx % 9;
      if (c === 2 || c === 5) input.classList.add('block-gap-r');
      if (r === 2 || r === 5) input.classList.add('block-gap-b');
      frag.appendChild(input);
    }
    els.editorGrid.innerHTML = '';
    els.editorGrid.appendChild(frag);
  }

  function buildEditorPresets() {
    els.editorPresets.innerHTML = E.PRESETS.map((preset, index) => `
      <button class="preset-pick" type="button" data-editor-preset="${index}">
        ${escapeHtml(preset.name)} <small>${escapeHtml(preset.difficulty)} · ${escapeHtml(preset.label)}</small>
      </button>`).join('');
  }

  function editorInputs() {
    return $$('.editor-cell', els.editorGrid);
  }

  function fillEditor(gridLike) {
    const inputs = editorInputs();
    for (let i = 0; i < 81; i++) {
      const value = Number(gridLike[i]) || 0;
      inputs[i].value = value ? String(value) : '';
    }
  }

  function editorGridValue() {
    return editorInputs().map((input) => input.value.trim() || '0').join('');
  }

  function showEditorError(message) {
    els.editorError.textContent = message;
    els.editorError.hidden = !message;
  }

  function openModal(modal) {
    if (!modal) return;
    stopPlayback();
    if (state.activeModal && state.activeModal !== modal) state.activeModal.hidden = true;
    state.lastFocus = document.activeElement;
    state.activeModal = modal;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const card = modal.querySelector('.modal-card');
    if (card) card.scrollTop = 0;
    requestAnimationFrame(() => {
      const preferred = modal.querySelector('[data-modal-focus]');
      const target = preferred || modal.querySelector('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)');
      if (target) target.focus();
    });
  }

  function closeActiveModal(options = {}) {
    const modal = state.activeModal;
    if (!modal) return;
    modal.hidden = true;
    state.activeModal = null;
    document.body.style.overflow = '';
    if (options.restoreFocus !== false && state.lastFocus && typeof state.lastFocus.focus === 'function') {
      state.lastFocus.focus();
    }
  }

  function closeEditor() {
    if (state.activeModal === els.editorModal) closeActiveModal();
  }

  function openEditor() {
    if (state.result) {
      fillEditor(state.result.initialGrid);
    } else {
      fillEditor(new Array(81).fill(0));
    }
    els.pasteInput.value = '';
    showEditorError('');
    openModal(els.editorModal);
    requestAnimationFrame(() => {
      const inputs = editorInputs();
      const firstEmpty = inputs.find((input) => !input.value) || inputs[0];
      firstEmpty.focus();
      firstEmpty.select();
    });
  }

  function normalizePuzzleText(text) {
    return String(text || '')
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9.]/g, '')
      .replace(/\./g, '0');
  }

  function fillFromPastedText(text, announce = true) {
    const clean = normalizePuzzleText(text);
    if (clean.length !== 81) {
      if (announce && clean.length) showEditorError(`已识别 ${clean.length} / 81 个格子，继续粘贴或手动补全。`);
      return false;
    }
    fillEditor(clean);
    showEditorError('');
    if (announce) showToast('已填入 81 个格子，确认后开始推理');
    return true;
  }

  function focusEditorCell(index) {
    const inputs = editorInputs();
    if (inputs[index]) {
      inputs[index].focus();
      inputs[index].select();
    }
  }

  function submitEditor() {
    const raw = editorGridValue();
    if (!raw.replace(/0/g, '')) {
      showEditorError('盘面还是空的。先填入一些已知数，或从示例开始。');
      return;
    }
    const empties = raw.split('').filter((ch) => ch === '0').length;
    if (empties === 0) {
      showEditorError('盘面已经填满了。留一些空格，才能演示推理过程。');
      return;
    }
    let result;
    try {
      result = E.solvePuzzle(raw);
    } catch (error) {
      showEditorError(error.message || '这道题无法求解。');
      return;
    }
    closeEditor();
    loadPuzzle(raw, { type: 'custom' }, result);
    showToast(`题目已载入 · ${result.stats.totalSteps} 步推理`);
  }

  function scrollToPanel(element) {
    if (!element) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function trapModalFocus(event) {
    if (!state.activeModal || event.key !== 'Tab') return;
    const focusable = $$('button, input, textarea, [tabindex]:not([tabindex="-1"])', state.activeModal)
      .filter((el) => !el.disabled && el.offsetParent !== null);
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

  function bindEvents() {
    els.presetTabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-preset]');
      if (!tab) return;
      loadPreset(Number(tab.dataset.preset), { toast: false });
    });

    els.cyclePreset.addEventListener('click', cyclePreset);
    els.candidatesToggle.addEventListener('click', () => {
      setCandidates(!state.showCandidates);
      try { window.localStorage.setItem('sudoku-candidates', state.showCandidates ? '1' : '0'); } catch (error) { /* ignore */ }
    });
    els.randomBtn.addEventListener('click', openGenerator);
    els.exportBtn.addEventListener('click', openExport);
    els.openEditor.addEventListener('click', openEditor);
    els.prevBtn.addEventListener('click', prevStep);
    els.nextBtn.addEventListener('click', nextStep);
    els.playBtn.addEventListener('click', togglePlayback);
    els.jumpBtn.addEventListener('click', jumpToNewTechnique);
    els.panelPrev.addEventListener('click', prevStep);
    els.panelNext.addEventListener('click', nextStep);
    els.toReason.addEventListener('click', () => scrollToPanel(els.reasonPanel));
    els.toBoard.addEventListener('click', () => scrollToPanel(els.boardPanel));

    els.speedSelect.addEventListener('change', () => {
      state.speed = Number(els.speedSelect.value) || 1600;
      try { window.localStorage.setItem('sudoku-speed', String(state.speed)); } catch (error) { /* ignore */ }
      if (state.playing) scheduleNext();
    });

    els.reasonBody.addEventListener('click', (event) => {
      const introStart = event.target.closest('#introStart');
      if (introStart) {
        goToStep(0);
        return;
      }
      const chip = event.target.closest('[data-step]');
      if (chip) {
        goToStep(Number(chip.dataset.step));
        return;
      }
      const history = event.target.closest('[data-index]');
      if (history) {
        goToStep(Number(history.dataset.index));
      }
    });

    document.addEventListener('keydown', (event) => {
      if (state.activeModal) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeActiveModal();
        } else {
          trapModalFocus(event);
        }
        return;
      }
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.code === 'Space' && (tag === 'BUTTON' || tag === 'A')) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextStep();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prevStep();
      } else if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.playing) stopPlayback();
    });

    /* generator */
    els.difficultyGrid.addEventListener('click', (event) => {
      const card = event.target.closest('[data-difficulty]');
      if (card) selectGeneratorDifficulty(card.dataset.difficulty);
    });
    els.generateBtn.addEventListener('click', generateRandom);
    els.generationResult.addEventListener('click', (event) => {
      if (event.target.closest('#useGenerated')) useGenerated(state.generated, false);
      else if (event.target.closest('#exportGenerated')) useGenerated(state.generated, true);
      else if (event.target.closest('#regenGenerated')) generateRandom();
    });
    els.closeGenerator.addEventListener('click', () => closeActiveModal());
    els.generatorModal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-generator]')) closeActiveModal();
    });

    /* export */
    els.exportFormats.addEventListener('click', (event) => {
      const format = event.target.closest('[data-format]');
      if (!format) return;
      state.exportFormat = format.dataset.format;
      updateExportUI();
    });
    els.exportAnswer.addEventListener('change', updateExportUI);
    els.exportSteps.addEventListener('change', updateExportUI);
    els.copyPuzzle.addEventListener('click', () => copyText(state.puzzle || ''));
    els.downloadExport.addEventListener('click', downloadExport);
    els.closeExport.addEventListener('click', () => closeActiveModal());
    els.exportModal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-export]')) closeActiveModal();
    });

    /* editor modal */
    els.closeEditor.addEventListener('click', closeEditor);
    els.cancelEditor.addEventListener('click', closeEditor);
    els.editorModal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-editor]')) closeEditor();
    });
    els.submitEditor.addEventListener('click', submitEditor);
    els.clearEditor.addEventListener('click', () => {
      fillEditor(new Array(81).fill(0));
      els.pasteInput.value = '';
      showEditorError('');
      focusEditorCell(0);
    });

    els.editorPresets.addEventListener('click', (event) => {
      const pick = event.target.closest('[data-editor-preset]');
      if (!pick) return;
      const preset = E.PRESETS[Number(pick.dataset.editorPreset)];
      if (!preset) return;
      fillEditor(preset.puzzle);
      els.pasteInput.value = '';
      showEditorError('');
      const firstEmpty = editorInputs().find((input) => !input.value);
      if (firstEmpty) firstEmpty.focus();
      showToast(`已填入「${preset.name}」示例`);
    });

    els.editorGrid.addEventListener('input', (event) => {
      const input = event.target.closest('.editor-cell');
      if (!input) return;
      const cleaned = input.value.replace(/\D/g, '').slice(-1);
      input.value = cleaned;
      if (cleaned) {
        const index = Number(input.dataset.index);
        const next = editorInputs()[index + 1];
        if (next) {
          next.focus();
          next.select();
        }
      }
    });

    els.editorGrid.addEventListener('keydown', (event) => {
      const input = event.target.closest('.editor-cell');
      if (!input) return;
      const index = Number(input.dataset.index);
      const r = Math.floor(index / 9);
      const c = index % 9;
      if (event.key === 'ArrowRight' && c < 8) { event.preventDefault(); focusEditorCell(index + 1); }
      else if (event.key === 'ArrowLeft' && c > 0) { event.preventDefault(); focusEditorCell(index - 1); }
      else if (event.key === 'ArrowUp' && r > 0) { event.preventDefault(); focusEditorCell(index - 9); }
      else if (event.key === 'ArrowDown' && r < 8) { event.preventDefault(); focusEditorCell(index + 9); }
      else if (event.key === 'Backspace' && !input.value && index > 0) {
        event.preventDefault();
        const prev = editorInputs()[index - 1];
        prev.value = '';
        prev.focus();
        prev.select();
      }
      else if (event.key === 'Enter') {
        event.preventDefault();
        submitEditor();
      }
    });

    els.editorGrid.addEventListener('paste', (event) => {
      const text = event.clipboardData && event.clipboardData.getData('text');
      if (!text) return;
      const clean = normalizePuzzleText(text);
      if (clean.length >= 81) {
        event.preventDefault();
        fillFromPastedText(clean.slice(0, 81));
      } else if (clean.length === 1) {
        event.preventDefault();
        const input = event.target.closest('.editor-cell');
        if (input) input.value = clean;
      }
    });

    els.pasteInput.addEventListener('input', () => {
      const clean = normalizePuzzleText(els.pasteInput.value);
      if (clean.length === 81) fillFromPastedText(clean);
      else if (clean.length > 81) showEditorError(`识别到 ${clean.length} 个字符，只需要 81 个。`);
      else if (clean.length) showEditorError(`已识别 ${clean.length} / 81 个格子。`);
      else showEditorError('');
    });
  }

  function restorePreferences() {
    try {
      const saved = window.localStorage.getItem('sudoku-candidates');
      if (saved === '0' || saved === '1') state.showCandidates = saved === '1';
      const speed = window.localStorage.getItem('sudoku-speed');
      if (speed) {
        state.speed = Number(speed) || 1600;
        els.speedSelect.value = String(state.speed);
      }
    } catch (error) { /* localStorage 不可用也不影响 */ }
    setCandidates(state.showCandidates);
  }

  function init() {
    buildEditorGrid();
    buildEditorPresets();
    buildDifficultyGrid();
    buildExportFormats();
    bindEvents();
    renderTabs();
    restorePreferences();
    const params = new URLSearchParams(window.location.search);
    const reviewPuzzle = params.get('p');
    if (reviewPuzzle) {
      try {
        loadPuzzle(reviewPuzzle, { type: 'custom', fromPlay: true });
        showToast('已载入实战题目');
      } catch (error) {
        loadPreset(1, { toast: false });
      }
    } else {
      loadPreset(1, { toast: false });
    }
  }

  init();
})();
