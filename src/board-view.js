/**
 * The board on screen. Renders columns and cards (render.js), keeps scroll positions and focus
 * across re-renders, and turns clicks, keys, pointer drags and keyboard moves into app actions.
 * Keys on a focused card: Enter opens it, the arrow keys move focus to the neighbouring card
 * and Space starts a keyboard move (keymove.js).
 */

import { createPointerDrag } from './drag.js';
import { createKeyboardMove } from './keymove.js';
import { canMoveTo, findColumn } from './model.js';
import { dropIndex } from './placement.js';
import { buildBoard } from './render.js';

/**
 * @typedef {import('./model.js').Card} Card
 * @typedef {import('./main.js').AppContext} AppContext
 */

/**
 * Connects the board container to the app.
 * @param {{
 *   element: HTMLElement,
 *   ctx: AppContext,
 *   getMatcher: () => ((card: Card) => boolean) | null,
 *   onOpenCard: (cardId: string) => void,
 *   onAddCard: (columnId: string) => void,
 *   onEditColumn: (columnId: string) => void,
 *   onAddColumn: () => void,
 * }} options element: the scrolling board container; getMatcher: the active filter, or null
 * @returns {{ render: () => void, focusKey: (key: string) => boolean, isBusy: () => boolean }}
 *   focusKey focuses the element with that data-focus-key and says whether it exists;
 *   isBusy is true while a card is being dragged or moved with the keyboard
 */
export function createBoardView({ element, ctx, getMatcher, onOpenCard, onAddCard, onEditColumn, onAddColumn }) {
  const keyMove = createKeyboardMove({
    element,
    getBoard: ctx.getBoard,
    getMatcher,
    render,
    onDrop: (cardId, target) => moveCard(cardId, target.columnId, target.index),
    announce: (key, params) => ctx.announce(ctx.t(key, params)),
  });
  const pointerDrag = createPointerDrag({
    board: element,
    canStart: () => !keyMove.isActive(),
    canDrop: (cardId, columnId) => canMoveTo(ctx.getBoard(), cardId, columnId),
    onDrop: ({ cardId, columnId, beforeId }) => {
      const column = findColumn(ctx.getBoard(), columnId);
      if (column) moveCard(cardId, columnId, dropIndex(column.cards, cardId, beforeId));
    },
    onBlocked: ctx.warnWip,
  });
  const actions = {
    'add-card': (button, columnId) => {
      if (button.getAttribute('aria-disabled') === 'true') ctx.warnWip(columnId);
      else onAddCard(columnId);
    },
    'column-menu': (button, columnId) => onEditColumn(columnId),
    'add-column': () => onAddColumn(),
  };

  element.addEventListener('click', onClick);
  element.addEventListener('keydown', onKeyDown);

  function render() {
    const focused = focusedKey();
    const scroll = saveScroll();
    const view = {
      t: ctx.t,
      lang: ctx.lang(),
      today: ctx.today(),
      matches: visibleMatcher(),
      liftedId: keyMove.liftedId(),
    };
    element.replaceChildren(...buildBoard(keyMove.preview(ctx.getBoard()), view));
    restoreScroll(scroll);
    if (focused) restoreFocus(focused);
  }

  function moveCard(cardId, columnId, index) {
    const result = ctx.dispatch({ type: 'card/move', cardId, toColumnId: columnId, toIndex: index });
    if (!result.ok) ctx.reportError(result.error);
    return result.ok;
  }

  /** The filter, widened so a card being moved with the keyboard never disappears. */
  function visibleMatcher() {
    const matcher = getMatcher();
    const liftedId = keyMove.liftedId();
    if (!matcher || !liftedId) return matcher;
    return (card) => card.id === liftedId || matcher(card);
  }

  function onClick(event) {
    if (keyMove.isActive()) return;
    const button = event.target.closest('[data-action]');
    if (button) {
      actions[button.dataset.action]?.(button, button.closest('.column')?.dataset.columnId);
      return;
    }
    const card = event.target.closest('.card');
    if (card) onOpenCard(card.dataset.cardId);
  }

  function onKeyDown(event) {
    const card = event.target;
    if (!(card instanceof HTMLElement) || !card.classList.contains('card')) return;
    if (event.altKey || event.ctrlKey || event.metaKey || pointerDrag.isActive()) return;
    if (keyMove.handleKey(event, card.dataset.cardId)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      onOpenCard(card.dataset.cardId);
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      focusNeighbour(card, event.key);
    }
  }

  /** Arrow keys without a lifted card: up/down within the column, left/right to the next column with cards. */
  function focusNeighbour(card, key) {
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const sibling = key === 'ArrowUp' ? card.previousElementSibling : card.nextElementSibling;
      if (sibling instanceof HTMLElement) sibling.focus();
      return;
    }
    const columns = [...element.querySelectorAll('.column')];
    const step = key === 'ArrowLeft' ? -1 : 1;
    const row = [...card.parentElement.children].indexOf(card);
    for (let i = columns.indexOf(card.closest('.column')) + step; i >= 0 && i < columns.length; i += step) {
      const cards = columns[i].querySelectorAll('.card');
      if (cards.length > 0) {
        cards[Math.min(row, cards.length - 1)].focus();
        return;
      }
    }
  }

  function focusedKey() {
    const active = document.activeElement;
    return active instanceof HTMLElement && element.contains(active) ? (active.dataset.focusKey ?? null) : null;
  }

  function find(key) {
    return element.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  }

  function restoreFocus(key) {
    const target = find(key);
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    if (target.classList.contains('card--lifted')) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function focusKey(key) {
    const target = find(key);
    if (!(target instanceof HTMLElement)) return false;
    target.focus();
    return true;
  }

  function saveScroll() {
    const lists = new Map();
    for (const column of element.querySelectorAll('.column')) {
      lists.set(column.dataset.columnId, column.querySelector('.cards').scrollTop);
    }
    return { left: element.scrollLeft, lists };
  }

  function restoreScroll({ left, lists }) {
    element.scrollLeft = left;
    for (const column of element.querySelectorAll('.column')) {
      const top = lists.get(column.dataset.columnId);
      if (top) column.querySelector('.cards').scrollTop = top;
    }
  }

  return { render, focusKey, isBusy: () => keyMove.isActive() || pointerDrag.isActive() };
}
