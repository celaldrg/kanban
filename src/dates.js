/**
 * Calendar-date helpers for due dates.
 * A date is a "YYYY-MM-DD" key in the user's local calendar. Arithmetic on keys runs in UTC,
 * so daylight-saving changes can never shift a day. Pure module: the caller supplies "today".
 */

const DAY_MS = 86_400_000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Due-date filter ids: overdue, due today, due from today through this Sunday. */
export const DUE_FILTERS = Object.freeze(['overdue', 'today', 'week']);

/**
 * Checks that a value is a real calendar date written as "YYYY-MM-DD".
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDateKey(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Returns the local calendar date of a timestamp, e.g. today's key from the clock.
 * @param {number} ms milliseconds since the epoch
 * @returns {string} "YYYY-MM-DD"
 */
export function toDateKey(ms) {
  const date = new Date(ms);
  return formatKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Adds a whole number of days (negative to go back) to a date key.
 * @param {string} key "YYYY-MM-DD"
 * @param {number} days
 * @returns {string} "YYYY-MM-DD"
 */
export function addDays(key, days) {
  const date = new Date((dayNumber(key) + days) * DAY_MS);
  return formatKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Counts whole days from one date key to another: 1 for tomorrow, -1 for yesterday.
 * @param {string} from "YYYY-MM-DD"
 * @param {string} to "YYYY-MM-DD"
 * @returns {number}
 */
export function daysBetween(from, to) {
  return dayNumber(to) - dayNumber(from);
}

/**
 * Classifies a due date relative to today. Weeks run Monday to Sunday, so "week" means
 * after today but no later than this Sunday.
 * @param {string|null} due "YYYY-MM-DD" or null
 * @param {string} today "YYYY-MM-DD"
 * @returns {'none'|'overdue'|'today'|'week'|'later'}
 */
export function dueStatus(due, today) {
  if (!due) return 'none';
  const diff = daysBetween(today, due);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return diff <= daysUntilSunday(today) ? 'week' : 'later';
}

/**
 * Checks a due date against a due filter. "week" covers today through this Sunday;
 * a null filter lets everything through; cards without a due date fail every filter.
 * @param {string|null} due
 * @param {'overdue'|'today'|'week'|null} filter
 * @param {string} today "YYYY-MM-DD"
 * @returns {boolean}
 */
export function matchesDueFilter(due, filter, today) {
  if (!filter) return true;
  const status = dueStatus(due, today);
  return filter === 'week' ? status === 'today' || status === 'week' : status === filter;
}

function dayNumber(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function daysUntilSunday(key) {
  const weekday = new Date(dayNumber(key) * DAY_MS).getUTCDay(); // 0 = Sunday
  return (7 - weekday) % 7;
}

function formatKey(year, month, day) {
  const pad = (value, size) => String(value).padStart(size, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}
