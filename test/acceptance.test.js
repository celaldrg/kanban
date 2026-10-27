// The "done" criterion, end to end through the store: the reducer, cross-column moves with WIP
// limits, undo/redo and Turkish-insensitive search.
import assert from 'node:assert/strict';
import test from 'node:test';

import { toDateKey } from '../src/dates.js';
import { findCard } from '../src/model.js';
import { EMPTY_FILTERS, createMatcher } from '../src/search.js';
import { createKanban } from '../src/store.js';

const NOW = new Date(2026, 9, 27, 10, 0).getTime();

test('a board session: moves, WIP limit, undo/redo and Turkish search', () => {
  let clock = NOW;
  const store = createKanban({ now: () => (clock += 1000) });
  const todo = store.dispatch({ type: 'column/add', title: 'Yapılacak' }).id;
  const doing = store.dispatch({ type: 'column/add', title: 'Yapılıyor', wipLimit: 2 }).id;
  const done = store.dispatch({ type: 'column/add', title: 'Bitti' }).id;
  const homework = store.dispatch({ type: 'card/add', columnId: todo, title: 'Işık Ödevi', due: '2026-10-28' }).id;
  const report = store.dispatch({ type: 'card/add', columnId: todo, title: 'Deney raporu' }).id;
  const slides = store.dispatch({ type: 'card/add', columnId: todo, title: 'Sunum slaytları' }).id;
  const titles = () => store.getState().columns.map((column) => column.cards.map((card) => card.title));

  // Cross-column moves to exact indices.
  assert.equal(store.dispatch({ type: 'card/move', cardId: report, toColumnId: doing, toIndex: 0 }).ok, true);
  assert.equal(store.dispatch({ type: 'card/move', cardId: homework, toColumnId: doing, toIndex: 0 }).ok, true);
  assert.deepEqual(titles(), [['Sunum slaytları'], ['Işık Ödevi', 'Deney raporu'], []]);
  const full = store.getState();

  // The WIP limit blocks a third card but not reordering inside the column.
  assert.deepEqual(store.dispatch({ type: 'card/move', cardId: slides, toColumnId: doing, toIndex: 1 }), {
    ok: false,
    error: 'wip-limit',
    id: null,
  });
  assert.equal(store.getState(), full);
  assert.equal(store.dispatch({ type: 'card/move', cardId: homework, toColumnId: doing, toIndex: 1 }).ok, true);
  assert.deepEqual(titles(), [['Sunum slaytları'], ['Deney raporu', 'Işık Ödevi'], []]);
  const reordered = store.getState();

  // Moving a card out frees the slot.
  store.dispatch({ type: 'card/move', cardId: report, toColumnId: done, toIndex: 0 });
  assert.equal(store.dispatch({ type: 'card/move', cardId: slides, toColumnId: doing, toIndex: 0 }).ok, true);
  assert.deepEqual(titles(), [[], ['Sunum slaytları', 'Işık Ödevi'], ['Deney raporu']]);
  const finished = store.getState();

  // Undo and redo restore the exact earlier states.
  store.undo();
  store.undo();
  assert.equal(store.getState(), reordered);
  store.undo();
  assert.equal(store.getState(), full);
  store.redo();
  store.redo();
  store.redo();
  assert.equal(store.getState(), finished);

  // Search ignores case and Turkish accents; filters use the fixed clock.
  const today = toDateKey(NOW);
  const search = (filters) =>
    store
      .getState()
      .columns.flatMap((column) => column.cards)
      .filter(createMatcher({ ...EMPTY_FILTERS, ...filters }, today))
      .map((card) => card.id);
  assert.deepEqual(search({ query: 'isik odevi' }), [homework]);
  assert.deepEqual(search({ query: 'SLAYT' }), [slides]);
  assert.deepEqual(search({ due: 'week' }), [homework]);
  assert.equal(findCard(store.getState(), homework).card.createdAt, NOW + 4000);
});
