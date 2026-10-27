/**
 * User feedback: one toast at a time (optionally with an action such as "Undo") and
 * announcements for screen readers. While a modal dialog is open the rest of the page is inert,
 * so both elements move into the dialog on top before they show anything.
 */

import { h } from './dom.js';

const TOAST_MS = 5000;
const ANNOUNCE_DELAY_MS = 60; // lets screen readers repeat a message even when it did not change

/**
 * @param {{ region: HTMLElement, announcer: HTMLElement, host: () => HTMLElement }} elements
 *   region: the container for toasts; announcer: a visually hidden aria-live element;
 *   host: where they must live right now (the top dialog, or document.body)
 * @returns {{
 *   toast: (message: string, options?: { actionLabel?: string, onAction?: () => void, tone?: 'info'|'error' }) => void,
 *   hide: () => void,
 *   announce: (message: string) => void,
 * }}
 */
export function createFeedback({ region, announcer, host }) {
  let timer = 0;
  let announceTimer = 0;

  function place(element) {
    const target = host();
    if (element.parentElement !== target) target.append(element);
  }

  function hide() {
    clearTimeout(timer);
    region.replaceChildren();
  }

  function toast(message, { actionLabel, onAction, tone = 'info' } = {}) {
    hide();
    place(region);
    const action =
      actionLabel &&
      h('button', {
        type: 'button',
        class: 'toast-action',
        text: actionLabel,
        onclick: () => {
          hide();
          onAction();
        },
      });
    region.append(h('div', { class: `toast toast--${tone}` }, h('span', { class: 'toast-text', text: message }), action));
    timer = setTimeout(hide, TOAST_MS);
    announce(message);
  }

  function announce(message) {
    clearTimeout(announceTimer);
    place(announcer);
    announcer.textContent = '';
    announceTimer = setTimeout(() => {
      announcer.textContent = message;
    }, ANNOUNCE_DELAY_MS);
  }

  return { toast, hide, announce };
}
