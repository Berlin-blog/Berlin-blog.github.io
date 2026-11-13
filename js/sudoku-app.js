(function () {
  'use strict';

  const E = window.SudokuEngine;
  if (!E) throw new Error('SudokuEngine 未加载');

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
    modalOpen: false,
    lastFocus: null,
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

    const frag = document.createDocumentFragment();
    for (let block = 0; block < 9; block++) {
      const blockEl = document.createElement('div');
      blockEl.className = 'board-block';
      blockEl.setAttribute('role', 'row');
      for (let local = 0; local < 9; local++) {
        const br = Math.floor(block / 3);
        const bc = block % 3;
        const r = br * 3 + Math.floor(local / 3);
        const c = bc * 3 + (local % 3);
        const idx = r * 9 + c;
        const value = grid[idx];
        const isGiven = Boolean(givens[idx]);
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.index = idx;
        if (isGiven) cell.classList.add('is-given');
        else if (value) cell.classList.add('is-solved');
        if (unitCells.has(idx)) cell.classList.add('unit-hint');
        if (inspect.has(idx)) cell.classList.add('inspect');
        if (evidence.has(idx)) cell.classList.add('evidence');
        if (targets.has(idx)) cell.classList.add('target');
        if (focus.has(idx)) cell.classList.add('focus');

        if (value) {
          const valueEl = document.createElement('span');
          valueEl.className = 'value';
          valueEl.textContent = String(value);
          cell.appendChild(valueEl);
          cell.setAttribute('aria-label', `第${r + 1}行第${c + 1}列，${isGiven ? '已知' : '推出'}数字 ${value}`);
        } else {
          const notes = document.createElement('div');
          notes.className = 'notes';
          const goneSet = ghost.get(idx);
          const candidateValues = E.maskValues(cands[idx]);
          for (let d = 1; d <= 9; d++) {
            const note = document.createElement('span');
            note.className = 'note';
            if (cands[idx] & E.BITS[d]) {
              note.textContent = String(d);
            } else if (goneSet && goneSet.has(d)) {
              note.textContent = String(d);
              note.classList.add('gone');
            } else {
              note.classList.add('empty');
            }
            notes.appendChild(note);
          }
          cell.appendChild(notes);
          cell.setAttribute('aria-label', `第${r + 1}行第${c + 1}列，候选数 ${candidateValues.join('、') || '无'}`);
        }
        blockEl.appendChild(cell);
      }
      frag.appendChild(blockEl);
    }
    els.board.innerHTML = '';
    els.board.appendChild(frag);
    els.board.classList.toggle('hide-notes', !state.showCandidates);
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
    const preset = state.meta && state.meta.preset;
    const custom = state.meta && state.meta.type === 'custom';
    const givens = stats.givens;
    const total = stats.totalSteps;
    const pure = stats.logicalSteps;
    const fallback = stats.fallbackSteps;
    const lede = custom
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

  function currentTitle(preset) {
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
    els.puzzleKicker.textContent = meta && meta.type === 'preset'
      ? `PUZZLE ${pad2(meta.presetIndex + 1)} / ${pad2(E.PRESETS.length)} · ${meta.preset.difficulty}`
      : 'CUSTOM PUZZLE · 自定义';
    els.puzzleName.textContent = currentTitle(meta && meta.preset);
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
    els.board.classList.toggle('hide-notes', !show);
    els.candidatesToggle.classList.toggle('is-on', show);
    els.candidatesToggle.setAttribute('aria-pressed', String(show));
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

  function openEditor() {
    stopPlayback();
    state.lastFocus = document.activeElement;
    if (state.result) {
      fillEditor(state.result.initialGrid);
    } else {
      fillEditor(new Array(81).fill(0));
    }
    els.pasteInput.value = '';
    showEditorError('');
    els.editorModal.hidden = false;
    state.modalOpen = true;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const inputs = editorInputs();
      const firstEmpty = inputs.find((input) => !input.value) || inputs[0];
      firstEmpty.focus();
      firstEmpty.select();
    });
  }

  function closeEditor() {
    if (!state.modalOpen) return;
    state.modalOpen = false;
    els.editorModal.hidden = true;
    document.body.style.overflow = '';
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
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
    if (!state.modalOpen || event.key !== 'Tab') return;
    const focusable = $$('button, input, textarea, [tabindex]:not([tabindex="-1"])', els.editorModal)
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
      if (state.modalOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeEditor();
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

    /* modal */
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
    bindEvents();
    renderTabs();
    restorePreferences();
    loadPreset(1, { toast: false });
  }

  init();
})();
