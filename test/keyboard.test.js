import assert from 'node:assert/strict';
import test from 'node:test';

import { stepTarget } from '../src/keyboard.js';
import { createBoard, findCard } from '../src/model.js';
import { reduce } from '../src/reducer.js';

/** Todo [A, B, C] | Full [D, E] (WIP 2) | Doing [F] | Done [] */
function fixture() {
  let board = createBoard();
  const step = (action) => {
    const result = reduce(board, action, 0);
    assert.equal(result.error, null);
    board = result.board;
    return result.id;
  };
  const todo = step({ type: 'column/add', title: 'Todo' });
  const full = step({ type: 'column/add', title: 'Full', wipLimit: 2 });
  const doing = step({ type: 'column/add', title: 'Doing' });
  const done = step({ type: 'column/add', title: 'Done' });
  const add = (columnId, title) => step({ type: 'card/add', columnId, title });
  const [a, b, c] = ['A', 'B', 'C'].map((title) => add(todo, title));
  const [d, e] = ['D', 'E'].map((title) => add(full, title));
  const f = add(doing, 'F');
  return { board, ids: { todo, full, doing, done, a, b, c, d, e, f } };
}

test('up and down move one slot inside the column and stop at the ends', () => {
  const { board, ids } = fixture();
  const start = { columnId: ids.todo, index: 1 };
  assert.deepEqual(stepTarget(board, ids.b, start, 'up'), { columnId: ids.todo, index: 0 });
  assert.deepEqual(stepTarget(board, ids.b, start, 'down'), { columnId: ids.todo, index: 2 });
  const top = { columnId: ids.todo, index: 0 };
  assert.equal(stepTarget(board, ids.b, top, 'up'), top);
  const bottom = { columnId: ids.todo, index: 2 };
  assert.equal(stepTarget(board, ids.b, bottom, 'down'), bottom, 'own column: last index is length - 1');
});

test('left and right skip full columns and clamp the index', () => {
  const { board, ids } = fixture();
  const fromTodo = stepTarget(board, ids.c, { columnId: ids.todo, index: 2 }, 'right');
  assert.deepEqual(fromTodo, { columnId: ids.doing, index: 1 }, 'Full is skipped; Doing has slots 0..1');
  assert.deepEqual(stepTarget(board, ids.c, fromTodo, 'down'), fromTodo, 'cannot go below the last slot');
  assert.deepEqual(stepTarget(board, ids.c, fromTodo, 'right'), { columnId: ids.done, index: 0 });
  assert.deepEqual(stepTarget(board, ids.c, fromTodo, 'left'), { columnId: ids.todo, index: 1 });
  const edge = { columnId: ids.todo, index: 0 };
  assert.equal(stepTarget(board, ids.a, edge, 'left'), edge);
});

test('a card can move around inside its own full column', () => {
  const { board, ids } = fixture();
  const home = { columnId: ids.full, index: 0 };
  assert.deepEqual(stepTarget(board, ids.d, home, 'down'), { columnId: ids.full, index: 1 });
  const fromDoing = stepTarget(board, ids.d, { columnId: ids.doing, index: 1 }, 'left');
  assert.deepEqual(fromDoing, { columnId: ids.full, index: 1 }, 'its own full column is not skipped');
});

test('unknown cards, columns and directions leave the target alone', () => {
  const { board, ids } = fixture();
  const target = { columnId: ids.todo, index: 0 };
  assert.equal(stepTarget(board, 'card-404', target, 'down'), target);
  assert.equal(stepTarget(board, ids.a, { columnId: 'col-404', index: 0 }, 'down').columnId, 'col-404');
  assert.equal(stepTarget(board, ids.a, target, 'diagonal'), target);
});

test('dropping at a stepped target lands the card exactly there', () => {
  const { board, ids } = fixture();
  let target = { columnId: ids.todo, index: 0 };
  for (const direction of ['right', 'down', 'right', 'left', 'down']) target = stepTarget(board, ids.a, target, direction);
  assert.deepEqual(target, { columnId: ids.doing, index: 1 });
  const moved = reduce(board, { type: 'card/move', cardId: ids.a, toColumnId: target.columnId, toIndex: target.index }, 0);
  assert.equal(moved.error, null);
  const found = findCard(moved.board, ids.a);
  assert.equal(found.column.id, ids.doing);
  assert.equal(found.index, 1);
});
