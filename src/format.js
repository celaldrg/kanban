/**
 * Display formatting for dates in English or Turkish: due-date badges and timestamps.
 * Pure module (uses Intl only).
 */

import { daysBetween } from './dates.js';
import { translate } from './i18n.js';

const LOCALES = Object.freeze({ en: 'en-US', tr: 'tr-TR' });

/** The BCP 47 locale of an app language. */
function localeOf(lang) {
  return Object.hasOwn(LOCALES, lang) ? LOCALES[lang] : LOCALES.en;
}

/**
 * Short text for a due-date badge: "Today", "Tomorrow" or "Yesterday" for nearby days,
 * otherwise a short date such as "Oct 30" ("30 Eki"), with the year when it is not this year.
 * @param {string} due "YYYY-MM-DD"
 * @param {string} today "YYYY-MM-DD"
 * @param {string} lang "en" or "tr"
 * @returns {string}
 */
export function formatDue(due, today, lang) {
  const offset = daysBetween(today, due);
  if (offset === 0) return translate(lang, 'dueToday');
  if (offset === 1) return translate(lang, 'dueTomorrow');
  if (offset === -1) return translate(lang, 'dueYesterday');
  const [year, month, day] = due.split('-').map(Number);
  const options = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (due.slice(0, 4) !== today.slice(0, 4)) options.year = 'numeric';
  return new Intl.DateTimeFormat(localeOf(lang), options).format(Date.UTC(year, month - 1, day));
}

/**
 * Date and time of a timestamp in the user's time zone, e.g. "Oct 27, 2026, 10:00 AM".
 * @param {number} ms milliseconds since the epoch
 * @param {string} lang "en" or "tr"
 * @returns {string}
 */
export function formatTimestamp(ms, lang) {
  return new Intl.DateTimeFormat(localeOf(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
}
