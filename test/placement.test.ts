import { describe, expect, it } from 'vitest';
import { place } from '../src/overlay/placement';

const frame = { width: 800, height: 600 };
const bubble = { width: 200, height: 100 };

describe('place', () => {
  it('prefers the top, centred on the orb', () => {
    const p = place({ x: 350, y: 250, width: 100, height: 100 }, bubble, frame);
    expect(p.side).toBe('top');
    expect(p.x).toBe(300);
    expect(p.y).toBe(250 - 10 - 100);
  });

  it('goes below when there is no room above', () => {
    const p = place({ x: 350, y: 20, width: 100, height: 100 }, bubble, frame);
    expect(p.side).toBe('bottom');
    expect(p.y).toBe(130);
  });

  it('stays inside the frame in a corner', () => {
    const p = place({ x: 0, y: 0, width: 80, height: 80 }, bubble, frame);
    expect(p.x).toBeGreaterThanOrEqual(8);
    expect(p.y).toBeGreaterThanOrEqual(8);
  });

  it('goes to the side for an orb that fills the height', () => {
    const p = place({ x: 100, y: 20, width: 560, height: 560 }, { width: 120, height: 100 }, frame);
    expect(p.side).toBe('right');
  });

  it('returns finite numbers when nothing fits', () => {
    const p = place({ x: 10, y: 10, width: 50, height: 50 }, { width: 2000, height: 2000 }, frame);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
