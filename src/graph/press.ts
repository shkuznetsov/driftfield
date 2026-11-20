export type PressEvent = 'hold' | 'dragstart' | 'activate' | 'end';

/**
 * Tells a quick press (activate) from a hold and from a drag. The same rules
 * serve a mouse and a finger. It knows nothing about the DOM: the caller
 * feeds it positions and times.
 */
export class PressRecogniser {
  state: 'idle' | 'pressed' | 'holding' | 'dragging' = 'idle';

  private startX = 0;
  private startY = 0;
  private startTime = 0;
  /** `opts` is read live, so the thresholds can be changed after creation. */
  constructor(private readonly opts: { holdMs: number; dragPx: number }) {}

  private get holdMs(): number {
    return this.opts.holdMs;
  }

  private get dragPx(): number {
    return this.opts.dragPx;
  }

  down(x: number, y: number, time: number): void {
    this.state = 'pressed';
    this.startX = x;
    this.startY = y;
    this.startTime = time;
  }

  move(x: number, y: number, _time: number): PressEvent | null {
    if (this.state !== 'pressed' && this.state !== 'holding') return null;
    if (Math.hypot(x - this.startX, y - this.startY) <= this.dragPx) return null;
    this.state = 'dragging';
    return 'dragstart';
  }

  /** Call regularly while a press is in progress. */
  tick(time: number): PressEvent | null {
    if (this.state !== 'pressed' || time - this.startTime < this.holdMs) return null;
    this.state = 'holding';
    return 'hold';
  }

  up(time: number): PressEvent {
    const quick = this.state === 'pressed' && time - this.startTime < this.holdMs;
    this.state = 'idle';
    return quick ? 'activate' : 'end';
  }

  /** A second finger arrived or the pointer was taken away. */
  cancel(): void {
    this.state = 'idle';
  }
}
