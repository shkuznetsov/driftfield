import type { Item } from './types.js';

export interface Link {
  /** Item ids. `a` comes before `b` in the sequence. */
  a: string;
  b: string;
  /** 0.5 for one shared tag, rising to 1. */
  strength: number;
  /** The tags the two items share, in the order of the first item's tags. */
  tags: string[];
}

function shared(a: Item, b: Item): string[] {
  if (!a.tags?.length || !b.tags?.length) return [];
  const other = new Set(b.tags);
  return [...new Set(a.tags)].filter((tag) => other.has(tag));
}

const strengthFor = (count: number) => Math.min(1, 0.5 + 0.25 * (count - 1));

/**
 * The tag lines shown at rest. Each item links to the nearest following items
 * that share a tag, and no item carries more than `cap` lines, so a window in
 * which everything shares a tag stays readable.
 */
export function restLinks(items: Item[], cap: number): Link[] {
  const links: Link[] = [];
  const count = new Array<number>(items.length).fill(0);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length && count[i] < cap; j++) {
      if (count[j] >= cap) continue;
      const tags = shared(items[i], items[j]);
      if (!tags.length) continue;
      links.push({ a: items[i].id, b: items[j].id, strength: strengthFor(tags.length), tags });
      count[i]++;
      count[j]++;
    }
  }
  return links;
}

/** Links from one item to every other item that shares a tag with it. No cap. */
export function emphasisLinks(focus: Item, items: Item[]): Link[] {
  const links: Link[] = [];
  let before = true;
  for (const other of items) {
    if (other.id === focus.id) {
      before = false;
      continue;
    }
    const tags = shared(focus, other);
    if (!tags.length) continue;
    const strength = strengthFor(tags.length);
    links.push(before ? { a: other.id, b: focus.id, strength, tags } : { a: focus.id, b: other.id, strength, tags });
  }
  return links;
}
