/*
 * 通用数独盘面组件
 * 推理页和实战页共用同一套 9×9 DOM、候选数布局与高亮类。
 */
(function (global) {
  'use strict';

  const E = global.SudokuEngine
    || (typeof module !== 'undefined' && module.exports ? require('./sudoku-engine.js') : null);

  function has(setOrArray, idx) {
    if (!setOrArray) return false;
    if (setOrArray instanceof Set) return setOrArray.has(idx);
    return Array.from(setOrArray).includes(idx);
  }

  class SudokuBoard {
    constructor(mount, options = {}) {
      if (!mount) throw new Error('SudokuBoard 需要一个挂载节点');
      this.mount = mount;
      this.onCellClick = options.onCellClick || null;
      this.cells = [];
      this.blocks = [];
      this.showNotes = true;
      this._build();
      if (this.onCellClick) {
        this.mount.addEventListener('click', (event) => {
          const cell = event.target.closest('.cell');
          if (!cell) return;
          this.onCellClick(Number(cell.dataset.index), event);
        });
      }
    }

    _build() {
      this.mount.classList.add('board');
      this.mount.innerHTML = '';
      const frag = document.createDocumentFragment();
      this.cells = [];
      this.blocks = [];

      for (let block = 0; block < 9; block++) {
        const blockEl = document.createElement('div');
        blockEl.className = 'board-block';
        blockEl.setAttribute('role', 'row');
        this.blocks.push(blockEl);
        for (let local = 0; local < 9; local++) {
          const br = Math.floor(block / 3);
          const bc = block % 3;
          const r = br * 3 + Math.floor(local / 3);
          const c = bc * 3 + (local % 3);
          const idx = r * 9 + c;
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.setAttribute('role', 'gridcell');
          cell.dataset.index = String(idx);
          cell.tabIndex = -1;
          this.cells[idx] = cell;
          blockEl.appendChild(cell);
        }
        frag.appendChild(blockEl);
      }
      this.mount.appendChild(frag);
    }

    setNotesVisible(show) {
      this.showNotes = Boolean(show);
      this.mount.classList.toggle('hide-notes', !this.showNotes);
    }

    setInteractive(interactive) {
      this.interactive = Boolean(interactive);
    }

    render(model = {}) {
      const grid = model.grid || new Array(81).fill(0);
      const givens = model.givens || [];
      const cands = model.cands || new Uint16Array(81);
      const ghost = model.ghost || new Map();
      const highlights = model.highlights || {};
      const activeIndex = Number.isInteger(model.activeIndex) ? model.activeIndex : -1;
      const highlightKeys = Object.keys(highlights);

      for (let idx = 0; idx < 81; idx++) {
        const cell = this.cells[idx];
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        const value = grid[idx] || 0;
        const isGiven = Boolean(givens[idx]);
        const wasFocused = document.activeElement === cell;

        cell.className = 'cell';
        if (isGiven) cell.classList.add('is-given');
        else if (value) cell.classList.add('is-solved');

        for (const key of highlightKeys) {
          if (has(highlights[key], idx)) cell.classList.add(key);
        }

        cell.innerHTML = '';

        if (value) {
          const valueEl = document.createElement('span');
          valueEl.className = 'value';
          valueEl.textContent = String(value);
          cell.appendChild(valueEl);
          cell.setAttribute('aria-label', `第${r + 1}行第${c + 1}列，${isGiven ? '已知' : '已填'}数字 ${value}`);
        } else {
          const notes = document.createElement('div');
          notes.className = 'notes';
          const goneSet = ghost.get(idx);
          const candidateValues = [];
          for (let d = 1; d <= 9; d++) {
            const note = document.createElement('span');
            note.className = 'note';
            if (cands[idx] & E.BITS[d]) {
              note.textContent = String(d);
              candidateValues.push(d);
            } else if (goneSet && (goneSet instanceof Set ? goneSet.has(d) : goneSet.includes(d))) {
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

        if (this.onCellClick) {
          cell.tabIndex = idx === activeIndex ? 0 : -1;
          cell.setAttribute('aria-selected', idx === activeIndex ? 'true' : 'false');
          if (idx === activeIndex) cell.setAttribute('aria-current', 'true');
          else cell.removeAttribute('aria-current');
          if (wasFocused && idx !== activeIndex) cell.blur();
        } else {
          cell.tabIndex = -1;
          cell.removeAttribute('aria-selected');
          cell.removeAttribute('aria-current');
        }
      }

      this.mount.classList.toggle('hide-notes', !this.showNotes);
    }

    focusCell(index) {
      const cell = this.cells[index];
      if (!cell) return;
      cell.focus({ preventScroll: true });
    }

    getCell(index) {
      return this.cells[index] || null;
    }

    destroy() {
      this.mount.innerHTML = '';
      this.cells = [];
      this.blocks = [];
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = SudokuBoard;
  global.SudokuBoard = SudokuBoard;
})(typeof window !== 'undefined' ? window : globalThis);
