import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BoardError,
  LABELS,
  canMoveTo,
  checkDue,
  checkLabels,
  checkTitle,
  checkWip,
  checklistProgress,
  createBoard,
  findCard,
  findColumn,
  idCounter,
  isColumnFull,
} from '../src/model.js';
import { reduce } from '../src/reducer.js';

/** Todo [A (2 of 3 checked), B] | Doing [C] (WIP 1), plus D archived from Todo. */
function fixture() {
  let board = createBoard();
  const step = (action) => {
    const result = reduce(board, action, 0);
    assert.equal(result.error, null);
    board = result.board;
    return result.id;
  };
  const todo = step({ type: 'column/add', title: 'Todo' });
  const doing = step({ type: 'column/add', title: 'Doing', wipLimit: 1 });
  const checklist = [
    { text: 'x', done: true },
    { text: 'y', done: true },
    { text: 'z', done: false },
  ];
  const a = step({ type: 'card/add', columnId: todo, title: 'A', checklist });
  const b = step({ type: 'card/add', columnId: todo, title: 'B' });
  const c = step({ type: 'card/add', columnId: doing, title: 'C' });
  const d = step({ type: 'card/add', columnId: todo, title: 'D' });
  step({ type: 'card/archive', cardId: d });
  return { board, ids: { todo, doing, a, b, c, d } };
}

test('createBoard starts empty at the current schema version', () => {
  assert.deepEqual(createBoard(), { version: 2, nextId: 1, columns: [], archive: [] });
  assert.notEqual(createBoard(), createBoard());
});

test('idCounter hands out sequential prefixed ids', () => {
  const ids = idCounter(7);
  assert.equal(ids.take('card'), 'card-7');
  assert.equal(ids.take('item'), 'item-8');
  assert.equal(ids.peek(), 9);
});

test('findColumn and findCard locate columns, active cards and archived cards', () => {
  const { board, ids } = fixture();
  assert.equal(findColumn(board, ids.doing).title, 'Doing');
  assert.equal(findColumn(board, 'col-404'), undefined);
  const b = findCard(board, ids.b);
  assert.deepEqual({ title: b.card.title, archived: b.archived, index: b.index, columnIndex: b.columnIndex }, {
    title: 'B',
    archived: false,
    index: 1,
    columnIndex: 0,
  });
  assert.equal(b.column.id, ids.todo);
  const d = findCard(board, ids.d);
  assert.deepEqual({ archived: d.archived, index: d.index, column: d.column, columnIndex: d.columnIndex }, {
    archived: true,
    index: 0,
    column: null,
    columnIndex: -1,
  });
  assert.equal(findCard(board, 'card-404'), null);
});

test('isColumnFull and canMoveTo follow WIP limits', () => {
  const { board, ids } = fixture();
  const [todo, doing] = board.columns;
  assert.equal(isColumnFull(todo), false, 'no limit');
  assert.equal(isColumnFull(doing), true);
  assert.equal(canMoveTo(board, ids.a, ids.doing), false);
  assert.equal(canMoveTo(board, ids.c, ids.doing), true, 'a card always fits in its own column');
  assert.equal(canMoveTo(board, ids.c, ids.todo), true);
  assert.equal(canMoveTo(board, ids.d, ids.todo), true, 'archived cards can be restored into open columns');
  assert.equal(canMoveTo(board, ids.a, 'col-404'), false);
});

test('checklistProgress counts finished items', () => {
  const { board, ids } = fixture();
  assert.deepEqual(checklistProgress(findCard(board, ids.a).card), { done: 2, total: 3 });
  assert.deepEqual(checklistProgress(findCard(board, ids.b).card), { done: 0, total: 0 });
});

test('field rules clean valid input and throw BoardError("invalid") otherwise', () => {
  assert.equal(checkTitle('  Plan\tthe   launch '), 'Plan the launch');
  assert.deepEqual(checkLabels(['purple', 'red', 'purple']), ['red', 'purple']);
  assert.deepEqual(checkLabels([...LABELS].reverse()), [...LABELS]);
  assert.equal(checkDue(''), null);
  assert.equal(checkDue('2026-10-27'), '2026-10-27');
  assert.equal(checkWip(0), null);
  assert.equal(checkWip(4), 4);
  for (const attempt of [() => checkTitle(''), () => checkLabels(['RED']), () => checkDue('tomorrow'), () => checkWip(-2)]) {
    assert.throws(attempt, (error) => error instanceof BoardError && error.code === 'invalid');
  }
});
