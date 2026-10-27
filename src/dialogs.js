/**
 * Shared behaviour of the app's modal <dialog> elements and the yes/no confirm dialog.
 * The browser handles focus trapping and Escape; this adds close buttons, backdrop clicks and
 * a stack of open dialogs (a confirm dialog can open on top of another dialog).
 */

const wired = new WeakSet();
let stack = []; // dialogs in the order they were opened; closed ones are dropped lazily
let pendingAnswer = null; // settles the confirm question that is still waiting for its answer

/**
 * Opens a dialog modally. Buttons marked [data-close] close it; a click on the backdrop closes
 * it only when the dialog has [data-backdrop-close] (forms keep their unsaved input otherwise).
 * @param {HTMLDialogElement} dialog
 */
export function openDialog(dialog) {
  if (!wired.has(dialog)) wire(dialog);
  dialog.returnValue = '';
  if (dialog.open) return;
  dialog.showModal();
  stack = [...openOnly().filter((open) => open !== dialog), dialog];
}

/**
 * True while any modal dialog is open.
 * @returns {boolean}
 */
export function isDialogOpen() {
  return topDialog() !== null;
}

/**
 * The dialog on top: the one the user is working in, or null when none is open.
 * @returns {HTMLDialogElement|null}
 */
export function topDialog() {
  stack = openOnly();
  return stack.at(-1) ?? null;
}

/**
 * Asks for confirmation in the confirm dialog (#confirm-dialog in index.html).
 * @param {{ title: string, message: string, confirmLabel: string }} texts
 * @returns {Promise<boolean>} true when the user confirmed
 */
export function confirmAction({ title, message, confirmLabel }) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('confirm-dialog'));
  // Browsers fire "close" a frame later. A question asked again before the previous one heard
  // its close event counts that previous one as cancelled.
  pendingAnswer?.(false);
  dialog.querySelector('#confirm-title').textContent = title;
  dialog.querySelector('#confirm-message').textContent = message;
  dialog.querySelector('#confirm-ok').textContent = confirmLabel;
  openDialog(dialog);
  return new Promise((resolve) => {
    function answer(confirmed) {
      dialog.removeEventListener('close', onClose);
      pendingAnswer = null;
      resolve(confirmed);
    }
    function onClose() {
      if (!dialog.open) answer(dialog.returnValue === 'confirm'); // an open dialog means a late event
    }
    pendingAnswer = answer;
    dialog.addEventListener('close', onClose);
  });
}

function openOnly() {
  return stack.filter((dialog) => dialog.open);
}

function wire(dialog) {
  wired.add(dialog);
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    const onBackdrop = event.target === dialog && pressedBackdrop && dialog.hasAttribute('data-backdrop-close');
    if (onBackdrop || event.target.closest('[data-close]')) dialog.close();
  });
}
