import { prismaRoot } from "../db";

/**
 * Löscht Originalbelege (verschlüsselte Datei + extrahierter Text) nach Ablauf der
 * Aufbewahrungsfrist des Mandanten – nur für abgeschlossene/archivierte Aufträge.
 * Metadaten (Dateiname, Hash), Rechnungsdaten und Audit-Log bleiben erhalten.
 */
export async function purgeExpiredDocuments(now = new Date()): Promise<{ tenant: string; purged: number }[]> {
  const tenants = await prismaRoot.tenant.findMany({ where: { retentionDays: { not: null } }, select: { id: true, slug: true, retentionDays: true } });
  const out: { tenant: string; purged: number }[] = [];
  for (const t of tenants) {
    const cutoff = new Date(now.getTime() - t.retentionDays! * 86400_000);
    const docs = await prismaRoot.document.findMany({
      where: { tenantId: t.id, deletedAt: null, createdAt: { lt: cutoff }, order: { status: { in: ["COMPLETED", "ARCHIVED"] } } },
      select: { id: true, orderId: true, fileName: true, sha256: true }, take: 2000,
    });
    if (!docs.length) continue;
    const ids = docs.map((d) => d.id);
    await prismaRoot.$transaction([
      prismaRoot.storedFile.deleteMany({ where: { tenantId: t.id, documentId: { in: ids } } }),
      prismaRoot.document.updateMany({ where: { tenantId: t.id, id: { in: ids } }, data: { deletedAt: now } }),
      prismaRoot.auditLog.createMany({ data: docs.map((d) => ({ tenantId: t.id, userId: null, action: "RETENTION_PURGE", entityType: "Document", entityId: d.id,
        oldValue: { fileName: d.fileName, sha256: d.sha256, orderId: d.orderId }, reason: `Aufbewahrungsfrist ${t.retentionDays} Tage abgelaufen` })) }),
    ]);
    await prismaRoot.$executeRaw`UPDATE "Document" SET "extractedText" = NULL WHERE "tenantId" = ${t.id} AND id = ANY(${ids})`;
    out.push({ tenant: t.slug, purged: docs.length });
  }
  return out;
}
