import type { Item, LoadMore, LoadMoreResult } from './types.js';

export interface WindowEntry {
  item: Item;
  index: number;
  /** Distance behind the viewer in items. Negative while the orb is flying through. */
  depth: number;
}

/**
 * Holds the items delivered so far, works out which are in view for a travel
 * position, and asks the host for more. It has no visual output.
 */
export class Collection {
  items: Item[] = [];
  ended = false;
  /** Assigned by the owner. Called after the list changes. */
  onChange: () => void = () => {};

  private ids = new Map<string, number>();
  private generation = 0;
  private pending = false;
  /** False until the host makes its first delivery. */
  private delivered = false;
  /** Set when a request failed or brought nothing new. Cleared by `retry`. */
  private stalled = false;
  private readonly loadMore?: LoadMore;

  /** `opts` is read live, so the sizes can be changed after creation. */
  constructor(private readonly opts: { windowSize: number; floorSize: number; loadMore?: LoadMore }) {
    this.loadMore = opts.loadMore;
  }

  private get windowSize(): number {
    return this.opts.windowSize;
  }

  private get floorSize(): number {
    return this.opts.floorSize;
  }

  /** Replaces the whole collection. Any request still in flight is ignored when it lands. */
  setItems(items: Item[], end: boolean): void {
    this.generation++;
    this.pending = false;
    this.delivered = true;
    this.stalled = false;
    this.items = [];
    this.ids.clear();
    this.ended = end;
    this.append(items);
    this.onChange();
  }

  /** Furthest travel position: the last `floorSize` items stay in view. */
  maxPosition(): number {
    return Math.max(0, this.items.length - this.floorSize);
  }

  atFloor(position: number): boolean {
    return this.ended && position >= this.maxPosition() - 0.01;
  }

  windowAt(position: number): WindowEntry[] {
    const first = Math.max(0, Math.floor(position - 1) + 1);
    const out: WindowEntry[] = [];
    for (let index = first; index < this.items.length; index++) {
      const depth = index - position;
      if (depth >= this.windowSize) break;
      if (depth > -1) out.push({ item: this.items[index], index, depth });
    }
    return out;
  }

  /** Allows another request after a failed one. Called when the person travels forward again. */
  retry(): void {
    this.stalled = false;
  }

  /**
   * Requests more items when travel is within two windows of the delivered
   * edge. Safe to call every frame: a request that fails or brings nothing new
   * is not repeated until `retry` is called.
   */
  ensureAhead(position: number): void {
    if (!this.delivered || this.ended || this.pending || this.stalled || !this.loadMore) return;
    if (this.items.length - position >= 2 * this.windowSize) return;
    const generation = this.generation;
    const last = this.items[this.items.length - 1];
    this.pending = true;
    let request: Promise<LoadMoreResult>;
    try {
      request = Promise.resolve(this.loadMore({ after: last ? last.id : null, count: this.windowSize }));
    } catch (error) {
      request = Promise.reject(error);
    }
    request.then(
      (result) => {
        if (generation !== this.generation) return;
        this.pending = false;
        const before = this.items.length;
        this.append(Array.isArray(result?.items) ? result.items : []);
        this.ended = !!result?.end;
        // Nothing new and no end: wait for the person to travel forward before asking again.
        if (this.items.length === before && !this.ended) this.stalled = true;
        this.onChange();
      },
      () => {
        if (generation !== this.generation) return;
        this.pending = false;
        this.stalled = true;
      },
    );
  }

  indexOf(id: string): number {
    return this.ids.get(String(id)) ?? -1;
  }

  private append(items: Item[]): void {
    for (const item of items) {
      if (!item || item.id == null) continue;
      // Ids are compared as strings throughout, so a numeric id is converted once here.
      const id = String(item.id);
      if (this.ids.has(id)) continue;
      this.ids.set(id, this.items.length);
      this.items.push(typeof item.id === 'string' ? item : { ...item, id });
    }
  }
}
