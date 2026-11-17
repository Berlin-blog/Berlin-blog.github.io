/*
 * 数独随机出题器
 * 先生成完整终盘，再随机挖空，并在每次挖空后验证“仍然只有唯一解”。
 * 难度用目标已知数控制：线索越多越轻松，越少越需要更长的推理链。
 */
(function (global) {
  'use strict';

  const E = global.SudokuEngine
    || (typeof module !== 'undefined' && module.exports ? require('./sudoku-engine.js') : null);
  if (!E) throw new Error('SudokuGenerator 需要先加载 SudokuEngine');

  const DIFFICULTIES = [
    {
      id: 'easy',
      name: '入门',
      target: 40,
      label: '40 个已知数',
      description: '线索充足，适合先熟悉盘面和候选数。',
      tone: 'mint',
    },
    {
      id: 'medium',
      name: '进阶',
      target: 33,
      label: '33 个已知数',
      description: '线索适中，推理链会比入门更长。',
      tone: 'amber',
    },
    {
      id: 'hard',
      name: '高阶',
      target: 28,
      label: '28 个已知数',
      description: '空格更多，更容易出现复杂候选与更长的推理链。',
      tone: 'coral',
    },
    {
      id: 'expert',
      name: '专家',
      target: 24,
      label: '24 个已知数',
      description: '线索最少，可能触发分支验证兜底。',
      tone: 'violet',
    },
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      global.crypto.getRandomValues(buf);
      return buf[0] >>> 0;
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function makeRng(seed) {
    const next = mulberry32(seed);
    function shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = array[i];
        array[i] = array[j];
        array[j] = tmp;
      }
      return array;
    }
    return { next, shuffle };
  }

  function randomSolution(rng) {
    const grid = new Uint8Array(81);
    const B = E.BITS;

    function candidatesAt(idx) {
      let mask = E.ALL;
      for (const peer of E.PEERS[idx]) {
        if (grid[peer]) mask &= ~B[grid[peer]];
      }
      return mask;
    }

    function fill() {
      let best = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let idx = 0; idx < 81; idx++) {
        if (grid[idx]) continue;
        const mask = candidatesAt(idx);
        const n = E.countBits(mask);
        if (n === 0) return false;
        if (n < bestCount) {
          bestCount = n;
          best = idx;
          bestMask = mask;
          if (n === 1) break;
        }
      }
      if (best === -1) return true;
      for (const value of rng.shuffle(E.maskValues(bestMask))) {
        grid[best] = value;
        if (fill()) return true;
        grid[best] = 0;
      }
      return false;
    }

    if (!fill()) throw new Error('随机终盘生成失败，请重试。');
    return grid;
  }

  function carveUnique(solution, target, rng) {
    const puzzle = Uint8Array.from(solution);
    const order = rng.shuffle(Array.from({ length: 81 }, (_, i) => i));
    let clues = 81;

    for (const idx of order) {
      if (clues <= target) break;
      const old = puzzle[idx];
      puzzle[idx] = 0;
      if (E.countSolutions(puzzle, 2) !== 1) {
        puzzle[idx] = old;
      } else {
        clues--;
      }
    }

    return { puzzle, clues };
  }

  function difficultyById(id) {
    return DIFFICULTIES.find((difficulty) => difficulty.id === id) || DIFFICULTIES[1];
  }

  function techniqueSummary(result) {
    const order = [];
    const counts = {};
    result.steps.forEach((step) => {
      if (!Object.prototype.hasOwnProperty.call(counts, step.technique)) {
        counts[step.technique] = 0;
        order.push({ technique: step.technique, tone: step.tone });
      }
      counts[step.technique]++;
    });
    return order.map((item) => ({ ...item, count: counts[item.technique] }));
  }

  function generatePuzzle(options = {}) {
    const difficulty = difficultyById(options.difficulty);
    const seed = Number.isFinite(options.seed) ? (options.seed >>> 0) : randomSeed();
    const rng = makeRng(seed);
    const solution = randomSolution(rng);
    const { puzzle, clues } = carveUnique(solution, difficulty.target, rng);
    const puzzleString = Array.from(puzzle).join('');
    const solutionString = Array.from(solution).join('');
    const analysis = E.solvePuzzle(puzzleString);

    if (analysis.warnings.length) {
      throw new Error('生成的题目不是唯一解，请重新生成。');
    }

    return {
      puzzle: puzzleString,
      solution: solutionString,
      clues,
      difficulty,
      seed,
      id: `SD-${difficulty.id.slice(0, 2).toUpperCase()}-${seed.toString(36).toUpperCase().padStart(6, '0')}`,
      stats: analysis.stats,
      techniques: techniqueSummary(analysis),
      analysis,
    };
  }

  const Generator = {
    DIFFICULTIES,
    difficultyById,
    generatePuzzle,
    randomSeed,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
  global.SudokuGenerator = Generator;
})(typeof window !== 'undefined' ? window : globalThis);
