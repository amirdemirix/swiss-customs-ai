import type { PrismaClient, Role } from "@prisma/client";
import { hashToken, newSessionToken, SESSION_TTL_MS } from "./token";
import { verifyPasswordConstantTime } from "./password";
import { loginLimiter, type Limiter } from "./rate-limit";

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; userId: string; tenantId: string }
  | { ok: false; reason: "INVALID" | "RATE_LIMITED" | "NO_MEMBERSHIP"; retryAfterMs?: number };

/** Prüft Zugangsdaten und legt eine serverseitige, widerrufbare Session an. */
export async function login(
  db: PrismaClient,
  input: { email: string; password: string; ip?: string | null; userAgent?: string | null },
  limiter: Limiter = loginLimiter,
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const rl = await limiter.check(`${email}|${input.ip ?? "-"}`);
  if (!rl.allowed) return { ok: false, reason: "RATE_LIMITED", retryAfterMs: rl.retryAfterMs };

  const user = await db.user.findUnique({ where: { email }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
  const valid = await verifyPasswordConstantTime(input.password, user?.isActive ? user.passwordHash : null);
  if (!user || !valid) {
    if (user) {
      for (const m of user.memberships)
        await db.auditLog.create({ data: { tenantId: m.tenantId, userId: user.id, action: "LOGIN_FAILED", entityType: "User", entityId: user.id, ip: input.ip ?? null } });
    }
    return { ok: false, reason: "INVALID" };
  }
  const membership = user.memberships[0];
  if (!membership) return { ok: false, reason: "NO_MEMBERSHIP" };

  await limiter.reset(`${email}|${input.ip ?? "-"}`);
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.$transaction([
    db.session.create({ data: { userId: user.id, tenantId: membership.tenantId, tokenHash: hashToken(token), expiresAt, ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null } }),
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    db.auditLog.create({ data: { tenantId: membership.tenantId, userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id, ip: input.ip ?? null } }),
  ]);
  return { ok: true, token, expiresAt, userId: user.id, tenantId: membership.tenantId };
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  userName: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: Role;
  tenants: { id: string; name: string }[];
}

/**
 * Löst ein Session-Token auf. Gibt null zurück, wenn abgelaufen, Benutzer deaktiviert
 * oder die Mitgliedschaft im Session-Mandanten entzogen wurde (sofortige Wirkung).
 */
export async function resolveSession(db: PrismaClient, token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token || token.length > 100) return null;
  const s = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { memberships: { include: { tenant: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!s) return null;
  if (s.expiresAt < new Date() || !s.user.isActive) {
    await db.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  const m = s.user.memberships.find((x) => x.tenantId === s.tenantId);
  if (!m) return null;
  return {
    sessionId: s.id, userId: s.userId, userName: s.user.name, email: s.user.email, tenantId: s.tenantId, tenantName: m.tenant.name, role: m.role,
    tenants: s.user.memberships.map((x) => x.tenant),
  };
}

export async function logout(db: PrismaClient, token: string | undefined | null) {
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Mandantenwechsel nur, wenn der Benutzer dort Mitglied ist. */
export async function switchTenant(db: PrismaClient, sessionId: string, userId: string, tenantId: string) {
  const m = await db.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
  if (!m) return false;
  await db.session.update({ where: { id: sessionId }, data: { tenantId } });
  return true;
}

/** Beendet alle Sessions eines Benutzers (z. B. nach Deaktivierung oder Passwortänderung). */
export const revokeUserSessions = (db: PrismaClient, userId: string) => db.session.deleteMany({ where: { userId } });
