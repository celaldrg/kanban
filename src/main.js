/**
 * Entry point: loads the saved board (the sample board on a first visit or when the saved data
 * cannot be read, or the "?demo" board, which is never saved), keeps it saved, and wires the
 * header, toolbar, board, dialogs and shortcuts: Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes
 * (Cmd on a Mac).
 */

import { createArchiveDialog } from './archive-dialog.js';
import { createBoardView } from './board-view.js';
import { createCardEditor } from './card-editor.js';
import { createColumnDialog } from './column-dialog.js';
import { toDateKey } from './dates.js';
import { confirmAction, isDialogOpen, openDialog, topDialog } from './dialogs.js';
import { applyTranslations, hydrateIcons, isTypingTarget } from './dom.js';
import { createFeedback } from './feedback.js';
import { LANGUAGES, translate } from './i18n.js';
import { findColumn } from './model.js';
import { loadBoard, saveBoard } from './persist.js';
import { createDemoBoard, createSampleBoard } from './sample.js';
import { createMatcher, isFilterActive } from './search.js';
import { readItem, writeItem } from './storage.js';
import { createKanban } from './store.js';
import { createToolbar } from './toolbar.js';
import { downloadBoard, readBoardFile } from './transfer.js';

/**
 * Services the UI modules share.
 * @typedef {{
 *   t: (key: string, params?: Record<string, string|number>) => string,
 *   lang: () => string,
 *   today: () => string,
 *   getBoard: () => import('./model.js').Board,
 *   dispatch: (action: import('./reducer.js').Action) => import('./store.js').DispatchResult,
 *   announce: (message: string) => void,
 *   toast: (key: string, params?: Record<string, string|number>) => void,
 *   undoToast: (key: string) => void,
 *   reportError: (code: string) => void,
 *   warnWip: (columnId: string) => void,
 *   focusKey: (key: string) => boolean,
 * }} AppContext
 *   t: translates a text key; today: the local date as "YYYY-MM-DD"; announce: tells screen
 *   readers a message; toast: shows a translated message; undoToast: the same with an Undo button
 *   for the change just made; reportError: shows the text of a reducer error code; warnWip: says
 *   that a column is at its WIP limit; focusKey: focuses a board control by its data-focus-key
 */

const LANG_KEY = 'lang';

const state = {
  lang: LANGUAGES[0],
  demo: false,
  kanban: null,
  unsubscribe: () => {},
  pristine: false, // an untouched sample or demo board, rebuilt when the language changes
  undoTarget: null, // the board an Undo toast belongs to; any other board hides that toast
  saving: false, // off for the demo board, and when saved data can be neither read nor backed up
  saveWarned: false,
};

/** @type {AppContext} */
const ctx = {
  t,
  lang: () => state.lang,
  today: () => toDateKey(Date.now()),
  getBoard: () => state.kanban.getState(),
  dispatch: (action) => state.kanban.dispatch(action),
  announce: (message) => feedback.announce(message),
  toast: (key, params) => showToast(t(key, params)),
  undoToast: showUndoToast,
  reportError: (code) => showToast(t(`error.${code}`), 'error'),
  warnWip: (columnId) => showToast(t('wipBlocked', { column: findColumn(ctx.getBoard(), columnId)?.title ?? '' }), 'error'),
  focusKey: (key) => view.focusKey(key),
};

let feedback;
let toolbar;
let view;
let archive;

start();

function start() {
  state.demo = new URLSearchParams(location.search).has('demo');
  state.lang = savedLanguage();
  feedback = createFeedback({ region: byId('toasts'), announcer: byId('announcer'), host: () => topDialog() ?? document.body });
  toolbar = createToolbar({ root: byId('toolbar'), onChange: renderAll });
  archive = createArchiveDialog({ dialog: byId('archive-dialog'), ctx });
  const cardEditor = createCardEditor({ dialog: byId('card-dialog'), ctx });
  const columnDialog = createColumnDialog({ dialog: byId('column-dialog'), ctx });
  view = createBoardView({
    element: byId('board'),
    ctx,
    getMatcher,
    onOpenCard: cardEditor.openCard,
    onAddCard: cardEditor.openNew,
    onEditColumn: columnDialog.openColumn,
    onAddColumn: columnDialog.openNew,
  });
  hydrateIcons(document.body);
  wireHeader();
  wireBoardMenu();
  document.addEventListener('keydown', onShortcut);
  const saved = loadSavedBoard();
  useBoard(saved ?? readyMadeBoard(), saved === null);
  applyLanguage();
}

function t(key, params) {
  return translate(state.lang, key, params);
}

function byId(id) {
  return document.getElementById(id);
}

// Board and store

function useBoard(board, pristine) {
  state.unsubscribe();
  state.kanban = createKanban({ board });
  state.unsubscribe = state.kanban.subscribe(onBoardChange);
  state.pristine = pristine;
  state.undoTarget = null;
}

/**
 * The saved board, or null for the demo, on a first visit and when the saved data cannot be read.
 * loadBoard backs unreadable data up, and a toast tells the user; when no backup could be made,
 * saving stays off so that the board shown instead cannot overwrite the only copy.
 */
