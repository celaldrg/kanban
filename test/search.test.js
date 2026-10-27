import assert from 'node:assert/strict';
import test from 'node:test';

import { toDateKey } from '../src/dates.js';
import { EMPTY_FILTERS, createMatcher, isFilterActive, normalizeText } from '../src/search.js';

// Fixed clock: Tuesday 27 October 2026, 10:00 local time.
const TODAY = toDateKey(new Date(2026, 9, 27, 10, 0).getTime());

function card(title, extra = {}) {
  return { id: 'card-1', title, description: '', labels: [], due: null, checklist: [], createdAt: 0, updatedAt: 0, ...extra };
}

const matches = (filters, subject) => createMatcher({ ...EMPTY_FILTERS, ...filters }, TODAY)(subject);

test('normalizeText folds case, accents and the Turkish dotted and dotless I', () => {
  assert.equal(normalizeText('Işık Ödevi'), 'isik odevi');
  assert.equal(normalizeText('IŞIK ÖDEVİ'), 'isik odevi');
  assert.equal(normalizeText('İıIi'), 'iiii');
  assert.equal(normalizeText('Şş Ğğ Çç Öö Üü'), 'ss gg cc oo uu');
  assert.equal(normalizeText('  çok \n\t boşluk  '), 'cok bosluk');
  assert.equal(normalizeText('Crème Brûlée'), 'creme brulee');
});

test('search finds "Işık Ödevi" with "isik odevi"', () => {
  const homework = card('Işık Ödevi');
  assert.equal(matches({ query: 'isik odevi' }, homework), true);
  for (const query of ['ISIK ODEVI', 'ışık ödevi', 'İŞIK', 'odevi isik', 'öde', '  isik   ']) {
    assert.equal(matches({ query }, homework), true, query);
  }
  assert.equal(matches({ query: 'isik raporu' }, homework), false);
  assert.equal(matches({ query: 'ısık odevi' }, card('Isik odevi')), true, 'works in both directions');
});

test('search looks at the description as well as the title', () => {
  const subject = card('Weekly report', { description: 'Çalışma takvimini güncelle' });
  assert.equal(matches({ query: 'calisma' }, subject), true);
  assert.equal(matches({ query: 'report takvim' }, subject), true);
  assert.equal(matches({ query: 'budget' }, subject), false);
});

test('the label filter keeps cards that have any selected label', () => {
  const red = card('Red', { labels: ['red'] });
  const both = card('Both', { labels: ['red', 'blue'] });
  const none = card('None');
  assert.deepEqual([red, both, none].filter((c) => matches({ labels: ['blue'] }, c)), [both]);
  assert.deepEqual([red, both, none].filter((c) => matches({ labels: ['blue', 'red'] }, c)), [red, both]);
  assert.deepEqual([red, both, none].filter((c) => matches({ labels: [] }, c)), [red, both, none]);
});

test('due filters use the fixed clock', () => {
  const cards = {
    overdue: card('Overdue', { due: '2026-10-26' }),
    today: card('Today', { due: '2026-10-27' }),
    sunday: card('Sunday', { due: '2026-11-01' }),
    nextWeek: card('Next week', { due: '2026-11-02' }),
    none: card('No date'),
  };
  const pick = (due) => Object.keys(cards).filter((key) => matches({ due }, cards[key]));
  assert.deepEqual(pick('overdue'), ['overdue']);
  assert.deepEqual(pick('today'), ['today']);
  assert.deepEqual(pick('week'), ['today', 'sunday']);
  assert.deepEqual(pick(null), ['overdue', 'today', 'sunday', 'nextWeek', 'none']);
});

test('query, labels and due date combine', () => {
  const subject = card('Işık ödevini teslim et', { labels: ['green'], due: '2026-10-28' });
  assert.equal(matches({ query: 'odev', labels: ['green'], due: 'week' }, subject), true);
  assert.equal(matches({ query: 'odev', labels: ['red'], due: 'week' }, subject), false);
  assert.equal(matches({ query: 'odev', labels: ['green'], due: 'overdue' }, subject), false);
  assert.equal(matches({ query: 'rapor', labels: ['green'], due: 'week' }, subject), false);
});

test('isFilterActive ignores blank queries', () => {
  assert.equal(isFilterActive(EMPTY_FILTERS), false);
  assert.equal(isFilterActive({ ...EMPTY_FILTERS, query: '   ' }), false);
  assert.equal(isFilterActive({ ...EMPTY_FILTERS, query: 'x' }), true);
  assert.equal(isFilterActive({ ...EMPTY_FILTERS, labels: ['red'] }), true);
  assert.equal(isFilterActive({ ...EMPTY_FILTERS, due: 'today' }), true);
});
