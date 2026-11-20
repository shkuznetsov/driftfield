import type { Rect } from '../core/types.js';

export type Side = 'top' | 'bottom' | 'right' | 'left';

const MARGIN = 8;
const ORDER: Side[] = ['top', 'bottom', 'right', 'left'];

/**
 * Works out where a bubble goes relative to an orb: the first side with room,
 * centred on the orb and kept inside the frame.
 */
export function place(
  orb: Rect,
  bubble: { width: number; height: number },
  frame: { width: number; height: number },
  gap = 10,
): { x: number; y: number; side: Side } {
  const room: Record<Side, number> = {
    top: orb.y - gap - MARGIN,
    bottom: frame.height - (orb.y + orb.height) - gap - MARGIN,
    right: frame.width - (orb.x + orb.width) - gap - MARGIN,
    left: orb.x - gap - MARGIN,
  };
  const needs = (side: Side) => (side === 'top' || side === 'bottom' ? bubble.height : bubble.width);

  let side = ORDER.find((s) => room[s] >= needs(s));
  if (!side) side = ORDER.reduce((best, s) => (room[s] - needs(s) > room[best] - needs(best) ? s : best), ORDER[0]);

  let x: number;
  let y: number;
  if (side === 'top' || side === 'bottom') {
    x = orb.x + orb.width / 2 - bubble.width / 2;
    y = side === 'top' ? orb.y - gap - bubble.height : orb.y + orb.height + gap;
  } else {
    y = orb.y + orb.height / 2 - bubble.height / 2;
    x = side === 'left' ? orb.x - gap - bubble.width : orb.x + orb.width + gap;
  }

  const fit = (value: number, size: number, limit: number) =>
    Math.max(MARGIN, Math.min(value, Math.max(MARGIN, limit - size - MARGIN)));
  return { x: fit(x, bubble.width, frame.width), y: fit(y, bubble.height, frame.height), side };
}
