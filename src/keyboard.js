/**
 * Keyboard moving: after a card is picked up with Space, each arrow key moves its drop target.
 * The UI shows a placeholder at the target and dispatches a single "card/move" on drop.
 * Pure module.
 */

import { canMoveTo, findCard } from './model.js';

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {{ columnId: string, index: number }} DropTarget
 *   `index` follows "card/move": the card's index in that column after the drop.
 */

/**
 * Returns where a picked-up card's drop target goes after one arrow key.
 * Up/down move one slot inside the column (stopping at the ends). Left/right jump to the
 * nearest column in that direction that can take the card (full WIP columns are skipped)
 * and keep the index, clamped to that column.
 * @param {Board} board the board as it is, with the card still in its original place
 * @param {string} cardId the picked-up card
 * @param {DropTarget} target the current drop target (start with the card's own position)
 * @param {'up'|'down'|'left'|'right'} direction
 * @returns {DropTarget} the new target, or `target` itself when the card cannot go that way
 */
export function stepTarget(board, cardId, target, direction) {
  const found = findCard(board, cardId);
  const columnIndex = board.columns.findIndex((column) => column.id === target.columnId);
  if (!found || found.archived || columnIndex === -1) return target;

  if (direction === 'up' || direction === 'down') {
    const last = lastIndex(board.columns[columnIndex], cardId);
    const index = Math.min(Math.max(target.index + (direction === 'up' ? -1 : 1), 0), last);
    return index === target.index ? target : { columnId: target.columnId, index };
  }

  const step = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  if (step === 0) return target;
  for (let i = columnIndex + step; i >= 0 && i < board.columns.length; i += step) {
    const column = board.columns[i];
    if (canMoveTo(board, cardId, column.id)) {
      return { columnId: column.id, index: Math.min(target.index, lastIndex(column, cardId)) };
    }
  }
  return target;
}

/** Highest drop index in a column: one more slot when the card would come from elsewhere. */
function lastIndex(column, cardId) {
  const isHome = column.cards.some((card) => card.id === cardId);
  return isHome ? column.cards.length - 1 : column.cards.length;
}
