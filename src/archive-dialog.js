/**
 * The archive dialog: lists archived cards (newest first) with Restore and Delete permanently.
 * A restored card goes back to the end of its old column; a permanent delete can be undone
 * from the toast.
 */

import { openDialog } from './dialogs.js';
import { h, icon } from './dom.js';
import { formatTimestamp } from './format.js';
import { findCard, findColumn } from './model.js';

/**
 * @typedef {import('./main.js').AppContext} AppContext
 */

/**
 * Wires the archive dialog (#archive-dialog in index.html).
 * @param {{ dialog: HTMLDialogElement, ctx: AppContext }} options
 * @returns {{ open: () => void, refresh: () => void }} refresh redraws the list while the dialog is open
 */
export function createArchiveDialog({ dialog, ctx }) {
  const list = dialog.querySelector('#archive-list');
  const empty = dialog.querySelector('#archive-empty');

  list.addEventListener('click', onClick);

  function open() {
    render();
    openDialog(dialog);
  }

  function refresh() {
    if (dialog.open) render();
  }

  function render() {
    const board = ctx.getBoard();
    list.replaceChildren(...board.archive.map((card) => item(card, findColumn(board, card.columnId))));
    empty.hidden = board.archive.length > 0;
  }

  function item(card, column) {
    const titleId = `archived-${card.id}`;
    return h(
      'li',
      { class: 'archive-item', dataset: { cardId: card.id } },
      h(
        'div',
        { class: 'archive-info' },
        card.labels.length > 0 &&
          h(
            'div',
            { class: 'card-labels', 'aria-hidden': 'true' },
            card.labels.map((id) => h('span', { class: `label-chip label--${id}` })),
          ),
        h('p', { class: 'archive-title', id: titleId, text: card.title }),
        h('p', {
          class: 'archive-meta',
          text: ctx.t('archivedFrom', { column: column?.title ?? '', date: formatTimestamp(card.archivedAt, ctx.lang()) }),
        }),
      ),
      h(
        'div',
        { class: 'archive-actions' },
        h(
          'button',
          { type: 'button', class: 'btn', 'aria-describedby': titleId, dataset: { archiveAction: 'restore' } },
          icon('restore'),
          h('span', { text: ctx.t('restore') }),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn icon-btn--danger',
            'aria-label': ctx.t('deleteForever', { title: card.title }),
            title: ctx.t('deleteForever', { title: card.title }),
            dataset: { archiveAction: 'delete' },
          },
          icon('trash'),
        ),
      ),
    );
  }

  function onClick(event) {
    const button = event.target.closest('[data-archive-action]');
    if (!button) return;
    const row = button.closest('li');
    const index = [...list.children].indexOf(row);
    if (button.dataset.archiveAction === 'restore') restore(row.dataset.cardId);
    else remove(row.dataset.cardId);
    focusRow(index);
  }

  function restore(cardId) {
    const columnId = findCard(ctx.getBoard(), cardId)?.card.columnId;
    const result = ctx.dispatch({ type: 'card/restore', cardId });
    if (result.ok) ctx.toast('cardRestored');
    else if (result.error === 'wip-limit') ctx.warnWip(columnId);
    else ctx.reportError(result.error);
  }

  function remove(cardId) {
    const result = ctx.dispatch({ type: 'card/delete', cardId });
    if (result.ok) ctx.undoToast('cardDeleted');
    else ctx.reportError(result.error);
  }

  /** After a row leaves the list, focus stays near it: the row now in its place, or the close button. */
  function focusRow(index) {
    const rows = list.children;
    const row = rows[Math.min(index, rows.length - 1)];
    const target = row ? row.querySelector('[data-archive-action="restore"]') : dialog.querySelector('[data-close]');
    target?.focus();
  }

  return { open, refresh };
}
