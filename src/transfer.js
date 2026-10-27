/**
 * Moving boards in and out of the app: downloading the board as a JSON file and reading a
 * JSON file the user picked. Everything stays on the device.
 */

import { MAX_IMPORT_CHARS, parseBoard, stringifyBoard } from './schema.js';

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {import('./schema.js').ImportResult | { ok: false, error: 'read' }} FileResult
 */

/** A UTF-8 character takes at most 4 bytes, so a bigger file cannot fit the import limit. */
const MAX_IMPORT_BYTES = MAX_IMPORT_CHARS * 4;

/**
 * Starts a download of the board as pretty-printed JSON.
 * @param {Board} board
 * @param {string} fileName
 */
export function downloadBoard(board, fileName) {
  const url = URL.createObjectURL(new Blob([stringifyBoard(board, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Reads and checks a board file (see parseBoard for the error codes).
 * @param {File} file
 * @returns {Promise<FileResult>} error "read" when the browser cannot read the file
 */
export async function readBoardFile(file) {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: 'too-large' };
  let text;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: 'read' };
  }
  return parseBoard(text);
}
