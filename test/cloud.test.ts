// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create as createCloud, type Cloud, type CloudOptions, type Item } from '../src/index';

// Orbs pop in over time by default. Most tests want them there at once.
const create = (el: HTMLElement, options?: CloudOptions): Cloud => createCloud(el, { popSeconds: 0, ...options });

const make = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, title: `Item ${i}`, image: `img${i}.png`, tags: [i % 2 ? 'odd' : 'even'] }));

let clock = 0;
let frame: FrameRequestCallback | null = null;
let container: HTMLElement;
let cloud: Cloud | null = null;

const pump = (frames = 1) => {
  for (let i = 0; i < frames; i++) {
    clock += 16;
    const cb = frame;
    frame = null;
    cb?.(clock);
  }
};

const size = (el: HTMLElement, width: number, height: number) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
};

const pointer = (el: Element, type: string, init: Record<string, unknown> = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0, button: 0, ...init });
  el.dispatchEvent(event);
};

const orbs = () => [...container.querySelectorAll<HTMLElement>('.driftfield-orb')];
const orb = (id: string) => container.querySelector<HTMLElement>(`.driftfield-orb[data-id="${id}"]`);

beforeEach(() => {
  clock = 0;
  frame = null;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frame = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frame = null;
  });
  container = document.createElement('div');
  size(container, 800, 600);
  document.body.appendChild(container);
});

