import { DEFAULTS, type Config } from '../core/config.js';

/** How an orb looks at a given depth. */
export interface Projected {
  scale: number;
  opacity: number;
  /** 0 sharp to 1 fully blurred, before the host's blur setting is applied. */
  blur: number;
  /** 0 bright to 0.75 nearly dark. */
  dim: number;
  /** False from the moment the orb starts to fly through. */
  interactive: boolean;
  /** Multiplier on the orb's distance from the centre of the frame. */
  spread: number;
  z: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** `depth` is in items behind the viewer. Between -1 and 0 the orb is flying through. */
export function project(depth: number, windowSize: number, cfg: Config = DEFAULTS): Projected {
  const z = Math.round(1000 - depth * 10);
  if (depth < 0) {
    const t = Math.min(1, -depth);
    return { scale: 1 + cfg.flyScale * t * t, opacity: 1 - t, blur: 0, dim: 0, interactive: false, spread: 1 + cfg.flySpread * t, z };
  }
  const scale = Math.pow(cfg.depthScale, depth);
  return {
    scale,
    opacity: depth > windowSize - 1 ? clamp(windowSize - depth, 0, 1) : 1,
    blur: clamp(depth / Math.max(0.001, cfg.blurDepth * windowSize), 0, 1),
    dim: clamp(depth / windowSize, 0, cfg.maxDim),
    interactive: true,
    spread: 1 - cfg.depthSpread * (1 - scale),
    z,
  };
}

/** Stable pseudo-random number in [0, 1) from a string. */
/**
 * How far an orb has popped in, `elapsed` seconds after its turn came. Opacity
 * rises from nothing over the first half; size starts small, grows past full
 * size and settles back.
 */
export function popFactor(elapsed: number, seconds: number, overshoot: number): { opacity: number; scale: number } {
  if (!(seconds > 0) || elapsed >= seconds) return { opacity: 1, scale: 1 };
  if (elapsed <= 0) return { opacity: 0, scale: 0 };
  const u = elapsed / seconds;
  const v = u - 1;
  const back = 1 + (overshoot + 1) * v * v * v + overshoot * v * v;
  const fade = Math.min(1, u * 2);
  return { opacity: fade * (2 - fade), scale: 0.4 + 0.6 * back };
}

export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Final mix, so ids that differ by one character give unrelated numbers.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Steps of two additive sequences, the golden ratio across and the square
// root of three down: any run of consecutive indexes covers the rectangle
// evenly, edges included. The R2 pair used before has an across step so close
// to three quarters that a run of twenty left a fifth of the width empty.
const R2_X = 0.6180339887498949;
const R2_Y = 0.7320508075688772;
const JITTER = 0.1;
const frac = (v: number) => v - Math.floor(v);

/**
 * Resting place of an item, each axis in [-1, 1], spread evenly over the
 * whole frame. It depends only on the item's place in the sequence and its
 * id, so an orb is in the same spot whenever the person travels back to it.
 */
export function homeNorm(index: number, id: string): { x: number; y: number } {
  const x = frac(0.5 + R2_X * index) * 2 - 1 + (hash01(id) - 0.5) * JITTER;
  const y = frac(0.5 + R2_Y * index) * 2 - 1 + (hash01(id + '/y') - 0.5) * JITTER;
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
}

/** Radius in pixels of an orb at the very front. */
export function baseRadius(width: number, height: number, cfg: Config = DEFAULTS): number {
  return Math.max(cfg.minOrbPx, cfg.orbSize * Math.min(width, height));
}
