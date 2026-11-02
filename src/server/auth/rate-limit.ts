import { createHash } from "node:crypto";
/**
 * Einfaches Sliding-Window-Limit im Prozessspeicher.
 * Ausreichend für eine Instanz; bei mehreren Instanzen (Phase 8) auf DB/Redis umstellen.
 */
export interface Limiter {
  check(key: string): { allowed: boolean; retryAfterMs: number } | Promise<{ allowed: boolean; retryAfterMs: number }>;
  reset(key: string): void | Promise<void>;
}

export class RateLimiter implements Limiter {
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
/**
 * Instanzübergreifendes Limit über die Datenbank (Vercel startet mehrere Instanzen).
 * Schlüssel wird gehasht gespeichert (keine E-Mail-Adressen im Klartext).
 */
export class DbRateLimiter implements Limiter {
  constructor(private max: number, private windowMs: number) {}
  private h = (k: string) => createHash("sha256").update(k).digest("hex");
  async check(key: string) {
    const { prismaRoot } = await import("../db");
    const since = new Date(Date.now() - this.windowMs);
    const k = this.h(key);
    const attempts = await prismaRoot.loginAttempt.findMany({ where: { key: k, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    if (attempts.length >= this.max) return { allowed: false, retryAfterMs: this.windowMs - (Date.now() - attempts[0].createdAt.getTime()) };
    await prismaRoot.loginAttempt.create({ data: { key: k } });
    // Aufräumen alter Einträge (gelegentlich)
    if (Math.random() < 0.02) await prismaRoot.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
    return { allowed: true, retryAfterMs: 0 };
  }
  async reset(key: string) {
    const { prismaRoot } = await import("../db");
    await prismaRoot.loginAttempt.deleteMany({ where: { key: this.h(key) } });
  }
}

export const loginLimiter: Limiter = new DbRateLimiter(5, 15 * 60 * 1000);
