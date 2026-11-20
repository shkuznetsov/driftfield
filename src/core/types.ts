import type { Config } from './config.js';

/** One entry in the collection. Only the fields below are read; anything else passes through untouched. */
export interface Item {
  /**
   * Unique within the list. A number is accepted and converted to a string
   * once, so items that come back in events always carry a string id.
   */
  id: string;
  title: string;
  image?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface LoadMoreRequest {
  /** Id of the last delivered item, or null when nothing has been delivered. */
  after: string | null;
  /** How many items the cloud would like. A hint, not a contract. */
  count: number;
}

export interface LoadMoreResult {
  items: Item[];
  /** True when the collection has no more items after these. */
  end: boolean;
}

export type LoadMore = (request: LoadMoreRequest) => Promise<LoadMoreResult>;

/** A box in pixels, relative to the top-left corner of the cloud. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every number in `Config` is optional here. See `config.ts` for what each one does and its default. */
export interface CloudOptions extends Partial<Config> {
  /** Called when the cloud needs items further down the collection. */
  loadMore?: LoadMore;
}

export interface CloudEvents {
  /** A quick press and release on an orb. */
  activate: { item: Item };
  /** An orb is hovered (mouse) or held (touch). The host may show brief information. */
  focus: { item: Item; rect: Rect; source: 'hover' | 'hold' };
  /** The focused orb moved on screen. */
  move: { item: Item; rect: Rect };
  /** The orb is no longer focused. */
  blur: { item: Item };
  /** The travel position changed. Position is measured in items from the top. */
  travel: { position: number; atFloor: boolean };
}
