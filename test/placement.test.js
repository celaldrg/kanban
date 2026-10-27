import assert from 'node:assert/strict';
import test from 'node:test';

import { dropIndex, edgeScrollSpeed } from '../src/placement.js';

const cards = (...ids) => ids.map((id) => ({ id }));

test('dropIndex: a card from another column lands in front of the target card', () => {
  const column = cards('a', 'b', 'c');
  assert.equal(dropIndex(column, 'x', 'a'), 0);
  assert.equal(dropIndex(column, 'x', 'c'), 2);
  assert.equal(dropIndex(column, 'x', null), 3, 'null means the end of the column');
  assert.equal(dropIndex([], 'x', null), 0);
});

test('dropIndex: moving inside the same column ignores the moving card itself', () => {
  const column = cards('a', 'b', 'c', 'd');
  assert.equal(dropIndex(column, 'a', 'd'), 2, 'a moves down in front of d');
  assert.equal(dropIndex(column, 'd', 'b'), 1, 'd moves up in front of b');
  assert.equal(dropIndex(column, 'b', 'c'), 1, 'dropping in front of the next card keeps the place');
  assert.equal(dropIndex(column, 'b', null), 3, 'b moves to the end');
});

test('dropIndex: an unknown target card (e.g. hidden or deleted meanwhile) means the end', () => {
  assert.equal(dropIndex(cards('a', 'b'), 'x', 'gone'), 2);
  assert.equal(dropIndex(cards('a', 'b'), 'a', 'a'), 1, 'a card cannot land in front of itself');
});

test('edgeScrollSpeed: no scrolling away from the edges', () => {
  assert.equal(edgeScrollSpeed(500, 0, 1000), 0);
  assert.equal(edgeScrollSpeed(48, 0, 1000), 0, 'the band edge itself does not scroll');
  assert.equal(edgeScrollSpeed(952, 0, 1000), 0);
});

test('edgeScrollSpeed: faster the closer the pointer is to an edge, capped at the top speed', () => {
  assert.equal(edgeScrollSpeed(24, 0, 1000), -8);
  assert.equal(edgeScrollSpeed(0, 0, 1000), -16);
  assert.equal(edgeScrollSpeed(-200, 0, 1000), -16, 'past the edge is full speed');
  assert.equal(edgeScrollSpeed(976, 0, 1000), 8);
  assert.equal(edgeScrollSpeed(1300, 0, 1000), 16);
  assert.equal(edgeScrollSpeed(147, 100, 900), -1, 'a speed just inside the band rounds up to one pixel');
});

test('edgeScrollSpeed: custom band and speed, and the band shrinks for small areas', () => {
  assert.equal(edgeScrollSpeed(10, 0, 1000, 20, 30), -15);
  assert.equal(edgeScrollSpeed(40, 0, 90), 0, 'a 90 px area gets 30 px bands, not 48 px ones');
  assert.equal(edgeScrollSpeed(15, 0, 90), -8);
  assert.equal(edgeScrollSpeed(75, 0, 90), 8);
  assert.equal(edgeScrollSpeed(5, 10, 10), 0, 'an empty area never scrolls');
  assert.equal(edgeScrollSpeed(5, 10, 0), 0, 'nor does a reversed one');
});
