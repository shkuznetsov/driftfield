/**
 * Every tunable number in the cloud. All of them can be given to `create` and
 * changed later with `cloud.configure`.
 */
export interface Config {
  // ---- collection ----
  /** Orbs active at once. */
  windowSize: number;
  /** Orbs that remain on screen at the end of the collection. */
  floorSize: number;
  /** Most tag lines an orb shows at rest. */
  linkCap: number;

  // ---- press, hold and drag ----
  /** A press longer than this is a hold, in milliseconds. */
  holdMs: number;
  /** Movement beyond this is a drag, in pixels. */
  dragPx: number;

  // ---- depth and look ----
  /** Size of each orb relative to the one in front of it. 0.9 is ten per cent smaller per step. */
  depthScale: number;
  /** Radius of the front orb as a fraction of the shorter side of the frame. */
  orbSize: number;
  /** Smallest radius of the front orb, in pixels. */
  minOrbPx: number;
  /** Depth blur intensity, 0 to 1. */
  blur: number;
  /** Fraction of the window depth at which blur reaches its maximum. */
  blurDepth: number;
  /** How dark the deepest orbs get, 0 to 1. */
  maxDim: number;
  /**
   * How much deeper orbs draw in towards the centre of the frame, 0 to 1.
   * 0 spreads every depth across the whole frame, 1 gathers the deepest orbs in the middle.
   */
  depthSpread: number;
  /** Title text size as a fraction of the orb's diameter on screen, before the limits below. */
  titleRatio: number;
  /** Largest title text size, in pixels on screen. */
  titleSize: number;
  /** Smallest title text size, in pixels on screen. */
  titleMinSize: number;
  /** Width of the title block as a multiple of the orb's diameter. Above 1 it overflows the orb. */
  titleWidth: number;
  /** Most lines a title may take before it is cut short. */
  titleLines: number;
  /** Orbs smaller than this fraction of the front orb show no title. */
  titleHideScale: number;
  /** Text size in pixels of the tag names shown on the lit lines of the focused orb. 0 shows none. */
  labelSize: number;
  /** Seconds an orb takes to pop in when a new list arrives. 0 shows the orbs at once. */
  popSeconds: number;
  /** Seconds between one orb starting to pop in and the next, in sequence order. */
  popStagger: number;
  /** How far an orb grows past its size before settling as it pops in. 0 for none, 1.7 is about a tenth. */
  popOvershoot: number;
  /** How much an orb grows while it is flown through. 5 means six times its front size. */
  flyScale: number;
  /** How far an orb moves out from the centre while it is flown through. */
  flySpread: number;

  // ---- physics (pixels and seconds, mass 1) ----
  /** Pull of an orb towards its resting place. Higher is snappier. */
  homeStiffness: number;
  /** Resistance to movement. Higher settles sooner with less wobble. */
  damping: number;
  /** Pull along a tag line at rest. */
  linkStiffness: number;
  /** Pull along the tag lines of the hovered, held or dragged orb. */
  emphasisStiffness: number;
  /** While dragging, tagged orbs gather to this fraction of their usual distance. */
  gatherRatio: number;
  /** Push that keeps orbs at a similar depth from overlapping. */
  separation: number;
  /** Size of the ambient drift, in pixels. 0 switches it off. */
  driftPx: number;
  /** Speed kept when an orb bounces off an edge, 0 to 1. */
  bounce: number;
  /** Speed given to each orb by a pulse, in pixels per second. */
  pulseSpeed: number;
  /**
   * How long an orb takes to drift back to its resting place after it has
   * been dragged somewhere, in seconds. 0 returns it at once.
   */
  returnSeconds: number;

  // ---- travel ----
  /** Wheel distance, in pixels, that travels one item. */
  wheelPxPerItem: number;
  /** Items travelled when a pinch doubles or halves in size, divided by 0.69. */
  pinchRate: number;
  /** How long travel glides on after the gesture ends, in seconds. */
  glideSeconds: number;
  /** How far travel can be pushed past the top or the end, in items. */
  overshoot: number;
  /** Strength of the spring that returns travel from an overshoot. */
  snapStiffness: number;
}

export const DEFAULTS: Readonly<Config> = {
  windowSize: 20,
  floorSize: 5,
  linkCap: 3,
  holdMs: 250,
  dragPx: 6,
  depthScale: 0.9,
  orbSize: 0.13,
  minOrbPx: 24,
  blur: 1,
  blurDepth: 0.6,
  maxDim: 0.75,
  depthSpread: 0.25,
  titleRatio: 0.085,
  titleSize: 17,
  titleMinSize: 11,
  titleWidth: 1.5,
  titleLines: 4,
  titleHideScale: 0.38,
  labelSize: 12,
  popSeconds: 0.5,
  popStagger: 0.09,
  popOvershoot: 2.4,
  flyScale: 5,
  flySpread: 1.5,
  homeStiffness: 18,
  damping: 5,
  linkStiffness: 4,
  emphasisStiffness: 28,
  gatherRatio: 0.55,
  separation: 80,
  driftPx: 6,
  bounce: 0.45,
  pulseSpeed: 600,
  returnSeconds: 60,
  wheelPxPerItem: 100,
  pinchRate: 3,
  glideSeconds: 0.3,
  overshoot: 0.6,
  snapStiffness: 60,
};

const WHOLE: (keyof Config)[] = ['windowSize', 'floorSize', 'linkCap', 'titleLines'];
const POSITIVE: (keyof Config)[] = ['windowSize', 'floorSize', 'depthScale', 'orbSize', 'minOrbPx', 'damping', 'wheelPxPerItem', 'glideSeconds', 'snapStiffness'];

/** Copies the valid numbers from `partial` into `target`. Anything else is ignored. */
export function applyConfig(target: Config, partial: Partial<Record<keyof Config, unknown>> | undefined): Config {
  if (!partial) return target;
  for (const key of Object.keys(DEFAULTS) as (keyof Config)[]) {
    let value = partial[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    if (WHOLE.includes(key)) value = Math.floor(value);
    if (POSITIVE.includes(key) && !((value as number) > 0)) continue;
    target[key] = value as number;
  }
  return target;
}