function loadSavedBoard() {
  if (state.demo) return null;
  const { status, board, backupKey } = loadBoard();
  state.saving = status !== 'not-backed-up';
  if (status === 'backed-up') showToast(t('unreadableCopied', { key: backupKey }), 'error');
  if (status === 'not-backed-up') showToast(t('unreadableKept'), 'error');
  return board;
}

function readyMadeBoard() {
  const options = { now: Date.now(), lang: state.lang };
  return state.demo ? createDemoBoard(options) : createSampleBoard(options);
}

function onBoardChange(board) {
  state.pristine = false;
  if (state.undoTarget && board !== state.undoTarget) {
    state.undoTarget = null;
    feedback.hide();
  }
  if (state.saving && !saveBoard(board) && !state.saveWarned) {
    state.saveWarned = true;
    showToast(t('saveFailed'), 'error');
  }
  renderAll();
}

function renderAll() {
  const board = state.kanban.getState();
  view.render();
  setDisabled(byId('undo'), !state.kanban.canUndo());
  setDisabled(byId('redo'), !state.kanban.canRedo());
  byId('menu-archive-text').textContent = t('archivedCount', { n: board.archive.length });
  toolbar.setStatus(matchStatus(board));
  archive.refresh();
}

function getMatcher() {
  const filters = toolbar.getFilters();
  return isFilterActive(filters) ? createMatcher(filters, ctx.today()) : null;
}

function matchStatus(board) {
  const matcher = getMatcher();
  if (!matcher) return '';
  const cards = board.columns.flatMap((column) => column.cards);
  return t('matchCount', { n: cards.filter(matcher).length, total: cards.length });
}

function undo() {
  if (!view.isBusy() && state.kanban.undo()) showToast(t('undone'));
}

function redo() {
  if (!view.isBusy() && state.kanban.redo()) showToast(t('redone'));
}

function onShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (isDialogOpen() || isTypingTarget(event.target)) return;
  const key = event.key.toLowerCase();
  const isUndo = key === 'z' && !event.shiftKey;
  const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
  if (!isUndo && !isRedo) return;
  event.preventDefault();
  if (isUndo) undo();
  else redo();
}

// Header and board menu

function wireHeader() {
  byId('undo').addEventListener('click', undo);
  byId('redo').addEventListener('click', redo);
  byId('menu-button').addEventListener('click', () => openDialog(byId('menu-dialog')));
  byId('lang-toggle').addEventListener('click', toggleLanguage);
}

function wireBoardMenu() {
  const menu = byId('menu-dialog');
  const fromMenu = (action) => () => {
    menu.close();
    action();
  };
  byId('menu-archive').addEventListener('click', fromMenu(() => archive.open()));
  byId('menu-export').addEventListener('click', fromMenu(exportBoard));
  byId('menu-import').addEventListener('click', fromMenu(() => byId('import-file').click()));
  byId('menu-reset').addEventListener('click', fromMenu(resetBoard));
  byId('import-file').addEventListener('change', importFromFile);
}

function exportBoard() {
  downloadBoard(state.kanban.getState(), `kanban-${ctx.today()}.json`);
  showToast(t('boardExported'));
}

async function importFromFile(event) {
  const input = event.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const result = await readBoardFile(file);
  if (!result.ok) {
    showToast(t(`importError.${result.error}`), 'error');
    return;
  }
  const confirmed = await confirmAction({
    title: t('confirmImportTitle'),
    message: t('confirmImportText'),
    confirmLabel: t('confirmImport'),
  });
  if (confirmed) replaceBoard(result.board, 'boardImported');
}

async function resetBoard() {
  const confirmed = await confirmAction({
    title: t('confirmResetTitle'),
    message: t('confirmResetText'),
    confirmLabel: t('confirmReset'),
  });
  if (confirmed) replaceBoard(createSampleBoard({ now: Date.now(), lang: state.lang }), 'boardReset');
}

function replaceBoard(board, messageKey) {
  const result = state.kanban.dispatch({ type: 'board/replace', board });
  if (result.ok) showUndoToast(messageKey);
  else ctx.reportError(result.error);
}

// Language

function savedLanguage() {
  const saved = readItem(LANG_KEY);
  return LANGUAGES.includes(saved) ? saved : LANGUAGES[0];
}

function toggleLanguage() {
  state.lang = LANGUAGES.find((lang) => lang !== state.lang);
  writeItem(LANG_KEY, state.lang);
  // A toast on screen would stay in the old language, so it goes (toasts only last 5 s anyway).
  state.undoTarget = null;
  feedback.hide();
  if (state.pristine) useBoard(readyMadeBoard(), true);
  applyLanguage();
}

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.title = t('appTitle');
  applyTranslations(document.body, t);
  renderAll();
}

// Feedback

function showToast(message, tone = 'info') {
  state.undoTarget = null;
  feedback.toast(message, { tone });
}

function showUndoToast(key) {
  const board = state.kanban.getState();
  feedback.toast(t(key), {
    actionLabel: t('undo'),
    onAction: () => {
      if (state.kanban.getState() === board) undo();
    },
  });
  state.undoTarget = board;
}

function setDisabled(button, disabled) {
  button.setAttribute('aria-disabled', String(disabled));
}
