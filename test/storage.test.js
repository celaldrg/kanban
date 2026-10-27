import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoard } from '../src/model.js';
import { loadBoard, saveBoard } from '../src/persist.js';
import { reduce } from '../src/reducer.js';
import { readItem, writeItem } from '../src/storage.js';

/** In-memory stand-in for localStorage. */
function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

/** Storage that fails like Safari private mode or a full quota. */
const brokenStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

function smallBoard() {
  const result = reduce(createBoard(), { type: 'column/add', title: 'Todo', wipLimit: 2 }, 0);
  return reduce(result.board, { type: 'card/add', columnId: result.id, title: 'Işık Ödevi' }, 1000).board;
}

test('readItem and writeItem use namespaced keys', () => {
  const storage = memoryStorage();
  assert.equal(writeItem('lang', 'tr', storage), true);
  assert.equal(storage.data.get('kanban:lang'), 'tr');
  assert.equal(readItem('lang', storage), 'tr');
  assert.equal(readItem('missing', storage), null);
});

test('storage failures never throw', () => {
  assert.equal(readItem('lang', brokenStorage), null);
  assert.equal(writeItem('lang', 'en', brokenStorage), false);
  assert.deepEqual(loadBoard(brokenStorage), { status: 'empty', board: null });
  assert.equal(saveBoard(createBoard(), brokenStorage), false);
});

test('saveBoard and loadBoard round-trip the board', () => {
  const storage = memoryStorage();
  const board = smallBoard();
  assert.equal(saveBoard(board, storage), true);
  assert.ok(storage.data.has('kanban:board'));
  assert.deepEqual(loadBoard(storage), { status: 'loaded', board });
});

test('loadBoard finds no board on a first visit', () => {
  assert.deepEqual(loadBoard(memoryStorage()), { status: 'empty', board: null });
});

test('unreadable saved data is backed up before a new board can overwrite it', () => {
  const damaged = '{"version":2,"columns":';
  const fromNewerApp = '{"version":99,"columns":[],"archive":[]}';
  for (const text of [damaged, fromNewerApp]) {
    const storage = memoryStorage();
    storage.setItem('kanban:board', text);
    assert.deepEqual(loadBoard(storage), { status: 'backed-up', board: null, backupKey: 'board-unreadable' });
    assert.equal(storage.data.get('kanban:board-unreadable'), text);
    assert.equal(storage.data.get('kanban:board'), text, 'loading leaves the saved data alone');
    // The app then shows and saves the sample board; the copy survives.
    assert.equal(saveBoard(smallBoard(), storage), true);
    assert.equal(storage.data.get('kanban:board-unreadable'), text);
  }
});

test('a later unreadable save is kept next to the earlier copy, not over it', () => {
  const storage = memoryStorage();
  const newer = '{"version":99,"columns":[],"archive":[]}';
  storage.setItem('kanban:board', 'first damaged save');
  assert.deepEqual(loadBoard(storage), { status: 'backed-up', board: null, backupKey: 'board-unreadable' });
  assert.deepEqual(loadBoard(storage), { status: 'backed-up', board: null, backupKey: 'board-unreadable' }, 'the same data again makes no second copy');
  storage.setItem('kanban:board', newer);
  assert.deepEqual(loadBoard(storage), { status: 'backed-up', board: null, backupKey: 'board-unreadable-2' });
  assert.equal(storage.data.get('kanban:board-unreadable'), 'first damaged save');
  assert.equal(storage.data.get('kanban:board-unreadable-2'), newer);
  assert.equal(storage.data.size, 3);
});

test('when every backup key is taken, nothing is replaced and saving stays off', () => {
  const storage = memoryStorage();
  storage.setItem('kanban:board-unreadable', 'copy 1');
  for (let n = 2; n <= 9; n += 1) storage.setItem(`kanban:board-unreadable-${n}`, `copy ${n}`);
  storage.setItem('kanban:board', 'one more damaged save');
  assert.deepEqual(loadBoard(storage), { status: 'not-backed-up', board: null });
  assert.equal(storage.data.get('kanban:board-unreadable'), 'copy 1');
  assert.equal(storage.data.get('kanban:board-unreadable-9'), 'copy 9');
  assert.equal(storage.data.size, 10);
});

test('loadBoard says when unreadable data could not be backed up', () => {
  const storage = memoryStorage();
  storage.setItem('kanban:board', 'not json');
  const full = {
    getItem: storage.getItem,
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  assert.deepEqual(loadBoard(full), { status: 'not-backed-up', board: null });
  assert.equal(storage.data.has('kanban:board-unreadable'), false);
  assert.equal(storage.data.get('kanban:board'), 'not json');
});

test('loadBoard migrates data saved by schema v1', () => {
  const storage = memoryStorage();
  const v1 = { version: 1, columns: [{ id: 'x', title: 'Todo', cards: [{ id: 'y', title: 'Old card', createdAt: 7 }] }] };
  storage.setItem('kanban:board', JSON.stringify(v1));
  const { status, board } = loadBoard(storage);
  assert.equal(status, 'loaded');
  assert.equal(board.version, 2);
  assert.deepEqual(board.columns[0].cards[0], {
    id: 'card-2',
    title: 'Old card',
    description: '',
    labels: [],
    due: null,
    checklist: [],
    createdAt: 7,
    updatedAt: 7,
  });
  assert.equal(storage.data.has('kanban:board-unreadable'), false, 'readable data needs no backup');
});
