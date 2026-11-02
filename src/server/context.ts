import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prismaRoot } from "./db";
import { tenantDb, type TenantDb } from "./tenant-db";
import { resolveSession } from "./auth/service";
import { SESSION_COOKIE } from "./auth/token";
import { can, ForbiddenError, type Permission } from "./auth/permissions";

export { can, ROLE_LABEL, type Permission } from "./auth/permissions";

export interface RequestContext {
  sessionId: string;
  userId: string;
  userName: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenants: { id: string; name: string }[];
  role: Role;
  db: TenantDb;
}

/** Ermittelt Benutzer und Mandant aus der Session. Ohne gültige Session → Login. */
export async function getContext(): Promise<RequestContext> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await resolveSession(prismaRoot, token);
  if (!s) redirect("/login");
  return { ...s, db: tenantDb(s.tenantId) };
}

/** Für Seiten: ohne Berechtigung → Hinweisseite statt Fehler. */
export function requireCan(ctx: RequestContext, p: Permission) {
  if (!can(ctx.role, p)) redirect(`/kein-zugriff?p=${encodeURIComponent(p)}`);
}

/** Für Server Actions: ohne Berechtigung → Fehler. */
export function assertCan(ctx: RequestContext, p: Permission) {
  if (!can(ctx.role, p)) throw new ForbiddenError(p);
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Audit-Eintrag für den aktuellen Kontext. */
export function audit(ctx: RequestContext, e: { action: string; entityType: string; entityId: string; field?: string; oldValue?: unknown; newValue?: unknown; reason?: string }) {
  return ctx.db.auditLog.create({
    data: { tenantId: ctx.tenantId, userId: ctx.userId, action: e.action, entityType: e.entityType, entityId: e.entityId, field: e.field,
      oldValue: e.oldValue as never, newValue: e.newValue as never, reason: e.reason },
  });
}
