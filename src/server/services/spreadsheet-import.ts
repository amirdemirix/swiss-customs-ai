import type { Prisma } from "@prisma/client";
import { headerSignature, rowsToInvoices, type ColumnMap, type ImportDefaults, type RowProblem } from "@/domain";
import type { TenantDb } from "../tenant-db";
import type { Actor } from "./documents";
import { recomputeOrder } from "./consolidation";

export interface ImportRequest {
  documentId: string;
  sheetIndex: number;
  headerRow: number; // 0-basiert
  map: ColumnMap;
  defaults: ImportDefaults;
  saveMapping: boolean;
}

export function getSheets(doc: { extractedText: Prisma.JsonValue }): { name: string; rows: string[][] }[] {
  const t = doc.extractedText as { sheets?: { name: string; rows: string[][] }[] } | null;
  return t?.sheets ?? [];
}

/**
 * Importiert Tabellenzeilen als Rechnungen + Positionen. Ein erneuter Import derselben Datei
 * ersetzt die zuvor daraus erzeugten Rechnungen (protokolliert).
 */
export async function importSpreadsheet(db: TenantDb, actor: Actor, req: ImportRequest): Promise<{ invoices: number; lines: number; problems: RowProblem[] }> {
  const doc = await db.document.findFirstOrThrow({ where: { id: req.documentId }, include: { order: { select: { id: true, customerId: true, status: true } } } });
  if (doc.order.status === "COMPLETED" || doc.order.status === "ARCHIVED") throw new Error("Auftrag ist abgeschlossen.");
  const sheet = getSheets(doc)[req.sheetIndex];
  if (!sheet) throw new Error("Tabellenblatt nicht gefunden.");
  const headers = sheet.rows[req.headerRow] ?? [];
  const dataRows = sheet.rows.slice(req.headerRow + 1);
  const { invoices, problems } = rowsToInvoices(dataRows, req.map, req.defaults, req.headerRow + 2);

  let lineCount = 0;
  await db.$transaction(async (tx) => {
    const previous = await tx.invoice.findMany({ where: { documentId: doc.id }, select: { id: true, invoiceNumber: true } });
    if (previous.length) {
      await tx.invoice.deleteMany({ where: { documentId: doc.id } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: "REIMPORT", entityType: "Document", entityId: doc.id, oldValue: previous } });
    }
    for (const inv of invoices) {
      await tx.invoice.create({
        data: {
          tenantId: actor.tenantId, orderId: doc.orderId, documentId: doc.id,
          invoiceNumber: inv.invoiceNumber, invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : null,
          supplierName: inv.supplierName, currency: inv.currency, totalAmount: inv.totalAmount,
          reviewStatus: "EXTRACTED",
          extractionMeta: { method: "spreadsheet-import", sheet: sheet.name, headerRow: req.headerRow + 1, map: req.map } as Prisma.InputJsonValue,
          lines: {
            create: inv.lines.map((l) => ({
              tenantId: actor.tenantId, lineNo: l.lineNo, articleNumber: l.articleNumber, description: l.description,
              tariffNumber: l.tariffNumber, tariffNumberSource: l.tariffNumber ? "INVOICE" : null,
              statisticalKey: l.statisticalKey, originCountry: l.originCountry, originSource: l.originCountry ? "INVOICE" : null,
              preferenceStatus: l.preferenceStatus, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, lineAmount: l.lineAmount,
              netWeightKg: l.netWeightKg, grossWeightKg: l.grossWeightKg, packaging: l.packaging,
              fieldMeta: { source: { sheet: sheet.name, row: l.sourceRow }, raw: l.raw } as Prisma.InputJsonValue,
            })),
          },
        },
      });
      lineCount += inv.lines.length;
    }
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: "IMPORT", entityType: "Document", entityId: doc.id,
      newValue: { invoices: invoices.length, lines: lineCount, problems: problems.length, map: req.map } as Prisma.InputJsonValue } });
    if (req.saveMapping) {
      const sig = headerSignature(headers);
      const named = Object.fromEntries(Object.entries(req.map).map(([f, i]) => [f, headers[i as number] ?? null]));
      const existing = await tx.columnMapping.findFirst({ where: { headerSignature: sig, customerId: doc.order.customerId } });
      if (existing) await tx.columnMapping.update({ where: { id: existing.id }, data: { mapping: named } });
      else await tx.columnMapping.create({ data: { tenantId: actor.tenantId, customerId: doc.order.customerId, headerSignature: sig, name: doc.fileName, mapping: named, createdById: actor.userId } });
    }
  }, { timeout: 60_000 });

  await recomputeOrder(db, doc.orderId, actor.userId);
  return { invoices: invoices.length, lines: lineCount, problems };
}

/** Gespeicherte Zuordnung (Spaltennamen) auf aktuelle Kopfzeile anwenden. */
export async function findSavedMapping(db: TenantDb, headers: string[], customerId: string | null): Promise<ColumnMap | null> {
  const sig = headerSignature(headers);
  const m = (await db.columnMapping.findFirst({ where: { headerSignature: sig, customerId } })) ?? (await db.columnMapping.findFirst({ where: { headerSignature: sig } }));
  if (!m) return null;
  const out: ColumnMap = {};
  for (const [f, name] of Object.entries(m.mapping as Record<string, string | null>)) {
    const i = headers.indexOf(name ?? "\u0000");
    if (i >= 0) out[f as keyof ColumnMap] = i;
  }
  return out;
}
