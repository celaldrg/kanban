/**
 * The card dialog: creates a card or edits one (title, labels, due date, description and a
 * checklist), and archives or deletes it. Edits apply on Save as one undo step; Cancel, Escape
 * and the close button discard them.
 */

import { openDialog } from './dialogs.js';
import { h, icon } from './dom.js';
import { formatTimestamp } from './format.js';
import { LABELS, LIMITS, findCard, findColumn } from './model.js';

/**
 * @typedef {import('./model.js').Card} Card
 * @typedef {import('./main.js').AppContext} AppContext
 */

const BLANK = Object.freeze({ title: '', description: '', labels: [], due: null, checklist: [] });

/**
 * Wires the card dialog (#card-dialog in index.html).
 * @param {{ dialog: HTMLDialogElement, ctx: AppContext }} options
 * @returns {{ openNew: (columnId: string) => void, openCard: (cardId: string) => void }}
 */
export function createCardEditor({ dialog, ctx }) {
  const $ = (selector) => dialog.querySelector(selector);
  const form = $('form');
  const titleInput = $('#card-title');
  const labelPicker = $('#card-labels');
  const dueInput = $('#card-due');
  const description = $('#card-description');
  const list = $('#checklist');
  const newItem = $('#checklist-new');
  const addItemButton = $('#checklist-add');
  const errorBox = $('#card-error');
  let session = null; // { mode: 'new'|'edit', columnId, cardId, returnKey }

  titleInput.maxLength = LIMITS.title;
  description.maxLength = LIMITS.description;
  newItem.maxLength = LIMITS.itemText;
  labelPicker.append(...LABELS.map(labelOption));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });
  $('#card-due-clear').addEventListener('click', () => {
    dueInput.value = '';
    dueInput.focus();
  });
  $('#card-archive').addEventListener('click', () => removeCard('card/archive', 'cardArchived'));
  $('#card-delete').addEventListener('click', () => removeCard('card/delete', 'cardDeleted'));
  addItemButton.addEventListener('click', addItem);
  newItem.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault(); // Enter adds the item instead of submitting the form
    addItem();
  });
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.target.classList.contains('check-text')) return;
    event.preventDefault();
    newItem.focus();
  });
  list.addEventListener('input', (event) => {
    if (event.target.classList.contains('check-text')) relabel(event.target.closest('li'));
  });
  list.addEventListener('change', updateProgress);
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-item]');
    if (button) removeItem(button.closest('li'));
  });
  dialog.addEventListener('close', () => {
    // Browsers fire "close" a frame later; by then the dialog may be open again for a new session.
    if (dialog.open || !session) return;
    if (!ctx.focusKey(session.returnKey)) ctx.focusKey(`add:${session.columnId}`);
    session = null;
  });

  /** Opens an empty card form for a new card at the end of a column. */
  function openNew(columnId) {
    const column = findColumn(ctx.getBoard(), columnId);
    if (!column) return;
    session = { mode: 'new', columnId, cardId: null, returnKey: `add:${columnId}` };
    fill(BLANK, column.title);
  }

  /** Opens the form for an existing card. */
  function openCard(cardId) {
    const found = findCard(ctx.getBoard(), cardId);
    if (!found || found.archived) return;
    session = { mode: 'edit', columnId: found.column.id, cardId, returnKey: `card:${cardId}` };
    fill(found.card, found.column.title);
  }

  /** @param {Card|typeof BLANK} card */
  function fill(card, columnTitle) {
    const isNew = session.mode === 'new';
    $('#card-dialog-title').textContent = ctx.t(isNew ? 'newCard' : 'editCard');
    $('#card-column').textContent = ctx.t('inColumn', { column: columnTitle });
    $('#card-save').textContent = ctx.t(isNew ? 'create' : 'save');
    $('#card-actions').hidden = isNew;
    const meta = $('#card-meta');
    meta.hidden = isNew;
    meta.textContent = isNew
      ? ''
      : ctx.t('cardMeta', { created: formatTimestamp(card.createdAt, ctx.lang()), updated: formatTimestamp(card.updatedAt, ctx.lang()) });
    titleInput.value = card.title;
    titleInput.removeAttribute('aria-invalid');
    for (const box of labelPicker.querySelectorAll('input')) box.checked = card.labels.includes(box.value);
    dueInput.value = card.due ?? '';
    description.value = card.description;
    list.replaceChildren(...card.checklist.map(itemRow));
    newItem.value = '';
    refreshChecklist();
    showError(null);
    openDialog(dialog);
    titleInput.focus();
  }

  function save() {
    if (titleInput.value.trim() === '') {
      showError('titleRequired');
      titleInput.setAttribute('aria-invalid', 'true');
      titleInput.focus();
      return;
    }
    const fields = readFields();
    const result =
      session.mode === 'new'
        ? ctx.dispatch({ type: 'card/add', columnId: session.columnId, ...fields })
        : ctx.dispatch({ type: 'card/update', cardId: session.cardId, patch: fields });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    if (session.mode === 'new') session.returnKey = `card:${result.id}`;
    dialog.close();
  }

  function removeCard(type, messageKey) {
    const result = ctx.dispatch({ type, cardId: session.cardId });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    session.returnKey = `add:${session.columnId}`;
    dialog.close();
    ctx.undoToast(messageKey);
  }

  function fail(code) {
    if (code === 'not-found') {
      dialog.close();
      ctx.reportError(code);
    } else {
      showError(code === 'invalid' ? 'invalidCard' : `error.${code}`);
    }
  }

  function readFields() {
    const checklist = [...list.children].map((row) => ({
      id: row.dataset.itemId,
      text: row.querySelector('.check-text').value,
      done: row.querySelector('.check-done').checked,
    }));
    // Text typed into "Add an item" but not added yet is kept rather than lost.
    if (newItem.value.trim() !== '' && checklist.length < LIMITS.checklistItems) {
      checklist.push({ id: undefined, text: newItem.value, done: false });
    }
    return {
      title: titleInput.value,
      description: description.value,
      labels: [...labelPicker.querySelectorAll('input:checked')].map((box) => box.value),
      due: dueInput.value || null,
      checklist,
    };
  }

  function showError(key) {
    errorBox.hidden = key === null;
    errorBox.textContent = key === null ? '' : ctx.t(key);
  }

  function labelOption(id) {
    return h(
      'label',
      { class: 'label-option' },
      h('input', { type: 'checkbox', value: id }),
      h('span', { class: `swatch label--${id}`, 'aria-hidden': 'true' }),
      h('span', { dataset: { i18n: `label.${id}` } }),
    );
  }

  function itemRow(item) {
    return h(
      'li',
      { class: 'check-item', dataset: item.id ? { itemId: item.id } : {} },
      h('label', { class: 'check-box' }, h('input', { type: 'checkbox', class: 'check-done', checked: item.done })),
      h('input', { type: 'text', class: 'check-text', value: item.text, maxlength: LIMITS.itemText, autocomplete: 'off' }),
      h('button', { type: 'button', class: 'icon-btn', dataset: { removeItem: '' } }, icon('close')),
    );
  }

  function addItem() {
    const text = newItem.value.trim();
    if (text === '' || list.children.length >= LIMITS.checklistItems) {
      newItem.focus();
      return;
    }
    list.append(itemRow({ text, done: false }));
    newItem.value = '';
    refreshChecklist();
    newItem.focus();
  }

  function removeItem(row) {
    const next = row.nextElementSibling ?? row.previousElementSibling;
    row.remove();
    refreshChecklist();
    (next?.querySelector('.check-text') ?? newItem).focus();
  }

  function refreshChecklist() {
    [...list.children].forEach((row, index) => relabel(row, index + 1));
    const full = list.children.length >= LIMITS.checklistItems;
    newItem.disabled = full;
    addItemButton.disabled = full;
    const hint = $('#checklist-hint');
    hint.hidden = !full;
    hint.textContent = ctx.t('checklistFull', { max: LIMITS.checklistItems });
    updateProgress();
  }

  /** Screen-reader names of a checklist row, which mention its text and number. */
  function relabel(row, number = [...list.children].indexOf(row) + 1) {
    const text = row.querySelector('.check-text').value.trim() || ctx.t('itemText', { n: number });
    row.querySelector('.check-done').setAttribute('aria-label', ctx.t('itemDone', { text }));
    row.querySelector('.check-text').setAttribute('aria-label', ctx.t('itemText', { n: number }));
    row.querySelector('[data-remove-item]').setAttribute('aria-label', ctx.t('removeItem', { text }));
  }

  function updateProgress() {
    const boxes = [...list.querySelectorAll('.check-done')];
    const done = boxes.filter((box) => box.checked).length;
    const progress = $('#checklist-progress');
    progress.hidden = boxes.length === 0;
    progress.style.setProperty('--progress', String(boxes.length === 0 ? 0 : done / boxes.length));
    $('#checklist-count').textContent = `${done}/${boxes.length}`;
    $('#checklist-summary').textContent = ctx.t('checklistSr', { done, total: boxes.length });
  }

  return { openNew, openCard };
}
