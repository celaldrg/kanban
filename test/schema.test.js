import assert from 'node:assert/strict';
import test from 'node:test';

import { SCHEMA_VERSION, createBoard } from '../src/model.js';
import { reduce } from '../src/reducer.js';
import { MAX_IMPORT_CHARS, importBoard, migrate, parseBoard, stringifyBoard } from '../src/schema.js';

const NOW = Date.UTC(2026, 9, 27, 9, 0);

/** Todo (WIP 3) [Işık Ödevi + checklist] | Done [] with one archived card from Done. */
function validBoard() {
  let board = createBoard();
  const step = (action) => {
    const result = reduce(board, action, NOW);
    assert.equal(result.error, null);
    board = result.board;
    return result.id;
  };
  const todo = step({ type: 'column/add', title: 'Todo', wipLimit: 3 });
  const done = step({ type: 'column/add', title: 'Done' });
  step({
    type: 'card/add',
    columnId: todo,
    title: 'Işık Ödevi',
    description: 'Fizik',
    labels: ['red', 'blue'],
    due: '2026-10-30',
    checklist: [{ text: 'Oku', done: true }, { text: 'Yaz' }],
  });
  step({ type: 'card/archive', cardId: step({ type: 'card/add', columnId: done, title: 'Old' }) });
  return board;
}

/** JSON text of the valid board after `change` edits its plain-object copy. */
function mutated(change) {
  const doc = JSON.parse(stringifyBoard(validBoard()));
  change(doc);
  return JSON.stringify(doc);
}

test('export and import round-trip a board exactly', () => {
  const board = validBoard();
  for (const indent of [0, 2]) {
    const result = parseBoard(stringifyBoard(board, indent));
    assert.equal(result.ok, true);
    assert.deepEqual(result.board, board);
  }
  assert.match(stringifyBoard(board, 2), /\n {2}"version": 2,/);
});

test('text that is not JSON is rejected without throwing', () => {
  for (const text of ['', '{', '{"version":2,', 'undefined', 'NaN', "{'version':2}", '{"version":2}}']) {
    assert.deepEqual(parseBoard(text), { ok: false, error: 'json' }, text);
  }
  for (const value of [null, undefined, 42, {}, ['{}']]) {
    assert.deepEqual(parseBoard(value), { ok: false, error: 'json' });
  }
});

test('JSON that is not a board is rejected', () => {
  const texts = ['null', '[]', '42', '"board"', 'true', '{}', '{"version":"2"}', '{"version":0}', '{"version":1.5}', '[[[[[]]]]]'];
  for (const text of texts) assert.deepEqual(parseBoard(text), { ok: false, error: 'shape' }, text);
});

test('boards from a newer app version are rejected', () => {
  assert.deepEqual(parseBoard(mutated((doc) => (doc.version = SCHEMA_VERSION + 1))), { ok: false, error: 'version' });
});

test('oversized input is rejected before parsing', () => {
  assert.deepEqual(parseBoard(' '.repeat(MAX_IMPORT_CHARS + 1)), { ok: false, error: 'too-large' });
});

test('wrong shapes inside a board are rejected', () => {
  const card = (doc) => doc.columns[0].cards[0];
  const cases = {
    'no columns': (doc) => delete doc.columns,
    'columns not an array': (doc) => (doc.columns = {}),
    'archive missing': (doc) => delete doc.archive,
    'negative nextId': (doc) => (doc.nextId = -3),
    'fractional nextId': (doc) => (doc.nextId = 1.5),
    'absurd nextId': (doc) => (doc.nextId = 1e15),
    'absurd counter id': (doc) => (card(doc).id = 'card-99999999999999999999'),
    'column is null': (doc) => (doc.columns[1] = null),
    'column without id': (doc) => delete doc.columns[0].id,
    'column id with spaces': (doc) => (doc.columns[0].id = 'my column'),
    'numeric column id': (doc) => (doc.columns[0].id = 7),
    'empty column title': (doc) => (doc.columns[0].title = '  '),
    'bad WIP limit': (doc) => (doc.columns[0].wipLimit = 'many'),
    'negative WIP limit': (doc) => (doc.columns[0].wipLimit = -1),
    'cards not an array': (doc) => (doc.columns[0].cards = 'cards'),
    'card is an array': (doc) => (doc.columns[0].cards[0] = []),
    'card without title': (doc) => delete card(doc).title,
    'title too long': (doc) => (card(doc).title = 'x'.repeat(201)),
    'description not text': (doc) => (card(doc).description = ['x']),
    'unknown label': (doc) => (card(doc).labels = ['pink']),
    'labels not a list': (doc) => (card(doc).labels = 'red'),
    'impossible due date': (doc) => (card(doc).due = '2026-02-30'),
    'numeric due date': (doc) => (card(doc).due = 20261030),
    'checklist not a list': (doc) => (card(doc).checklist = 'list'),
    'checklist item without done': (doc) => delete card(doc).checklist[0].done,
    'checklist item with empty text': (doc) => (card(doc).checklist[0].text = ' '),
    'checklist item without id': (doc) => delete card(doc).checklist[1].id,
    'negative createdAt': (doc) => (card(doc).createdAt = -1),
    'text updatedAt': (doc) => (card(doc).updatedAt = '2026-10-27'),
    'duplicate card id': (doc) => (doc.columns[1].cards = [{ ...card(doc), checklist: [] }]),
    'card id equal to a column id': (doc) => (card(doc).id = doc.columns[1].id),
    'archived card from a missing column': (doc) => (doc.archive[0].columnId = 'col-404'),
    'archived card without archivedAt': (doc) => delete doc.archive[0].archivedAt,
  };
  for (const [name, change] of Object.entries(cases)) {
    assert.deepEqual(parseBoard(mutated(change)), { ok: false, error: 'shape' }, name);
  }
});

