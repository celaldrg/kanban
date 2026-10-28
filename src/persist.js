/**
 * Saving and loading the board through the storage helper, using the versioned schema.
 * Saved data that cannot be read is never lost silently: loading copies it to a backup key first.
 */

import { parseBoard, stringifyBoard } from './schema.js';
import { readItem, storageKey, writeItem } from './storage.js';

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {import('./storage.js').StorageLike} StorageLike
 * @typedef {'empty'|'loaded'|'backed-up'|'not-backed-up'} LoadStatus
 *   empty: nothing is saved yet (a first visit); loaded: the saved board was read;
 *   backed-up: the saved data cannot be read (damaged, or written by a newer version of the app)
 *   and a copy of it is now kept under a backup key; not-backed-up: the same, but the copy could
 *   not be written, so saving another board would destroy the only copy
 */

const BOARD_KEY = 'board';

// Copies of saved data that could not be read go to "kanban:board-unreadable", then
// "kanban:board-unreadable-2", "-3" and so on, so a later copy never replaces an earlier one.
const UNREADABLE_KEY = 'board-unreadable';
const MAX_UNREADABLE_COPIES = 9;

/**
 * Loads the saved board, migrating data written by older versions. Saved data that cannot be read
 * is first copied to a backup key, so saving the board shown instead does not destroy it.
 * @param {StorageLike} [backend] storage to use; defaults to localStorage
 * @returns {{ status: LoadStatus, board: Board|null, backupKey?: string }} board is null unless the
 *   status is "loaded"; backupKey (without the "kanban:" prefix) names the copy when it is "backed-up"
 */
export function loadBoard(backend) {
  const text = readItem(BOARD_KEY, backend);
  if (text === null) return { status: 'empty', board: null };
  const result = parseBoard(text);
  if (result.ok) return { status: 'loaded', board: result.board };
  const backupKey = backUp(text, backend);
  return backupKey ? { status: 'backed-up', board: null, backupKey } : { status: 'not-backed-up', board: null };
}

/**
 * Keeps unreadable data under the first free backup key. The same data comes back on every visit
 * until another board is saved, so a key that already holds it is used again.
 * @param {string} text
 * @param {StorageLike} [backend]
 * @returns {string|null} the key used, or null when no copy could be kept (all keys taken, or storage full)
 */
function backUp(text, backend) {
  for (let n = 1; n <= MAX_UNREADABLE_COPIES; n += 1) {
    const key = n === 1 ? UNREADABLE_KEY : `${UNREADABLE_KEY}-${n}`;
    const kept = readItem(key, backend);
    if (kept === text) return key;
    if (kept === null) return writeItem(key, text, backend) ? key : null;
  }
  return null;
}

/**
 * Saves the board.
 * @param {Board} board
 * @param {StorageLike} [backend] storage to use; defaults to localStorage
 * @returns {boolean} false when storage is unavailable or full
 */
export function saveBoard(board, backend) {
  return writeItem(BOARD_KEY, stringifyBoard(board), backend);
}

/**
 * The board another tab just saved, read from a "storage" event. Events for other keys, a cleared
 * key and data that cannot be read give null, so the board shown is kept.
 * @param {{ key: string|null, newValue: string|null }} event
 * @returns {Board|null}
 */
export function boardFromStorageEvent(event) {
  if (event.key !== storageKey(BOARD_KEY) || event.newValue === null) return null;
  const result = parseBoard(event.newValue);
  return result.ok ? result.board : null;
}
