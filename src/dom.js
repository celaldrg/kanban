/**
 * Small DOM helpers for the UI modules: building elements and icons without innerHTML and
 * filling the static texts of index.html. Nothing runs at import time.
 */

import { ICONS } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates an element. Props: "class", "text" (textContent), "dataset", "on<event>" listeners,
 * and other attributes (true sets an empty attribute; null, undefined and false are skipped).
 * Children may be nodes, strings, numbers or nested arrays; null, undefined and false are skipped.
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {...unknown} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/**
 * Builds an inline SVG icon (decorative: hidden from screen readers).
 * @param {string} name a key of ICONS
 * @param {string} [extraClass]
 * @returns {SVGSVGElement}
 */
export function icon(name, extraClass = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon ${extraClass}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/**
 * Replaces every placeholder like <i data-icon="undo" class="x"></i> with its SVG icon.
 * @param {ParentNode} root
 */
export function hydrateIcons(root) {
  for (const slot of root.querySelectorAll('[data-icon]')) slot.replaceWith(icon(slot.dataset.icon, slot.className));
}

/**
 * Fills static texts: data-i18n="key" sets the text, data-i18n-attr="attr:key;attr:key" sets attributes.
 * @param {ParentNode} root
 * @param {(key: string) => string} t
 */
export function applyTranslations(root, t) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(';')) {
      const [attribute, key] = pair.split(':').map((part) => part.trim());
      node.setAttribute(attribute, t(key));
    }
  }
}

/**
 * True when keyboard shortcuts must leave the key alone because the user is typing.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(target.type);
}
