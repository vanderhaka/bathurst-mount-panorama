// Settings > Frame rate limit: skips animation frames so that the game runs at most
// `cap` frames per second. Frames are due on a fixed schedule (not "cap ms after the
// last frame"), so a 120 or 144 Hz display still gives an even 60 for a cap of 60.

/** Early-acceptance slack (ms) for display-timer jitter. */
const SLACK_MS = 1.5;

export class FrameLimiter {
  private next = 0;

  /** True when a frame should run at time `t` (ms, from requestAnimationFrame). cap 0 = no limit. */
  ready(t: number, cap: number): boolean {
    if (cap <= 0) {
      this.next = 0;
      return true;
    }
    if (t < this.next - SLACK_MS) return false;
    const interval = 1000 / cap;
    this.next += interval;
    // More than one frame behind (first frame, a hidden tab, a stall): restart the schedule.
    if (this.next < t) this.next = t + interval;
    return true;
  }
}
