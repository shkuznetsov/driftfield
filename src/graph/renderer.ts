import type { Item } from '../core/types.js';
import type { Projected } from './projection.js';

export interface OrbFrame {
  item: Item;
  /** Centre, in pixels from the top-left of the cloud. */
  x: number;
  y: number;
  /** Radius in pixels as drawn. */
  r: number;
  p: Projected;
  /** Connected to the focused orb. */
  lit: boolean;
  focused: boolean;
}

export interface LineFrame {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
  lit: boolean;
  /** Tag names to show on a lit line, empty for none. */
  label: string;
  /** Where the label sits: the middle of the part of the line between the two orbs. */
  lx: number;
  ly: number;
}

export interface FrameData {
  width: number;
  height: number;
  orbs: OrbFrame[];
  lines: LineFrame[];
  /** 0 to 1: how strongly the end-of-collection backdrop shows. */
  floor: number;
  /** 0 to 1: depth blur intensity chosen by the host. */
  blur: number;
  /** Text size of the labels on lit lines, in pixels. 0 shows none. */
  labelSize: number;
  /** Title settings, see `Config`. */
  title: { ratio: number; size: number; minSize: number; width: number; lines: number; hideScale: number };
}

/**
 * Everything the cloud needs from a drawing surface. The simulation and the
 * travel logic only ever talk to this interface, so the page-element renderer
 * can be replaced, for example by a WebGL one.
 */
export interface Renderer {
  /** Element that fills the host's container and receives input. */
  readonly root: HTMLElement;
  render(frame: FrameData): void;
  /** Maps an event target to the id of the orb it belongs to. */
  itemIdAt(target: EventTarget | null): string | null;
  destroy(): void;
}
