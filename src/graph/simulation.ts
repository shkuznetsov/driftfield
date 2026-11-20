import { DEFAULTS, type Config } from '../core/config.js';

export interface Body {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Home position the body is drawn back to. */
  hx: number;
  hy: number;
  r: number;
  depth: number;
  /** Whether the frame edges contain this body. Off while it flies through. */
  walls: boolean;
  /** 0..1, gives each body its own drift rhythm. */
  phase: number;
  /**
   * Where the body was last put down, as an offset from home. It fades away
   * over `returnSeconds`, which is what carries a dragged orb slowly back.
   */
  ox?: number;
  oy?: number;
  /**
   * Ambient wander, added to the position when the body is drawn. It is kept
   * out of the forces, so one orb's wander never passes along the tag lines
   * and the cloud never sways as a whole.
   */
  dx?: number;
  dy?: number;
  /** 0..1 strength of the wander. It fades out while the body is held. */
  da?: number;
}

/** Where a body is drawn: its simulated position plus its own wander. */
export const shownX = (b: Body) => b.x + (b.dx ?? 0);
export const shownY = (b: Body) => b.y + (b.dy ?? 0);

/** Stable number in [0, 1) for the k-th property of a body. */
function vary(phase: number, k: number): number {
  const v = Math.sin((phase + 1) * (k * 12.9898 + 78.233)) * 43758.5453;
  return v - Math.floor(v);
}

export interface SimLink {
  a: Body;
  b: Body;
  strength: number;
  emphasised: boolean;
}

const MAX_DT = 1 / 30;

/** Spring, mass and damper simulation of the orbs. Units are pixels and seconds, mass is 1. */
export class Simulation {
  bodies = new Map<string, Body>();
  links: SimLink[] = [];
  bounds = { width: 0, height: 0 };
  dragged: Body | null = null;
  /** False switches the ambient drift off. */
  motion = true;

  private grabDx = 0;
  private grabDy = 0;

  /** `cfg` is read live, so the feel can be changed after creation. */
  constructor(private readonly cfg: Config = DEFAULTS) {}

