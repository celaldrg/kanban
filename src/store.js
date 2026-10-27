/**
 * Board store: the pure reducer plus undo/redo history and change notifications.
 * This is what the UI drives. State lives in a closure; no DOM or storage access.
 */

import * as History from './history.js';
import { createBoard } from './model.js';
import { reduce } from './reducer.js';

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {import('./reducer.js').Action} Action
 * @typedef {{ ok: boolean, error: string|null, id: string|null }} DispatchResult
 * @typedef {{
 *   getState: () => Board,
 *   dispatch: (action: Action) => DispatchResult,
 *   undo: () => boolean,
 *   redo: () => boolean,
 *   canUndo: () => boolean,
 *   canRedo: () => boolean,
 *   subscribe: (listener: (board: Board) => void) => () => void,
 * }} Kanban
 */

/**
 * Creates a store around a board.
 * - dispatch(action): applies a reducer action; a change becomes one undo step and notifies
 *   subscribers; errors ("wip-limit", ...) and no-op actions leave state and history alone.
 * - undo()/redo(): return false when there is nothing to undo/redo.
 * - subscribe(listener): listener(board) runs after every change; returns an unsubscribe function.
 * @param {{ board?: Board, now?: () => number, historyLimit?: number }} [options]
 *   board: initial board (default: empty); now: clock in ms for card timestamps (default Date.now);
 *   historyLimit: undo steps kept (default 100)
 * @returns {Kanban}
 */
export function createKanban({ board = createBoard(), now = Date.now, historyLimit = History.DEFAULT_HISTORY_LIMIT } = {}) {
  let history = History.createHistory(board, historyLimit);
  const listeners = new Set();

  const commit = (next) => {
    history = next;
    for (const listener of listeners) listener(history.present);
  };

  return {
    getState: () => history.present,
    dispatch(action) {
      const result = reduce(history.present, action, now());
      if (result.error) return { ok: false, error: result.error, id: null };
      if (result.board !== history.present) commit(History.record(history, result.board));
      return { ok: true, error: null, id: result.id };
    },
    undo() {
      if (!History.canUndo(history)) return false;
      commit(History.undo(history));
      return true;
    },
    redo() {
      if (!History.canRedo(history)) return false;
      commit(History.redo(history));
      return true;
    },
    canUndo: () => History.canUndo(history),
    canRedo: () => History.canRedo(history),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
