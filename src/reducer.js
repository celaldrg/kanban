/**
 * The board reducer: every change to a board is an action applied by `reduce`.
 * Pure: boards are never mutated, unchanged parts are shared, time comes in as an argument.
 *
 * Actions (ids come from the board, indices are 0-based):
 *   column/add      { title, wipLimit?, index? }        -> result.id is the new column id
 *   column/rename   { columnId, title }
 *   column/move     { columnId, toIndex }
 *   column/setWip   { columnId, wipLimit }              null or 0 removes the limit
 *   column/delete   { columnId }                        also deletes its cards and their archived cards
 *   card/add        { columnId, title, description?, labels?, due?, checklist?, index? } -> result.id
 *   card/update     { cardId, patch: { title?, description?, labels?, due?, checklist? } }
 *   card/move       { cardId, toColumnId, toIndex }     toIndex = the card's index after the move
 *   card/archive    { cardId }
 *   card/restore    { cardId, toColumnId?, toIndex? }   defaults: its old column, at the end
 *   card/delete     { cardId }                          active or archived
 *   checklist/toggle { cardId, itemId }
 *   board/replace   { board }                           a board already checked by importBoard/parseBoard
 *   batch           { actions }                         applies the actions in order as one change;
 *                                                       the first error cancels all of them
 * Checklist input items are { id?, text, done? }: known ids are kept, others get new ids,
 * items with empty text are dropped. Edits, checklist toggles and moves to another column set
 * the card's updatedAt to `now`; reordering inside a column does not.
 *
 * Error codes: "invalid", "not-found", "wip-limit", "unknown-action".
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
  findCard,
  idCounter,
  isColumnFull,
  isPlainObject,
} from './model.js';

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {{ type: string, [key: string]: unknown }} Action
 * @typedef {{ board: Board, error: string|null, id: string|null }} ReduceResult
 */

const HANDLERS = new Map([
  ['column/add', addColumn],
  ['column/rename', renameColumn],
  ['column/move', moveColumn],
  ['column/setWip', setColumnWip],
  ['column/delete', deleteColumn],
  ['card/add', addCard],
  ['card/update', updateCard],
  ['card/move', moveCard],
  ['card/archive', archiveCard],
  ['card/restore', restoreCard],
  ['card/delete', deleteCard],
  ['checklist/toggle', toggleChecklistItem],
  ['board/replace', replaceBoard],
  ['batch', applyBatch],
]);

/**
 * Applies one action to a board.
 * When nothing changes (e.g. a card moved to its own place) the same board object comes back,
 * so callers can skip saving and history.
 * @param {Board} board
 * @param {Action} action
 * @param {number} now timestamp in ms for createdAt, updatedAt and archivedAt
 * @returns {ReduceResult} on error `board` is the input board and `error` a code;
 *   `id` is the new column or card id for add actions, otherwise null
 */
export function reduce(board, action, now) {
  const handler = typeof action?.type === 'string' ? HANDLERS.get(action.type) : undefined;
  if (!handler) return { board, error: 'unknown-action', id: null };
  try {
    const { board: next, id = null } = handler(board, action, now);
    return { board: next, error: null, id };
  } catch (error) {
    if (error instanceof BoardError) return { board, error: error.code, id: null };
    throw error;
  }
}

// Columns

function addColumn(board, { title, wipLimit = null, index }) {
  const ids = idCounter(board.nextId);
  const column = { id: ids.take('col'), title: checkTitle(title), wipLimit: checkWip(wipLimit), cards: [] };
  const columns = insertAt(board.columns, insertionIndex(index, board.columns.length), column);
  return { board: { ...board, nextId: ids.peek(), columns }, id: column.id };
}

function renameColumn(board, { columnId, title }) {
  const index = columnIndex(board, columnId);
  const column = board.columns[index];
  const clean = checkTitle(title);
  if (clean === column.title) return { board };
  return { board: withColumn(board, index, { ...column, title: clean }) };
}

