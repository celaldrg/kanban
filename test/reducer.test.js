import assert from 'node:assert/strict';
import test from 'node:test';

import { LIMITS, createBoard, findCard, isColumnFull } from '../src/model.js';
import { reduce } from '../src/reducer.js';

const NOW = Date.UTC(2026, 9, 27, 9, 0);
const LATER = NOW + 60_000;

/** Freezes a value deeply so any mutation by the reducer throws (ES modules are strict). */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/** Applies actions in order to frozen boards, failing on any error; returns the board and new ids. */
function run(board, ...actions) {
  let current = board;
  const ids = [];
  for (const action of actions) {
    const result = reduce(deepFreeze(current), action, NOW);
    assert.equal(result.error, null, `${action.type} failed with ${result.error}`);
    current = result.board;
    if (result.id) ids.push(result.id);
  }
  return { board: deepFreeze(current), ids };
}

/** Todo [A, B, C] | Doing [D, E] (WIP 3) | Done [] */
function fixture() {
  const columns = run(
    createBoard(),
    { type: 'column/add', title: 'Todo' },
    { type: 'column/add', title: 'Doing', wipLimit: 3 },
    { type: 'column/add', title: 'Done' },
  );
  const [todo, doing, done] = columns.ids;
  const cards = run(
    columns.board,
    { type: 'card/add', columnId: todo, title: 'A' },
    { type: 'card/add', columnId: todo, title: 'B' },
    { type: 'card/add', columnId: todo, title: 'C' },
    { type: 'card/add', columnId: doing, title: 'D' },
    { type: 'card/add', columnId: doing, title: 'E' },
  );
  const [a, b, c, d, e] = cards.ids;
  return { board: cards.board, ids: { todo, doing, done, a, b, c, d, e } };
}

const titles = (column) => column.cards.map((card) => card.title);
const columnTitles = (board) => board.columns.map((column) => column.title);

test('column/add appends a column and returns its new id', () => {
  const result = reduce(deepFreeze(createBoard()), { type: 'column/add', title: '  To \n do ' }, NOW);
  assert.equal(result.error, null);
  assert.equal(result.id, 'col-1');
  assert.deepEqual(result.board.columns, [{ id: 'col-1', title: 'To do', wipLimit: null, cards: [] }]);
  assert.equal(result.board.nextId, 2);
});

test('column/add inserts at an exact index with a WIP limit', () => {
  const { board } = fixture();
  const result = reduce(board, { type: 'column/add', title: 'Review', wipLimit: 2, index: 1 }, NOW);
  assert.deepEqual(columnTitles(result.board), ['Todo', 'Review', 'Doing', 'Done']);
  assert.equal(result.board.columns[1].wipLimit, 2);
  assert.equal(result.board.columns[1].id, result.id);
});

test('column/add rejects bad titles, WIP limits and indices', () => {
  const board = deepFreeze(createBoard());
  const actions = [
    { type: 'column/add', title: '   ' },
    { type: 'column/add', title: 42 },
    { type: 'column/add', title: 'x'.repeat(LIMITS.title + 1) },
    { type: 'column/add', title: 'Ok', wipLimit: -1 },
    { type: 'column/add', title: 'Ok', wipLimit: 2.5 },
    { type: 'column/add', title: 'Ok', wipLimit: '3' },
    { type: 'column/add', title: 'Ok', wipLimit: LIMITS.wip + 1 },
    { type: 'column/add', title: 'Ok', index: 'first' },
  ];
  for (const action of actions) {
    const result = reduce(board, action, NOW);
    assert.equal(result.error, 'invalid', JSON.stringify(action));
    assert.equal(result.board, board);
    assert.equal(result.id, null);
  }
});

