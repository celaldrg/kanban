/**
 * The search box and filter chips above the board. Label chips can be combined (a card needs
 * one of them); the due-date chips work like radio buttons. On narrow screens the chips fold
 * away behind a "Filters" button that shows how many chips are on.
 */

import { DUE_FILTERS } from './dates.js';
import { h } from './dom.js';
import { LABELS } from './model.js';
import { EMPTY_FILTERS, isFilterActive } from './search.js';

/**
 * @typedef {import('./search.js').Filters} Filters
 */

/**
 * Builds the filter chips inside the toolbar of index.html and wires its controls.
 * Chip texts use data-i18n, so applyTranslations() fills them in.
 * @param {{ root: HTMLElement, onChange: (filters: Filters) => void }} options
 * @returns {{ getFilters: () => Filters, setStatus: (text: string) => void }}
 *   setStatus shows a short line such as the number of matching cards ("" hides it)
 */
export function createToolbar({ root, onChange }) {
  const search = /** @type {HTMLInputElement} */ (root.querySelector('#search'));
  const labelGroup = root.querySelector('#label-filters');
  const dueGroup = root.querySelector('#due-filters');
  const clear = root.querySelector('#clear-filters');
  const toggle = root.querySelector('#filters-toggle');
  const badge = root.querySelector('#filters-count');
  const status = root.querySelector('#match-count');
  let filters = EMPTY_FILTERS;

  labelGroup.append(
    ...LABELS.map((id) => chip({ filterLabel: id }, `label.${id}`, h('span', { class: `swatch label--${id}`, 'aria-hidden': 'true' }))),
  );
  dueGroup.append(...DUE_FILTERS.map((id) => chip({ filterDue: id }, `due.${id}`, null)));

  search.addEventListener('input', () => update({ query: search.value }));
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || search.value === '') return;
    event.preventDefault();
    search.value = '';
    update({ query: '' });
  });
  labelGroup.addEventListener('click', (event) => {
    const id = event.target.closest('[data-filter-label]')?.dataset.filterLabel;
    if (!id) return;
    const labels = filters.labels.includes(id) ? filters.labels.filter((label) => label !== id) : [...filters.labels, id];
    update({ labels });
  });
  dueGroup.addEventListener('click', (event) => {
    const id = event.target.closest('[data-filter-due]')?.dataset.filterDue;
    if (id) update({ due: filters.due === id ? null : id });
  });
  clear.addEventListener('click', () => {
    search.value = '';
    update(EMPTY_FILTERS);
    search.focus(); // the Clear button hides itself
  });
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
  });

  function update(patch) {
    filters = { ...filters, ...patch };
    sync();
    onChange(filters);
  }

  function sync() {
    for (const button of labelGroup.querySelectorAll('[data-filter-label]')) {
      button.setAttribute('aria-pressed', String(filters.labels.includes(button.dataset.filterLabel)));
    }
    for (const button of dueGroup.querySelectorAll('[data-filter-due]')) {
      button.setAttribute('aria-pressed', String(filters.due === button.dataset.filterDue));
    }
    const chipsOn = filters.labels.length + (filters.due ? 1 : 0);
    badge.textContent = String(chipsOn);
    badge.hidden = chipsOn === 0;
    clear.hidden = !isFilterActive(filters);
  }

  return {
    getFilters: () => filters,
    setStatus: (text) => {
      status.textContent = text;
    },
  };
}

function chip(dataset, textKey, swatch) {
  return h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', dataset }, swatch, h('span', { dataset: { i18n: textKey } }));
}