function moveColumn(board, { columnId, toIndex }) {
  const from = columnIndex(board, columnId);
  const to = exactIndex(toIndex, board.columns.length - 1);
  if (to === from) return { board };
  return { board: { ...board, columns: insertAt(removeAt(board.columns, from), to, board.columns[from]) } };
}

function setColumnWip(board, { columnId, wipLimit }) {
  const index = columnIndex(board, columnId);
  const column = board.columns[index];
  const limit = checkWip(wipLimit);
  if (limit === column.wipLimit) return { board };
  return { board: withColumn(board, index, { ...column, wipLimit: limit }) };
}

function deleteColumn(board, { columnId }) {
  const index = columnIndex(board, columnId);
  return {
    board: {
      ...board,
      columns: removeAt(board.columns, index),
      archive: board.archive.filter((card) => card.columnId !== columnId),
    },
  };
}

// Cards

function addCard(board, action, now) {
  const index = columnIndex(board, action.columnId);
  const column = board.columns[index];
  if (isColumnFull(column)) throw new BoardError('wip-limit');
  const ids = idCounter(board.nextId);
  const card = {
    id: ids.take('card'),
    title: checkTitle(action.title),
    description: checkDescription(action.description ?? ''),
    labels: checkLabels(action.labels ?? []),
    due: checkDue(action.due ?? null),
    checklist: buildChecklist(action.checklist ?? [], [], ids),
    createdAt: now,
    updatedAt: now,
  };
  const cards = insertAt(column.cards, insertionIndex(action.index, column.cards.length), card);
  return { board: { ...withColumn(board, index, { ...column, cards }), nextId: ids.peek() }, id: card.id };
}

function updateCard(board, { cardId, patch }, now) {
  if (!isPlainObject(patch)) throw new BoardError('invalid');
  const found = locate(board, cardId);
  const ids = idCounter(board.nextId);
  const next = { ...found.card };
  if (patch.title !== undefined) next.title = checkTitle(patch.title);
  if (patch.description !== undefined) next.description = checkDescription(patch.description);
  if (patch.labels !== undefined) next.labels = checkLabels(patch.labels);
  if (patch.due !== undefined) next.due = checkDue(patch.due);
  if (patch.checklist !== undefined) next.checklist = buildChecklist(patch.checklist, found.card.checklist, ids);
  if (contentKey(next) === contentKey(found.card)) return { board };
  return { board: { ...putCard(board, found, { ...next, updatedAt: now }), nextId: ids.peek() } };
}

function moveCard(board, { cardId, toColumnId, toIndex }, now) {
  const from = locateActive(board, cardId);
  const targetIndex = columnIndex(board, toColumnId);
  const target = board.columns[targetIndex];
  if (targetIndex === from.columnIndex) {
    const to = exactIndex(toIndex, target.cards.length - 1);
    if (to === from.index) return { board };
    const cards = insertAt(removeAt(target.cards, from.index), to, from.card);
    return { board: withColumn(board, targetIndex, { ...target, cards }) };
  }
  if (isColumnFull(target)) throw new BoardError('wip-limit');
  const to = exactIndex(toIndex, target.cards.length);
  const columns = board.columns.slice();
  columns[from.columnIndex] = { ...from.column, cards: removeAt(from.column.cards, from.index) };
  columns[targetIndex] = { ...target, cards: insertAt(target.cards, to, { ...from.card, updatedAt: now }) };
  return { board: { ...board, columns } };
}

function archiveCard(board, { cardId }, now) {
  const from = locateActive(board, cardId);
  const column = { ...from.column, cards: removeAt(from.column.cards, from.index) };
  const entry = { ...from.card, columnId: from.column.id, archivedAt: now };
  return { board: { ...withColumn(board, from.columnIndex, column), archive: [entry, ...board.archive] } };
}

function restoreCard(board, { cardId, toColumnId, toIndex }) {
  const found = locate(board, cardId);
  if (!found.archived) throw new BoardError('not-found');
  const targetIndex = columnIndex(board, toColumnId ?? found.card.columnId);
  const target = board.columns[targetIndex];
  if (isColumnFull(target)) throw new BoardError('wip-limit');
  const card = { ...found.card };
  delete card.columnId;
  delete card.archivedAt;
  const cards = insertAt(target.cards, insertionIndex(toIndex, target.cards.length), card);
  return {
    board: { ...withColumn(board, targetIndex, { ...target, cards }), archive: removeAt(board.archive, found.index) },
  };
}

