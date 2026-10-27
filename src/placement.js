/**
 * Placement math for drag and drop: where a dropped card lands and how fast the board scrolls
 * near its edges. Pure module.
 */

/**
 * Turns a drop position into the index for a "card/move" action. Filters may hide cards, so a
 * drop is described by the card it lands in front of rather than by a visible position.
 * @param {{ id: string }[]} cards every card of the target column, in order
 * @param {string} cardId the moving card (it may already be in this column)
 * @param {string|null} beforeId the card the drop lands in front of; null for the end of the column
 * @returns {number} the moving card's index after the move
 */
export function dropIndex(cards, cardId, beforeId) {
  const others = cards.filter((card) => card.id !== cardId);
  const index = beforeId === null ? -1 : others.findIndex((card) => card.id === beforeId);
  return index === -1 ? others.length : index;
}

/**
 * Auto-scroll step while a card is dragged near the edge of a scroll area: negative near the
 * start, positive near the end, faster the closer the pointer gets (full speed past the edge).
 * @param {number} pointer pointer coordinate on the scroll axis
 * @param {number} start where the area starts on that axis (left or top)
 * @param {number} end where the area ends (right or bottom)
 * @param {number} [zone] width of the sensitive band at each edge, in px (shrinks for small areas)
 * @param {number} [max] top speed, in px per frame
 * @returns {number} pixels to scroll this frame
 */
export function edgeScrollSpeed(pointer, start, end, zone = 48, max = 16) {
  const band = Math.min(zone, (end - start) / 3);
  if (!(band > 0)) return 0;
  if (pointer < start + band) return -Math.ceil(max * Math.min(1, (start + band - pointer) / band));
  if (pointer > end - band) return Math.ceil(max * Math.min(1, (pointer - (end - band)) / band));
  return 0;
}
