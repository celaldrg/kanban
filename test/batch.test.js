import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoard, findColumn } from '../src/model.js';
import { reduce } from '../src/reducer.js';
import { createKanban } from '../src/store.js';

const NOW = Date.UTC(2026, 9, 27, 9, 0);

/** A store with Todo [A, B] | Doing [C] (WIP 1), and the ids it made. */
function fixture() {
  const store = createKanban({ board: createBoard(), now: () => NOW });
  const todo = store.dispatch({ type: 'column/add', title: 'Todo' }).id;
  const doing = store.dispatch({ type: 'column/add', title: 'Doing', wipLimit: 1 }).id;
  const a = store.dispatch({ type: 'card/add', columnId: todo, title: 'A' }).id;
  store.dispatch({ type: 'card/add', columnId: todo, title: 'B' });
  store.dispatch({ type: 'card/add', columnId: doing, title: 'C' });
  return { store, todo, doing, a };
}

const titles = (board) => board.columns.map((column) => column.title);

test('a batch applies its actions in order as one undo step', () => {
  const { store, todo } = fixture();
  const before = store.getState();
  const result = store.dispatch({
    type: 'batch',
    actions: [
      { type: 'column/rename', columnId: todo, title: 'Backlog' },
      { type: 'column/setWip', columnId: todo, wipLimit: 5 },
      { type: 'column/move', columnId: todo, toIndex: 1 },
    ],
  });
  assert.deepEqual(result, { ok: true, error: null, id: null });
  assert.deepEqual(titles(store.getState()), ['Doing', 'Backlog']);
  assert.equal(findColumn(store.getState(), todo).wipLimit, 5);
  assert.equal(store.undo(), true);
  assert.equal(store.getState(), before, 'one undo reverts the whole batch');
  assert.equal(store.redo(), true);
  assert.deepEqual(titles(store.getState()), ['Doing', 'Backlog']);
});

test('the first failing action cancels the whole batch with its error code', () => {
  const { store, todo, doing, a } = fixture();
  const before = store.getState();
  let notified = 0;
  store.subscribe(() => (notified += 1));
  const invalid = store.dispatch({
    type: 'batch',
    actions: [
      { type: 'column/rename', columnId: todo, title: 'Renamed' },
      { type: 'column/setWip', columnId: todo, wipLimit: -1 },
    ],
  });
  assert.deepEqual(invalid, { ok: false, error: 'invalid', id: null });
  const full = store.dispatch({
    type: 'batch',
    actions: [
      { type: 'column/rename', columnId: doing, title: 'Renamed' },
      { type: 'card/move', cardId: a, toColumnId: doing, toIndex: 0 },
    ],
  });
  assert.equal(full.error, 'wip-limit');
  assert.equal(store.dispatch({ type: 'batch', actions: [{ type: 'column/rename', columnId: 'nope', title: 'X' }] }).error, 'not-found');
  assert.equal(store.dispatch({ type: 'batch', actions: [{ type: 'nope' }] }).error, 'unknown-action');
  assert.equal(store.getState(), before, 'nothing was applied');
  assert.equal(notified, 0);
});

test('later actions see the changes of earlier ones, and new ids come back', () => {
  const { store } = fixture();
  const result = reduce(
    store.getState(),
    {
      type: 'batch',
      actions: [
        { type: 'column/add', title: 'Done' },
        { type: 'column/setWip', columnId: 'col-6', wipLimit: 2 },
      ],
    },
    NOW,
  );
  assert.equal(result.error, null);
  assert.equal(result.id, 'col-6');
  assert.equal(findColumn(result.board, 'col-6').wipLimit, 2);
});

test('an empty batch changes nothing and is not an undo step', () => {
  const store = createKanban({ board: createBoard() });
  const before = store.getState();
  assert.deepEqual(store.dispatch({ type: 'batch', actions: [] }), { ok: true, error: null, id: null });
  assert.equal(store.getState(), before);
  assert.equal(store.canUndo(), false);
});

test('a batch without an action list is invalid', () => {
  const board = createBoard();
  for (const actions of [undefined, null, 'column/add', { type: 'column/add', title: 'X' }]) {
    assert.deepEqual(reduce(board, { type: 'batch', actions }, NOW), { board, error: 'invalid', id: null });
  }
});