test('column/rename renames, ignores identical titles and reports unknown ids', () => {
  const { board, ids } = fixture();
  const renamed = reduce(board, { type: 'column/rename', columnId: ids.doing, title: 'In progress' }, NOW).board;
  assert.deepEqual(columnTitles(renamed), ['Todo', 'In progress', 'Done']);
  assert.equal(renamed.columns[1].cards, board.columns[1].cards, 'unchanged parts are shared');
  assert.equal(reduce(board, { type: 'column/rename', columnId: ids.doing, title: ' Doing ' }, NOW).board, board);
  assert.equal(reduce(board, { type: 'column/rename', columnId: 'col-99', title: 'X' }, NOW).error, 'not-found');
  assert.equal(reduce(board, { type: 'column/rename', columnId: ids.doing, title: '' }, NOW).error, 'invalid');
});

test('column/move reorders columns to an exact index', () => {
  const { board, ids } = fixture();
  const move = (columnId, toIndex) => columnTitles(reduce(board, { type: 'column/move', columnId, toIndex }, NOW).board);
  assert.deepEqual(move(ids.done, 0), ['Done', 'Todo', 'Doing']);
  assert.deepEqual(move(ids.todo, 1), ['Doing', 'Todo', 'Done']);
  assert.deepEqual(move(ids.todo, 2), ['Doing', 'Done', 'Todo']);
  assert.deepEqual(move(ids.todo, 99), ['Doing', 'Done', 'Todo'], 'index is clamped');
  assert.equal(reduce(board, { type: 'column/move', columnId: ids.doing, toIndex: 1 }, NOW).board, board);
  assert.equal(reduce(board, { type: 'column/move', columnId: ids.doing }, NOW).error, 'invalid');
  assert.equal(reduce(board, { type: 'column/move', columnId: 'nope', toIndex: 0 }, NOW).error, 'not-found');
});

test('column/setWip sets, lowers and clears the limit', () => {
  const { board, ids } = fixture();
  const set = reduce(board, { type: 'column/setWip', columnId: ids.todo, wipLimit: 5 }, NOW).board;
  assert.equal(set.columns[0].wipLimit, 5);
  assert.equal(reduce(set, { type: 'column/setWip', columnId: ids.todo, wipLimit: null }, NOW).board.columns[0].wipLimit, null);
  assert.equal(reduce(set, { type: 'column/setWip', columnId: ids.todo, wipLimit: 0 }, NOW).board.columns[0].wipLimit, null);
  const tight = reduce(board, { type: 'column/setWip', columnId: ids.todo, wipLimit: 1 }, NOW).board;
  assert.equal(isColumnFull(tight.columns[0]), true, 'a limit below the card count is allowed');
  assert.equal(reduce(board, { type: 'column/setWip', columnId: ids.doing, wipLimit: 3 }, NOW).board, board);
  for (const wipLimit of [-1, 1.5, LIMITS.wip + 1, '2', undefined]) {
    assert.equal(reduce(board, { type: 'column/setWip', columnId: ids.todo, wipLimit }, NOW).error, 'invalid');
  }
});

test('column/delete removes the column, its cards and its archived cards', () => {
  const { board: start, ids } = fixture();
  const { board } = run(start, { type: 'card/archive', cardId: ids.a }, { type: 'card/archive', cardId: ids.d });
  const result = reduce(board, { type: 'column/delete', columnId: ids.todo }, NOW);
  assert.deepEqual(result.board.columns.map((column) => column.id), [ids.doing, ids.done]);
  assert.deepEqual(result.board.archive.map((card) => card.id), [ids.d]);
  for (const cardId of [ids.a, ids.b, ids.c]) assert.equal(findCard(result.board, cardId), null);
  assert.equal(reduce(board, { type: 'column/delete', columnId: 'nope' }, NOW).error, 'not-found');
});

