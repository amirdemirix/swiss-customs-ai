import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sca_session";
export const SESSION_TTL_MS = 10 * 60 * 60 * 1000; // 10 h (ein Arbeitstag)

/** 256-Bit Zufallstoken; in der DB wird nur der SHA-256-Hash gespeichert. */
export const newSessionToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
