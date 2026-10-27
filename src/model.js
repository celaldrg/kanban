/**
 * Board model: data shapes, constants, field rules and read-only selectors.
 * Pure module: no DOM, storage or clock access.
 */

import { isDateKey } from './dates.js';

/**
 * @typedef {{ id: string, text: string, done: boolean }} ChecklistItem
 * @typedef {{
 *   id: string, title: string, description: string, labels: string[], due: string|null,
 *   checklist: ChecklistItem[], createdAt: number, updatedAt: number
 * }} Card
 * @typedef {Card & { columnId: string, archivedAt: number }} ArchivedCard
 * @typedef {{ id: string, title: string, wipLimit: number|null, cards: Card[] }} Column
 * @typedef {{ version: number, nextId: number, columns: Column[], archive: ArchivedCard[] }} Board
 *   `archive` lists archived cards newest first; `nextId` feeds the id counter ("col-1", "card-2", ...).
 * @typedef {{ card: Card, archived: boolean, index: number, column: Column|null, columnIndex: number }} CardLocation
 */

/** Version of the board schema this app writes. */
export const SCHEMA_VERSION = 2;

/** Label ids: one per color of the small label palette (the UI maps them to colors and names). */
export const LABELS = Object.freeze(['red', 'orange', 'yellow', 'green', 'blue', 'purple']);

/** Size limits shared by the reducer, the import validator and the UI's input fields. */
export const LIMITS = Object.freeze({
  title: 200,
  description: 5000,
  checklistItems: 50,
  itemText: 200,
  wip: 99,
});

/** Error thrown by field rules; `code` is a stable reason the UI can translate. */
export class BoardError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.name = 'BoardError';
    this.code = code;
  }
}

const invalid = () => new BoardError('invalid');

/**
 * Creates an empty board.
 * @returns {Board}
 */
export function createBoard() {
  return { version: SCHEMA_VERSION, nextId: 1, columns: [], archive: [] };
}

/**
 * Returns an id generator backed by a counter: take('card') -> "card-7", then "card-8", ...
 * @param {number} start first number handed out
 * @returns {{ take: (prefix: string) => string, peek: () => number }} peek() is the next unused number
 */
export function idCounter(start) {
  let next = start;
  return {
    take: (prefix) => `${prefix}-${next++}`,
    peek: () => next,
  };
}

/**
 * True for non-null objects that are not arrays: the shape of a JSON object.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a card or column title: one line, trimmed, 1 to LIMITS.title characters.
 * @param {unknown} value
 * @returns {string} the cleaned title
 * @throws {BoardError} code "invalid"
 */
export function checkTitle(value) {
  if (typeof value !== 'string') throw invalid();
  const title = value.replace(/\s+/g, ' ').trim();
  if (title === '' || title.length > LIMITS.title) throw invalid();
  return title;
}

/**
 * Validates a description: multi-line text, trimmed, up to LIMITS.description characters.
 * @param {unknown} value
 * @returns {string}
 * @throws {BoardError} code "invalid"
 */
export function checkDescription(value) {
  if (typeof value !== 'string') throw invalid();
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (text.length > LIMITS.description) throw invalid();
  return text;
}

/**
 * Validates label ids and returns them without duplicates, in palette order.
 * @param {unknown} value
 * @returns {string[]}
 * @throws {BoardError} code "invalid"
 */
export function checkLabels(value) {
  if (!Array.isArray(value) || !value.every((id) => LABELS.includes(id))) throw invalid();
  return LABELS.filter((id) => value.includes(id));
}

/**
 * Validates a due date: null or "" for none, otherwise a calendar date "YYYY-MM-DD".
 * @param {unknown} value
 * @returns {string|null}
 * @throws {BoardError} code "invalid"
 */
export function checkDue(value) {
  if (value === null || value === '') return null;
  if (!isDateKey(value)) throw invalid();
  return value;
}

/**
 * Validates a WIP limit: null or 0 for none, otherwise an integer from 1 to LIMITS.wip.
 * @param {unknown} value
 * @returns {number|null}
 * @throws {BoardError} code "invalid"
 */
export function checkWip(value) {
  if (value === null || value === 0) return null;
  if (!Number.isInteger(value) || value < 1 || value > LIMITS.wip) throw invalid();
  return value;
}

/**
 * Validates checklist item text: one line, trimmed, up to LIMITS.itemText characters ("" allowed).
 * @param {unknown} value
 * @returns {string}
 * @throws {BoardError} code "invalid"
 */
export function checkItemText(value) {
  if (typeof value !== 'string') throw invalid();
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > LIMITS.itemText) throw invalid();
  return text;
}

/**
 * Finds a column by id.
 * @param {Board} board
 * @param {string} columnId
 * @returns {Column|undefined}
 */
export function findColumn(board, columnId) {
  return board.columns.find((column) => column.id === columnId);
}

/**
 * Locates a card on the board or in the archive.
 * @param {Board} board
 * @param {string} cardId
 * @returns {CardLocation|null} for archived cards `column` is null and `columnIndex` is -1
 */
export function findCard(board, cardId) {
  for (let columnIndex = 0; columnIndex < board.columns.length; columnIndex++) {
    const column = board.columns[columnIndex];
    const index = column.cards.findIndex((card) => card.id === cardId);
    if (index !== -1) return { card: column.cards[index], archived: false, index, column, columnIndex };
  }
  const index = board.archive.findIndex((card) => card.id === cardId);
  if (index === -1) return null;
  return { card: board.archive[index], archived: true, index, column: null, columnIndex: -1 };
}

/**
 * True when the column has a WIP limit and already holds that many cards (or more).
 * @param {Column} column
 * @returns {boolean}
 */
export function isColumnFull(column) {
  return column.wipLimit !== null && column.cards.length >= column.wipLimit;
}

/**
 * True when a card may be dropped (or restored) into a column: it is already there,
 * or the column is below its WIP limit.
 * @param {Board} board
 * @param {string} cardId
 * @param {string} columnId
 * @returns {boolean}
 */
export function canMoveTo(board, cardId, columnId) {
  const column = findColumn(board, columnId);
  if (!column) return false;
  return column.cards.some((card) => card.id === cardId) || !isColumnFull(column);
}

/**
 * Counts finished and total checklist items of a card.
 * @param {Card} card
 * @returns {{ done: number, total: number }}
 */
export function checklistProgress(card) {
  return { done: card.checklist.filter((item) => item.done).length, total: card.checklist.length };
}
