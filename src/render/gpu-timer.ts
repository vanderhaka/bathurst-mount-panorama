/**
 * GPU time of the frame's render (EXT_disjoint_timer_query_webgl2), for dynamic resolution: it shows headroom that
 * rAF intervals hide behind vsync, and tells fill-bound frames from CPU-bound ones. Results arrive a few frames
 * late; browsers without the extension (Safari, Firefox by default, most phones) get null and the interval fallback.
 */
const MAX_PENDING = 4;

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

export class GpuTimer {
  private readonly ext: TimerExtension | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    let ext: TimerExtension | null = null;
    try { ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null; } catch { /* unavailable */ }
    this.ext = ext;
  }

  /** Starts timing (skipped while results are backlogged, so queries never pile up on a stalled GPU). */
  begin(): void {
    if (!this.ext || this.active || this.pending.length >= MAX_PENDING) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Newest finished result in seconds, or null when none finished since the last call. */
  poll(): number | null {
    const ext = this.ext;
    if (!ext || !this.pending.length) return null;
    const gl = this.gl;
    if (!gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) return null;
    // A disjoint event (clock change, context switch) invalidates every query in flight.
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const q of this.pending) gl.deleteQuery(q);
      this.pending.length = 0;
      return null;
    }
    let result: number | null = null;
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift()!;
      result = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e9;
      gl.deleteQuery(q);
    }
    return result;
  }

  dispose(): void {
    if (this.active && this.ext) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    for (const q of this.pending) this.gl.deleteQuery(q);
    if (this.active) this.gl.deleteQuery(this.active);
    this.pending.length = 0;
    this.active = null;
  }
}
