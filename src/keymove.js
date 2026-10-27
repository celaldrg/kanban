/**
 * Moving cards with the keyboard. Space picks the focused card up, the arrow keys move it (the
 * board shows it at its new place right away), Space or Enter drops it and Escape puts it back.
 * Nothing is dispatched until the drop, so a cancelled move leaves no undo step.
 * While a filter hides cards, up and down skip the hidden ones so every key press visibly moves
 * the card. Moving focus away from the lifted card cancels the move.
 */

import { stepTarget } from './keyboard.js';
import { findCard, findColumn } from './model.js';
import { reduce } from './reducer.js';

const DIRECTIONS = Object.freeze({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' });

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {import('./model.js').Card} Card
 * @typedef {import('./keyboard.js').DropTarget} DropTarget
 */

/**
 * @param {{
 *   element: HTMLElement,
 *   getBoard: () => Board,
 *   getMatcher: () => ((card: Card) => boolean) | null,
 *   render: () => void,
 *   onDrop: (cardId: string, target: DropTarget) => boolean,
 *   announce: (key: string, params?: Record<string, string|number>) => void,
 * }} options element: the board container; getMatcher: the active filter, or null;
 *   render: redraws the board (it asks preview() for the board to draw); onDrop: commits the
 *   move and returns whether it worked; announce: tells screen readers a translated text by key
 * @returns {{
 *   isActive: () => boolean,
 *   liftedId: () => string|null,
 *   preview: (board: Board) => Board,
 *   handleKey: (event: KeyboardEvent, cardId: string) => boolean,
 * }} handleKey returns true when it used the key
 */
export function createKeyboardMove({ element, getBoard, getMatcher, render, onDrop, announce }) {
  let lifted = null; // { cardId, title, target: DropTarget }

  element.addEventListener('focusout', () => {
    // Re-rendering replaces the focused card and focuses its copy, so check once things settle.
    if (lifted) setTimeout(cancelIfFocusLeft, 0);
  });

  function handleKey(event, cardId) {
    if (event.repeat && (event.key === ' ' || event.key === 'Enter')) {
      // A held key must not pick the card up, drop it or open it again and again.
      event.preventDefault();
      return true;
    }
    if (!lifted) {
      if (event.key !== ' ') return false;
      pickUp(cardId);
    } else {
      const direction = DIRECTIONS[event.key];
      if (direction) step(direction);
      else if (event.key === ' ' || event.key === 'Enter') drop();
      else if (event.key === 'Escape') cancel();
      else return false;
    }
    event.preventDefault();
    return true;
  }

  function pickUp(cardId) {
    const found = findCard(getBoard(), cardId);
    if (!found || found.archived) return;
    lifted = { cardId, title: found.card.title, target: { columnId: found.column.id, index: found.index } };
    render();
    announce('pickedUp', { title: found.card.title });
  }

  function step(direction) {
    const target = nextTarget(direction);
    if (!target) {
      announce('cannotMove');
      return;
    }
    lifted.target = target;
    render();
    const { column, position, total } = place(target);
    announce('movedTo', { column, position, total });
  }

  /** The next target that visibly moves the card, or null when it cannot go that way. */
  function nextTarget(direction) {
    const board = getBoard();
    const start = place(lifted.target);
    let target = lifted.target;
    for (;;) {
      const next = stepTarget(board, lifted.cardId, target, direction);
      if (next === target) return null;
      target = next;
      const spot = place(target);
      if (spot.columnId !== start.columnId || spot.position !== start.position) return target;
    }
  }

  /** Where the card would show up: its column and its position among the visible cards. */
  function place(target) {
    const column = findColumn(previewAt(getBoard(), target), target.columnId);
    const matcher = getMatcher();
    const visible = column.cards.filter((card) => card.id === lifted.cardId || !matcher || matcher(card));
    const position = visible.findIndex((card) => card.id === lifted.cardId) + 1;
    return { columnId: column.id, column: column.title, position, total: visible.length };
  }

  function drop() {
    const { cardId, title, target } = lifted;
    const { column, position, total } = place(target);
    lifted = null;
    const moved = onDrop(cardId, target);
    render();
    if (moved) announce('dropped', { title, column, position, total });
  }

  function cancel() {
    const { title } = lifted;
    lifted = null;
    render();
    announce('moveCancelled', { title });
  }

  function cancelIfFocusLeft() {
    if (!lifted) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && element.contains(active) && active.dataset.cardId === lifted.cardId) return;
    cancel();
  }

  function previewAt(board, target) {
    const action = { type: 'card/move', cardId: lifted.cardId, toColumnId: target.columnId, toIndex: target.index };
    return reduce(board, action, Date.now()).board;
  }

  return {
    isActive: () => lifted !== null,
    liftedId: () => lifted?.cardId ?? null,
    preview: (board) => (lifted ? previewAt(board, lifted.target) : board),
    handleKey,
  };
}