test('card/add creates a normalized card stamped by the clock', () => {
  const { board, ids } = fixture();
  const first = board.nextId;
  const result = reduce(
    board,
    {
      type: 'card/add',
      columnId: ids.done,
      title: '  Ship   it ',
      description: ' Line 1\r\nLine 2 ',
      labels: ['blue', 'red', 'blue'],
      due: '2026-11-02',
      checklist: [{ text: 'One', done: true }, { text: '   ' }, { text: ' Two ' }],
    },
    NOW,
  );
  assert.equal(result.error, null);
  assert.equal(result.id, `card-${first}`);
  assert.deepEqual(findCard(result.board, result.id).card, {
    id: `card-${first}`,
    title: 'Ship it',
    description: 'Line 1\nLine 2',
    labels: ['red', 'blue'],
    due: '2026-11-02',
    checklist: [
      { id: `item-${first + 1}`, text: 'One', done: true },
      { id: `item-${first + 2}`, text: 'Two', done: false },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(result.board.nextId, first + 3);
});

test('card/add inserts at an exact index and defaults to the end', () => {
  const { board, ids } = fixture();
  const add = (index) => titles(reduce(board, { type: 'card/add', columnId: ids.todo, title: 'N', index }, NOW).board.columns[0]);
  assert.deepEqual(add(0), ['N', 'A', 'B', 'C']);
  assert.deepEqual(add(2), ['A', 'B', 'N', 'C']);
  assert.deepEqual(add(undefined), ['A', 'B', 'C', 'N']);
});

test('card/add is blocked when the column is at its WIP limit', () => {
  const { board, ids } = fixture();
  const third = reduce(board, { type: 'card/add', columnId: ids.doing, title: 'F' }, NOW);
  assert.equal(third.error, null);
  const fourth = reduce(deepFreeze(third.board), { type: 'card/add', columnId: ids.doing, title: 'G' }, NOW);
  assert.equal(fourth.error, 'wip-limit');
  assert.equal(fourth.board, third.board);
});

test('card/add validates every field', () => {
  const { board, ids } = fixture();
  const base = { type: 'card/add', columnId: ids.todo, title: 'Ok' };
  const bad = [
    { title: '' },
    { title: null },
    { description: 7 },
    { description: 'x'.repeat(LIMITS.description + 1) },
    { labels: ['pink'] },
    { labels: 'red' },
    { due: '2026-02-30' },
    { due: '27.10.2026' },
    { checklist: 'todo' },
    { checklist: [{ text: 'x', done: 'yes' }] },
    { checklist: [{ text: 5 }] },
    { checklist: Array.from({ length: LIMITS.checklistItems + 1 }, (_, i) => ({ text: `#${i}` })) },
  ];
  for (const patch of bad) {
    assert.equal(reduce(board, { ...base, ...patch }, NOW).error, 'invalid', JSON.stringify(patch).slice(0, 80));
  }
  assert.equal(reduce(board, { ...base, columnId: 'col-404' }, NOW).error, 'not-found');
});

test('card/update edits fields, keeps createdAt and bumps updatedAt', () => {
  const { board, ids } = fixture();
  const patch = { title: 'B2', description: 'Notes', labels: ['green'], due: '2026-12-01' };
  const result = reduce(board, { type: 'card/update', cardId: ids.b, patch }, LATER);
  assert.equal(result.error, null);
  assert.deepEqual(findCard(result.board, ids.b).card, {
    id: ids.b,
    title: 'B2',
    description: 'Notes',
    labels: ['green'],
    due: '2026-12-01',
    checklist: [],
    createdAt: NOW,
    updatedAt: LATER,
  });
  const cleared = reduce(result.board, { type: 'card/update', cardId: ids.b, patch: { due: null, labels: [] } }, LATER);
  assert.equal(findCard(cleared.board, ids.b).card.due, null);
  assert.deepEqual(findCard(cleared.board, ids.b).card.labels, []);
});

test('card/update keeps ids of existing checklist items and numbers new ones', () => {
  const { board: start, ids } = fixture();
  const { board } = run(start, {
    type: 'card/update',
    cardId: ids.a,
    patch: { checklist: [{ text: 'One' }, { text: 'Two' }] },
  });
  const [one, two] = findCard(board, ids.a).card.checklist;
  const next = board.nextId;
  const result = reduce(
    board,
    {
      type: 'card/update',
      cardId: ids.a,
      patch: {
        checklist: [
          { id: two.id, text: 'Two', done: true },
          { id: two.id, text: 'Copy of two' },
          { id: 'item-999', text: 'Three' },
          { id: one.id, text: '' },
        ],
      },
    },
    LATER,
  );
  assert.deepEqual(findCard(result.board, ids.a).card.checklist, [
    { id: two.id, text: 'Two', done: true },
    { id: `item-${next}`, text: 'Copy of two', done: false },
    { id: `item-${next + 1}`, text: 'Three', done: false },
  ]);
  assert.equal(result.board.nextId, next + 2);
});

test('card/update without a real change returns the same board', () => {
  const { board, ids } = fixture();
  assert.equal(reduce(board, { type: 'card/update', cardId: ids.a, patch: { title: ' A ' } }, LATER).board, board);
  assert.equal(reduce(board, { type: 'card/update', cardId: ids.a, patch: {} }, LATER).board, board);
});

test('card/update validates the patch and the card id', () => {
  const { board, ids } = fixture();
  assert.equal(reduce(board, { type: 'card/update', cardId: ids.a, patch: { labels: ['teal'] } }, NOW).error, 'invalid');
  assert.equal(reduce(board, { type: 'card/update', cardId: ids.a, patch: { title: '  ' } }, NOW).error, 'invalid');
  assert.equal(reduce(board, { type: 'card/update', cardId: ids.a }, NOW).error, 'invalid');
  assert.equal(reduce(board, { type: 'card/update', cardId: ids.a, patch: [] }, NOW).error, 'invalid');
  assert.equal(reduce(board, { type: 'card/update', cardId: 'card-404', patch: { title: 'X' } }, NOW).error, 'not-found');
});

test('card/move reorders inside a column to exact indices', () => {
  const { board, ids } = fixture();
  const move = (cardId, toIndex) =>
    titles(reduce(board, { type: 'card/move', cardId, toColumnId: ids.todo, toIndex }, NOW).board.columns[0]);
  assert.deepEqual(move(ids.a, 1), ['B', 'A', 'C']);
  assert.deepEqual(move(ids.a, 2), ['B', 'C', 'A']);
  assert.deepEqual(move(ids.c, 0), ['C', 'A', 'B']);
  assert.deepEqual(move(ids.c, 1), ['A', 'C', 'B']);
  assert.deepEqual(move(ids.b, 9), ['A', 'C', 'B'], 'index is clamped to the end');
  assert.equal(reduce(board, { type: 'card/move', cardId: ids.b, toColumnId: ids.todo, toIndex: 1 }, NOW).board, board);
  const reordered = reduce(board, { type: 'card/move', cardId: ids.a, toColumnId: ids.todo, toIndex: 2 }, LATER).board;
  assert.equal(findCard(reordered, ids.a).card.updatedAt, NOW, 'reordering is not an edit');
});

test('card/move moves across columns to exact indices', () => {
  const { board, ids } = fixture();
  const expected = [
    [0, ['B', 'D', 'E']],
    [1, ['D', 'B', 'E']],
    [2, ['D', 'E', 'B']],
    [7, ['D', 'E', 'B']],
  ];
  for (const [toIndex, doing] of expected) {
    const result = reduce(board, { type: 'card/move', cardId: ids.b, toColumnId: ids.doing, toIndex }, LATER);
    assert.equal(result.error, null);
    assert.deepEqual(titles(result.board.columns[0]), ['A', 'C']);
    assert.deepEqual(titles(result.board.columns[1]), doing, `toIndex ${toIndex}`);
    assert.equal(findCard(result.board, ids.b).card.updatedAt, LATER);
    assert.equal(result.board.columns[2], board.columns[2], 'untouched columns are shared');
  }
  const back = run(
    board,
    { type: 'card/move', cardId: ids.e, toColumnId: ids.done, toIndex: 0 },
    { type: 'card/move', cardId: ids.d, toColumnId: ids.todo, toIndex: 0 },
    { type: 'card/move', cardId: ids.e, toColumnId: ids.todo, toIndex: 2 },
  ).board;
  assert.deepEqual(back.columns.map(titles), [['D', 'A', 'E', 'B', 'C'], [], []]);
});

test('card/move rejects unknown targets, bad indices and archived cards', () => {
  const { board: start, ids } = fixture();
  const { board } = run(start, { type: 'card/archive', cardId: ids.c });
  const move = (action) => reduce(board, { type: 'card/move', ...action }, NOW).error;
  assert.equal(move({ cardId: ids.a, toColumnId: 'col-404', toIndex: 0 }), 'not-found');
  assert.equal(move({ cardId: 'card-404', toColumnId: ids.done, toIndex: 0 }), 'not-found');
  assert.equal(move({ cardId: ids.c, toColumnId: ids.done, toIndex: 0 }), 'not-found');
  assert.equal(move({ cardId: ids.a, toColumnId: ids.done, toIndex: 0.5 }), 'invalid');
  assert.equal(move({ cardId: ids.a, toColumnId: ids.done }), 'invalid');
});

test('a WIP limit blocks moves into a full column but not reordering inside it', () => {
  const { board: start, ids } = fixture();
  const { board: full } = run(start, { type: 'card/move', cardId: ids.a, toColumnId: ids.doing, toIndex: 0 });
  assert.deepEqual(titles(full.columns[1]), ['A', 'D', 'E']);
  const blocked = reduce(full, { type: 'card/move', cardId: ids.b, toColumnId: ids.doing, toIndex: 1 }, NOW);
  assert.equal(blocked.error, 'wip-limit');
  assert.equal(blocked.board, full);
  const reordered = reduce(full, { type: 'card/move', cardId: ids.e, toColumnId: ids.doing, toIndex: 0 }, NOW);
  assert.equal(reordered.error, null);
  assert.deepEqual(titles(reordered.board.columns[1]), ['E', 'A', 'D']);
  const freed = run(
    full,
    { type: 'card/move', cardId: ids.d, toColumnId: ids.done, toIndex: 0 },
    { type: 'card/move', cardId: ids.b, toColumnId: ids.doing, toIndex: 2 },
  ).board;
  assert.deepEqual(freed.columns.map(titles), [['C'], ['A', 'E', 'B'], ['D']]);
});

test('card/archive moves a card to the archive, newest first', () => {
  const { board, ids } = fixture();
  const once = reduce(board, { type: 'card/archive', cardId: ids.b }, NOW).board;
  const twice = reduce(deepFreeze(once), { type: 'card/archive', cardId: ids.d }, LATER).board;
  assert.deepEqual(twice.columns.map(titles), [['A', 'C'], ['E'], []]);
  assert.deepEqual(
    twice.archive.map(({ id, columnId, archivedAt }) => ({ id, columnId, archivedAt })),
    [
      { id: ids.d, columnId: ids.doing, archivedAt: LATER },
      { id: ids.b, columnId: ids.todo, archivedAt: NOW },
    ],
  );
  assert.equal(reduce(twice, { type: 'card/archive', cardId: ids.b }, NOW).error, 'not-found', 'already archived');
});

test('card/restore brings a card back to its column or to an exact place', () => {
  const { board, ids } = fixture();
  const archived = reduce(board, { type: 'card/archive', cardId: ids.b }, LATER).board;
  const restored = reduce(deepFreeze(archived), { type: 'card/restore', cardId: ids.b }, NOW).board;
  assert.deepEqual(restored.columns.map(titles), [['A', 'C', 'B'], ['D', 'E'], []]);
  assert.deepEqual(restored.archive, []);
  assert.deepEqual(findCard(restored, ids.b).card, findCard(board, ids.b).card, 'archive fields are removed');
  const placed = reduce(archived, { type: 'card/restore', cardId: ids.b, toColumnId: ids.done, toIndex: 0 }, NOW).board;
  assert.deepEqual(placed.columns.map(titles), [['A', 'C'], ['D', 'E'], ['B']]);
  assert.equal(reduce(archived, { type: 'card/restore', cardId: ids.a }, NOW).error, 'not-found', 'not archived');
  assert.equal(reduce(archived, { type: 'card/restore', cardId: 'card-404' }, NOW).error, 'not-found');
});

test('card/restore respects WIP limits', () => {
  const { board: start, ids } = fixture();
  const { board } = run(
    start,
    { type: 'card/archive', cardId: ids.d },
    { type: 'card/add', columnId: ids.doing, title: 'F' },
    { type: 'card/add', columnId: ids.doing, title: 'G' },
  );
  const result = reduce(board, { type: 'card/restore', cardId: ids.d }, NOW);
  assert.equal(result.error, 'wip-limit');
  assert.equal(result.board, board);
  assert.equal(reduce(board, { type: 'card/restore', cardId: ids.d, toColumnId: ids.done }, NOW).error, null);
});

test('card/delete removes active and archived cards', () => {
  const { board: start, ids } = fixture();
  const { board } = run(start, { type: 'card/archive', cardId: ids.e });
  const withoutA = reduce(board, { type: 'card/delete', cardId: ids.a }, NOW).board;
  assert.deepEqual(withoutA.columns.map(titles), [['B', 'C'], ['D'], []]);
  const withoutE = reduce(board, { type: 'card/delete', cardId: ids.e }, NOW).board;
  assert.deepEqual(withoutE.archive, []);
  assert.equal(reduce(board, { type: 'card/delete', cardId: 'card-404' }, NOW).error, 'not-found');
});

test('checklist/toggle flips one item and bumps updatedAt', () => {
  const { board: start, ids } = fixture();
  const { board } = run(start, {
    type: 'card/update',
    cardId: ids.c,
    patch: { checklist: [{ text: 'One' }, { text: 'Two' }] },
  });
  const [one, two] = findCard(board, ids.c).card.checklist;
  const toggled = reduce(board, { type: 'checklist/toggle', cardId: ids.c, itemId: two.id }, LATER).board;
  const card = findCard(toggled, ids.c).card;
  assert.deepEqual(card.checklist, [one, { ...two, done: true }]);
  assert.equal(card.updatedAt, LATER);
  const back = reduce(toggled, { type: 'checklist/toggle', cardId: ids.c, itemId: two.id }, LATER).board;
  assert.equal(findCard(back, ids.c).card.checklist[1].done, false);
  assert.equal(reduce(board, { type: 'checklist/toggle', cardId: ids.c, itemId: 'item-404' }, NOW).error, 'not-found');
});

test('board/replace swaps in another board and rejects non-boards', () => {
  const { board } = fixture();
  const other = run(createBoard(), { type: 'column/add', title: 'Only' }).board;
  assert.equal(reduce(board, { type: 'board/replace', board: other }, NOW).board, other);
  for (const bad of [null, [], {}, { ...other, version: 1 }, { ...other, columns: 'x' }, { ...other, nextId: '9' }]) {
    assert.equal(reduce(board, { type: 'board/replace', board: bad }, NOW).error, 'invalid');
  }
});

test('unknown or malformed actions are rejected without changes', () => {
  const { board } = fixture();
  for (const action of [undefined, null, {}, { type: 7 }, { type: 'card/fly' }, { type: 'constructor' }, { type: '__proto__' }]) {
    const result = reduce(board, action, NOW);
    assert.equal(result.error, 'unknown-action');
    assert.equal(result.board, board);
  }
});

test('the reducer never mutates the board it is given', () => {
  const { board, ids } = fixture();
  const snapshot = structuredClone(board);
  const actions = [
    { type: 'column/add', title: 'X', index: 0 },
    { type: 'column/rename', columnId: ids.todo, title: 'Y' },
    { type: 'column/move', columnId: ids.todo, toIndex: 2 },
    { type: 'column/setWip', columnId: ids.todo, wipLimit: 9 },
    { type: 'column/delete', columnId: ids.doing },
    { type: 'card/add', columnId: ids.done, title: 'Z', checklist: [{ text: 'z' }] },
    { type: 'card/update', cardId: ids.a, patch: { title: 'A!', checklist: [{ text: 'a' }] } },
    { type: 'card/move', cardId: ids.a, toColumnId: ids.doing, toIndex: 1 },
    { type: 'card/move', cardId: ids.c, toColumnId: ids.todo, toIndex: 0 },
    { type: 'card/archive', cardId: ids.e },
    { type: 'card/delete', cardId: ids.b },
  ];
  for (const action of actions) assert.equal(reduce(board, action, LATER).error, null, action.type);
  assert.deepEqual(board, snapshot);
});
