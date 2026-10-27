import assert from 'node:assert/strict';
import test from 'node:test';

import { dueStatus, toDateKey } from '../src/dates.js';
import { LABELS } from '../src/model.js';
import { createDemoBoard, createSampleBoard } from '../src/sample.js';
import { parseBoard, stringifyBoard } from '../src/schema.js';

// Fixed clock: Tuesday 27 October 2026, 10:00 local time.
const NOW = new Date(2026, 9, 27, 10, 0).getTime();
const TODAY = toDateKey(NOW);

const activeCards = (board) => board.columns.flatMap((column) => column.cards);

/** Everything except the texts, to compare the English and Turkish versions. */
function structure(board) {
  const card = ({ id, labels, due, checklist, createdAt, updatedAt }) => ({
    id,
    labels,
    due,
    done: checklist.map((item) => item.done),
    createdAt,
    updatedAt,
  });
  return {
    nextId: board.nextId,
    columns: board.columns.map((column) => ({ id: column.id, wipLimit: column.wipLimit, cards: column.cards.map(card) })),
    archive: board.archive.map((entry) => ({ ...card(entry), columnId: entry.columnId })),
  };
}

for (const [name, create] of [
  ['sample', createSampleBoard],
  ['demo', createDemoBoard],
]) {
  test(`the ${name} board passes strict validation in both languages`, () => {
    for (const lang of ['en', 'tr']) {
      const board = create({ now: NOW, lang });
      assert.deepEqual(parseBoard(stringifyBoard(board)), { ok: true, board }, lang);
    }
  });

  test(`the ${name} board is deterministic and has the same structure in English and Turkish`, () => {
    const english = create({ now: NOW });
    assert.deepEqual(create({ now: NOW, lang: 'en' }), english);
    assert.deepEqual(create({ now: NOW, lang: 'de' }), english, 'unknown languages fall back to English');
    const turkish = create({ now: NOW, lang: 'tr' });
    assert.notDeepEqual(turkish, english);
    assert.deepEqual(structure(turkish), structure(english));
  });

  test(`the ${name} board respects its WIP limits`, () => {
    for (const column of create({ now: NOW }).columns) {
      if (column.wipLimit !== null) assert.ok(column.cards.length <= column.wipLimit, column.title);
    }
  });
}

test('the demo board has 4 columns, 12 cards, labels and exactly one overdue card', () => {
  const board = createDemoBoard({ now: NOW });
  const cards = activeCards(board);
  assert.equal(board.columns.length, 4);
  assert.equal(cards.length, 12);
  assert.equal(board.archive.length, 1);
  const statuses = cards.map((card) => dueStatus(card.due, TODAY));
  assert.equal(statuses.filter((status) => status === 'overdue').length, 1);
  assert.equal(statuses.filter((status) => status === 'today').length, 1);
  const usedLabels = new Set(cards.flatMap((card) => card.labels));
  assert.deepEqual([...usedLabels].sort(), [...LABELS].sort(), 'every label color appears');
  assert.ok(cards.filter((card) => card.checklist.length > 0).length >= 3, 'some cards show checklist progress');
  assert.ok(board.columns.some((column) => column.wipLimit !== null && column.cards.length === column.wipLimit));
});

test('the demo board keeps its single overdue card on any day', () => {
  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const now = new Date(2026, 10, day, 8, 0).getTime();
    const today = toDateKey(now);
    const overdue = activeCards(createDemoBoard({ now })).filter((card) => dueStatus(card.due, today) === 'overdue');
    assert.equal(overdue.length, 1);
  }
});

test('the sample board introduces the app on a first visit', () => {
  const board = createSampleBoard({ now: NOW });
  assert.deepEqual(
    board.columns.map((column) => column.title),
    ['To do', 'Doing', 'Done'],
  );
  assert.equal(activeCards(board)[0].title, 'Welcome! Open this card to edit it');
  assert.equal(activeCards(board).every((card) => card.createdAt === NOW), true);
  assert.deepEqual(
    createSampleBoard({ now: NOW, lang: 'tr' }).columns.map((column) => column.title),
    ['Yapılacak', 'Yapılıyor', 'Bitti'],
  );
});
