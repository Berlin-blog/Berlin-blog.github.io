/*
 * 数独推理引擎
 * 纯前端、无依赖。先用人类可读的技巧推进；实在无解可推时，
 * 才使用带明确标注的分支验证兜底，保证任何合法题目都能完成。
 */
(function (global) {
  'use strict';

  const ALL = 0x1ff; // bit 1..9
  const BITS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256];

  const ROWS = [];
  const COLS = [];
  const BOXES = [];
  for (let r = 0; r < 9; r++) {
    const row = [];
    for (let c = 0; c < 9; c++) row.push(r * 9 + c);
    ROWS.push(row);
  }
  for (let c = 0; c < 9; c++) {
    const col = [];
    for (let r = 0; r < 9; r++) col.push(r * 9 + c);
    COLS.push(col);
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const box = [];
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) box.push(r * 9 + c);
      }
      BOXES.push(box);
    }
  }

  const UNITS = [];
  ROWS.forEach((cells, index) => UNITS.push({ type: 'row', index, cells }));
  COLS.forEach((cells, index) => UNITS.push({ type: 'col', index, cells }));
  BOXES.forEach((cells, index) => UNITS.push({ type: 'box', index, cells }));

  const CELL_UNITS = Array.from({ length: 81 }, () => []);
  UNITS.forEach((unit, uid) => unit.cells.forEach((idx) => CELL_UNITS[idx].push(uid)));

  const PEERS = Array.from({ length: 81 }, () => []);
  for (let idx = 0; idx < 81; idx++) {
    const set = new Set();
    CELL_UNITS[idx].forEach((uid) => UNITS[uid].cells.forEach((p) => {
      if (p !== idx) set.add(p);
    }));
    PEERS[idx] = Array.from(set);
  }

  const ROW_OF = (idx) => Math.floor(idx / 9);
  const COL_OF = (idx) => idx % 9;
  const BOX_OF = (idx) => Math.floor(ROW_OF(idx) / 3) * 3 + Math.floor(COL_OF(idx) / 3);
  const CELL = (idx) => `R${ROW_OF(idx) + 1}C${COL_OF(idx) + 1}`;
  const CELL_CN = (idx) => `第${ROW_OF(idx) + 1}行第${COL_OF(idx) + 1}列`;

  function maskValues(mask) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (mask & BITS[d]) out.push(d);
    return out;
  }

  function countBits(mask) {
    let n = 0;
    while (mask) { mask &= mask - 1; n++; }
    return n;
  }

  function digitList(values, sep = '、') {
    return values.slice().sort((a, b) => a - b).join(sep);
  }

  function unitName(unit) {
    if (unit.type === 'row') return `第${unit.index + 1}行`;
    if (unit.type === 'col') return `第${unit.index + 1}列`;
    return `第${unit.index + 1}宫`;
  }

  function unitRelation(unit) {
    if (unit.type === 'row') return '同行';
    if (unit.type === 'col') return '同列';
    return '同宫';
  }

  function unitDigitCells(cands, unit, d) {
    return unit.cells.filter((idx) => cands[idx] & BITS[d]);
  }

  function unitHasDigit(grid, unit, d) {
    return unit.cells.some((idx) => grid[idx] === d);
  }

  function parsePuzzle(input) {
    let clean;
    if (Array.isArray(input)) {
      clean = input.map((x) => (x === null || x === undefined || x === 0 || x === '0' || x === '.' ? '0' : String(x))).join('');
    } else {
      clean = String(input || '').replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/[^0-9.]/g, '')
        .replace(/\./g, '0');
    }
    if (clean.length !== 81) {
      throw new Error(`需要 81 个格子，目前识别到 ${clean.length} 个。请检查是否漏行或多了字符。`);
    }
    const grid = new Uint8Array(81);
    for (let i = 0; i < 81; i++) {
      const n = Number(clean[i]);
      if (!Number.isInteger(n) || n < 0 || n > 9) throw new Error(`第 ${i + 1} 个格子的内容无法识别。`);
      grid[i] = n;
    }

    for (const unit of UNITS) {
      const seen = new Map();
      for (const idx of unit.cells) {
        const v = grid[idx];
        if (!v) continue;
        if (seen.has(v)) {
          throw new Error(`${unitName(unit)}里的数字 ${v} 重复了（${CELL(seen.get(v))} 与 ${CELL(idx)}）。`);
        }
        seen.set(v, idx);
      }
    }
    return grid;
  }

  function computeCandidates(grid) {
    const cands = new Uint16Array(81);
    for (let idx = 0; idx < 81; idx++) {
      if (grid[idx]) continue;
      let mask = ALL;
      for (const p of PEERS[idx]) {
        if (grid[p]) mask &= ~BITS[grid[p]];
      }
      cands[idx] = mask;
    }
    return cands;
  }

  function gridIsValid(grid) {
    for (const unit of UNITS) {
      let seen = 0;
      for (const idx of unit.cells) {
        const v = grid[idx];
        if (!v) continue;
        if (seen & BITS[v]) return false;
        seen |= BITS[v];
      }
    }
    return true;
  }

  function isSolved(grid) {
    for (let i = 0; i < 81; i++) if (!grid[i]) return false;
    return gridIsValid(grid);
  }

  function cloneGrid(grid) {
    return Uint8Array.from(grid);
  }

  // 快速求解 / 计数：只用于校验与兜底，不参与逻辑步骤。
  function search(grid, limit, collect) {
    const work = cloneGrid(grid);
    const result = collect ? new Uint8Array(81) : null;
    let found = 0;

    function recurse() {
      if (found >= limit) return;
      let best = -1;
      let bestMask = 0;
      let bestCount = 10;
      const cands = computeCandidates(work);
      for (let idx = 0; idx < 81; idx++) {
        if (work[idx]) continue;
        const n = countBits(cands[idx]);
        if (n === 0) return;
        if (n < bestCount) {
          bestCount = n;
          best = idx;
          bestMask = cands[idx];
          if (n === 1) break;
        }
      }
      if (best === -1) {
        found++;
        if (collect && found === 1) result.set(work);
        return;
      }
      for (const d of maskValues(bestMask)) {
        work[best] = d;
        recurse();
        work[best] = 0;
        if (found >= limit) return;
      }
    }

    recurse();
    return { count: found, solution: found ? result : null };
  }

  function countSolutions(grid, limit = 2) {
    return search(grid, limit, false).count;
  }

  function solveGrid(grid) {
    const res = search(grid, 1, true);
    return res.solution;
  }

  function emptyList(cands, unit) {
    return unit.cells.filter((idx) => cands[idx]);
  }

  function removeValues(changes) {
    return changes.filter((c) => c.values.length);
  }

  function changeText(changes, max = 4) {
    const sorted = changes.slice().sort((a, b) => a.idx - b.idx);
    const parts = sorted.slice(0, max).map((c) => `${CELL(c.idx)} 去掉 ${digitList(c.values)}`);
    if (sorted.length > max) parts.push(`等 ${sorted.length} 处`);
    return parts.join('；');
  }

  function eliminationCells(changes) {
    return Array.from(new Set(changes.map((c) => c.idx)));
  }

  function focusFromRaw(raw) {
    return raw.focus || [];
  }

  function describeNakedSingle(raw, cands) {
    const { idx, value } = raw;
    const groups = { row: [], col: [], box: [] };
    const blockCells = { row: [], col: [], box: [] };
    for (let d = 1; d <= 9; d++) {
      if (d === value) continue;
      for (const type of ['row', 'col', 'box']) {
        const uid = CELL_UNITS[idx].find((u) => UNITS[u].type === type);
        const unit = UNITS[uid];
        const blocker = unit.cells.find((p) => p !== idx && gridValueForExplain[p] === d);
        if (blocker !== undefined) {
          groups[type].push(d);
          blockCells[type].push(blocker);
          break;
        }
      }
    }
    const groupText = [
      groups.row.length ? `同行已有 ${digitList(groups.row)}` : '',
      groups.col.length ? `同列已有 ${digitList(groups.col)}` : '',
      groups.box.length ? `同宫已有 ${digitList(groups.box)}` : '',
    ].filter(Boolean).join('；');
    return {
      title: `${CELL(idx)} 被排除到只剩 ${value}`,
      summary: `${CELL(idx)} 的候选数只剩 ${value}。它所在的${CELL_CN(idx)}周围，其它八个数字都已经出现，没有第二种选择。`,
      chain: [
        { k: '观察', t: `先看 ${CELL(idx)}。按行、列、宫扫过它的 20 个关联格，目前只剩 ${value} 没有出现。` },
        { k: '排除', t: `${groupText} —— 1 到 9 里除了 ${value} 都被占掉。` },
        { k: '结论', t: `候选集合收缩到唯一的 ${value}，因此 ${CELL(idx)} = ${value}。` },
      ],
      principle: '唯一候选（Naked Single）是所有技巧的地基：先把每格的候选数写全，再看哪一格只剩一个。不要靠猜，候选数会把答案逼出来。',
      highlights: {
        focus: [idx],
        evidence: Array.from(new Set(blockCells.row.concat(blockCells.col, blockCells.box))),
        targets: [],
        inspect: [],
        eliminations: [],
        units: CELL_UNITS[idx].map((uid) => UNITS[uid]),
      },
    };
  }

  function describeHiddenSingle(raw, cands) {
    const { idx, value, unit } = raw;
    const others = emptyList(cands, unit).filter((p) => p !== idx);
    const examples = [];
    for (const cell of others) {
      const otherUnits = CELL_UNITS[cell].filter((uid) => UNITS[uid] !== unit);
      const blockerUnit = otherUnits.find((uid) => unitHasDigit(gridValueForExplain, UNITS[uid], value));
      if (blockerUnit !== undefined) {
        examples.push(`${CELL(cell)} 的${UNITS[blockerUnit].type === 'row' ? '行' : UNITS[blockerUnit].type === 'col' ? '列' : '宫'}里已有 ${value}`);
      }
    }
    const exampleText = examples.length ? `${examples.slice(0, 3).join('，')}${examples.length > 3 ? '，其余空格也各有冲突' : ''}。` : '';
    return {
      title: `${unitName(unit)}里，${value} 只能落在 ${CELL(idx)}`,
      summary: `在${unitName(unit)}中寻找数字 ${value}：其它空格都因行、列或宫的限制不能再放它，只剩 ${CELL(idx)} 一个落点。`,
      chain: [
        { k: '观察', t: `暂时放下“这一格能填什么”，改问“${unitName(unit)}里的 ${value} 能填在哪”。逐一检查空格后，只有 ${CELL(idx)} 的候选数里还有 ${value}。` },
        { k: '排除', t: `${exampleText}所以这些位置都不能承担这个 ${value}。` },
        { k: '结论', t: `${unitName(unit)}必须出现一次 ${value}，位置已经被压缩到唯一一格：${CELL(idx)} = ${value}。` },
      ],
      principle: '隐性唯一（Hidden Single）要求换个视角：不盯格子，盯数字。一个数字在某一行、列或宫里只剩一个可放位置时，即使那格还有别的候选，也必须先落这个数。',
      highlights: {
        focus: [idx],
        evidence: [],
        targets: [],
        inspect: others,
        eliminations: [],
        units: [unit],
      },
    };
  }

  function describeNakedPair(raw) {
    const { cells, digits, unit, changes } = raw;
    return {
      title: `数对 {${digitList(digits)}} 锁住了 ${CELL(cells[0])} 与 ${CELL(cells[1])}（${unitName(unit)}）`,
      summary: `在${unitName(unit)}里，这两格的候选数完全一样，都只有 {${digitList(digits)}}。它们正好组成一个封闭的两格组合，别处不能再使用这两个数字。`,
      chain: [
        { k: '观察', t: `${CELL(cells[0])} 和 ${CELL(cells[1])} 的候选数都恰好是 {${digitList(digits)}}，没有任何第三个数字。` },
        { k: '锁定', t: `这两格必须一格填 ${digits[0]}、一格填 ${digits[1]}。无论顺序如何，${digitList(digits)} 都被它们用完。` },
        { k: '结论', t: `${unitName(unit)}的其它空格不可能再用 ${digitList(digits)}，删去：${changeText(changes)}。` },
      ],
      principle: '显性数对（Naked Pair）像两个人占住了两个座位：座位满了，别人就不能坐。看到两格候选完全相同且只有两个数，就去同一行、列、宫里删这两个候选。',
      highlights: {
        focus: cells.slice(),
        evidence: [],
        targets: eliminationCells(changes),
        inspect: [],
        eliminations: changes,
        units: [unit],
      },
    };
  }

  function describeHiddenPair(raw) {
    const { cells, digits, unit, changes } = raw;
    return {
      title: `数字 ${digitList(digits)} 被关在 ${CELL(cells[0])}、${CELL(cells[1])} 里（${unitName(unit)}）`,
      summary: `在${unitName(unit)}中分别追踪 ${digitList(digits)}，发现它们都只可能出现在同样两格。于是这两格必须承担这两个数字，格内其它候选都是多余的。`,
      chain: [
        { k: '观察', t: `看${unitName(unit)}：数字 ${digits[0]} 只可能落在 ${CELL(cells[0])}、${CELL(cells[1])}；数字 ${digits[1]} 也只剩同样两格。` },
        { k: '锁定', t: `两条“位置线索”重叠，说明这两格就是 ${digitList(digits)} 的专属位置，没有余量再放别的数。` },
        { k: '结论', t: `从这两格中删去其它候选：${changeText(changes)}。剩下的候选更少，后续会更好推。` },
      ],
      principle: '隐性数对（Hidden Pair）与显性数对方向相反：先追数字，再看格子。两个数字的位置集合完全重合时，这两格便只能属于它们。',
      highlights: {
        focus: cells.slice(),
        evidence: [],
        targets: cells.slice(),
        inspect: [],
        eliminations: changes,
        units: [unit],
      },
    };
  }

  function describeNakedTriple(raw) {
    const { cells, digits, unit, changes } = raw;
    return {
      title: `三数组 {${digitList(digits)}} 占住了三个格子（${unitName(unit)}）`,
      summary: `在${unitName(unit)}里，三个格子的候选并集恰好只有 {${digitList(digits)}} 三个数字。三格瓜分三数，别的格子就被排除在外。`,
      chain: [
        { k: '观察', t: `${cells.map(CELL).join('、')} 三格的候选数合起来正好是 {${digitList(digits)}}，没有第四个数参与。` },
        { k: '锁定', t: `三个格子、三个数字，必须一一对应地填满。无论每个格具体填哪个，${digitList(digits)} 都已被这三格消耗完。` },
        { k: '结论', t: `${unitName(unit)}其它格不能再出现这三个数，删除：${changeText(changes)}。` },
      ],
      principle: '显性三数组（Naked Triple）不要求每格都有三个候选，只看三个格子的“并集”是否正好三个数。并集越小，约束越强。',
      highlights: {
        focus: cells.slice(),
        evidence: [],
        targets: eliminationCells(changes),
        inspect: [],
        eliminations: changes,
        units: [unit],
      },
    };
  }

  function describeHiddenTriple(raw) {
    const { cells, digits, unit, changes } = raw;
    return {
      title: `数字 ${digitList(digits)} 收缩到三个位置（${unitName(unit)}）`,
      summary: `在${unitName(unit)}中，${digitList(digits)} 这三个数字的所有可能位置，合起来只覆盖 ${cells.map(CELL).join('、')}。这三格成了它们的专属空间。`,
      chain: [
        { k: '观察', t: `逐一追踪 ${digitList(digits)} 在${unitName(unit)}里的落点，把位置合并后，只覆盖了 ${cells.map(CELL).join('、')} 三格。` },
        { k: '锁定', t: `三个数字必须占据三个位置，刚好把这三格填满，没有给其它候选留空间。` },
        { k: '结论', t: `清掉这三格里的其它候选：${changeText(changes)}。这一步清理的是“格内杂项”，不是同单位其它格。` },
      ],
      principle: '隐性三数组（Hidden Triple）是在一条单位里找“三个数字的三个共同落点”。它常常能把看起来候选很多的格子一下削干净。',
      highlights: {
        focus: cells.slice(),
        evidence: [],
        targets: cells.slice(),
        inspect: [],
        eliminations: changes,
        units: [unit],
      },
    };
  }

  function describePointing(raw) {
    const { box, line, digit, sources, changes } = raw;
    return {
      title: `第${box.index + 1}宫的 ${digit}，被第${line.index + 1}${line.type === 'row' ? '行' : '列'}接管`,
      summary: `数字 ${digit} 在第${box.index + 1}宫里的所有可能位置，都落在同一${line.type === 'row' ? '行' : '列'}中。宫里一定要有 ${digit}，所以这一${line.type === 'row' ? '行' : '列'}一定被它占住一个位置。`,
      chain: [
        { k: '观察', t: `在第${box.index + 1}宫里找 ${digit} 的候选位置，只剩 ${sources.map(CELL).join('、')}，它们恰好都在第${line.index + 1}${line.type === 'row' ? '行' : '列'}。` },
        { k: '锁定', t: `宫内的 ${digit} 无论落在哪一格，都逃不出这一${line.type === 'row' ? '行' : '列'}。也就是说，这一${line.type === 'row' ? '行' : '列'}已经为宫内的 ${digit} 预留了位置。` },
        { k: '结论', t: `同一${line.type === 'row' ? '行' : '列'}、宫外的格子不能再放 ${digit}，删除：${changeText(changes)}。` },
      ],
      principle: '宫内指向（Pointing）利用宫的约束反推行列：宫里的某个数字被挤到一行/列时，这条线在宫外的相同数字就可以删除。',
      highlights: {
        focus: sources.slice(),
        evidence: [],
        targets: eliminationCells(changes),
        inspect: [],
        eliminations: changes,
        units: [box, line],
      },
    };
  }

  function describeClaiming(raw) {
    const { line, box, digit, sources, changes } = raw;
    return {
      title: `第${line.index + 1}${line.type === 'row' ? '行' : '列'}的 ${digit}，全部缩进第${box.index + 1}宫`,
      summary: `数字 ${digit} 在这一${line.type === 'row' ? '行' : '列'}上的候选位置，全部落在第${box.index + 1}宫。这一${line.type === 'row' ? '行' : '列'}必须有一个 ${digit}，因此宫内这个数字的位置也被锁定了。`,
      chain: [
        { k: '观察', t: `沿第${line.index + 1}${line.type === 'row' ? '行' : '列'}找 ${digit}，候选格只在 ${sources.map(CELL).join('、')}，而它们同属第${box.index + 1}宫。` },
        { k: '锁定', t: `这一${line.type === 'row' ? '行' : '列'}必须出现 ${digit}，且只会出现在宫内。宫内 ${digit} 的名额便被这条线占住。` },
        { k: '结论', t: `第${box.index + 1}宫其余格子删除 ${digit}：${changeText(changes)}。` },
      ],
      principle: '区块占位（Claiming）是宫内指向的反向操作：当一行/列的某数字全在宫内，就从宫内反删这条线之外的相同数字。方向不同，本质都是“区块与线共享名额”。',
      highlights: {
        focus: sources.slice(),
        evidence: [],
        targets: eliminationCells(changes),
        inspect: [],
        eliminations: changes,
        units: [line, box],
      },
    };
  }

  function describeXWing(raw) {
    const { digit, baseType, base, cover, focus, changes } = raw;
    const baseWord = baseType === 'row' ? '行' : '列';
    const coverWord = baseType === 'row' ? '列' : '行';
    return {
      title: `X-Wing：${digit} 被锁在第 ${cover.map((n) => n + 1).join('、')} ${coverWord}`,
      summary: `数字 ${digit} 在第 ${base.map((n) => n + 1).join('、')} ${baseWord}里都只有同样两个位置，形成两${baseWord}两${coverWord}的矩形。其它${baseWord}在这两${coverWord}上的 ${digit} 都不能成立。`,
      chain: [
        { k: '观察', t: `第 ${base[0] + 1} ${baseWord}的 ${digit} 只在第 ${cover[0] + 1}、${cover[1] + 1} ${coverWord}；第 ${base[1] + 1} ${baseWord}也完全一样。` },
        { k: '锁定', t: `这两${baseWord}各要放一个 ${digit}，只能分别占据这两${coverWord}。矩形四个角会被 ${digit} 用掉两个，但这两${coverWord}一定各有一个。` },
        { k: '结论', t: `其它${baseWord}在这两${coverWord}上的 ${digit} 全部删除：${changeText(changes)}。` },
      ],
      principle: 'X-Wing 是第一个“跨单位”技巧：两个单位里同一数字的候选位置形成两行两列的矩形。它不关心最后落在哪两个角，只关心这两个列/行被整条锁定。',
      highlights: {
        focus: focus.slice(),
        evidence: [],
        targets: eliminationCells(changes),
        inspect: [],
        eliminations: changes,
        units: baseType === 'row' ? base.map((n) => UNITS[n]) : base.map((n) => UNITS[9 + n]),
      },
    };
  }

  function describeSwordfish(raw) {
    const { digit, baseType, base, cover, focus, changes } = raw;
    const baseWord = baseType === 'row' ? '行' : '列';
    const coverWord = baseType === 'row' ? '列' : '行';
    return {
      title: `Swordfish：${digit} 的三${baseWord}三${coverWord}封锁`,
      summary: `数字 ${digit} 在三${baseWord}中的候选位置，合起来只覆盖三${coverWord}。三${baseWord}必须各放一个 ${digit}，这三${coverWord}就被整体锁定。`,
      chain: [
        { k: '观察', t: `检查第 ${base.map((n) => n + 1).join('、')} ${baseWord}，${digit} 的候选位置都限制在第 ${cover.map((n) => n + 1).join('、')} ${coverWord}内。` },
        { k: '锁定', t: `三${baseWord}要放下三个 ${digit}，却只有三${coverWord}可用；每一${coverWord}最多一个 ${digit}，所以这三${coverWord}必须各承担一个。` },
        { k: '结论', t: `其它${baseWord}在这三${coverWord}上的 ${digit} 都不成立，删除：${changeText(changes)}。` },
      ],
      principle: 'Swordfish（三链列/行）是 X-Wing 的三单位版本。只要“三条线里的候选并集只有三条线”，就可以把覆盖线在其他地方的同数字全部删掉。',
      highlights: {
        focus: focus.slice(),
        evidence: [],
        targets: eliminationCells(changes),
        inspect: [],
        eliminations: changes,
        units: baseType === 'row' ? base.map((n) => UNITS[n]) : base.map((n) => UNITS[9 + n]),
      },
    };
  }

  function describeXYWing(raw) {
    const { pivot, pincers, digit, changes, masks, shared, otherPivot } = raw;
    const [p1, p2] = pincers;
    const pv = maskValues(masks.pivot);
    const v1 = maskValues(masks.p1);
    const v2 = maskValues(masks.p2);
    return {
      title: `XY-Wing：${CELL(pivot)} 牵动两个格子`,
      summary: `${CELL(pivot)} 只有 {${digitList(pv)}}；它分别“看见”候选为 {${digitList(v1)}} 与 {${digitList(v2)}} 的两格。三者构成链，任何同时看见两个端点的格子都不能填 ${digit}。`,
      chain: [
        { k: '观察', t: `枢纽 ${CELL(pivot)} 的候选是 {${digitList(pv)}}。端点 ${CELL(p1)} 是 {${digitList(v1)}}，${CELL(p2)} 是 {${digitList(v2)}}，并且两个端点都与枢纽同行、同列或同宫。` },
        { k: '推演', t: `若枢纽填 ${shared}，则 ${CELL(p1)} 被逼成 ${digit}；若枢纽填 ${otherPivot}，则 ${CELL(p2)} 被逼成 ${digit}。两条分支里，至少有一个端点等于 ${digit}。` },
        { k: '结论', t: `同时看见两个端点的格子不可能再填 ${digit}，删除：${changeText(changes)}。` },
      ],
      principle: 'XY-Wing 不直接确定数字，而是证明“两个端点里必有一个是某数”。因此所有能同时看见两个端点的格子，都不能再出现这个数。',
      highlights: {
        focus: [pivot],
        evidence: [p1, p2],
        targets: eliminationCells(changes),
        inspect: [],
        eliminations: changes,
        units: [],
      },
    };
  }

  function describeFallback(raw) {
    const { idx, value, candidates, wrong, unique } = raw;
    const wrongText = wrong.length ? `填 ${digitList(wrong)} 的分支会走向矛盾` : '其它分支无法完成';
    const title = unique
      ? '逻辑技巧暂时停住，做一次有记录的分支验证'
      : '逻辑技巧暂时停住，选择一个可行分支';
    const summary = unique
      ? `当前局面里，内置的逻辑技巧都找不到可执行的步骤。选择候选最少的 ${CELL(idx)}，分别向后推演，用结果排除错误分支。`
      : `当前局面里，内置的逻辑技巧都找不到可执行的步骤。题目本身有多个解，所以下面只选取其中一个可行分支继续演示。`;
    const verifyText = unique
      ? `${CELL(idx)} 的候选是 {${digitList(candidates)}}。逐支验证：${wrongText}；填 ${value} 则可以继续完成。`
      : `${CELL(idx)} 的候选是 {${digitList(candidates)}}。每个分支都能配出至少一个完整解，并没有唯一必然的选择；这里取 ${value} 作为演示路径。`;
    const conclusion = unique
      ? `先取 ${CELL(idx)} = ${value}。注意：这是兜底的分支验证，不是纯逻辑技巧；后续仍会回到逻辑推理。`
      : `先取 ${CELL(idx)} = ${value}。注意：这道题有多个解，本步不是唯一结论，只是其中一条可行路径。`;
    return {
      title,
      summary,
      chain: [
        { k: '观察', t: '扫描全盘后，唯一候选、隐性唯一、数对、三数组、指向、占位、X-Wing、Swordfish、XY-Wing 都没有产生新结论。' },
        { k: '验证', t: verifyText },
        { k: '结论', t: conclusion },
      ],
      principle: unique
        ? '分支验证（Bifurcation）适合在你卡住时使用，但要诚实标记：它依赖“题目有唯一解”的前提，思维成本也比逻辑技巧高。学习时优先寻找结构，而不是一卡住就试数。'
        : '当题目有多个解时，任何“唯一答案”的说法都不成立。这里展示的是一条可行路径，而不是必然推理；如果是在练逻辑，应该先确认题目本身是否只有唯一解。',
      highlights: {
        focus: [idx],
        evidence: [],
        targets: [],
        inspect: [],
        eliminations: [],
        units: [],
      },
    };
  }

  let gridValueForExplain = null;

  function findNakedSingle(grid, cands) {
    for (let idx = 0; idx < 81; idx++) {
      if (!grid[idx] && countBits(cands[idx]) === 1) {
        return { kind: 'naked-single', technique: '唯一候选', techniqueEn: 'Naked Single', tone: 'mint', idx, value: maskValues(cands[idx])[0] };
      }
    }
    return null;
  }

  function findHiddenSingle(grid, cands) {
    for (const unit of UNITS) {
      for (let d = 1; d <= 9; d++) {
        const cells = unitDigitCells(cands, unit, d);
        if (cells.length === 1 && !grid[cells[0]]) {
          return { kind: 'hidden-single', technique: '隐性唯一', techniqueEn: 'Hidden Single', tone: 'blue', idx: cells[0], value: d, unit };
        }
      }
    }
    return null;
  }

  function findNakedPair(grid, cands) {
    for (const unit of UNITS) {
      const cells = unit.cells.filter((idx) => !grid[idx] && countBits(cands[idx]) === 2);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          if (cands[cells[i]] !== cands[cells[j]]) continue;
          const mask = cands[cells[i]];
          const changes = [];
          for (const other of unit.cells) {
            if (other === cells[i] || other === cells[j] || grid[other]) continue;
            const hit = cands[other] & mask;
            if (hit) changes.push({ idx: other, values: maskValues(hit) });
          }
          if (changes.length) {
            return {
              kind: 'naked-pair', technique: '显性数对', techniqueEn: 'Naked Pair', tone: 'amber',
              cells: [cells[i], cells[j]], digits: maskValues(mask), unit, changes, focus: [cells[i], cells[j]],
            };
          }
        }
      }
    }
    return null;
  }

  function findHiddenPair(grid, cands) {
    for (const unit of UNITS) {
      const positions = {};
      for (let d = 1; d <= 9; d++) positions[d] = unitDigitCells(cands, unit, d);
      for (let a = 1; a <= 8; a++) {
        for (let b = a + 1; b <= 9; b++) {
          const pa = positions[a], pb = positions[b];
          if (pa.length !== 2 || pb.length !== 2) continue;
          if (pa[0] !== pb[0] || pa[1] !== pb[1]) continue;
          const mask = BITS[a] | BITS[b];
          const changes = [];
          for (const idx of pa) {
            const extra = cands[idx] & ~mask;
            if (extra) changes.push({ idx, values: maskValues(extra) });
          }
          if (changes.length) {
            return {
              kind: 'hidden-pair', technique: '隐性数对', techniqueEn: 'Hidden Pair', tone: 'violet',
              cells: pa.slice(), digits: [a, b], unit, changes, focus: pa.slice(),
            };
          }
        }
      }
    }
    return null;
  }

  function findNakedTriple(grid, cands) {
    for (const unit of UNITS) {
      const cells = unit.cells.filter((idx) => !grid[idx] && countBits(cands[idx]) >= 2 && countBits(cands[idx]) <= 3);
      for (let i = 0; i < cells.length - 2; i++) {
        for (let j = i + 1; j < cells.length - 1; j++) {
          for (let k = j + 1; k < cells.length; k++) {
            const trio = [cells[i], cells[j], cells[k]];
            const union = cands[trio[0]] | cands[trio[1]] | cands[trio[2]];
            if (countBits(union) !== 3) continue;
            const changes = [];
            for (const other of unit.cells) {
              if (trio.includes(other) || grid[other]) continue;
              const hit = cands[other] & union;
              if (hit) changes.push({ idx: other, values: maskValues(hit) });
            }
            if (changes.length) {
              return {
                kind: 'naked-triple', technique: '显性三数组', techniqueEn: 'Naked Triple', tone: 'amber',
                cells: trio, digits: maskValues(union), unit, changes, focus: trio,
              };
            }
          }
        }
      }
    }
    return null;
  }

  function findHiddenTriple(grid, cands) {
    for (const unit of UNITS) {
      const positions = {};
      for (let d = 1; d <= 9; d++) positions[d] = unitDigitCells(cands, unit, d);
      for (let a = 1; a <= 7; a++) {
        for (let b = a + 1; b <= 8; b++) {
          for (let c = b + 1; c <= 9; c++) {
            const set = new Set();
            positions[a].concat(positions[b], positions[c]).forEach((idx) => set.add(idx));
            if (set.size !== 3) continue;
            const trio = Array.from(set).sort((x, y) => x - y);
            if (positions[a].length === 0 || positions[b].length === 0 || positions[c].length === 0) continue;
            const mask = BITS[a] | BITS[b] | BITS[c];
            const changes = [];
            for (const idx of trio) {
              const extra = cands[idx] & ~mask;
              if (extra) changes.push({ idx, values: maskValues(extra) });
            }
            if (changes.length) {
              return {
                kind: 'hidden-triple', technique: '隐性三数组', techniqueEn: 'Hidden Triple', tone: 'violet',
                cells: trio, digits: [a, b, c], unit, changes, focus: trio,
              };
            }
          }
        }
      }
    }
    return null;
  }

  function findPointing(grid, cands) {
    for (const box of BOXES) {
      const boxUnit = UNITS[18 + BOXES.indexOf(box)];
      for (let d = 1; d <= 9; d++) {
        const sources = unitDigitCells(cands, boxUnit, d);
        if (sources.length < 2) continue;
        const rows = new Set(sources.map(ROW_OF));
        if (rows.size === 1) {
          const line = UNITS[ROW_OF(sources[0])];
          const changes = [];
          for (const idx of line.cells) {
            if (BOX_OF(idx) === boxUnit.index || grid[idx]) continue;
            if (cands[idx] & BITS[d]) changes.push({ idx, values: [d] });
          }
          if (changes.length) {
            return {
              kind: 'pointing', technique: '宫内指向', techniqueEn: 'Pointing', tone: 'blue',
              box: boxUnit, line, digit: d, sources, changes, focus: sources,
            };
          }
        }
        const cols = new Set(sources.map(COL_OF));
        if (cols.size === 1) {
          const line = UNITS[9 + COL_OF(sources[0])];
          const changes = [];
          for (const idx of line.cells) {
            if (BOX_OF(idx) === boxUnit.index || grid[idx]) continue;
            if (cands[idx] & BITS[d]) changes.push({ idx, values: [d] });
          }
          if (changes.length) {
            return {
              kind: 'pointing', technique: '宫内指向', techniqueEn: 'Pointing', tone: 'blue',
              box: boxUnit, line, digit: d, sources, changes, focus: sources,
            };
          }
        }
      }
    }
    return null;
  }

  function findClaiming(grid, cands) {
    for (const unit of UNITS) {
      if (unit.type === 'box') continue;
      for (let d = 1; d <= 9; d++) {
        const sources = unitDigitCells(cands, unit, d);
        if (sources.length < 2) continue;
        const boxes = new Set(sources.map(BOX_OF));
        if (boxes.size !== 1) continue;
        const box = UNITS[18 + BOX_OF(sources[0])];
        const changes = [];
        for (const idx of box.cells) {
          if (CELL_UNITS[idx].some((uid) => UNITS[uid] === unit)) continue;
          if (grid[idx]) continue;
          if (cands[idx] & BITS[d]) changes.push({ idx, values: [d] });
        }
        if (changes.length) {
          return {
            kind: 'claiming', technique: '区块占位', techniqueEn: 'Claiming', tone: 'blue',
            line: unit, box, digit: d, sources, changes, focus: sources,
          };
        }
      }
    }
    return null;
  }

  function findXWing(grid, cands) {
    for (const baseType of ['row', 'col']) {
      const baseUnits = baseType === 'row' ? ROWS : COLS;
      const coverUnits = baseType === 'row' ? COLS : ROWS;
      for (let d = 1; d <= 9; d++) {
        const positions = baseUnits.map((cells) => cells.filter((idx) => !grid[idx] && (cands[idx] & BITS[d])));
        for (let i = 0; i < 9; i++) {
          if (positions[i].length !== 2) continue;
          for (let j = i + 1; j < 9; j++) {
            if (positions[j].length !== 2) continue;
            const covers = positions[i].map((idx) => (baseType === 'row' ? COL_OF(idx) : ROW_OF(idx)));
            const covers2 = positions[j].map((idx) => (baseType === 'row' ? COL_OF(idx) : ROW_OF(idx)));
            if (covers[0] !== covers2[0] || covers[1] !== covers2[1]) continue;
            const cover = covers.slice().sort((a, b) => a - b);
            const changes = [];
            for (let k = 0; k < 9; k++) {
              if (k === i || k === j) continue;
              for (const c of cover) {
                const idx = baseType === 'row' ? k * 9 + c : c * 9 + k;
                if (!grid[idx] && (cands[idx] & BITS[d])) changes.push({ idx, values: [d] });
              }
            }
            if (changes.length) {
              const focus = positions[i].concat(positions[j]);
              return {
                kind: 'xwing', technique: 'X-Wing', techniqueEn: 'X-Wing', tone: 'coral',
                digit: d, baseType, base: [i, j], cover, focus, changes,
              };
            }
          }
        }
      }
    }
    return null;
  }

  function findSwordfish(grid, cands) {
    for (const baseType of ['row', 'col']) {
      const baseUnits = baseType === 'row' ? ROWS : COLS;
      for (let d = 1; d <= 9; d++) {
        const positions = baseUnits.map((cells) => cells.filter((idx) => !grid[idx] && (cands[idx] & BITS[d])));
        for (let i = 0; i < 7; i++) {
          if (positions[i].length < 2 || positions[i].length > 3) continue;
          for (let j = i + 1; j < 8; j++) {
            if (positions[j].length < 2 || positions[j].length > 3) continue;
            for (let k = j + 1; k < 9; k++) {
              if (positions[k].length < 2 || positions[k].length > 3) continue;
              const coverSet = new Set();
              positions[i].concat(positions[j], positions[k]).forEach((idx) => {
                coverSet.add(baseType === 'row' ? COL_OF(idx) : ROW_OF(idx));
              });
              if (coverSet.size !== 3) continue;
              const cover = Array.from(coverSet).sort((a, b) => a - b);
              const changes = [];
              for (let b = 0; b < 9; b++) {
                if (b === i || b === j || b === k) continue;
                for (const c of cover) {
                  const idx = baseType === 'row' ? b * 9 + c : c * 9 + b;
                  if (!grid[idx] && (cands[idx] & BITS[d])) changes.push({ idx, values: [d] });
                }
              }
              if (changes.length) {
                return {
                  kind: 'swordfish', technique: 'Swordfish', techniqueEn: 'Swordfish', tone: 'coral',
                  digit: d, baseType, base: [i, j, k], cover,
                  focus: positions[i].concat(positions[j], positions[k]), changes,
                };
              }
            }
          }
        }
      }
    }
    return null;
  }

  function findXYWing(grid, cands) {
    for (let pivot = 0; pivot < 81; pivot++) {
      if (grid[pivot] || countBits(cands[pivot]) !== 2) continue;
      const pMask = cands[pivot];
      const pVals = maskValues(pMask);
      const pairPeers = PEERS[pivot].filter((idx) => !grid[idx] && countBits(cands[idx]) === 2);
      for (const p1 of pairPeers) {
        const m1 = cands[p1];
        const common = pMask & m1;
        if (countBits(common) !== 1) continue;
        const shared = maskValues(common)[0];
        const pOther = pVals.find((v) => v !== shared);
        const y = maskValues(m1 & ~pMask)[0];
        const p2Mask = BITS[pOther] | BITS[y];
        for (const p2 of pairPeers) {
          if (p2 === p1 || cands[p2] !== p2Mask) continue;
          // 端点通常不应互为 peer；若互为 peer，取数依然成立，但解释更绕，这里跳过。
          if (PEERS[p1].includes(p2)) continue;
          const commonPeers = PEERS[p1].filter((idx) => PEERS[p2].includes(idx));
          const changes = [];
          for (const idx of commonPeers) {
            if (grid[idx] || idx === pivot) continue;
            if (cands[idx] & BITS[y]) changes.push({ idx, values: [y] });
          }
          if (changes.length) {
            return {
              kind: 'xywing', technique: 'XY-Wing', techniqueEn: 'XY-Wing', tone: 'violet',
              pivot, pincers: [p1, p2], digit: y, changes, focus: [pivot, p1, p2],
              shared, otherPivot: pOther,
              masks: { pivot: pMask, p1: m1, p2: p2Mask },
            };
          }
        }
      }
    }
    return null;
  }

  function findLogicalStep(grid, cands) {
    gridValueForExplain = grid;
    return findNakedSingle(grid, cands)
      || findHiddenSingle(grid, cands)
      || findNakedPair(grid, cands)
      || findHiddenPair(grid, cands)
      || findNakedTriple(grid, cands)
      || findHiddenTriple(grid, cands)
      || findPointing(grid, cands)
      || findClaiming(grid, cands)
      || findXWing(grid, cands)
      || findSwordfish(grid, cands)
      || findXYWing(grid, cands);
  }

  function makeFallback(grid, cands, unique) {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let idx = 0; idx < 81; idx++) {
      if (grid[idx]) continue;
      const n = countBits(cands[idx]);
      if (n < bestCount) { best = idx; bestMask = cands[idx]; bestCount = n; if (n === 2) break; }
    }
    if (best === -1) return null;
    const solution = solveGrid(grid);
    if (!solution) throw new Error('当前局面已经无解，无法继续。');
    const value = solution[best];
    const candidates = maskValues(bestMask);
    const wrong = [];
    if (unique) {
      for (const alt of candidates) {
        if (alt === value) continue;
        const test = cloneGrid(grid);
        test[best] = alt;
        if (countSolutions(test, 1) === 0) wrong.push(alt);
      }
    }
    return {
      kind: 'fallback', technique: '分支验证', techniqueEn: 'Bifurcation', tone: 'slate',
      idx: best, value, candidates, alternatives: candidates.filter((v) => v !== value), wrong,
      solution, unique,
    };
  }

  function describe(raw, beforeGrid, beforeCands) {
    gridValueForExplain = beforeGrid;
    switch (raw.kind) {
      case 'naked-single': return describeNakedSingle(raw);
      case 'hidden-single': return describeHiddenSingle(raw, beforeCands);
      case 'naked-pair': return describeNakedPair(raw);
      case 'hidden-pair': return describeHiddenPair(raw);
      case 'naked-triple': return describeNakedTriple(raw);
      case 'hidden-triple': return describeHiddenTriple(raw);
      case 'pointing': return describePointing(raw);
      case 'claiming': return describeClaiming(raw);
      case 'xwing': return describeXWing(raw);
      case 'swordfish': return describeSwordfish(raw);
      case 'xywing': return describeXYWing(raw);
      case 'fallback': return describeFallback(raw);
      default: throw new Error(`未知技巧：${raw.kind}`);
    }
  }

  function applyStep(grid, cands, step) {
    if (step.action.type === 'place') {
      if (grid[step.action.idx]) throw new Error('目标格已经有数字。');
      const next = Uint16Array.from(cands);
      const { idx, value } = step.action;
      grid[idx] = value;
      next[idx] = 0;
      // 只做减法：已证明无效的候选不能在后续步骤里“复活”。
      for (const p of PEERS[idx]) next[p] &= ~BITS[value];
      return next;
    }
    const next = Uint16Array.from(cands);
    for (const change of step.action.changes) {
      next[change.idx] &= ~change.values.reduce((m, v) => m | BITS[v], 0);
      if (!next[change.idx] && !grid[change.idx]) {
        throw new Error(`删除候选后 ${CELL(change.idx)} 没有可填数字，请检查题目是否合法。`);
      }
    }
    return next;
  }

  function snapshotGrid(grid) {
    return Array.from(grid);
  }

  function snapshotCandidates(cands) {
    return Array.from(cands);
  }

  function solvePuzzle(input) {
    const initial = parsePuzzle(input);
    const solutions = countSolutions(initial, 2);
    if (solutions === 0) throw new Error('这道题无解，请检查录入的数字。');

    const grid = cloneGrid(initial);
    let cands = computeCandidates(grid);
    const steps = [];
    let guard = 0;

    while (!isSolved(grid)) {
      if (++guard > 240) throw new Error('求解步数超出预期，请检查题目是否合法。');
      gridValueForExplain = grid;
      const raw = findLogicalStep(grid, cands) || makeFallback(grid, cands, solutions === 1);
      if (!raw) throw new Error('当前局面无法继续推进。');

      const beforeGrid = snapshotGrid(grid);
      const beforeCands = snapshotCandidates(cands);
      const copy = describe(raw, grid, cands);

      let action;
      if (raw.kind === 'naked-single' || raw.kind === 'hidden-single' || raw.kind === 'fallback') {
        action = { type: 'place', idx: raw.idx, value: raw.value };
      } else {
        action = { type: 'eliminate', changes: raw.changes.map((c) => ({ idx: c.idx, values: c.values.slice() })) };
      }

      const step = {
        index: steps.length + 1,
        kind: raw.kind,
        technique: raw.technique,
        techniqueEn: raw.techniqueEn,
        tone: raw.tone,
        title: copy.title,
        summary: copy.summary,
        chain: copy.chain,
        principle: copy.principle,
        highlights: copy.highlights,
        action,
        beforeGrid,
        beforeCands,
        afterGrid: null,
        afterCands: null,
        pure: raw.kind !== 'fallback',
      };

      cands = applyStep(grid, cands, step);
      step.afterGrid = snapshotGrid(grid);
      step.afterCands = snapshotCandidates(cands);
      steps.push(step);
    }

    const solution = snapshotGrid(grid);
    if (!isSolved(grid)) throw new Error('求解结束但盘面仍不完整。');
    const techniqueCounts = {};
    steps.forEach((step) => {
      techniqueCounts[step.technique] = (techniqueCounts[step.technique] || 0) + 1;
    });

    return {
      initialGrid: snapshotGrid(initial),
      steps,
      solution,
      warnings: solutions > 1 ? ['这道题有多个解，演示展示其中一个解。'] : [],
      stats: {
        givens: initial.reduce((n, v) => n + (v ? 1 : 0), 0),
        empties: initial.reduce((n, v) => n + (v ? 0 : 1), 0),
        totalSteps: steps.length,
        logicalSteps: steps.filter((s) => s.pure).length,
        fallbackSteps: steps.filter((s) => !s.pure).length,
        techniqueCounts,
      },
    };
  }

  function hintsFor(input) {
    const result = solvePuzzle(input);
    const seen = new Set();
    const unique = [];
    result.steps.forEach((s) => {
      if (!seen.has(s.technique)) {
        seen.add(s.technique);
        unique.push({ technique: s.technique, en: s.techniqueEn, count: result.stats.techniqueCounts[s.technique], tone: s.tone });
      }
    });
    return { ...result.stats, techniques: unique, warnings: result.warnings };
  }

  const PRESETS = [
    {
      id: 'starter', name: '热身', label: '先学会看候选数', difficulty: '入门', accent: 'mint',
      note: '一盘只用“唯一候选”就能走完的题。适合熟悉候选数、行列宫的关系。',
      puzzle: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    },
    {
      id: 'medium', name: '数对', label: '显性 / 隐性数对', difficulty: '进阶', accent: 'amber',
      note: '从这里开始，单靠“这一格剩什么”不够了。需要看见两格共同锁住两个数字。',
      puzzle: '005000000000090017000040080030000000120004038608000700006370001000080002902610300',
    },
    {
      id: 'hard', name: '链式', label: 'XY-Wing 与区块', difficulty: '高阶', accent: 'coral',
      note: '练习“一个大格牵动两个端点”的链式思维，同时混合数对与宫内指向。',
      puzzle: '600140070000907000080000400160408903003500006000000000700050002000001098000304060',
    },
    {
      id: 'expert', name: '全技巧', label: 'X-Wing / Swordfish / XY-Wing', difficulty: '专家', accent: 'violet',
      note: '一盘把八种技巧串起来的题：数对、区块、X-Wing、Swordfish 与 XY-Wing 都会出现。',
      puzzle: '050710080070850093100000000845006700000070900000008000000360000017000400080900070',
    },
  ];

  const Engine = {
    ALL, BITS, ROWS, COLS, BOXES, UNITS, PEERS, PRESETS,
    maskValues, countBits, digitList, CELL, CELL_CN, unitName,
    parsePuzzle, computeCandidates, countSolutions, solveGrid, isSolved,
    solvePuzzle, hintsFor,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  global.SudokuEngine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
