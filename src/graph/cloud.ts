import { Collection } from '../core/collection.js';
import { applyConfig, DEFAULTS, type Config } from '../core/config.js';
import { Emitter } from '../core/emitter.js';
import { emphasisLinks, restLinks } from '../core/links.js';
import { Travel } from '../core/travel.js';
import type { CloudEvents, CloudOptions, Item, Rect } from '../core/types.js';
import { createDomRenderer } from './dom-renderer.js';
import { PressRecogniser } from './press.js';
import { baseRadius, hash01, homeNorm, popFactor, project, type Projected } from './projection.js';
import type { FrameData, LineFrame, OrbFrame, Renderer } from './renderer.js';
import { shownX, shownY, Simulation, type Body, type SimLink } from './simulation.js';

export interface Cloud {
  /**
   * Hands the cloud a list and starts from its top. Call it once the first
   * items are ready, and again with a new list for a filter or a search.
   * `end` says whether the list is complete. It defaults to true when no
   * `loadMore` was given.
   */
  setItems(items: Item[], opts?: { end?: boolean }): void;
  on<K extends keyof CloudEvents>(type: K, fn: (payload: CloudEvents[K]) => void): () => void;
  /** Depth blur intensity, 0 to 1. Shorthand for `configure({ blur })`. */
  setBlur(value: number): void;
  /** Changes any of the tunable numbers while the cloud is running. Invalid values are ignored. */
  configure(changes: Partial<Config>): void;
  /** The numbers currently in use. */
  getConfig(): Config;
  /** Sends a ripple through the cloud. */
  pulse(): void;
  /** Travels to an item that has already been delivered. Unknown ids are ignored. */
  travelTo(itemId: string): void;
  destroy(): void;
  readonly container: HTMLElement;
  /** The element the cloud draws into. Companions may add their own elements to it. */
  readonly root: HTMLElement;
}

interface Entry {
  item: Item;
  index: number;
  depth: number;
  p: Projected;
  body: Body;
  r: number;
}


