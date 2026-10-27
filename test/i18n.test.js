import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { DUE_FILTERS } from '../src/dates.js';
import { LANGUAGES, translate } from '../src/i18n.js';
import { LABELS } from '../src/model.js';

// The text tables are private to i18n.js, so their keys are read from its source.
const SRC = new URL('../src/', import.meta.url);
const read = (url) => readFileSync(url, 'utf8');
const I18N_SOURCE = read(new URL('i18n.js', SRC));
const UI_SOURCES = readdirSync(SRC)
  .filter((name) => name.endsWith('.js') && name !== 'i18n.js')
  .map((name) => read(new URL(name, SRC)))
  .join('\n');
const HTML = read(new URL('../index.html', import.meta.url));

/** Keys of a text table (`const EN = {` … `};`): one per line at the first indent level. */
function tableKeys(name) {
  const body = I18N_SOURCE.split(`const ${name} = {`)[1].split('\n};')[0];
  return [...body.matchAll(/^ {2}(?:'([^']+)'|(\w+)):/gm)].map((match) => match[1] ?? match[2]);
}

const EN_KEYS = tableKeys('EN');
const TR_KEYS = tableKeys('TR');

/** Keys the interface builds from a code, such as `label.${id}`, with every code it can use. */
const FAMILIES = {
  label: LABELS,
  due: DUE_FILTERS,
  error: ['invalid', 'not-found', 'wip-limit', 'unknown-action'],
  importError: ['json', 'too-large', 'version', 'shape', 'read'],
};
const FAMILY_KEYS = Object.entries(FAMILIES).flatMap(([family, codes]) => codes.map((code) => `${family}.${code}`));

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const exists = (lang, key) => translate(lang, key) !== key;

/** Every key the code or the page asks for by name. */
function requestedKeys() {
  const found = new Set();
  const collect = (text, pattern) => {
    for (const match of text.matchAll(pattern)) match.slice(1).forEach((key) => key && found.add(key));
  };
  collect(UI_SOURCES, /\bt\(\s*'([^']+)'/g);
  collect(UI_SOURCES, /\bt\(\s*[\w.]+\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/g);
  collect(UI_SOURCES, /\btranslate\(\s*[\w.]+\s*,\s*'([^']+)'/g);
  collect(UI_SOURCES, /\bi18n:\s*'([^']+)'/g);
  collect(HTML, /data-i18n="([^"]+)"/g);
  for (const [, pairs] of HTML.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of pairs.split(';')) found.add(pair.split(':')[1]);
  }
  return found;
}

test('English and Turkish define the same texts', () => {
  assert.ok(EN_KEYS.length > 100, `only ${EN_KEYS.length} keys found: has the table layout changed?`);
  assert.equal(new Set(EN_KEYS).size, EN_KEYS.length, 'duplicate English key');
  assert.equal(new Set(TR_KEYS).size, TR_KEYS.length, 'duplicate Turkish key');
  assert.deepEqual([...TR_KEYS].sort(), [...EN_KEYS].sort());
  for (const key of EN_KEYS) {
    for (const lang of LANGUAGES) assert.ok(exists(lang, key) && translate(lang, key).trim() !== '', `${lang}: ${key}`);
  }
});

test('each text has the same placeholders in both languages', () => {
  for (const key of EN_KEYS) {
    assert.deepEqual(placeholders(translate('tr', key)), placeholders(translate('en', key)), key);
    // With n = 1 the singular form is used where a language has one.
    assert.deepEqual(placeholders(translate('tr', key, { n: 1 })), placeholders(translate('en', key, { n: 1 })), `${key} (n = 1)`);
  }
});

test('every text the interface asks for exists in both languages', () => {
  const keys = [...requestedKeys(), ...FAMILY_KEYS];
  assert.ok(keys.length > 100, `only ${keys.length} keys found: has the code changed shape?`);
  for (const key of keys) {
    for (const lang of LANGUAGES) assert.ok(exists(lang, key), `${lang}: missing "${key}"`);
  }
});

test('every text is used by the interface', () => {
  for (const family of Object.keys(FAMILIES)) {
    assert.ok(UI_SOURCES.includes(`\`${family}.\${`), `no code builds "${family}." keys`);
  }
  const requested = requestedKeys();
  const quoted = new Set([...UI_SOURCES.matchAll(/'([^'\n]+)'/g)].map((match) => match[1]));
  const unused = EN_KEYS.filter((key) => !FAMILY_KEYS.includes(key) && !requested.has(key) && !quoted.has(key));
  assert.deepEqual(unused, []);
  const unknownCodes = EN_KEYS.filter((key) => key.includes('.') && !FAMILY_KEYS.includes(key));
  assert.deepEqual(unknownCodes, [], 'a family key that no code produces');
});

test('translate fills placeholders and picks the plural form', () => {
  assert.equal(translate('en', 'matchCount', { n: 3, total: 12 }), 'Matches: 3 of 12');
  assert.equal(translate('tr', 'matchCount', { n: 3, total: 12 }), 'Eşleşen: 3 / 12');
  assert.equal(translate('en', 'cardCount', { n: 1 }), '1 card');
  assert.equal(translate('en', 'cardCount', { n: 2 }), '2 cards');
  assert.equal(translate('en', 'cardCount', { n: 0 }), '0 cards');
  assert.equal(translate('tr', 'cardCount', { n: 1 }), '1 kart');
  assert.equal(translate('tr', 'cardCount', { n: 5 }), '5 kart');
  assert.equal(translate('en', 'wipBlocked', { column: 'Doing' }), '“Doing” is at its WIP limit.');
});

test('translate leaves unknown keys and placeholders visible and falls back to English', () => {
  assert.equal(translate('en', 'no.such.text'), 'no.such.text');
  assert.equal(translate('en', 'matchCount', { n: 1 }), 'Matches: 1 of {total}');
  assert.equal(translate('de', 'addCard'), 'Add card');
  assert.equal(translate(undefined, 'addCard'), 'Add card');
  assert.equal(translate('en', 'toString'), 'toString', 'inherited properties are not texts');
});

test('the language button names the other language', () => {
  assert.deepEqual(LANGUAGES, ['en', 'tr']);
  assert.ok(Object.isFrozen(LANGUAGES));
  assert.equal(translate('en', 'langButton'), 'TR');
  assert.equal(translate('tr', 'langButton'), 'EN');
  assert.equal(translate('en', 'appTitle'), 'Kanban Board');
  assert.equal(translate('tr', 'appTitle'), 'Kanban Panosu');
});
