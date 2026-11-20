import { DEFAULTS, type Config } from './config.js';

const MAX_DT = 1 / 30;

type TravelConfig = Pick<Config, 'glideSeconds' | 'overshoot' | 'snapStiffness'>;

/**
 * The travel position along the depth axis, in items from the top, with a
 * little inertia and elastic limits.
 */
export class Travel {
  position = 0;
  velocity = 0;

  private target: number | null = null;
  private max = 0;

  /** `cfg` is read live, so the feel can be changed after creation. */
  constructor(private readonly cfg: TravelConfig = DEFAULTS) {}

  /** Velocity falls by 90% in `glideSeconds`. */
  private get friction(): number {
    return Math.LN10 / this.cfg.glideSeconds;
  }

  /** Adds travel. One unit carries the position about one item. */
  push(delta: number): void {
    this.target = null;
    const over = this.overshoot();
    const pushingOut = over !== 0 && Math.sign(delta) === Math.sign(over);
    const scale = pushingOut ? 1 / (1 + 4 * Math.abs(over)) : 1;
    this.velocity += delta * this.friction * scale;
  }

  /** Eases to a position without inertia. */
  jumpTo(position: number): void {
    this.target = position;
    this.velocity = 0;
  }

  reset(): void {
    this.position = 0;
    this.velocity = 0;
    this.target = null;
  }

  /**
   * @param max furthest allowed position
   * @param elastic whether the far limit rubber-bands (the true end) or simply holds (more items on their way)
   */
  step(dt: number, max: number, elastic: boolean): void {
    dt = Math.min(Math.max(dt, 0), MAX_DT);
    this.max = Math.max(0, max);

    if (this.target !== null) {
      const goal = Math.min(Math.max(this.target, 0), this.max);
      this.position += (goal - this.position) * (1 - Math.exp(-6 * dt));
      if (Math.abs(goal - this.position) < 0.001) {
        this.position = goal;
        this.target = null;
      }
      return;
    }

    if (!elastic && this.position >= this.max && this.velocity >= 0) {
      this.position = this.max;
      this.velocity = 0;
      return;
    }

    const FRICTION = this.friction;
    const SPRING = this.cfg.snapStiffness;
    const MAX_OVERSHOOT = this.cfg.overshoot;
    const over = this.overshoot();
    if (over !== 0) {
      this.velocity += (-SPRING * over - 2 * Math.sqrt(SPRING) * this.velocity) * dt;
      this.position += this.velocity * dt;
    } else {
      const decay = Math.exp(-FRICTION * dt);
      this.position += (this.velocity * (1 - decay)) / FRICTION;
      this.velocity *= decay;
      if (Math.abs(this.velocity) < 1e-4) this.velocity = 0;
    }

    if (!elastic && this.position > this.max) {
      this.position = this.max;
      this.velocity = 0;
    }
    if (this.position > this.max + MAX_OVERSHOOT) {
      this.position = this.max + MAX_OVERSHOOT;
      if (this.velocity > 0) this.velocity = 0;
    }
    if (this.position < -MAX_OVERSHOOT) {
      this.position = -MAX_OVERSHOOT;
      if (this.velocity < 0) this.velocity = 0;
    }
    const settled = this.overshoot();
    if (settled !== 0 && Math.abs(settled) < 0.0005 && Math.abs(this.velocity) < 0.005) {
      this.position = settled > 0 ? this.max : 0;
      this.velocity = 0;
    }
  }

  /** Signed distance beyond a limit, or 0 inside the range. */
  private overshoot(): number {
    if (this.position < 0) return this.position;
    if (this.position > this.max) return this.position - this.max;
    return 0;
  }
}
