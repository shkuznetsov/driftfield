import { describe, expect, it } from 'vitest';
import { emphasisLinks, restLinks } from '../src/core/links';
import type { Item } from '../src/core/types';

const item = (id: string, tags?: string[]): Item => ({ id, title: id, tags });

describe('emphasisLinks tags', () => {
  it('names the shared tags in the order of the focused item', () => {
    const focus = item('b', ['z', 'x', 'y']);
    const links = emphasisLinks(focus, [item('a', ['y', 'z']), focus, item('c', ['x'])]);
    expect(links).toEqual([
      { a: 'a', b: 'b', strength: 0.75, tags: ['z', 'y'] },
      { a: 'b', b: 'c', strength: 0.5, tags: ['x'] },
    ]);
  });
});

describe('restLinks', () => {
  it('makes no links for items without tags', () => {
    expect(restLinks([item('a'), item('b', []), item('c', ['x'])], 3)).toEqual([]);
  });

  it('makes one stronger link for two shared tags', () => {
    const links = restLinks([item('a', ['x', 'y']), item('b', ['y', 'x', 'z'])], 3);
    expect(links).toEqual([{ a: 'a', b: 'b', strength: 0.75, tags: ['x', 'y'] }]);
  });

  it('caps the links per item', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, ['x']));
    const links = restLinks(items, 2);
    const count: Record<string, number> = {};
    for (const l of links) {
      count[l.a] = (count[l.a] ?? 0) + 1;
      count[l.b] = (count[l.b] ?? 0) + 1;
      expect(l.a).not.toBe(l.b);
    }
    expect(Math.max(...Object.values(count))).toBeLessThanOrEqual(2);
    expect(links.length).toBeGreaterThan(0);
    const keys = links.map((l) => `${l.a}|${l.b}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('emphasisLinks', () => {
  it('links the focused item to every item sharing a tag, without a cap', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, ['x']));
    items.push(item('f', ['other']));
    const links = emphasisLinks(items[2], items);
    expect(links.length).toBe(4);
    expect(links.every((l) => l.a === 'c' || l.b === 'c')).toBe(true);
  });

  it('returns nothing for an untagged focus', () => {
    expect(emphasisLinks(item('a'), [item('a'), item('b', ['x'])])).toEqual([]);
  });
});
