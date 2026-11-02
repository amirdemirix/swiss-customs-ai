import { Prisma, PrismaClient } from "@prisma/client";
import { prismaRoot } from "./db";

/** Alle Modelle mit tenantId-Spalte. Neue Modelle hier ergänzen – ein Test prüft die Vollständigkeit. */
export const TENANT_SCOPED_MODELS = [
  "Membership", "Customer", "ArticleMaster", "CustomsOrder", "Document", "ProcessingJob", "Invoice",
  "InvoiceLine", "GroupingProfile", "ExchangeRate", "DeclarationLine", "ValidationIssue", "AuditLog", "ExportFile",
  "StoredFile", "ColumnMapping",
] as const;
/** Bewusst ausgenommen: Session wird von der Authentifizierung gelesen, bevor der Mandant bekannt ist. */
export const TENANT_GUARD_EXEMPT = ["Session"] as const;
const scoped = new Set<string>(TENANT_SCOPED_MODELS);

const WHERE_OPS = new Set(["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy", "updateMany", "deleteMany", "update", "delete", "upsert"]);

export class TenantViolationError extends Error {}

/**
 * Liefert einen Prisma-Client, der jede Abfrage auf den Mandanten beschränkt.
 * - Lese-/Schreibfilter: tenantId wird per AND in jedes where eingefügt.
 * - create: tenantId wird gesetzt; ein abweichender Wert führt zu einem Fehler.
 * Zusätzliche Absicherung (Phase 8): Postgres Row-Level-Security.
 */
export function tenantDb(tenantId: string, client: PrismaClient = prismaRoot) {
  if (!tenantId) throw new TenantViolationError("tenantId fehlt");
  return client.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !scoped.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, any>;
          const stamp = (d: Record<string, any>) => {
            if (d.tenantId && d.tenantId !== tenantId) throw new TenantViolationError(`Schreibzugriff auf fremden Mandanten (${model})`);
            if (d.tenant) throw new TenantViolationError("Relation 'tenant' darf nicht direkt gesetzt werden");
            return { ...d, tenantId };
          };
          if (WHERE_OPS.has(operation)) a.where = a.where ? { ...a.where, AND: [...([] as any[]).concat(a.where.AND ?? []), { tenantId }] } : { tenantId };
          if (operation === "create" || operation === "upsert") a[operation === "create" ? "data" : "create"] = stamp(a[operation === "create" ? "data" : "create"]);
          if (operation === "createMany" || operation === "createManyAndReturn") a.data = ([] as any[]).concat(a.data).map(stamp);
          if ((operation === "update" || operation === "updateMany" || operation === "upsert") && a[operation === "upsert" ? "update" : "data"]?.tenantId)
            throw new TenantViolationError("tenantId darf nicht geändert werden");
          return query(a);
        },
      },
    },
  });
}
export type TenantDb = ReturnType<typeof tenantDb>;
export { Prisma };
