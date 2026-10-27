import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoard, findCard } from '../src/model.js';
import { createKanban } from '../src/store.js';

const START = Date.UTC(2026, 9, 27, 9, 0);

/** A fake clock that advances one second per reading. */
function tickingClock(start = START) {
  let time = start - 1000;
  return () => (time += 1000);
}

test('dispatch applies actions with the injected clock and returns new ids', () => {
  const store = createKanban({ now: tickingClock() });
  const column = store.dispatch({ type: 'column/add', title: 'Todo' });
  assert.deepEqual(column, { ok: true, error: null, id: 'col-1' });
  const card = store.dispatch({ type: 'card/add', columnId: column.id, title: 'Write tests' });
  assert.equal(card.id, 'card-2');
  const found = findCard(store.getState(), card.id);
  assert.equal(found.card.createdAt, START + 1000);
  store.dispatch({ type: 'card/update', cardId: card.id, patch: { title: 'Write more tests' } });
  assert.equal(findCard(store.getState(), card.id).card.updatedAt, START + 2000);
});

test('an initial board can be passed in', () => {
  const board = createBoard();
  const store = createKanban({ board });
  assert.equal(store.getState(), board);
  assert.equal(store.canUndo(), false);
  assert.equal(store.canRedo(), false);
});

test('failed and no-op dispatches leave state and history alone', () => {
  const store = createKanban({ now: tickingClock() });
  const columnId = store.dispatch({ type: 'column/add', title: 'Todo', wipLimit: 1 }).id;
  store.dispatch({ type: 'card/add', columnId, title: 'One' });
  const before = store.getState();
  let notified = 0;
  store.subscribe(() => notified++);
  assert.deepEqual(store.dispatch({ type: 'card/add', columnId, title: 'Two' }), { ok: false, error: 'wip-limit', id: null });
  assert.deepEqual(store.dispatch({ type: 'column/rename', columnId, title: 'Todo' }), { ok: true, error: null, id: null });
  assert.equal(store.dispatch({ type: 'nope' }).error, 'unknown-action');
  assert.equal(store.getState(), before);
  assert.equal(notified, 0);
  assert.equal(store.undo(), true);
  assert.equal(store.undo(), true);
  assert.equal(store.undo(), false, 'only the two real changes were recorded');
});

test('undo and redo restore exact board states across 60 steps', () => {
  const store = createKanban({ now: tickingClock() });
  const snapshots = [store.getState()];
  const columnId = store.dispatch({ type: 'column/add', title: 'Todo' }).id;
  snapshots.push(store.getState());
  for (let i = 0; i < 59; i++) {
    store.dispatch({ type: 'card/add', columnId, title: `Card ${i}`, index: 0 });
    snapshots.push(store.getState());
  }
  const copies = snapshots.map((board) => structuredClone(board));
  for (let i = snapshots.length - 1; i > 0; i--) {
    assert.equal(store.getState(), snapshots[i]);
    assert.equal(store.undo(), true);
  }
  assert.equal(store.getState(), snapshots[0]);
  assert.equal(store.undo(), false);
  for (let i = 1; i < snapshots.length; i++) {
    assert.equal(store.redo(), true);
    assert.equal(store.getState(), snapshots[i]);
  }
  assert.equal(store.redo(), false);
  assert.deepEqual(snapshots.map((board) => structuredClone(board)), copies, 'history snapshots were never mutated');
});

test('a new action after undo clears redo', () => {
  const store = createKanban({ now: tickingClock() });
  const columnId = store.dispatch({ type: 'column/add', title: 'Todo' }).id;
  store.dispatch({ type: 'card/add', columnId, title: 'One' });
  store.undo();
  assert.equal(store.canRedo(), true);
  store.dispatch({ type: 'card/add', columnId, title: 'Other' });
  assert.equal(store.canRedo(), false);
  assert.deepEqual(store.getState().columns[0].cards.map((card) => card.title), ['Other']);
});

test('subscribers hear every change until they unsubscribe', () => {
  const store = createKanban({ now: tickingClock() });
  const seen = [];
  const unsubscribe = store.subscribe((board) => seen.push(board));
  store.dispatch({ type: 'column/add', title: 'Todo' });
  store.undo();
  store.redo();
  assert.equal(seen.length, 3);
  assert.equal(seen[2], store.getState());
  unsubscribe();
  store.dispatch({ type: 'column/add', title: 'Done' });
  assert.equal(seen.length, 3);
});

test('the history limit option is honoured', () => {
  const store = createKanban({ now: tickingClock(), historyLimit: 2 });
  for (const title of ['A', 'B', 'C']) store.dispatch({ type: 'column/add', title });
  assert.equal(store.undo(), true);
  assert.equal(store.undo(), true);
  assert.equal(store.undo(), false);
  assert.deepEqual(store.getState().columns.map((column) => column.title), ['A']);
});
