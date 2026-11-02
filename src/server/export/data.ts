import type { TenantDb } from "../tenant-db";
import { prismaRoot } from "../db";

/** Lädt alle Daten eines Auftrags für Exporte (eine Quelle für Excel und Anmeldevorbereitung). */
export async function loadExportData(db: TenantDb, orderId: string) {
  const order = await db.customsOrder.findFirstOrThrow({
    where: { id: orderId },
    include: {
      customer: true, groupingProfile: true, exchangeRates: true,
      invoices: { orderBy: { invoiceNumber: "asc" }, include: { document: { select: { fileName: true, sha256: true } }, lines: { orderBy: { lineNo: "asc" } } } },
      declarationLines: { orderBy: { position: "asc" }, include: { sources: true } },
      issues: { where: { resolvedAt: null }, orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
    },
  });
  const entityIds = [order.id, ...order.invoices.map((i) => i.id), ...order.invoices.flatMap((i) => i.lines.map((l) => l.id))];
  const docIds = (await db.document.findMany({ where: { orderId }, select: { id: true } })).map((d) => d.id);
  const audit = await db.auditLog.findMany({ where: { entityId: { in: [...entityIds, ...docIds] } }, orderBy: { createdAt: "asc" }, take: 5000 });
  const users = new Map((await prismaRoot.user.findMany({ where: { id: { in: [...new Set(audit.map((a) => a.userId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  // Rechnungsposition → Anmeldeposition
  const posOf = new Map<string, number>();
  for (const d of order.declarationLines) for (const s of d.sources) posOf.set(s.invoiceLineId, d.position);
  const converted = new Map<string, string>();
  for (const d of order.declarationLines) for (const s of d.sources) converted.set(s.invoiceLineId, s.convertedValue.toString());
  const critical = order.issues.filter((i) => i.severity === "CRITICAL").length;
  const unconfirmed = order.invoices.filter((i) => i.reviewStatus !== "CONFIRMED").length;
  return { order, audit, users, posOf, converted, critical, unconfirmed };
}
export type ExportData = Awaited<ReturnType<typeof loadExportData>>;
