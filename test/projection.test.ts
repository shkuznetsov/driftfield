import { popFactor } from '../src/graph/projection';
import { describe, expect, it } from 'vitest';
import { popFactor } from '../src/graph/projection';
import { baseRadius, hash01, homeNorm, project } from '../src/graph/projection';

describe('project', () => {
  it('shrinks by ten per cent per step', () => {
    expect(project(0, 20).scale).toBe(1);
    expect(project(1, 20).scale).toBeCloseTo(0.9);
    expect(project(2, 20).scale).toBeCloseTo(0.81);
  });

  it('blurs and dims with depth', () => {
    expect(project(0, 20).blur).toBe(0);
    expect(project(12, 20).blur).toBe(1);
    expect(project(10, 20).dim).toBeCloseTo(0.5);
    expect(project(19, 20).dim).toBe(0.75);
  });

  it('stops input the moment the fly-through starts', () => {
    expect(project(0, 20).interactive).toBe(true);
    expect(project(-0.01, 20).interactive).toBe(false);
  });

  it('expands and fades while flying through', () => {
    const p = project(-0.5, 20);
    expect(p.opacity).toBeCloseTo(0.5);
    expect(p.scale).toBeCloseTo(2.25);
    expect(p.spread).toBeCloseTo(1.75);
    expect(project(0, 20).spread).toBe(1);
    expect(project(40, 20).spread).toBeGreaterThan(0.74);
  });

  it('fades in at the back', () => {
    expect(project(19.5, 20).opacity).toBeCloseTo(0.5);
    expect(project(19, 20).opacity).toBe(1);
  });

  it('orders nearer orbs on top', () => {
    expect(project(1, 20).z).toBeGreaterThan(project(2, 20).z);
    expect(project(-0.5, 20).z).toBeGreaterThan(project(0, 20).z);
  });
});

describe('homeNorm', () => {
  it('is stable and inside the frame', () => {
    const a = homeNorm(7, 'a');
    expect(homeNorm(7, 'a')).toEqual(a);
    for (let i = 0; i < 200; i++) {
      const h = homeNorm(i, `id-${i}`);
      expect(Math.abs(h.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(h.y)).toBeLessThanOrEqual(1);
    }
  });
});

describe('homeNorm spread', () => {
  it('covers the whole frame for any run of twenty items', () => {
    for (const start of [0, 37, 250]) {
      const points = Array.from({ length: 20 }, (_, i) => homeNorm(start + i, `item-${start + i}`));
      const cell = new Set(points.map((p) => `${Math.min(2, Math.floor((p.x + 1) * 1.5))}${Math.min(2, Math.floor((p.y + 1) * 1.5))}`));
      // Every cell of a three by three grid holds at least one orb.
      expect(cell.size).toBe(9);
      const outer = points.filter((p) => Math.hypot(p.x, p.y) > 0.75).length;
      expect(outer).toBeGreaterThanOrEqual(5);
    }
  });

  it('leaves no empty band at any edge, for twelve or twenty items', () => {
    for (const count of [12, 20]) {
      for (let start = 0; start < 120; start++) {
        const points = Array.from({ length: count }, (_, i) => homeNorm(start + i, `item-${start + i}`));
        for (const axis of ['x', 'y'] as const) {
          const values = points.map((p) => p[axis]);
          // Each axis runs from -1 to 1, so 0.4 is a fifth of the frame.
          expect(1 - Math.max(...values)).toBeLessThan(0.4);
          expect(Math.min(...values) + 1).toBeLessThan(0.4);
        }
      }
    }
  });

  it('gives ids that differ by one character unrelated numbers', () => {
    const values = Array.from({ length: 20 }, (_, i) => hash01(`item-${i}`));
    const low = values.filter((v) => v < 0.5).length;
    expect(low).toBeGreaterThanOrEqual(5);
    expect(low).toBeLessThanOrEqual(15);
  });
});

describe('baseRadius', () => {
  it('never collapses', () => {
    expect(baseRadius(0, 0)).toBe(24);
    expect(baseRadius(1000, 800)).toBeCloseTo(104);
  });
});

describe('popFactor', () => {
  it('is invisible before its turn and settled after', () => {
    expect(popFactor(-0.1, 0.5, 2.4)).toEqual({ opacity: 0, scale: 0 });
    expect(popFactor(0.5, 0.5, 2.4)).toEqual({ opacity: 1, scale: 1 });
    expect(popFactor(0.1, 0, 2.4)).toEqual({ opacity: 1, scale: 1 });
  });

  it('grows past full size and comes back', () => {
    let peak = 0;
    for (let t = 0.01; t < 0.5; t += 0.01) peak = Math.max(peak, popFactor(t, 0.5, 2.4).scale);
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.3);
    expect(popFactor(0.49, 0.5, 2.4).scale).toBeCloseTo(1, 1);
  });

  it('does not overshoot when overshoot is 0', () => {
    for (let t = 0.01; t < 0.5; t += 0.01) expect(popFactor(t, 0.5, 0).scale).toBeLessThanOrEqual(1);
  });
});
