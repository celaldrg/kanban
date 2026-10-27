/**
 * Undo/redo history of immutable snapshots. Pure functions: every call returns a new history.
 */

/** Undo steps kept when no limit is given. */
export const DEFAULT_HISTORY_LIMIT = 100;

/**
 * @template T
 * @typedef {{ past: T[], present: T, future: T[], limit: number }} History
 *   `past` is oldest first; `future` starts with the state the next redo brings back.
 */

/**
 * Starts a history at a state.
 * @template T
 * @param {T} present
 * @param {number} [limit] maximum number of undo steps kept, at least 1
 * @returns {History<T>}
 */
export function createHistory(present, limit = DEFAULT_HISTORY_LIMIT) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('History limit must be a positive integer');
  return { past: [], present, future: [], limit };
}

/**
 * Makes `next` the present state. Clears the redo steps and forgets the oldest undo step
 * beyond the limit. Recording the current present again changes nothing.
 * @template T
 * @param {History<T>} history
 * @param {T} next
 * @returns {History<T>}
 */
export function record(history, next) {
  if (next === history.present) return history;
  const past = [...history.past, history.present].slice(-history.limit);
  return { past, present: next, future: [], limit: history.limit };
}

/**
 * Goes back one state; returns the same history when there is nothing to undo.
 * @template T
 * @param {History<T>} history
 * @returns {History<T>}
 */
export function undo(history) {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
    limit: history.limit,
  };
}

/**
 * Goes forward one state; returns the same history when there is nothing to redo.
 * @template T
 * @param {History<T>} history
 * @returns {History<T>}
 */
export function redo(history) {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    limit: history.limit,
  };
}

/**
 * @param {History<unknown>} history
 * @returns {boolean} whether undo would change the present
 */
export function canUndo(history) {
  return history.past.length > 0;
}

/**
 * @param {History<unknown>} history
 * @returns {boolean} whether redo would change the present
 */
export function canRedo(history) {
  return history.future.length > 0;
}
