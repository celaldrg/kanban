/**
 * Search and filters: case- and diacritics-insensitive text search that understands Turkish
 * (I/ı/İ/i, ş/s, ğ/g, ç/c, ö/o, ü/u), plus label and due-date filters. Pure module.
 */

import { matchesDueFilter } from './dates.js';

/**
 * @typedef {import('./model.js').Card} Card
 * @typedef {{ query: string, labels: string[], due: 'overdue'|'today'|'week'|null }} Filters
 *   labels: a card needs at least one of them (none selected = no label filter)
 */

/** Filters that let every card through. */
export const EMPTY_FILTERS = Object.freeze({ query: '', labels: Object.freeze([]), due: null });

/**
 * Folds text for comparison: lower case, accents removed, every Turkish I (I, ı, İ, i) becomes "i",
 * whitespace collapsed. "Işık Ödevi" -> "isik odevi".
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return String(text)
    .replace(/[Iıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents left over by NFD
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the filters would hide at least some cards.
 * @param {Filters} filters
 * @returns {boolean}
 */
export function isFilterActive(filters) {
  return queryWords(filters.query).length > 0 || filters.labels.length > 0 || filters.due !== null;
}

/**
 * Builds a card predicate. A card matches when every query word appears in its title or
 * description, it has one of the selected labels (if any) and it passes the due filter.
 * @param {Filters} filters
 * @param {string} today "YYYY-MM-DD", for the due filter
 * @returns {(card: Card) => boolean}
 */
export function createMatcher(filters, today) {
  const words = queryWords(filters.query);
  const { labels, due } = filters;
  return (card) => {
    if (labels.length > 0 && !card.labels.some((id) => labels.includes(id))) return false;
    if (!matchesDueFilter(card.due, due, today)) return false;
    if (words.length === 0) return true;
    const text = normalizeText(`${card.title} ${card.description}`);
    return words.every((word) => text.includes(word));
  };
}

function queryWords(query) {
  return normalizeText(query).split(' ').filter(Boolean);
}