function deleteCard(board, { cardId }) {
  const found = locate(board, cardId);
  if (found.archived) return { board: { ...board, archive: removeAt(board.archive, found.index) } };
  const column = { ...found.column, cards: removeAt(found.column.cards, found.index) };
  return { board: withColumn(board, found.columnIndex, column) };
}

function toggleChecklistItem(board, { cardId, itemId }, now) {
  const found = locate(board, cardId);
  const index = found.card.checklist.findIndex((item) => item.id === itemId);
  if (index === -1) throw new BoardError('not-found');
  const item = found.card.checklist[index];
  const checklist = replaceAt(found.card.checklist, index, { ...item, done: !item.done });
  return { board: putCard(board, found, { ...found.card, checklist, updatedAt: now }) };
}

// Whole board

function replaceBoard(board, { board: next }) {
  const looksValid =
    isPlainObject(next) &&
    next.version === SCHEMA_VERSION &&
    Number.isSafeInteger(next.nextId) &&
    Array.isArray(next.columns) &&
    Array.isArray(next.archive);
  if (!looksValid) throw new BoardError('invalid');
  return { board: next };
}

function applyBatch(board, { actions }, now) {
  if (!Array.isArray(actions)) throw new BoardError('invalid');
  let next = board;
  let id = null;
  for (const action of actions) {
    const result = reduce(next, action, now);
    if (result.error) throw new BoardError(result.error);
    next = result.board;
    id = result.id ?? id;
  }
  return { board: next, id };
}

// Helpers

function columnIndex(board, columnId) {
  const index = board.columns.findIndex((column) => column.id === columnId);
  if (index === -1) throw new BoardError('not-found');
  return index;
}

function locate(board, cardId) {
  const found = findCard(board, cardId);
  if (!found) throw new BoardError('not-found');
  return found;
}

function locateActive(board, cardId) {
  const found = locate(board, cardId);
  if (found.archived) throw new BoardError('not-found');
  return found;
}

/** Writes a changed card back where it was found (a column or the archive). */
function putCard(board, found, card) {
  if (found.archived) return { ...board, archive: replaceAt(board.archive, found.index, card) };
  const column = { ...found.column, cards: replaceAt(found.column.cards, found.index, card) };
  return withColumn(board, found.columnIndex, column);
}

function withColumn(board, index, column) {
  return { ...board, columns: replaceAt(board.columns, index, column) };
}

function buildChecklist(input, current, ids) {
  if (!Array.isArray(input)) throw new BoardError('invalid');
  const known = new Set(current.map((item) => item.id));
  const items = [];
  for (const raw of input) {
    if (!isPlainObject(raw) || (raw.done !== undefined && typeof raw.done !== 'boolean')) {
      throw new BoardError('invalid');
    }
    const text = checkItemText(raw.text);
    if (text === '') continue;
    const id = known.delete(raw.id) ? raw.id : ids.take('item');
    items.push({ id, text, done: raw.done === true });
  }
  if (items.length > LIMITS.checklistItems) throw new BoardError('invalid');
  return items;
}

/** Everything a user can edit on a card, as a comparable string. */
function contentKey(card) {
  return JSON.stringify([card.title, card.description, card.labels, card.due, card.checklist]);
}

/** Index for an insert: undefined means "at the end", anything else must be an integer (clamped). */
function insertionIndex(value, length) {
  return value === undefined ? length : exactIndex(value, length);
}

function exactIndex(value, max) {
  if (!Number.isInteger(value)) throw new BoardError('invalid');
  return Math.min(Math.max(value, 0), max);
}

function insertAt(list, index, item) {
  return [...list.slice(0, index), item, ...list.slice(index)];
}

function removeAt(list, index) {
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

function replaceAt(list, index, item) {
  const copy = list.slice();
  copy[index] = item;
  return copy;
}
