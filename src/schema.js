/**
 * Saved and exported board format: versioned schema, migrations, strict validation and JSON I/O.
 *
 * Schema history
 *   v1  { version: 1, columns: [{ id, title, cards: [{ id, title, description?, labels?, due?, createdAt? }] }] }
 *       Cards lived inside their columns; no WIP limits, checklists, archive or update times.
 *   v2  The Board typedef in model.js: adds wipLimit, checklist, updatedAt, the archive and the id counter.
 *
 * Import error codes: "json" (not JSON text), "too-large", "version" (made by a newer app), "shape".
 */

import {
  BoardError,
  LIMITS,
  SCHEMA_VERSION,
  checkDescription,
  checkDue,
  checkItemText,
  checkLabels,
  checkTitle,
  checkWip,
  idCounter,
  isPlainObject,
} from './model.js';

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {{ ok: true, board: Board } | { ok: false, error: 'json'|'too-large'|'version'|'shape' }} ImportResult
 */

/** Longest JSON text accepted by parseBoard, in characters. */
export const MAX_IMPORT_CHARS = 2_000_000;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COUNTER_ID = /^(?:col|card|item)-(\d+)$/;
const MAX_COUNTER = 1e12;

const MIGRATIONS = {
  1: fromV1,
};

/**
 * Serializes a board for saving or exporting.
 * @param {Board} board
 * @param {number} [indent] spaces for pretty-printing; 0 gives compact JSON
 * @returns {string}
 */
export function stringifyBoard(board, indent = 0) {
  return JSON.stringify(board, null, indent);
}

/**
 * Reads a board from JSON text (an export file or saved data): checks size and syntax,
 * migrates older versions and validates strictly. Never throws on bad input.
 * @param {unknown} text
 * @returns {ImportResult}
 */
export function parseBoard(text) {
  if (typeof text !== 'string') return { ok: false, error: 'json' };
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, error: 'too-large' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  return importBoard(data);
}

/**
 * Turns parsed JSON into a valid current-version board: migrates, then validates every field.
 * Unknown fields are dropped and fresh objects are built, so nothing foreign reaches the app.
 * Missing optional fields get defaults (description "", labels [], due null, checklist [],
 * wipLimit null, nextId above every counter id).
 * @param {unknown} data
 * @returns {ImportResult}
 */
export function importBoard(data) {
  try {
    return { ok: true, board: sanitize(migrate(data)) };
  } catch (error) {
    if (error instanceof BoardError) return { ok: false, error: error.code === 'version' ? 'version' : 'shape' };
    throw error;
  }
}

/**
 * Upgrades a board document of any supported version to SCHEMA_VERSION, one version at a time.
 * Converts structure only; importBoard validates the result. A current document is returned as is.
 * @param {unknown} data parsed JSON with an integer `version`
 * @returns {object} a document at SCHEMA_VERSION
 * @throws {BoardError} "version" for a newer version, "shape" when it cannot be converted
 */
export function migrate(data) {
  if (!isPlainObject(data) || !Number.isInteger(data.version) || data.version < 1) throw shape();
  if (data.version > SCHEMA_VERSION) throw new BoardError('version');
  let doc = data;
  while (doc.version < SCHEMA_VERSION) doc = MIGRATIONS[doc.version](doc);
  return doc;
}

/** v1 -> v2: re-issues ids from a fresh counter (col-1, card-2, ...) and fills the new fields. */
function fromV1(doc) {
  if (!Array.isArray(doc.columns)) throw shape();
  const ids = idCounter(1);
  const columns = doc.columns.map((column) => {
    if (!isPlainObject(column) || !Array.isArray(column.cards)) throw shape();
    return {
      id: ids.take('col'),
      title: column.title,
      wipLimit: null,
      cards: column.cards.map((card) => {
        if (!isPlainObject(card)) throw shape();
        const createdAt = card.createdAt ?? 0;
        return {
          id: ids.take('card'),
          title: card.title,
          description: card.description ?? '',
          labels: card.labels ?? [],
          due: card.due ?? null,
          checklist: [],
          createdAt,
          updatedAt: createdAt,
        };
      }),
    };
  });
  return { version: 2, nextId: ids.peek(), columns, archive: [] };
}

function sanitize(doc) {
  if (!Array.isArray(doc.columns) || !Array.isArray(doc.archive)) throw shape();
  if (doc.nextId !== undefined && !(Number.isInteger(doc.nextId) && doc.nextId >= 1 && doc.nextId <= MAX_COUNTER)) {
    throw shape();
  }
  const seen = new Set();
  const claim = (id) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || seen.has(id)) throw shape();
    seen.add(id);
    return id;
  };
  const columns = doc.columns.map((column) => cleanColumn(column, claim));
  const columnIds = new Set(columns.map((column) => column.id));
  const archive = doc.archive.map((entry) => cleanArchived(entry, claim, columnIds));
  const nextId = Math.max(doc.nextId ?? 1, highestCounter(seen) + 1);
  return { version: SCHEMA_VERSION, nextId, columns, archive };
}

function cleanColumn(column, claim) {
  if (!isPlainObject(column) || !Array.isArray(column.cards)) throw shape();
  return {
    id: claim(column.id),
    title: checkTitle(column.title),
    wipLimit: checkWip(column.wipLimit ?? null),
    cards: column.cards.map((card) => cleanCard(card, claim)),
  };
}

function cleanCard(card, claim) {
  if (!isPlainObject(card)) throw shape();
  return {
    id: claim(card.id),
    title: checkTitle(card.title),
    description: checkDescription(card.description ?? ''),
    labels: checkLabels(card.labels ?? []),
    due: checkDue(card.due ?? null),
    checklist: cleanChecklist(card.checklist ?? [], claim),
    createdAt: checkTime(card.createdAt),
    updatedAt: checkTime(card.updatedAt),
  };
}

function cleanArchived(entry, claim, columnIds) {
  const card = cleanCard(entry, claim);
  if (!columnIds.has(entry.columnId)) throw shape();
  return { ...card, columnId: entry.columnId, archivedAt: checkTime(entry.archivedAt) };
}

function cleanChecklist(items, claim) {
  if (!Array.isArray(items) || items.length > LIMITS.checklistItems) throw shape();
  return items.map((item) => {
    if (!isPlainObject(item) || typeof item.done !== 'boolean') throw shape();
    const text = checkItemText(item.text);
    if (text === '') throw shape();
    return { id: claim(item.id), text, done: item.done };
  });
}

function checkTime(value) {
  if (!Number.isFinite(value) || value < 0) throw shape();
  return value;
}

/** Highest number used by counter-style ids; absurdly high numbers are rejected to keep ids exact. */
function highestCounter(ids) {
  let highest = 0;
  for (const id of ids) {
    const match = COUNTER_ID.exec(id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  if (highest >= MAX_COUNTER) throw shape();
  return highest;
}

function shape() {
  return new BoardError('shape');
}