test('unknown fields are dropped and prototypes stay clean', () => {
  const text = mutated((doc) => {
    doc.theme = 'dark';
    doc.columns[0].color = 'red';
    doc.columns[0].cards[0].votes = 3;
  }).replace('{', '{"__proto__":{"polluted":true},');
  const result = parseBoard(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.board, validBoard());
  assert.equal(Object.getPrototypeOf(result.board), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('missing optional fields get defaults', () => {
  const doc = {
    version: 2,
    columns: [{ id: 'col-1', title: 'Todo', cards: [{ id: 'card-2', title: 'Bare', createdAt: 5, updatedAt: 6 }] }],
    archive: [],
  };
  const result = importBoard(doc);
  assert.equal(result.ok, true);
  assert.deepEqual(result.board, {
    version: 2,
    nextId: 3,
    columns: [
      {
        id: 'col-1',
        title: 'Todo',
        wipLimit: null,
        cards: [{ id: 'card-2', title: 'Bare', description: '', labels: [], due: null, checklist: [], createdAt: 5, updatedAt: 6 }],
      },
    ],
    archive: [],
  });
});

test('nextId is raised above every counter id so new ids never collide', () => {
  const result = parseBoard(mutated((doc) => (doc.nextId = 1)));
  assert.equal(result.ok, true);
  assert.equal(result.board.nextId, validBoard().nextId);
  const custom = importBoard({ version: 2, nextId: 50, columns: [{ id: 'backlog', title: 'B', cards: [] }], archive: [] });
  assert.equal(custom.board.nextId, 50);
});

test('a v1 board migrates to the current schema', () => {
  const v1 = {
    version: 1,
    columns: [
      {
        id: 'todo',
        title: 'To do',
        cards: [
          { id: 'a', title: 'Işık Ödevi', description: 'Fizik', labels: ['blue'], due: '2026-11-03', createdAt: 1000 },
          { id: 'b', title: 'Bare card' },
        ],
      },
      { id: 'done', title: 'Done', cards: [] },
    ],
  };
  const expected = {
    version: SCHEMA_VERSION,
    nextId: 5,
    columns: [
      {
        id: 'col-1',
        title: 'To do',
        wipLimit: null,
        cards: [
          {
            id: 'card-2',
            title: 'Işık Ödevi',
            description: 'Fizik',
            labels: ['blue'],
            due: '2026-11-03',
            checklist: [],
            createdAt: 1000,
            updatedAt: 1000,
          },
          { id: 'card-3', title: 'Bare card', description: '', labels: [], due: null, checklist: [], createdAt: 0, updatedAt: 0 },
        ],
      },
      { id: 'col-4', title: 'Done', wipLimit: null, cards: [] },
    ],
    archive: [],
  };
  assert.deepEqual(migrate(v1), expected);
  assert.deepEqual(parseBoard(JSON.stringify(v1)), { ok: true, board: expected });
});

test('malformed v1 boards are rejected', () => {
  const bad = [
    { version: 1 },
    { version: 1, columns: [{ id: 'x', title: 'X' }] },
    { version: 1, columns: [{ id: 'x', title: 'X', cards: [null] }] },
    { version: 1, columns: [{ id: 'x', title: '', cards: [] }] },
    { version: 1, columns: [{ id: 'x', title: 'X', cards: [{ title: 'Y', labels: ['gold'] }] }] },
  ];
  for (const doc of bad) assert.deepEqual(parseBoard(JSON.stringify(doc)), { ok: false, error: 'shape' }, JSON.stringify(doc));
});

test('migrate returns current documents untouched', () => {
  const doc = JSON.parse(stringifyBoard(validBoard()));
  assert.equal(migrate(doc), doc);
});