const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Creates the cloud inside `container`. It returns at once and shows empty space until items arrive. */
export function create(container: HTMLElement, options: CloudOptions = {}): Cloud {
  const opts: Config & { loadMore?: CloudOptions['loadMore'] } = { ...DEFAULTS, loadMore: options.loadMore };
  applyConfig(opts, options);

  const emitter = new Emitter<CloudEvents>();
  const collection = new Collection(opts);
  const travel = new Travel(opts);
  const sim = new Simulation(opts);
  const press = new PressRecogniser(opts);
  const renderer: Renderer = createDomRenderer(container);
  const root = renderer.root;

  let destroyed = false;
  let rafId = 0;
  let lastTime = -1;
  let width = container.clientWidth;
  let height = container.clientHeight;
  let floor = 0;
  let lastPosition = NaN;
  let lastAtFloor = false;

  let entries = new Map<string, Entry>();
  let linkKey = '';
  let simLit = new Set<SimLink>();
  let simLabels = new Map<SimLink, string>();
  let litIds = new Set<string>();
  // Orbs of a new list pop in one after another. Maps an id to the time its turn comes.
  const pops = new Map<string, number>();
  let popPending = false;
  let popping = false;
  let popTurn = 0;
  const popSeen = new Set<string>();
  let clock = 0;

  let focus: { id: string; source: 'hover' | 'hold' } | null = null;
  let lastRect: Rect | null = null;
  let pressing: { pointerId: number; id: string; mouse: boolean; lastMove: number } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDistance = 0;
  let swallowClickUntil = 0;

  const reducedMotion =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const applyMotion = () => {
    sim.motion = !reducedMotion?.matches;
  };
  applyMotion();
  reducedMotion?.addEventListener?.('change', applyMotion);

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(() => {
      width = container.clientWidth;
      height = container.clientHeight;
    });
    observer.observe(container);
  }

  // ---- focus -------------------------------------------------------------

  const rectOf = (e: Entry): Rect => ({ x: shownX(e.body) - e.r, y: shownY(e.body) - e.r, width: 2 * e.r, height: 2 * e.r });

  function setFocus(id: string, source: 'hover' | 'hold'): void {
    if (focus?.id === id) return;
    clearFocus();
    const entry = entries.get(id);
    if (!entry || !entry.p.interactive) return;
    focus = { id, source };
    lastRect = rectOf(entry);
    emitter.emit('focus', { item: entry.item, rect: lastRect, source });
  }

  function clearFocus(): void {
    if (!focus) return;
    const id = focus.id;
    focus = null;
    lastRect = null;
    const item = entries.get(id)?.item ?? collection.items[collection.indexOf(id)];
    if (item) emitter.emit('blur', { item });
  }

  function endPress(): void {
    if (!pressing) return;
    if (sim.dragged) sim.release();
    press.cancel();
    try {
      root.releasePointerCapture?.(pressing.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    pressing = null;
    root.classList.remove('is-dragging');
  }

  // ---- frame -------------------------------------------------------------

  function syncEntries(): void {
    const cx = width / 2;
    const cy = height / 2;
    const base = baseRadius(width, height, opts);
    const next = new Map<string, Entry>();

    for (const w of collection.windowAt(travel.position)) {
      const p = project(w.depth, opts.windowSize, opts);
      const r = base * p.scale;
      const simR = base * Math.min(1, p.scale);
      const home = homeNorm(w.index, w.item.id);
      const hx = cx + home.x * Math.max(0, cx - simR) * p.spread;
      const hy = cy + home.y * Math.max(0, cy - simR) * p.spread;

      let body = sim.bodies.get(w.item.id);
      if (!body) {
        body = { id: w.item.id, x: hx, y: hy, vx: 0, vy: 0, hx, hy, r: simR, depth: w.depth, walls: true, phase: hash01(w.item.id + '~') };
        sim.bodies.set(w.item.id, body);
      }
      body.hx = hx;
      body.hy = hy;
      body.r = simR;
      body.depth = w.depth;
      body.walls = w.depth >= 0;
      next.set(w.item.id, { item: w.item, index: w.index, depth: w.depth, p, body, r });
    }

    for (const id of [...sim.bodies.keys()]) {
      if (next.has(id)) continue;
      if (sim.dragged?.id === id) endPress();
      sim.bodies.delete(id);
    }
    entries = next;

    // An orb that starts to fly through gives up focus, drag and press at once.
    if (pressing && !entries.get(pressing.id)?.p.interactive) endPress();
    if (focus && !entries.get(focus.id)?.p.interactive) clearFocus();
  }

  function syncLinks(): void {
    const ordered = [...entries.values()];
    const key = ordered.map((e) => e.item.id).join('|') + '#' + (focus?.id ?? '');
    if (key === linkKey) return;
    linkKey = key;

    const items = ordered.map((e) => e.item);
    const links = new Map<string, SimLink>();
    const body = (id: string) => entries.get(id)!.body;
    for (const l of restLinks(items, opts.linkCap)) {
      links.set(l.a + '|' + l.b, { a: body(l.a), b: body(l.b), strength: l.strength, emphasised: false });
    }
    simLit = new Set();
    simLabels = new Map();
    litIds = new Set();
    const focused = focus && entries.get(focus.id);
    if (focused) {
      for (const l of emphasisLinks(focused.item, items)) {
        const link: SimLink = { a: body(l.a), b: body(l.b), strength: l.strength, emphasised: true };
        links.set(l.a + '|' + l.b, link);
        simLit.add(link);
        simLabels.set(link, l.tags.join(' \u00b7 '));
        litIds.add(l.a === focused.item.id ? l.b : l.a);
      }
    }
    sim.links = [...links.values()];
  }

  function buildFrame(): FrameData {
    const orbs: OrbFrame[] = [];
    const shown = new Map<string, number>();
    for (const e of entries.values()) {
      let r = e.r;
      let p = e.p;
      const start = pops.get(e.item.id);
      if (start !== undefined) {
        const pop = popFactor(clock - start, opts.popSeconds, opts.popOvershoot);
        if (pop.opacity >= 1 && pop.scale === 1) pops.delete(e.item.id);
        else {
          r = e.r * pop.scale;
          p = { ...e.p, opacity: e.p.opacity * pop.opacity };
          shown.set(e.item.id, pop.opacity);
        }
      }
      orbs.push({
        item: e.item, x: shownX(e.body), y: shownY(e.body), r, p,
        lit: litIds.has(e.item.id), focused: focus?.id === e.item.id,
      });
    }
    const lines: LineFrame[] = [];
    for (const link of sim.links) {
      const a = entries.get(link.a.id);
      const b = entries.get(link.b.id);
      if (!a || !b) continue;
      // Lines sit behind the orbs and fade with depth, like the orbs they join.
      // A line appears with the later of its two orbs.
      const popped = Math.min(shown.get(link.a.id) ?? 1, shown.get(link.b.id) ?? 1);
      const fade = popped * Math.min(a.p.opacity, b.p.opacity) * (1 - 0.6 * Math.max(a.p.dim, b.p.dim));
      const lit = simLit.has(link);
      const x1 = shownX(link.a), y1 = shownY(link.a), x2 = shownX(link.b), y2 = shownY(link.b);
      // The label sits midway along the part of the line that shows between the two orbs.
      const length = Math.hypot(x2 - x1, y2 - y1);
      const along = length > a.r + b.r ? (a.r + (length - a.r - b.r) / 2) / length : 0.5;
      lines.push({
        x1, y1, x2, y2,
        alpha: lit ? popped * Math.min(a.p.opacity, b.p.opacity) : fade * link.strength,
        lit,
        label: (lit && simLabels.get(link)) || '',
        lx: x1 + (x2 - x1) * along, ly: y1 + (y2 - y1) * along,
      });
    }
    return {
      width, height, orbs, lines, floor, blur: clamp01(opts.blur), labelSize: opts.labelSize,
      title: { ratio: opts.titleRatio, size: opts.titleSize, minSize: opts.titleMinSize, width: opts.titleWidth, lines: opts.titleLines, hideScale: opts.titleHideScale },
    };
  }

  function tick(time: number): void {
    if (destroyed) return;
    rafId = requestAnimationFrame(tick);
    const dt = lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;

    if (!observer) {
      width = container.clientWidth;
      height = container.clientHeight;
    }

    travel.step(dt, collection.maxPosition(), collection.ended);
    collection.ensureAhead(travel.position);

    if (pressing && press.tick(now()) === 'hold' && !pressing.mouse) setFocus(pressing.id, 'hold');

    clock = time / 1000;
    syncEntries();
    if (popPending && entries.size) {
      popPending = false;
      pops.clear();
      popSeen.clear();
      popTurn = clock;
      popping = sim.motion && opts.popSeconds > 0;
    }
    if (popping) {
      // Orbs that a lazy load adds while the arrival is still playing join the queue.
      for (const id of entries.keys()) {
        if (popSeen.has(id)) continue;
        popSeen.add(id);
        popTurn = Math.max(popTurn, clock);
        pops.set(id, popTurn);
        popTurn += opts.popStagger;
      }
      if (clock > popTurn + 1) popping = false;
    }
    syncLinks();
    sim.bounds.width = width;
    sim.bounds.height = height;
    sim.step(dt, time / 1000);

    const atFloor = collection.atFloor(travel.position) && collection.items.length > 0;
    // The end backdrop marks being at the end. A list short enough to need no
    // travel starts there, and shows it from the start (decision 53).
    const showFloor = atFloor;
    floor += ((showFloor ? 1 : 0) - floor) * (1 - Math.exp(-4 * dt));
    if (Math.abs(floor - (showFloor ? 1 : 0)) < 0.002) floor = showFloor ? 1 : 0;

    if (!(Math.abs(travel.position - lastPosition) < 0.001) || atFloor !== lastAtFloor) {
      lastPosition = travel.position;
      lastAtFloor = atFloor;
      emitter.emit('travel', { position: travel.position, atFloor });
    }

    if (focus && lastRect) {
      const entry = entries.get(focus.id);
      if (entry) {
        const rect = rectOf(entry);
        if (Math.abs(rect.x - lastRect.x) > 0.25 || Math.abs(rect.y - lastRect.y) > 0.25 || Math.abs(rect.width - lastRect.width) > 0.25) {
          lastRect = rect;
          emitter.emit('move', { item: entry.item, rect });
        }
      }
    }

    renderer.render(buildFrame());
  }

  // ---- input -------------------------------------------------------------

  /** Adds travel. Travelling forward also allows a failed request for more items to be tried again. */
  function pushTravel(delta: number): void {
    if (delta > 0) collection.retry();
    travel.push(delta);
  }

  const local = (e: PointerEvent) => {
    const box = root.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  function hover(target: EventTarget | null): void {
    if (pressing || pointers.size > 1) return;
    const id = renderer.itemIdAt(target);
    if (id && entries.get(id)?.p.interactive) setFocus(id, 'hover');
    else if (focus?.source === 'hover') clearFocus();
  }

  function onPointerDown(e: PointerEvent): void {
    const point = local(e);
    pointers.set(e.pointerId, point);
    if (pointers.size >= 2) {
      // A second finger turns the gesture into travel.
      const wasHold = focus?.source === 'hold';
      endPress();
      if (wasHold) clearFocus();
      pinchDistance = pinchSpan();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = renderer.itemIdAt(e.target);
    if (!id || !entries.get(id)?.p.interactive) return;
    const mouse = e.pointerType === 'mouse';
    if (!mouse && focus) clearFocus();
    pressing = { pointerId: e.pointerId, id, mouse, lastMove: now() };
    press.down(point.x, point.y, now());
    try {
      root.setPointerCapture?.(e.pointerId);
    } catch {
      /* not every pointer can be captured */
    }
  }

  function pinchSpan(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onPointerMove(e: PointerEvent): void {
    const point = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, point);

    if (pointers.size >= 2) {
      const span = pinchSpan();
      if (span > 0 && pinchDistance > 0) pushTravel(opts.pinchRate * Math.log(span / pinchDistance));
      pinchDistance = span;
      return;
    }

    if (pressing && pressing.pointerId === e.pointerId) {
      const time = now();
      if (press.move(point.x, point.y, time) === 'dragstart') {
        const entry = entries.get(pressing.id);
        if (entry) {
          sim.grab(entry.body, point.x, point.y);
          setFocus(pressing.id, pressing.mouse ? 'hover' : 'hold');
          root.classList.add('is-dragging');
        }
      }
      if (press.state === 'dragging') {
        sim.dragTo(point.x, point.y, Math.max(0.001, (time - pressing.lastMove) / 1000));
        pressing.lastMove = time;
      }
      return;
    }

    if (e.pointerType === 'mouse') hover(e.target);
  }

  function onPointerUp(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (!pressing || pressing.pointerId !== e.pointerId) return;

    const { id, mouse, lastMove } = pressing;
    const cancelled = e.type === 'pointercancel';
    const result = cancelled ? 'end' : press.up(now());
    // An orb held still before release is put down, not thrown.
    if (sim.dragged && now() - lastMove > 80) {
      sim.dragged.vx = 0;
      sim.dragged.vy = 0;
    }
    endPress();

    if (mouse) {
      // The pointer was captured during the press, so work out afresh what is under it.
      const under = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(e.clientX, e.clientY) : e.target;
      hover(under ?? e.target);
    } else {
      clearFocus();
    }
    if (result === 'activate') {
      const item = entries.get(id)?.item;
      if (item) {
        // The browser follows the release with a click at the same spot. By
        // then the host may have opened something there, and the click would
        // land on it and, for example, close it again. So that click is dropped.
        swallowClickUntil = now() + 500;
        emitter.emit('activate', { item });
      }
    }
  }

  function onClickCapture(e: Event): void {
    if (now() > swallowClickUntil) return;
    swallowClickUntil = 0;
    e.stopPropagation();
    e.preventDefault();
  }

  function onPointerOver(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || e.pointerType === undefined) hover(e.target);
  }

  function onPointerLeave(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && !pressing && focus?.source === 'hover') clearFocus();
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey) {
      // Trackpad pinch arrives as a wheel with ctrl held: spreading gives negative deltas.
      pushTravel(-e.deltaY / 40);
      return;
    }
    const unit = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 : opts.wheelPxPerItem;
    pushTravel(e.deltaY / unit);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    const id = renderer.itemIdAt(e.target);
    const item = id ? entries.get(id)?.item : null;
    if (!item) return;
    e.preventDefault();
    emitter.emit('activate', { item });
  }

  const prevent = (e: Event) => e.preventDefault();

  root.addEventListener('pointerdown', onPointerDown as EventListener);
  root.addEventListener('pointermove', onPointerMove as EventListener);
  // Releases are heard on the window, so a pointer that lifts outside the cloud is never left behind.
  const view = root.ownerDocument.defaultView ?? window;
  const onWindowBlur = () => {
    pointers.clear();
    pinchDistance = 0;
    const wasHold = focus?.source === 'hold';
    endPress();
    if (wasHold) clearFocus();
  };
  view.addEventListener('pointerup', onPointerUp as EventListener, true);
  view.addEventListener('pointercancel', onPointerUp as EventListener, true);
  view.addEventListener('blur', onWindowBlur);
  view.addEventListener('click', onClickCapture, true);
  root.addEventListener('pointerover', onPointerOver as EventListener);
  root.addEventListener('pointerleave', onPointerLeave as EventListener);
  root.addEventListener('wheel', onWheel as EventListener, { passive: false });
  root.addEventListener('keydown', onKeyDown as EventListener);
  root.addEventListener('dragstart', prevent);
  root.addEventListener('contextmenu', prevent);
  // Safari reports pinches as gesture events and would zoom the page.
  root.addEventListener('gesturestart', prevent);
  root.addEventListener('gesturechange', prevent);

  collection.onChange = () => {
    linkKey = '';
  };

  rafId = requestAnimationFrame(tick);

  return {
    container,
    root,

    setItems(items, o) {
      if (destroyed) return;
      endPress();
      clearFocus();
      collection.setItems(Array.isArray(items) ? items : [], o?.end ?? !opts.loadMore);
      travel.reset();
      popPending = true;
      sim.bodies.clear();
      sim.links = [];
      entries = new Map();
      linkKey = '';
      lastPosition = NaN;
    },

    on: (type, fn) => emitter.on(type, fn),

    setBlur(value) {
      opts.blur = clamp01(Number(value) || 0);
    },

    configure(changes) {
      applyConfig(opts, changes);
      linkKey = '';
    },

    getConfig() {
      const { loadMore: _loadMore, ...numbers } = opts;
      return numbers;
    },

    pulse() {
      if (!reducedMotion?.matches) sim.pulse();
    },

    travelTo(itemId) {
      const index = collection.indexOf(itemId);
      if (index < 0) return;
      travel.jumpTo(Math.min(index, collection.maxPosition()));
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      view.removeEventListener('pointerup', onPointerUp as EventListener, true);
      view.removeEventListener('pointercancel', onPointerUp as EventListener, true);
      view.removeEventListener('blur', onWindowBlur);
      view.removeEventListener('click', onClickCapture, true);
      reducedMotion?.removeEventListener?.('change', applyMotion);
      endPress();
      clearFocus();
      emitter.clear();
      renderer.destroy();
    },
  };
}
