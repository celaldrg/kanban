/**
 * Pointer drag and drop of cards for mouse, pen and touch (pointer events).
 * A mouse drag starts after a few pixels of movement. Touch and pen drags start with a long
 * press, so a quick swipe still scrolls the board. While dragging, a floating copy follows the
 * pointer, a placeholder marks the drop position, and the board and the column under the
 * pointer scroll when the pointer nears their edges. Escape cancels a drag.
 */

import { edgeScrollSpeed } from './placement.js';

const MOUSE_SLOP = 5; // px a mouse may move before the press becomes a drag
const TOUCH_SLOP = 10; // px a finger may wander during a long press
const LONG_PRESS_MS = 350;
const CLICK_GUARD_MS = 400; // clicks and context menus right after a drag are ignored

/**
 * @typedef {{ cardId: string, columnId: string, beforeId: string|null }} Drop
 *   beforeId: the card the drop lands in front of, or null for the end of the column
 */

/**
 * Enables dragging the `.card` elements inside a board container.
 * @param {{
 *   board: HTMLElement,
 *   canStart: () => boolean,
 *   canDrop: (cardId: string, columnId: string) => boolean,
 *   onDrop: (drop: Drop) => void,
 *   onBlocked: (columnId: string) => void,
 * }} options canDrop: false marks a column as blocked (its WIP limit is reached);
 *   onBlocked: called when a card is released over such a column (the card stays where it was)
 * @returns {{ isActive: () => boolean }}
 */