afterEach(() => {
  cloud?.destroy();
  cloud = null;
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('create', () => {
  it('renders the empty space before any items exist', () => {
    cloud = create(container);
    pump(3);
    expect(container.querySelectorAll('.driftfield').length).toBe(1);
    expect(orbs().length).toBe(0);
  });

  it('shows one window of orbs once items are delivered', () => {
    cloud = create(container);
    cloud.setItems(make(50), { end: true });
    pump();
    expect(orbs().length).toBe(20);
    expect(orb('i0')?.getAttribute('aria-label')).toBe('Item 0');
  });

  it('travels on the wheel and removes orbs that were flown through', () => {
    cloud = create(container);
    const travel = vi.fn();
    cloud.on('travel', travel);
    cloud.setItems(make(50), { end: true });
    pump();
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(wheel, { deltaY: 300, deltaMode: 0 });
    cloud.root.dispatchEvent(wheel);
    pump(120);
    const last = travel.mock.calls[travel.mock.calls.length - 1][0];
    expect(last.position).toBeGreaterThan(2);
    expect(last.atFloor).toBe(false);
    expect(orb('i0')).toBeNull();
    expect(wheel.defaultPrevented).toBe(true);
  });

  it('activates on a quick press and not after a hold', () => {
    cloud = create(container);
    const activate = vi.fn();
    cloud.on('activate', activate);
    cloud.setItems(make(50), { end: true });
    pump();
    const target = orb('i0')!;
    pointer(target, 'pointerdown');
    pump(3);
    pointer(target, 'pointerup');
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate.mock.calls[0][0].item.id).toBe('i0');

    pointer(target, 'pointerdown');
    pump(25);
    pointer(target, 'pointerup');
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('reports focus with a rectangle on hover and on a touch hold', () => {
    cloud = create(container);
    const focus = vi.fn();
    const blur = vi.fn();
    cloud.on('focus', focus);
    cloud.on('blur', blur);
    cloud.setItems(make(50), { end: true });
    pump();
    pointer(orb('i1')!, 'pointerover');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0][0].source).toBe('hover');
    expect(focus.mock.calls[0][0].rect.width).toBeGreaterThan(0);
    pump();
    expect(orb('i1')!.classList.contains('is-focused')).toBe(true);
    expect(orbs().some((o) => o.classList.contains('is-lit'))).toBe(true);
    pointer(cloud.root, 'pointerover');
    expect(blur).toHaveBeenCalledTimes(1);

    pointer(orb('i2')!, 'pointerdown', { pointerType: 'touch' });
    expect(focus).toHaveBeenCalledTimes(1);
    pump(25);
    expect(focus).toHaveBeenCalledTimes(2);
    expect(focus.mock.calls[1][0].source).toBe('hold');
    pointer(orb('i2')!, 'pointerup', { pointerType: 'touch' });
    expect(blur).toHaveBeenCalledTimes(2);
  });

  it('pops the orbs of a new list in one after another, first item first', () => {
    cloud = create(container, { popSeconds: 0.5, popStagger: 0.1 });
    cloud.setItems(make(5), { end: true });
    pump(2);
    expect(orbs().map((o) => o.dataset.id)).toEqual(['i0']);
    pump(7); // about 0.11 s after the first frame
    expect(orbs().map((o) => o.dataset.id)).toEqual(['i0', 'i1']);
    pump(80);
    expect(orbs().length).toBe(5);
  });

  it('drops the click that follows an activation, and only that one', () => {
    cloud = create(container);
    cloud.setItems(make(50), { end: true });
    pump();
    const clicked = vi.fn();
    document.body.addEventListener('click', clicked);
    pointer(orb('i0')!, 'pointerdown', { pointerType: 'touch' });
    pump(2);
    pointer(orb('i0')!, 'pointerup', { pointerType: 'touch' });
    document.body.dispatchEvent(new Event('click', { bubbles: true }));
    expect(clicked).not.toHaveBeenCalled();
    document.body.dispatchEvent(new Event('click', { bubbles: true }));
    expect(clicked).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('click', clicked);
  });

  it('recovers when a finger lifts outside the cloud', () => {
    cloud = create(container);
    const activate = vi.fn();
    cloud.on('activate', activate);
    cloud.setItems(make(50), { end: true });
    pump();
    pointer(orb('i0')!, 'pointerdown', { pointerType: 'touch', pointerId: 5 });
    pump(30);
    pointer(document.body, 'pointerup', { pointerType: 'touch', pointerId: 5 });
    pointer(orb('i0')!, 'pointerdown', { pointerType: 'touch', pointerId: 6 });
    pump(2);
    pointer(orb('i0')!, 'pointerup', { pointerType: 'touch', pointerId: 6 });
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('ignores options passed as undefined', () => {
    cloud = create(container, { windowSize: undefined, holdMs: undefined });
    const activate = vi.fn();
    cloud.on('activate', activate);
    cloud.setItems(make(50), { end: true });
    pump();
    expect(orbs().length).toBe(20);
    pointer(orb('i0')!, 'pointerdown');
    pump(2);
    pointer(orb('i0')!, 'pointerup');
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('does not ask for more before the first delivery', () => {
    const loadMore = vi.fn(() => new Promise<never>(() => {}));
    cloud = create(container, { loadMore });
    pump(5);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('can be reconfigured while running', () => {
    cloud = create(container, { windowSize: 12 });
    cloud.setItems(make(50), { end: true });
    pump();
    expect(orbs().length).toBe(12);
    cloud.configure({ windowSize: 8, returnSeconds: 10, damping: -3 });
    pump();
    expect(orbs().length).toBe(8);
    expect(cloud.getConfig().returnSeconds).toBe(10);
    expect(cloud.getConfig().damping).toBe(5);
  });

  it('never empties a short list', () => {
    cloud = create(container);
    cloud.setItems(make(3), { end: true });
    pump();
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(wheel, { deltaY: 5000, deltaMode: 0 });
    cloud.root.dispatchEvent(wheel);
    pump(120);
    expect(orbs().length).toBe(3);
  });

  it('survives a container with no size', () => {
    size(container, 0, 0);
    cloud = create(container);
    cloud.setItems(make(30), { end: true });
    pump(10);
    expect(orbs().length).toBe(20);
    for (const o of orbs()) expect(o.style.transform).not.toContain('NaN');
  });

  it('renders an item without an image', () => {
    cloud = create(container);
    cloud.setItems([{ id: 'a', title: 'No picture' }], { end: true });
    pump();
    expect(orb('a')!.querySelector('img')).toBeNull();
  });

  it('starts again from the top when given a new list', () => {
    cloud = create(container);
    cloud.setItems(make(50), { end: true });
    pump();
    cloud.travelTo('i10');
    pump(200);
    expect(orb('i0')).toBeNull();
    cloud.setItems([{ id: 'x', title: 'X' }], { end: true });
    pump();
    expect(orbs().map((o) => o.dataset.id)).toEqual(['x']);
  });

  it('removes its styles and restores the container when the last cloud is destroyed', () => {
    const other = document.createElement('div');
    size(other, 400, 300);
    document.body.appendChild(other);
    cloud = create(container);
    const second = create(other);
    expect(container.style.position).toBe('relative');
    cloud.destroy();
    cloud = null;
    expect(container.style.position).toBe('');
    expect(document.getElementById('driftfield-styles')).not.toBeNull();
    second.destroy();
    other.remove();
    expect(document.getElementById('driftfield-styles')).toBeNull();
  });

  it('keeps a position the host set on the container', () => {
    container.style.position = 'absolute';
    cloud = create(container);
    cloud.destroy();
    cloud = null;
    expect(container.style.position).toBe('absolute');
  });

  it('shows the end backdrop at once for a list that needs no travel', () => {
    cloud = create(container);
    cloud.setItems(make(3), { end: true });
    pump(200);
    expect(Number(container.querySelector<HTMLElement>('.driftfield-floor')!.style.opacity || 0)).toBeGreaterThan(0.9);
  });

  it('cleans up on destroy', () => {
    cloud = create(container);
    cloud.setItems(make(5), { end: true });
    pump();
    cloud.destroy();
    expect(container.querySelector('.driftfield')).toBeNull();
    expect(() => pump(3)).not.toThrow();
    cloud = null;
  });
});
