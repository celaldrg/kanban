import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDue, formatTimestamp } from '../src/format.js';

const TODAY = '2026-10-27';

test('formatDue names nearby days', () => {
  assert.equal(formatDue('2026-10-27', TODAY, 'en'), 'Today');
  assert.equal(formatDue('2026-10-28', TODAY, 'en'), 'Tomorrow');
  assert.equal(formatDue('2026-10-26', TODAY, 'en'), 'Yesterday');
  assert.equal(formatDue('2026-10-27', TODAY, 'tr'), 'Bugün');
  assert.equal(formatDue('2026-10-28', TODAY, 'tr'), 'Yarın');
  assert.equal(formatDue('2026-10-26', TODAY, 'tr'), 'Dün');
});

test('formatDue counts days across month and year ends', () => {
  assert.equal(formatDue('2026-11-01', '2026-10-31', 'en'), 'Tomorrow');
  assert.equal(formatDue('2027-01-01', '2026-12-31', 'en'), 'Tomorrow', 'not a date with a year');
  assert.equal(formatDue('2026-12-31', '2027-01-01', 'tr'), 'Dün');
});

test('formatDue shows other days as a short date, with the year when it differs', () => {
  assert.equal(formatDue('2026-10-30', TODAY, 'en'), 'Oct 30');
  assert.equal(formatDue('2026-10-30', TODAY, 'tr'), '30 Eki');
  assert.equal(formatDue('2026-03-09', TODAY, 'en'), 'Mar 9');
  assert.equal(formatDue('2027-01-05', TODAY, 'en'), 'Jan 5, 2027');
  assert.equal(formatDue('2027-01-05', TODAY, 'tr'), '5 Oca 2027');
  assert.equal(formatDue('2025-12-30', TODAY, 'en'), 'Dec 30, 2025');
});

test('formatDue falls back to English for an unknown language', () => {
  assert.equal(formatDue('2026-10-30', TODAY, 'xx'), 'Oct 30');
  assert.equal(formatDue('2026-10-27', TODAY, 'xx'), 'Today');
});

test('formatTimestamp shows date and time in the chosen language', () => {
  // Noon UTC falls on 27 or 28 October in every time zone.
  const noon = Date.UTC(2026, 9, 27, 12, 0);
  const en = formatTimestamp(noon, 'en');
  const tr = formatTimestamp(noon, 'tr');
  assert.match(en, /^Oct 2\d, 2026, \d{1,2}:\d{2}\s[AP]M$/);
  assert.match(tr, /^2\d Eki 2026 \d{2}:\d{2}$/);
  assert.equal(formatTimestamp(noon, 'xx'), en);
});