  step(dt: number, time: number): void {
    dt = Math.min(Math.max(dt, 0), MAX_DT);
    if (dt === 0) return;
    const c = this.cfg;
    const fade = c.returnSeconds > 0 ? Math.exp((-4 * dt) / c.returnSeconds) : 0;
    const list = [...this.bodies.values()];
    const ax = new Float64Array(list.length);
    const ay = new Float64Array(list.length);
    const slot = new Map<Body, number>();
    list.forEach((b, i) => slot.set(b, i));

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.ox || b.oy) {
        b.ox = (b.ox ?? 0) * fade;
        b.oy = (b.oy ?? 0) * fade;
        if (Math.abs(b.ox) < 0.05 && Math.abs(b.oy) < 0.05) b.ox = b.oy = 0;
      }
      const tx = b.hx + (b.ox ?? 0);
      const ty = b.hy + (b.oy ?? 0);
      this.wander(b, dt, time);
      ax[i] += c.homeStiffness * (tx - b.x) - c.damping * b.vx;
      ay[i] += c.homeStiffness * (ty - b.y) - c.damping * b.vy;
    }

    for (const link of this.links) {
      const ia = slot.get(link.a);
      const ib = slot.get(link.b);
      if (ia === undefined || ib === undefined) continue;
      const dx = link.b.x - link.a.x;
      const dy = link.b.y - link.a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) continue;
      // Measured between where the two bodies currently rest, including where a
      // dragged one was put down, so a line never tugs a parked orb back home.
      let rest = Math.hypot(
        link.b.hx + (link.b.ox ?? 0) - link.a.hx - (link.a.ox ?? 0),
        link.b.hy + (link.b.oy ?? 0) - link.a.hy - (link.a.oy ?? 0),
      );
      let k = c.linkStiffness * link.strength;
      if (link.emphasised) {
        k = c.emphasisStiffness * link.strength;
        // The group only gathers in while one end is being dragged. On a plain
        // hover the links stiffen without moving anything, so the orb stays
        // under the pointer.
        if (link.a === this.dragged || link.b === this.dragged) rest *= c.gatherRatio;
      }
      const f = k * (dist - rest);
      const fx = (f * dx) / dist;
      const fy = (f * dy) / dist;
      ax[ia] += fx;
      ay[ia] += fy;
      ax[ib] -= fx;
      ay[ib] -= fy;
    }

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (Math.abs(a.depth - b.depth) >= 1.5) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const overlap = a.r + b.r - dist;
        if (overlap <= 0) continue;
        if (dist < 1e-6) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const f = c.separation * overlap;
        ax[i] -= (f * dx) / dist;
        ay[i] -= (f * dy) / dist;
        ax[j] += (f * dx) / dist;
        ay[j] += (f * dy) / dist;
      }
    }

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b === this.dragged) continue;
      b.vx += ax[i] * dt;
      b.vy += ay[i] * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      this.contain(b, true);
    }
  }

  /**
   * Each body wanders on its own: two slow waves per axis, with speeds and
   * starting points taken from the body itself, so no two move alike.
   */
  private wander(b: Body, dt: number, time: number): void {
    const wanted = this.motion && this.cfg.driftPx > 0 && b !== this.dragged ? 1 : 0;
    b.da = (b.da ?? wanted) + (wanted - (b.da ?? wanted)) * Math.min(1, dt * 2);
    if (b.da < 0.001) {
      b.da = 0;
      b.dx = b.dy = 0;
      return;
    }
    const wave = (k: number) => {
      const speed = 0.35 + 0.75 * vary(b.phase, k);
      return Math.sin(time * speed + 6.2832 * vary(b.phase, k + 1));
    };
    const size = this.cfg.driftPx * b.da;
    b.dx = size * (0.6 * wave(1) + 0.4 * wave(3));
    b.dy = size * (0.6 * wave(5) + 0.4 * wave(7));
  }

  grab(body: Body, x: number, y: number): void {
    // Fold the wander into the position, so the orb does not jump when it is picked up.
    body.x += body.dx ?? 0;
    body.y += body.dy ?? 0;
    body.dx = body.dy = 0;
    body.da = 0;
    this.dragged = body;
    this.grabDx = x - body.x;
    this.grabDy = y - body.y;
    body.vx = 0;
    body.vy = 0;
  }

  /** Moves the held body with the pointer and tracks its speed for the release. */
  dragTo(x: number, y: number, dt: number): void {
    const b = this.dragged;
    if (!b) return;
    const px = b.x;
    const py = b.y;
    b.x = x - this.grabDx;
    b.y = y - this.grabDy;
    this.contain(b, false);
    if (dt > 0) {
      b.vx = 0.5 * b.vx + (0.5 * (b.x - px)) / dt;
      b.vy = 0.5 * b.vy + (0.5 * (b.y - py)) / dt;
    }
  }

  /**
   * Lets go of the held body. It stays roughly where it was put (a little
   * further on if it was thrown) and drifts home over `returnSeconds`.
   */
  release(): void {
    const b = this.dragged;
    this.dragged = null;
    if (!b || !(this.cfg.returnSeconds > 0)) return;
    const glide = 0.6 / Math.max(1, this.cfg.damping);
    const rest = { ...b, x: b.x + b.vx * glide, y: b.y + b.vy * glide };
    this.contain(rest, false);
    b.ox = rest.x - b.hx;
    b.oy = rest.y - b.hy;
  }

  /** Pushes every body outwards from the centre of the frame. */
  pulse(): void {
    const cx = this.bounds.width / 2;
    const cy = this.bounds.height / 2;
    for (const b of this.bodies.values()) {
      let dx = b.x - cx;
      let dy = b.y - cy;
      let dist = Math.hypot(dx, dy);
      if (dist < 1e-6) {
        dx = Math.cos(b.phase * 6.2832);
        dy = Math.sin(b.phase * 6.2832);
        dist = 1;
      }
      b.vx += (this.cfg.pulseSpeed * dx) / dist;
      b.vy += (this.cfg.pulseSpeed * dy) / dist;
    }
  }

  private contain(b: Body, bounce: boolean): void {
    const { width, height } = this.bounds;
    if (!b.walls || width <= 0 || height <= 0) return;
    const minX = Math.min(b.r, width / 2);
    const maxX = Math.max(width - b.r, width / 2);
    const minY = Math.min(b.r, height / 2);
    const maxY = Math.max(height - b.r, height / 2);
    if (b.x < minX) {
      b.x = minX;
      if (bounce && b.vx < 0) b.vx = -b.vx * this.cfg.bounce;
    } else if (b.x > maxX) {
      b.x = maxX;
      if (bounce && b.vx > 0) b.vx = -b.vx * this.cfg.bounce;
    }
    if (b.y < minY) {
      b.y = minY;
      if (bounce && b.vy < 0) b.vy = -b.vy * this.cfg.bounce;
    } else if (b.y > maxY) {
      b.y = maxY;
      if (bounce && b.vy > 0) b.vy = -b.vy * this.cfg.bounce;
    }
  }
}
