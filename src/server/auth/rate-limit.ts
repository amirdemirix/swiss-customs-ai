/**
 * Einfaches Sliding-Window-Limit im Prozessspeicher.
 * Ausreichend für eine Instanz; bei mehreren Instanzen (Phase 8) auf DB/Redis umstellen.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}
  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return { allowed: false, retryAfterMs: this.windowMs - (t - arr[0]) };
    }
    arr.push(t);
    this.hits.set(key, arr);
    return { allowed: true, retryAfterMs: 0 };
  }
  reset(key: string) { this.hits.delete(key); }
}
export const loginLimiter = new RateLimiter(5, 15 * 60 * 1000);
