import type { Item, Rect } from '../core/types.js';
import type { Cloud } from '../graph/cloud.js';
import { place } from './placement.js';

export { place } from './placement.js';
export type { Side } from './placement.js';

export interface BubbleOptions {
  /**
   * Fills the bubble for an item. The bubble is for brief, display-only
   * information: it takes no pointer input and closes as soon as the orb
   * loses focus.
   */
  render: (item: Item, element: HTMLElement) => void;
  /** Space between the orb and the bubble in pixels. Default 10. */
  gap?: number;
}

/**
 * Optional companion to the cloud. It creates one empty bubble element,
 * places it next to the focused orb and hands it to the host to fill. It sets
 * only position, visibility and a `data-side` attribute; everything else about
 * the bubble's look belongs to the host, through the `driftfield-bubble` class.
 */
export function attach(cloud: Cloud, options: BubbleOptions): { detach(): void; readonly element: HTMLElement } {
  const element = document.createElement('div');
  element.className = 'driftfield-bubble';
  Object.assign(element.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    zIndex: '10',
    pointerEvents: 'none',
    visibility: 'hidden',
  });
  element.setAttribute('role', 'tooltip');
  cloud.root.appendChild(element);

  let width = 0;
  let height = 0;

  const position = (rect: Rect) => {
    const frame = { width: cloud.root.clientWidth, height: cloud.root.clientHeight };
    const spot = place(rect, { width, height }, frame, options.gap);
    element.style.transform = `translate3d(${spot.x.toFixed(1)}px,${spot.y.toFixed(1)}px,0)`;
    element.dataset.side = spot.side;
  };

  const offs = [
    cloud.on('focus', ({ item, rect }) => {
      element.replaceChildren();
      options.render(item, element);
      width = element.offsetWidth;
      height = element.offsetHeight;
      position(rect);
      element.style.visibility = 'visible';
      element.classList.add('is-visible');
    }),
    cloud.on('move', ({ rect }) => position(rect)),
    cloud.on('blur', () => {
      element.style.visibility = 'hidden';
      element.classList.remove('is-visible');
    }),
  ];

  return {
    element,
    detach() {
      for (const off of offs) off();
      element.remove();
    },
  };
}
