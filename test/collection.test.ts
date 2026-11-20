import { describe, expect, it, vi } from 'vitest';
import { Collection } from '../src/core/collection';
import type { Item, LoadMoreResult } from '../src/core/types';

const make = (n: number, from = 0): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `i${from + i}`, title: `Item ${from + i}` }));

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Collection window', () => {
  it('returns the first window at position 0', () => {
    const c = new Collection({ windowSize: 20, floorSize: 5 });
    c.setItems(make(50), false);
    const w = c.windowAt(0);
    expect(w.map((e) => e.index)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(w[0].depth).toBe(0);
    expect(w[19].depth).toBe(19);
  });

  it('keeps an orb that is flying through', () => {
    const c = new Collection({ windowSize: 20, floorSize: 5 });
    c.setItems(make(50), false);
    const w = c.windowAt(3.5);
    expect(w[0].index).toBe(3);
    expect(w[0].depth).toBe(-0.5);
    expect(w[w.length - 1].index).toBe(23);
  });

  it('computes the travel limit from the floor size', () => {
    const c = new Collection({ windowSize: 20, floorSize: 5 });
    c.setItems(make(50), true);
    expect(c.maxPosition()).toBe(45);
    c.setItems(make(3), true);
    expect(c.maxPosition()).toBe(0);
    c.setItems([], true);
    expect(c.maxPosition()).toBe(0);
  });

  it('reports the floor only once the collection has ended', () => {
    const c = new Collection({ windowSize: 20, floorSize: 5 });
    c.setItems(make(50), false);
    expect(c.atFloor(c.maxPosition())).toBe(false);
    c.setItems(make(50), true);
    expect(c.atFloor(c.maxPosition())).toBe(true);
    expect(c.atFloor(10)).toBe(false);
  });

  it('handles an empty ended list', () => {
    const c = new Collection({ windowSize: 20, floorSize: 5 });
    c.setItems([], true);
    expect(c.windowAt(0)).toEqual([]);
    expect(c.atFloor(0)).toBe(true);
  });

  it('drops duplicate ids, first one wins', () => {
    const c = new Collection({ windowSize: 20, floorSize: 5 });
    c.setItems([{ id: 'a', title: 'first' }, { id: 'a', title: 'second' }, { id: 'b', title: 'b' }], true);
    expect(c.items.map((i) => i.title)).toEqual(['first', 'b']);
    expect(c.indexOf('b')).toBe(1);
    expect(c.indexOf('zz')).toBe(-1);
  });
});

describe('Collection loading', () => {
  it('requests more once, appends the result and notifies', async () => {
    const d = deferred<LoadMoreResult>();
    const loadMore = vi.fn(() => d.promise);
    const c = new Collection({ windowSize: 20, floorSize: 5, loadMore });
    const changed = vi.fn();
    c.setItems(make(50), false);
    c.onChange = changed;
    c.ensureAhead(15);
    c.ensureAhead(15);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(loadMore).toHaveBeenCalledWith({ after: 'i49', count: 20 });
    d.resolve({ items: [...make(30, 50), { id: 'i10', title: 'dup' }], end: false });
    await flush();
    expect(c.items.length).toBe(80);
    expect(changed).toHaveBeenCalled();
  });

  it('does not request when far from the delivered edge', () => {
    const loadMore = vi.fn(() => new Promise<LoadMoreResult>(() => {}));
    const c = new Collection({ windowSize: 20, floorSize: 5, loadMore });
    c.setItems(make(100), false);
    c.ensureAhead(0);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('retries a rejection only when asked to, not on every call', async () => {
    const loadMore = vi
      .fn<() => Promise<LoadMoreResult>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: make(10, 50), end: true });
    const c = new Collection({ windowSize: 20, floorSize: 5, loadMore });
    c.setItems(make(50), false);
    c.ensureAhead(40);
    await flush();
    expect(c.items.length).toBe(50);
    expect(c.ended).toBe(false);
    c.ensureAhead(40);
    c.ensureAhead(40);
    expect(loadMore).toHaveBeenCalledTimes(1);
    c.retry();
    c.ensureAhead(40);
    await flush();
    expect(loadMore).toHaveBeenCalledTimes(2);
    expect(c.items.length).toBe(60);
    expect(c.ended).toBe(true);
  });

  it('does not hammer a host that throws, or answers with nothing new or nonsense', async () => {
    const answers: unknown[] = [undefined, { items: [], end: false }, { items: 'nope', end: false }, { items: make(5, 0), end: false }];
    for (const answer of answers) {
      const loadMore = vi.fn(async () => answer as LoadMoreResult);
      const c = new Collection({ windowSize: 20, floorSize: 5, loadMore });
      c.setItems(make(50), false);
      for (let i = 0; i < 5; i++) {
        c.ensureAhead(40);
        await flush();
      }
      expect(loadMore).toHaveBeenCalledTimes(1);
      expect(c.items.length).toBe(50);
    }
    const thrower = vi.fn(() => {
      throw new Error('sync');
    });
    const c = new Collection({ windowSize: 20, floorSize: 5, loadMore: thrower as never });
    c.setItems(make(50), false);
    for (let i = 0; i < 5; i++) {
      c.ensureAhead(40);
      await flush();
    }
    expect(thrower).toHaveBeenCalledTimes(1);
  });

  it('waits for the first delivery before asking for more', () => {
    const loadMore = vi.fn(() => new Promise<LoadMoreResult>(() => {}));
    const c = new Collection({ windowSize: 20, floorSize: 5, loadMore });
    c.ensureAhead(0);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('accepts ids that are not strings', () => {
    const c = new Collection({ windowSize: 20, floorSize: 5 });
    c.setItems([{ id: 5, title: 'five' }, { id: 6, title: 'six' }] as never, true);
    expect(c.items.map((i) => i.id)).toEqual(['5', '6']);
    expect(c.indexOf('6')).toBe(1);
  });

  it('never shows the floor while a request hangs', () => {
    const c = new Collection({ windowSize: 20, floorSize: 5, loadMore: () => new Promise(() => {}) });
    c.setItems(make(50), false);
    c.ensureAhead(45);
    expect(c.atFloor(c.maxPosition())).toBe(false);
  });

  it('discards a response that arrives after the list was replaced', async () => {
    const d = deferred<LoadMoreResult>();
    const c = new Collection({ windowSize: 20, floorSize: 5, loadMore: () => d.promise });
    c.setItems(make(50), false);
    c.ensureAhead(40);
    c.setItems([{ id: 'x', title: 'x' }], true);
    d.resolve({ items: make(30, 50), end: false });
    await flush();
    expect(c.items.map((i) => i.id)).toEqual(['x']);
    expect(c.ended).toBe(true);
  });

  it('asks from the start when the first list is empty and not ended', () => {
    const loadMore = vi.fn(() => new Promise<LoadMoreResult>(() => {}));
    const c = new Collection({ windowSize: 20, floorSize: 5, loadMore });
    c.setItems([], false);
    c.ensureAhead(0);
    expect(loadMore).toHaveBeenCalledWith({ after: null, count: 20 });
  });
});
