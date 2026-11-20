import { describe, expect, it } from 'vitest';
import { PressRecogniser } from '../src/graph/press';

const make = () => new PressRecogniser({ holdMs: 250, dragPx: 6 });

describe('PressRecogniser', () => {
  it('activates on a quick press and release', () => {
    const p = make();
    p.down(10, 10, 0);
    expect(p.tick(100)).toBeNull();
    expect(p.up(100)).toBe('activate');
    expect(p.state).toBe('idle');
  });

  it('turns into a hold and then never activates', () => {
    const p = make();
    p.down(10, 10, 0);
    expect(p.tick(300)).toBe('hold');
    expect(p.tick(400)).toBeNull();
    expect(p.up(500)).toBe('end');
  });

  it('starts a drag on movement and never activates', () => {
    const p = make();
    p.down(10, 10, 0);
    expect(p.move(20, 10, 50)).toBe('dragstart');
    expect(p.move(40, 10, 60)).toBeNull();
    expect(p.state).toBe('dragging');
    expect(p.up(100)).toBe('end');
  });

  it('ignores a small wobble', () => {
    const p = make();
    p.down(10, 10, 0);
    expect(p.move(13, 10, 50)).toBeNull();
    expect(p.up(100)).toBe('activate');
  });

  it('can drag after holding', () => {
    const p = make();
    p.down(10, 10, 0);
    p.tick(300);
    expect(p.move(30, 10, 350)).toBe('dragstart');
    expect(p.tick(900)).toBeNull();
  });

  it('never activates after a cancel', () => {
    const p = make();
    p.down(10, 10, 0);
    p.cancel();
    expect(p.state).toBe('idle');
    expect(p.up(50)).toBe('end');
  });
});
