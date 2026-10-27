/** In-memory sliding-window limiter. Single process, so no shared store is needed. */
export interface Clock { now(): number }

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep: number;

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly clock: Clock = Date) {
    this.lastSweep = clock.now();
  }

  /** Records an attempt and reports whether it is within the limit. */
  hit(key: string): boolean {
    const now = this.clock.now();
    this.sweep(now);
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter(at => at > cutoff);
    recent.push(now);
    this.hits.set(key, recent);
    return recent.length <= this.limit;
  }

  /** Drops expired entries at most once per window so idle keys do not accumulate. */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      const recent = times.filter(at => at > cutoff);
      if (recent.length === 0) this.hits.delete(key); else this.hits.set(key, recent);
    }
  }
}
