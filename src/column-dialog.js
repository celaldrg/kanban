/**
 * The column dialog: adds a column, or renames one, sets its WIP limit, moves it left or right
 * and deletes it. Edits apply on Save as one undo step. Deleting a column that still has cards
 * asks first; either way the toast offers Undo.
 */

import { confirmAction, openDialog } from './dialogs.js';
import { LIMITS, findColumn } from './model.js';

/**
 * @typedef {import('./main.js').AppContext} AppContext
 */

/**
 * Wires the column dialog (#column-dialog in index.html).
 * @param {{ dialog: HTMLDialogElement, ctx: AppContext }} options
 * @returns {{ openNew: () => void, openColumn: (columnId: string) => void }}
 */
export function createColumnDialog({ dialog, ctx }) {
  const $ = (selector) => dialog.querySelector(selector);
  const nameInput = $('#column-name');
  const wipInput = $('#column-wip');
  const left = $('#column-left');
  const right = $('#column-right');
  const errorBox = $('#column-error');
  let session = null; // { mode: 'new'|'edit', columnId, position, returnKey }

  nameInput.maxLength = LIMITS.title;
  wipInput.max = String(LIMITS.wip);
  $('form').addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });
  left.addEventListener('click', () => shift(-1));
  right.addEventListener('click', () => shift(1));
  $('#column-delete').addEventListener('click', deleteColumn);
  dialog.addEventListener('close', () => {
    // Browsers fire "close" a frame later; by then the dialog may be open again for a new session.
    if (dialog.open || !session) return;
    if (!ctx.focusKey(session.returnKey)) ctx.focusKey('add-column');
    session = null;
  });

  /** Opens an empty form for a new column at the right end of the board. */
  function openNew() {
    session = { mode: 'new', columnId: null, position: -1, returnKey: 'add-column' };
    fill('', null);
  }

  /** Opens the settings of an existing column. */
  function openColumn(columnId) {
    const position = ctx.getBoard().columns.findIndex((column) => column.id === columnId);
    if (position === -1) return;
    const column = ctx.getBoard().columns[position];
    session = { mode: 'edit', columnId, position, returnKey: `menu:${columnId}` };
    fill(column.title, column.wipLimit);
  }

  function fill(title, wipLimit) {
    const isNew = session.mode === 'new';
    $('#column-dialog-title').textContent = ctx.t(isNew ? 'newColumn' : 'columnSettings');
    $('#column-save').textContent = ctx.t(isNew ? 'addColumn' : 'save');
    $('#column-position-field').hidden = isNew;
    $('#column-delete').hidden = isNew;
    nameInput.value = title;
    wipInput.value = wipLimit === null ? '' : String(wipLimit);
    showError(null, null);
    if (!isNew) showPosition();
    openDialog(dialog);
    nameInput.focus();
  }

  function shift(step) {
    const position = session.position + step;
    if (position < 0 || position >= ctx.getBoard().columns.length) return;
    session.position = position;
    showPosition();
  }

  function showPosition() {
    const total = ctx.getBoard().columns.length;
    $('#column-position').textContent = ctx.t('position', { n: session.position + 1, total });
    left.setAttribute('aria-disabled', String(session.position === 0));
    right.setAttribute('aria-disabled', String(session.position === total - 1));
  }

  function save() {
    if (nameInput.value.trim() === '') {
      showError('nameRequired', nameInput);
      return;
    }
    const wipLimit = readWip();
    if (wipLimit === undefined) {
      showError('wipInvalid', wipInput);
      return;
    }
    const title = nameInput.value;
    const { columnId, position } = session;
    const result =
      session.mode === 'new'
        ? ctx.dispatch({ type: 'column/add', title, wipLimit })
        : ctx.dispatch({
            type: 'batch',
            actions: [
              { type: 'column/rename', columnId, title },
              { type: 'column/setWip', columnId, wipLimit },
              { type: 'column/move', columnId, toIndex: position },
            ],
          });
    if (!result.ok) {
      showError(`error.${result.error}`, null);
      return;
    }
    if (session.mode === 'new') session.returnKey = `add:${result.id}`;
    dialog.close();
  }

  /** The WIP limit typed in: null for none (empty or 0), undefined when it is not valid. */
  function readWip() {
    const text = wipInput.value.trim();
    if (wipInput.validity.badInput) return undefined;
    if (text === '') return null;
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0 || value > LIMITS.wip) return undefined;
    return value === 0 ? null : value;
  }

  async function deleteColumn() {
    const board = ctx.getBoard();
    const column = findColumn(board, session.columnId);
    if (!column) return;
    if (column.cards.length > 0) {
      const confirmed = await confirmAction({
        title: ctx.t('confirmDeleteColumnTitle', { title: column.title }),
        message: ctx.t('confirmDeleteColumnText', { n: column.cards.length }),
        confirmLabel: ctx.t('confirmDelete'),
      });
      if (!confirmed || !session) return;
    }
    const index = board.columns.indexOf(column);
    const result = ctx.dispatch({ type: 'column/delete', columnId: column.id });
    if (!result.ok) {
      showError(`error.${result.error}`, null);
      return;
    }
    const { columns } = ctx.getBoard();
    const neighbour = columns[index] ?? columns[index - 1];
    session.returnKey = neighbour ? `menu:${neighbour.id}` : 'add-column';
    dialog.close();
    ctx.undoToast('columnDeleted');
  }

  function showError(key, field) {
    errorBox.hidden = key === null;
    errorBox.textContent = key === null ? '' : ctx.t(key);
    for (const input of [nameInput, wipInput]) {
      if (input === field) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    field?.focus();
  }

  return { openNew, openColumn };
}
