import type { TenantDb } from "../tenant-db";
import { prismaRoot } from "../db";

/** Änderungsverlauf einer Entität inkl. Benutzername. */
export async function getHistory(db: TenantDb, entityType: string, entityId: string, take = 50) {
  const rows = await db.auditLog.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" }, take });
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = ids.length ? await prismaRoot.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, userName: r.userId ? name.get(r.userId) ?? "Unbekannt" : "System" }));
}
