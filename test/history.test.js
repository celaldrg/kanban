import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_HISTORY_LIMIT, canRedo, canUndo, createHistory, record, redo, undo } from '../src/history.js';

const states = (count) => Array.from({ length: count }, (_, step) => ({ step }));

function recordAll(list, limit) {
  let history = createHistory(list[0], limit);
  for (const state of list.slice(1)) history = record(history, state);
  return history;
}

test('undo and redo walk through the exact recorded states', () => {
  const list = states(6);
  let history = recordAll(list);
  for (let i = 5; i > 0; i--) {
    assert.equal(history.present, list[i]);
    history = undo(history);
  }
  assert.equal(history.present, list[0]);
  assert.equal(canUndo(history), false);
  assert.equal(undo(history), history, 'undo at the start changes nothing');
  for (let i = 1; i <= 5; i++) {
    history = redo(history);
    assert.equal(history.present, list[i]);
  }
  assert.equal(canRedo(history), false);
  assert.equal(redo(history), history, 'redo at the end changes nothing');
});

test('recording after an undo drops the redo branch', () => {
  const list = states(4);
  const branch = { step: 'branch' };
  let history = undo(undo(recordAll(list)));
  assert.equal(canRedo(history), true);
  history = record(history, branch);
  assert.equal(canRedo(history), false);
  assert.equal(history.present, branch);
  assert.equal(undo(history).present, list[1]);
});

test('recording the present again is a no-op', () => {
  const history = recordAll(states(3));
  assert.equal(record(history, history.present), history);
});

test('at least 50 undo steps are kept by default', () => {
  assert.ok(DEFAULT_HISTORY_LIMIT >= 50);
  const list = states(61);
  let history = recordAll(list);
  for (let i = 0; i < 60; i++) history = undo(history);
  assert.equal(history.present, list[0]);
});

test('the oldest steps beyond the limit are forgotten', () => {
  const list = states(56);
  let history = recordAll(list, 50);
  assert.equal(history.past.length, 50);
  let undone = 0;
  while (canUndo(history)) {
    history = undo(history);
    undone++;
  }
  assert.equal(undone, 50);
  assert.equal(history.present, list[5]);
  while (canRedo(history)) history = redo(history);
  assert.equal(history.present, list[55]);
});

test('createHistory rejects invalid limits', () => {
  for (const limit of [0, -1, 2.5, '10', null]) {
    assert.throws(() => createHistory({}, limit), RangeError);
  }
});
