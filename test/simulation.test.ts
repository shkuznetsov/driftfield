import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../src/core/config';
import { shownX, Simulation, type Body } from '../src/graph/simulation';

const body = (id: string, hx: number, hy: number, depth = 0): Body => ({
  id, x: hx, y: hy, vx: 0, vy: 0, hx, hy, r: 30, depth, walls: true, phase: 0.3,
});

const sim = () => {
  const s = new Simulation();
  s.bounds = { width: 800, height: 600 };
  s.motion = false;
  return s;
};

const run = (s: Simulation, seconds: number, each?: () => void) => {
  let t = 0;
  for (let i = 0; i < seconds / 0.016; i++) {
    t += 0.016;
    s.step(0.016, t);
    each?.();
  }
};

const dist = (b: Body) => Math.hypot(b.x - b.hx, b.y - b.hy);

describe('Simulation', () => {
  it('returns a displaced body to its home', () => {
    const s = sim();
    const a = body('a', 400, 300);
    a.x = 600;
    s.bodies.set('a', a);
    run(s, 4);
    expect(dist(a)).toBeLessThan(1);
  });

  it('keeps a thrown body inside the walls', () => {
    const s = sim();
    const a = body('a', 400, 300);
    a.vx = 5000;
    a.vy = -3000;
    s.bodies.set('a', a);
    run(s, 3, () => {
      expect(a.x).toBeGreaterThanOrEqual(a.r - 0.001);
      expect(a.x).toBeLessThanOrEqual(800 - a.r + 0.001);
      expect(a.y).toBeGreaterThanOrEqual(a.r - 0.001);
      expect(a.y).toBeLessThanOrEqual(600 - a.r + 0.001);
    });
  });

  const dragScenario = (emphasised: boolean) => {
    const s = sim();
    const a = body('a', 200, 300);
    const b = body('b', 400, 300, 3);
    const c = body('c', 400, 100, 6);
    s.bodies.set('a', a).set('b', b).set('c', c);
    s.links = [{ a, b, strength: 1, emphasised }];
    s.grab(a, 200, 300);
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 0.016;
      s.dragTo(200 - Math.min(300, i * 5) + 100 - 100, 300 + Math.min(250, i * 5), 0.016);
      s.step(0.016, t);
    }
    return { b: dist(b), c: dist(c) };
  };

  it('pulls a tagged neighbour hard when the link is emphasised', () => {
    const r = dragScenario(true);
    expect(r.b).toBeGreaterThan(40);
    expect(r.c).toBeLessThan(5);
  });

  it('pulls less when the link is not emphasised', () => {
    expect(dragScenario(false).b).toBeLessThan(dragScenario(true).b);
  });

  it('does not move a hovered orb that is not being dragged', () => {
    const s = sim();
    const a = body('a', 200, 300);
    const b = body('b', 500, 300, 3);
    s.bodies.set('a', a).set('b', b);
    s.links = [{ a, b, strength: 1, emphasised: true }];
    run(s, 2);
    expect(dist(a)).toBeLessThan(1);
    expect(dist(b)).toBeLessThan(1);
  });

  it('keeps momentum on release, then settles', () => {
    const s = sim();
    const a = body('a', 400, 300);
    s.bodies.set('a', a);
    s.grab(a, 400, 300);
    let x = 400;
    for (let i = 0; i < 10; i++) {
      x += 800 * 0.016;
      s.dragTo(x, 300, 0.016);
      s.step(0.016, i * 0.016);
    }
    const before = a.x;
    s.release();
    s.step(0.016, 1);
    expect(a.x).toBeGreaterThan(before);
  });

  it('leaves a dragged body where it was put and returns it slowly', () => {
    const s = sim();
    const a = body('a', 400, 300);
    s.bodies.set('a', a);
    s.grab(a, 400, 300);
    s.dragTo(600, 300, 0.016);
    s.dragTo(600, 300, 5);
    s.release();
    run(s, 4);
    expect(dist(a)).toBeGreaterThan(140);
    run(s, 26);
    expect(dist(a)).toBeGreaterThan(15);
    expect(dist(a)).toBeLessThan(60);
    run(s, 40);
    expect(dist(a)).toBeLessThan(5);
  });

  it('does not tug a parked body back when its lines are emphasised', () => {
    const s = sim();
    const a = body('a', 400, 300);
    const b = body('b', 200, 300, 3);
    s.bodies.set('a', a).set('b', b);
    s.grab(a, 400, 300);
    s.dragTo(650, 300, 5);
    s.release();
    run(s, 2);
    const parked = a.x;
    s.links = [{ a, b, strength: 1, emphasised: true }];
    run(s, 0.5);
    expect(Math.abs(a.x - parked)).toBeLessThan(12);
  });

  it('lets each body wander on its own without moving its neighbours', () => {
    const s = new Simulation();
    s.bounds = { width: 800, height: 600 };
    const bodies = Array.from({ length: 6 }, (_, i) => ({ ...body(`b${i}`, 100 + i * 120, 300, i * 3), phase: (i * 0.37 + 0.11) % 1 }));
    for (const b of bodies) s.bodies.set(b.id, b);
    s.links = bodies.slice(1).map((b, i) => ({ a: bodies[i], b, strength: 1, emphasised: false }));
    const xs: number[][] = bodies.map(() => []);
    let t = 0;
    for (let i = 0; i < 4000; i++) {
      t += 0.016;
      s.step(0.016, t);
      if (i % 20 === 0) bodies.forEach((b, k) => xs[k].push(shownX(b) - b.hx));
    }
    // The wander is visible, and stays out of the physics.
    for (const b of bodies) expect(dist(b)).toBeLessThan(0.01);
    for (const x of xs) expect(Math.max(...x) - Math.min(...x)).toBeGreaterThan(4);
    // No shared sway: the average movement of the group is far smaller than one body's.
    const mean = xs[0].map((_, i) => xs.reduce((sum, x) => sum + x[i], 0) / xs.length);
    const spread = (v: number[]) => Math.sqrt(v.reduce((sum, n) => sum + n * n, 0) / v.length);
    expect(spread(mean)).toBeLessThan(0.6 * spread(xs[0]));
  });

  it('does not jump when a wandering body is picked up', () => {
    const s = new Simulation();
    s.bounds = { width: 800, height: 600 };
    const a = body('a', 400, 300);
    s.bodies.set('a', a);
    for (let i = 0; i < 200; i++) s.step(0.016, i * 0.016);
    const before = shownX(a);
    s.grab(a, before, 300);
    expect(shownX(a)).toBeCloseTo(before, 5);
  });

  it('returns at once when returnSeconds is 0', () => {
    const s = new Simulation({ ...DEFAULTS, returnSeconds: 0 });
    s.bounds = { width: 800, height: 600 };
    s.motion = false;
    const a = body('a', 400, 300);
    s.bodies.set('a', a);
    s.grab(a, 400, 300);
    s.dragTo(600, 300, 5);
    s.release();
    run(s, 4);
    expect(dist(a)).toBeLessThan(1);
  });

  it('separates overlapping bodies at similar depth', () => {
    const s = sim();
    const a = body('a', 400, 300);
    const b = body('b', 410, 300);
    s.bodies.set('a', a).set('b', b);
    run(s, 2);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
  });

  it('produces no NaN with empty bounds', () => {
    const s = sim();
    s.bounds = { width: 0, height: 0 };
    const a = body('a', 0, 0);
    const b = body('b', 0, 0);
    s.bodies.set('a', a).set('b', b);
    s.links = [{ a, b, strength: 1, emphasised: true }];
    run(s, 1.6);
    for (const v of [a.x, a.y, a.vx, a.vy, b.x, b.y]) expect(Number.isFinite(v)).toBe(true);
  });

  it('pulses every body away from the centre', () => {
    const s = sim();
    const a = body('a', 100, 300);
    const b = body('b', 700, 300);
    s.bodies.set('a', a).set('b', b);
    s.pulse();
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });
});
