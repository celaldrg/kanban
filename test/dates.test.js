import assert from 'node:assert/strict';
import test from 'node:test';

import { DUE_FILTERS, addDays, dueStatus, isDateKey, matchesDueFilter, toDateKey } from '../src/dates.js';

// Fixed clock: Tuesday 27 October 2026, 09:30 local time (any time zone).
const NOW = new Date(2026, 9, 27, 9, 30).getTime();
const TODAY = toDateKey(NOW);

test('isDateKey accepts real calendar dates only', () => {
  for (const ok of ['2026-10-27', '2028-02-29', '1999-12-31']) assert.equal(isDateKey(ok), true, ok);
  for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-10-32', '2026-1-05', '26-10-27', '0000-01-01', '', null, 20261027]) {
    assert.equal(isDateKey(bad), false, String(bad));
  }
});

test('toDateKey uses the local calendar day', () => {
  assert.equal(TODAY, '2026-10-27');
  assert.equal(toDateKey(new Date(2026, 9, 27, 0, 0, 1).getTime()), '2026-10-27');
  assert.equal(toDateKey(new Date(2026, 9, 27, 23, 59, 59).getTime()), '2026-10-27');
  assert.equal(toDateKey(new Date(2027, 0, 5).getTime()), '2027-01-05');
});

test('addDays crosses months, years and leap days', () => {
  assert.equal(addDays('2026-10-27', 5), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30', 'daylight-saving changes do not shift days');
  assert.equal(addDays('2026-10-27', 0), '2026-10-27');
});

test('dueStatus classifies dates against the fixed today (a Tuesday)', () => {
  assert.equal(dueStatus(null, TODAY), 'none');
  assert.equal(dueStatus('2025-12-31', TODAY), 'overdue');
  assert.equal(dueStatus('2026-10-26', TODAY), 'overdue');
  assert.equal(dueStatus('2026-10-27', TODAY), 'today');
  assert.equal(dueStatus('2026-10-28', TODAY), 'week');
  assert.equal(dueStatus('2026-11-01', TODAY), 'week', 'Sunday ends the week');
  assert.equal(dueStatus('2026-11-02', TODAY), 'later', 'next Monday');
});

test('"this week" shrinks to today on Sunday and spans seven days on Monday', () => {
  assert.equal(dueStatus('2026-11-02', '2026-11-01'), 'later');
  assert.equal(dueStatus('2026-11-08', '2026-11-02'), 'week');
  assert.equal(dueStatus('2026-11-09', '2026-11-02'), 'later');
});

test('due filters with a fixed clock', () => {
  assert.deepEqual(DUE_FILTERS, ['overdue', 'today', 'week']);
  const yesterday = addDays(TODAY, -1);
  const tomorrow = addDays(TODAY, 1);
  const nextMonth = addDays(TODAY, 30);
  assert.equal(matchesDueFilter(yesterday, 'overdue', TODAY), true);
  assert.equal(matchesDueFilter(TODAY, 'overdue', TODAY), false);
  assert.equal(matchesDueFilter(TODAY, 'today', TODAY), true);
  assert.equal(matchesDueFilter(tomorrow, 'today', TODAY), false);
  assert.equal(matchesDueFilter(TODAY, 'week', TODAY), true);
  assert.equal(matchesDueFilter(tomorrow, 'week', TODAY), true);
  assert.equal(matchesDueFilter(yesterday, 'week', TODAY), false);
  assert.equal(matchesDueFilter(nextMonth, 'week', TODAY), false);
  assert.equal(matchesDueFilter(null, 'today', TODAY), false);
  assert.equal(matchesDueFilter(null, null, TODAY), true);
  assert.equal(matchesDueFilter(nextMonth, null, TODAY), true);
});