export function createPointerDrag({ board, canStart, canDrop, onDrop, onBlocked }) {
  let press = null; // a press that may become a drag
  let drag = null; // the drag in progress
  let lastDragEnd = -Infinity;

  board.addEventListener('pointerdown', onPointerDown);
  board.addEventListener('click', swallowAfterDrag, true);
  board.addEventListener('contextmenu', onContextMenu);
  // Once a touch drag runs, its finger moves must not scroll the page or the board.
  board.addEventListener('touchmove', onTouchMove, { passive: false });

  function onPointerDown(event) {
    if (press || drag || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const card = event.target.closest('.card');
    if (!card || !canStart()) return;
    press = { pointerId: event.pointerId, card, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
    if (event.pointerType !== 'mouse') press.timer = setTimeout(() => begin(), LONG_PRESS_MS);
    listen(true);
  }

  function onPointerMove(event) {
    if (press && event.pointerId === press.pointerId) {
      press.x = event.clientX;
      press.y = event.clientY;
      const distance = Math.hypot(press.x - press.startX, press.y - press.startY);
      if (press.timer === undefined && distance > MOUSE_SLOP) begin();
      else if (press.timer !== undefined && distance > TOUCH_SLOP) release(); // a swipe: let it scroll
    } else if (drag && event.pointerId === drag.pointerId) {
      drag.x = event.clientX;
      drag.y = event.clientY;
      moveGhost();
      updateTarget();
    }
  }

  function onPointerUp(event) {
    if (press && event.pointerId === press.pointerId) release(); // a click or tap: the card opens
    else if (drag && event.pointerId === drag.pointerId) finish(true);
  }

  function onPointerCancel(event) {
    if (press && event.pointerId === press.pointerId) release();
    else if (drag && event.pointerId === drag.pointerId) finish(false);
  }

  function onKeyDown(event) {
    if (drag && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  }

  function onTouchMove(event) {
    if (drag && event.cancelable) event.preventDefault();
  }

  function onContextMenu(event) {
    if (press || drag || performance.now() - lastDragEnd < CLICK_GUARD_MS) event.preventDefault();
  }

  function swallowAfterDrag(event) {
    if (performance.now() - lastDragEnd < CLICK_GUARD_MS) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function listen(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('pointermove', onPointerMove);
    window[method]('pointerup', onPointerUp);
    window[method]('pointercancel', onPointerCancel);
    window[method]('keydown', onKeyDown, true);
  }

  function release() {
    clearTimeout(press.timer);
    press = null;
    listen(false);
  }

  function begin() {
    const { card, pointerId, x, y } = press;
    clearTimeout(press.timer);
    press = null;
    if (!card.isConnected) {
      listen(false);
      return;
    }
    const rect = card.getBoundingClientRect();
    const ghost = makeGhost(card, rect.width);
    const placeholder = document.createElement('li');
    placeholder.className = 'card-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.height = `${rect.height}px`;
    card.before(placeholder);
    card.classList.add('card--dragging');
    document.body.append(ghost);
    document.body.classList.add('is-dragging');
    board.classList.add('is-dragging');
    drag = {
      pointerId,
      card,
      cardId: card.dataset.cardId,
      ghost,
      placeholder,
      offsetX: x - rect.left,
      offsetY: y - rect.top,
      x,
      y,
      list: card.parentElement,
      target: null,
      blocked: null,
      frame: 0,
    };
    try {
      board.setPointerCapture(pointerId);
    } catch {
      // The pointer is already gone; pointerup or pointercancel ends the drag.
    }
    moveGhost();
    updateTarget();
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function makeGhost(card, width) {
    const ghost = /** @type {HTMLElement} */ (card.cloneNode(true));
    for (const attribute of ['tabindex', 'aria-describedby', 'data-focus-key', 'data-card-id']) ghost.removeAttribute(attribute);
    ghost.classList.add('card--ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${width}px`;
    return ghost;
  }

  function moveGhost() {
    drag.ghost.style.transform = `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0) rotate(2deg)`;
  }

  /** Finds the column under the pointer and moves the placeholder to the drop position. */
  function updateTarget() {
    const column = document.elementFromPoint(drag.x, drag.y)?.closest('.column');
    if (!column || !board.contains(column)) return; // between columns: keep the last target
    const columnId = column.dataset.columnId;
    const list = column.querySelector('.cards');
    drag.list = list;
    if (!canDrop(drag.cardId, columnId)) {
      markBlocked(column);
      drag.placeholder.remove();
      drag.target = null;
      return;
    }
    markBlocked(null);
    const before = [...list.children].find((node) => node.classList.contains('card') && node !== drag.card && isBelowPointer(node));
    if (drag.placeholder.parentElement !== list || drag.placeholder.nextElementSibling !== (before ?? null)) {
      list.insertBefore(drag.placeholder, before ?? null);
    }
    drag.target = { columnId, beforeId: before ? before.dataset.cardId : null };
  }

  function isBelowPointer(node) {
    const rect = node.getBoundingClientRect();
    return drag.y < rect.top + rect.height / 2;
  }

  function markBlocked(column) {
    const blocked = column ? column.dataset.columnId : null;
    if (blocked === drag.blocked) return;
    board.querySelector('.column.is-blocked')?.classList.remove('is-blocked');
    column?.classList.add('is-blocked');
    drag.blocked = blocked;
  }

  function autoScroll() {
    const area = board.getBoundingClientRect();
    let scrolled = scrollStep(board, 'scrollLeft', edgeScrollSpeed(drag.x, area.left, area.right));
    const column = drag.list?.closest('.column');
    if (column) {
      const box = column.getBoundingClientRect();
      const inside = drag.x >= box.left && drag.x <= box.right && drag.y >= box.top && drag.y <= box.bottom;
      const list = drag.list.getBoundingClientRect();
      if (inside) scrolled = scrollStep(drag.list, 'scrollTop', edgeScrollSpeed(drag.y, list.top, list.bottom)) || scrolled;
    }
    const page = document.scrollingElement;
    if (page) scrolled = scrollStep(page, 'scrollTop', edgeScrollSpeed(drag.y, 0, window.innerHeight, 32, 12)) || scrolled;
    if (scrolled) updateTarget();
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function scrollStep(element, property, delta) {
    if (delta === 0) return false;
    const before = element[property];
    element[property] = before + delta;
    return element[property] !== before;
  }

  function finish(dropIt) {
    const { cardId, target, blocked } = drag;
    cancelAnimationFrame(drag.frame);
    drag.ghost.remove();
    drag.placeholder.remove();
    drag.card.classList.remove('card--dragging');
    markBlocked(null);
    document.body.classList.remove('is-dragging');
    board.classList.remove('is-dragging');
    try {
      board.releasePointerCapture(drag.pointerId);
    } catch {
      // Capture was never set or is already released.
    }
    drag = null;
    lastDragEnd = performance.now();
    listen(false);
    if (!dropIt) return;
    if (blocked) onBlocked(blocked);
    else if (target) onDrop({ cardId, ...target });
  }

  return { isActive: () => press !== null || drag !== null };
}
