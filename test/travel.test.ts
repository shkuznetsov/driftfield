import { describe, expect, it } from 'vitest';
import { Travel } from '../src/core/travel';

const run = (t: Travel, seconds: number, max: number, elastic: boolean, each?: () => void) => {
  for (let i = 0; i < seconds / 0.016; i++) {
    t.step(0.016, max, elastic);
    each?.();
  }
};

describe('Travel', () => {
  it('moves about one item per unit pushed and comes to rest', () => {
    const t = new Travel();
    t.push(1);
    run(t, 2, 10, true);
    expect(t.position).toBeGreaterThan(0.8);
    expect(t.position).toBeLessThan(1.2);
    expect(Math.abs(t.velocity)).toBeLessThan(0.01);
  });

  it('resists and springs back at an elastic limit', () => {
    const t = new Travel();
    t.jumpTo(10);
    run(t, 2, 10, true);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      t.push(2);
      t.step(0.016, 10, true);
      peak = Math.max(peak, t.position);
    }
    expect(peak).toBeLessThanOrEqual(10.6 + 1e-6);
    expect(peak).toBeGreaterThan(10);
    run(t, 2, 10, true);
    expect(Math.abs(t.position - 10)).toBeLessThan(0.01);
  });

  it('stops dead at a hard limit', () => {
    const t = new Travel();
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      t.push(2);
      t.step(0.016, 10, false);
      peak = Math.max(peak, t.position);
    }
    expect(peak).toBeLessThanOrEqual(10);
  });

  it('springs back from before the top', () => {
    const t = new Travel();
    for (let i = 0; i < 20; i++) {
      t.push(-2);
      t.step(0.016, 10, false);
    }
    expect(t.position).toBeGreaterThanOrEqual(-0.6 - 1e-6);
    run(t, 2, 10, false);
    expect(Math.abs(t.position)).toBeLessThan(0.01);
  });

  it('eases to a jump target', () => {
    const t = new Travel();
    t.jumpTo(7);
    run(t, 2, 10, true);
    expect(Math.abs(t.position - 7)).toBeLessThan(0.05);
  });

  it('survives a very long frame', () => {
    const t = new Travel();
    t.push(3);
    t.step(5, 10, true);
    expect(Number.isFinite(t.position)).toBe(true);
    expect(t.position).toBeLessThan(4);
  });

  it('resets', () => {
    const t = new Travel();
    t.push(5);
    t.step(0.016, 10, true);
    t.reset();
    expect(t.position).toBe(0);
    expect(t.velocity).toBe(0);
  });
});
