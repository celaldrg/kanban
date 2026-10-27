/**
 * Builds the board's DOM from a board state: columns with their counts and menus, and cards with
 * label chips, a due badge and checklist progress. No listeners here: board-view.js delegates
 * events on the board container, using the data-action and data-focus-key attributes set below.
 */

import { dueStatus } from './dates.js';
import { h, icon } from './dom.js';
import { formatDue } from './format.js';
import { checklistProgress, isColumnFull } from './model.js';

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {import('./model.js').Column} Column
 * @typedef {import('./model.js').Card} Card
 * @typedef {{
 *   t: (key: string, params?: object) => string,
 *   lang: string,
 *   today: string,
 *   matches: ((card: Card) => boolean) | null,
 *   liftedId?: string | null,
 * }} ViewOptions  matches: the filter predicate, or null when no filter is active
 */

/**
 * Builds the board's children: one section per column, then the "Add column" button.
 * @param {Board} board
 * @param {ViewOptions} view
 * @returns {HTMLElement[]}
 */
export function buildBoard(board, view) {
  const addColumn = h(
    'button',
    { type: 'button', class: 'add-column', title: view.t('addColumn'), dataset: { action: 'add-column', focusKey: 'add-column' } },
    icon('plus'),
    h('span', { class: 'add-column-text', text: view.t('addColumn') }),
  );
  if (board.columns.length === 0) return [h('p', { class: 'board-empty', text: view.t('emptyBoard') }), addColumn];
  return [...board.columns.map((column) => buildColumn(column, view)), addColumn];
}

/**
 * @param {Column} column
 * @param {ViewOptions} view
 * @returns {HTMLElement}
 */
function buildColumn(column, view) {
  const { t } = view;
  const full = isColumnFull(column);
  const cards = view.matches ? column.cards.filter(view.matches) : column.cards;
  const titleId = `column-title-${column.id}`;
  return h(
    'section',
    {
      class: 'column',
      'aria-labelledby': titleId,
      dataset: { columnId: column.id, blockedText: t('wipReached') },
    },
    h(
      'header',
      { class: 'column-head' },
      h('h2', { class: 'column-title', id: titleId, text: column.title }),
      buildCount(column, full, t),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn column-menu',
          'aria-label': t('columnMenu', { title: column.title }),
          title: t('columnSettings'),
          dataset: { action: 'column-menu', focusKey: `menu:${column.id}` },
        },
        icon('dots', 'icon--dots'),
      ),
    ),
    h(
      'ul',
      { class: 'cards', 'aria-labelledby': titleId, dataset: { empty: t(view.matches ? 'emptyFiltered' : 'emptyColumn') } },
      cards.map((card) => buildCard(card, view)),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'add-card',
        'aria-disabled': full ? 'true' : null,
        title: full ? t('wipReached') : null,
        dataset: { action: 'add-card', focusKey: `add:${column.id}` },
      },
      icon('plus'),
      h('span', { text: t('addCard') }),
    ),
  );
}

/** The "3" or "3/5" pill next to a column title, red when the column is over its WIP limit. */
function buildCount(column, full, t) {
  const count = column.cards.length;
  const limit = column.wipLimit;
  const over = limit !== null && count > limit;
  const state = over ? ' count--over' : full ? ' count--full' : '';
  return h(
    'span',
    { class: `count${state}` },
    h('span', { 'aria-hidden': 'true', text: limit === null ? count : `${count}/${limit}` }),
    h('span', {
      class: 'visually-hidden',
      text: limit === null ? t('cardCount', { n: count }) : t('cardCountWip', { n: count, limit }),
    }),
  );
}

/**
 * @param {Card} card
 * @param {ViewOptions} view
 * @returns {HTMLElement}
 */
function buildCard(card, view) {
  const { t } = view;
  const lifted = card.id === view.liftedId;
  const labelNames = card.labels.map((id) => t(`label.${id}`));
  return h(
    'li',
    {
      class: lifted ? 'card card--lifted' : 'card',
      tabindex: '0',
      'aria-describedby': 'card-help',
      dataset: { cardId: card.id, focusKey: `card:${card.id}` },
    },
    card.labels.length > 0 &&
      h(
        'div',
        { class: 'card-labels' },
        card.labels.map((id, index) => h('span', { class: `label-chip label--${id}`, title: labelNames[index] })),
        h('span', { class: 'visually-hidden', text: t('labelsSr', { list: labelNames.join(', ') }) }),
      ),
    h('h3', { class: 'card-title', text: card.title }),
    buildMeta(card, view),
  );
}

/** Badges under the title: due date, checklist progress and a description marker. */
function buildMeta(card, { t, lang, today }) {
  const badges = [];
  if (card.due) {
    const status = dueStatus(card.due, today);
    badges.push(
      h(
        'span',
        { class: `badge badge--due badge--${status}` },
        icon('clock'),
        h('span', { class: 'visually-hidden', text: t(status === 'overdue' ? 'overdueSr' : 'dueSr') }),
        h('span', { text: formatDue(card.due, today, lang) }),
      ),
    );
  }
  const { done, total } = checklistProgress(card);
  if (total > 0) {
    badges.push(
      h(
        'span',
        { class: done === total ? 'badge badge--complete' : 'badge' },
        icon('checklist'),
        h('span', { 'aria-hidden': 'true', text: `${done}/${total}` }),
        h('span', { class: 'visually-hidden', text: t('checklistSr', { done, total }) }),
      ),
    );
  }
  if (card.description) {
    badges.push(
      h('span', { class: 'badge badge--icon', title: t('descriptionSr') }, icon('notes'), h('span', { class: 'visually-hidden', text: t('descriptionSr') })),
    );
  }
  return badges.length > 0 ? h('div', { class: 'card-meta' }, badges) : null;
}
