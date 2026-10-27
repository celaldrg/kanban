/**
 * Tiny localStorage helper: the only module that touches browser storage.
 * Every access is wrapped in try/catch, so private mode, disabled storage or a full quota never
 * throws. Keys get a "kanban:" prefix because every app on the same GitHub Pages origin shares
 * one storage area. Nothing is read at import time.
 */

const PREFIX = 'kanban:';

/**
 * @typedef {{ getItem(key: string): string|null, setItem(key: string, value: string): void }} StorageLike
 */

function resolve(backend) {
  if (backend) return backend;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads a saved string.
 * @param {string} key name without the app prefix
 * @param {StorageLike} [backend] storage to use; defaults to localStorage
 * @returns {string|null} null when missing or when storage is unavailable
 */
export function readItem(key, backend) {
  try {
    const store = resolve(backend);
    return store ? store.getItem(PREFIX + key) : null;
  } catch {
    return null;
  }
}

/**
 * Saves a string.
 * @param {string} key name without the app prefix
 * @param {string} value
 * @param {StorageLike} [backend] storage to use; defaults to localStorage
 * @returns {boolean} false when storage is unavailable or full
 */
export function writeItem(key, value, backend) {
  try {
    const store = resolve(backend);
    if (!store) return false;
    store.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}
