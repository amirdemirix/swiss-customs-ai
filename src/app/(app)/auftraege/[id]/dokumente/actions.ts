"use server";
import { revalidatePath } from "next/cache";
import { getContext, assertCan, audit } from "@/server/context";
import { recomputeOrder } from "@/server/services/consolidation";
import { importSpreadsheet } from "@/server/services/spreadsheet-import";
import { reprocessDocument } from "@/server/services/documents";
import type { ActionResult } from "@/components/action-form";
import { IMPORT_FIELDS, type ColumnMap, type ImportField, type RowProblem } from "@/domain";

/** Löscht ein Dokument inkl. verschlüsselter Datei und daraus erzeugter Rechnungen. */
export async function deleteDocument(orderId: string, documentId: string, _p: ActionResult, _fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "document.delete");
  const doc = await ctx.db.document.findFirst({ where: { id: documentId, orderId }, include: { order: { select: { status: true } }, invoices: { select: { id: true, invoiceNumber: true } } } });
  if (!doc) return { error: "Dokument nicht gefunden." };
  if (doc.order.status === "COMPLETED" || doc.order.status === "ARCHIVED") return { error: "Auftrag ist abgeschlossen." };
  await ctx.db.$transaction([
    ctx.db.invoice.deleteMany({ where: { documentId } }),
    ctx.db.document.delete({ where: { id: documentId } }), // StoredFile wird per Cascade gelöscht
  ]);
  await audit(ctx, { action: "DELETE", entityType: "Document", entityId: documentId, oldValue: { fileName: doc.fileName, sha256: doc.sha256, invoices: doc.invoices } });
  await recomputeOrder(ctx.db, orderId, ctx.userId);
  revalidatePath(`/auftraege/${orderId}`);
  return { ok: true };
}

async function isPdf(documentId: string) {
  const ctx = await getContext();
  const d = await ctx.db.document.findFirst({ where: { id: documentId }, select: { kind: true } });
  return d?.kind === "PDF_TEXT";
}

export type ImportState = { error?: string; result?: { invoices: number; lines: number; problems: RowProblem[] } };

export async function runImport(orderId: string, documentId: string, _p: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await getContext();
  assertCan(ctx, "document.upload");
  const map: ColumnMap = {};
  for (const f of Object.keys(IMPORT_FIELDS) as ImportField[]) {
    const v = fd.get(`map.${f}`);
    if (typeof v === "string" && v !== "" && /^\d{1,3}$/.test(v)) map[f] = Number(v);
  }
  // Einzige erlaubte Doppelbelegung: kombinierte Gewichtsspalte (netto / brutto)
  const cols = Object.entries(map).filter(([f]) => !(f === "grossWeightKg" && map.grossWeightKg === map.netWeightKg)).map(([, i]) => i);
  if (new Set(cols).size !== cols.length) return { error: "Eine Spalte ist mehreren Feldern zugeordnet." };
  if (map.lineAmount === undefined && map.unitPrice === undefined) return { error: "Bitte mindestens Positionswert oder Einzelpreis zuordnen." };
  const str = (k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
  const cur = str("default.currency")?.toUpperCase() ?? null;
  if (cur && !/^[A-Z]{3}$/.test(cur)) return { error: "Standardwährung: ISO-Code mit 3 Buchstaben (z. B. EUR)." };
  const date = str("default.invoiceDate");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Standarddatum ungültig." };
  try {
    const result = await importSpreadsheet(ctx.db, { tenantId: ctx.tenantId, userId: ctx.userId }, {
      documentId, sheetIndex: Number(fd.get("sheet") ?? 0), headerRow: Number(fd.get("headerRow") ?? 0), map,
      defaults: { invoiceNumber: str("default.invoiceNumber"), invoiceDate: date, supplierName: str("default.supplierName"), currency: cur },
      saveMapping: fd.get("saveMapping") === "on",
      ...(await isPdf(documentId) ? { reviewStatus: "NEEDS_REVIEW" as const, method: "pdf-table" as const } : {}),
    });
    revalidatePath(`/auftraege/${orderId}`);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import fehlgeschlagen." };
  }
}

export async function reprocess(orderId: string, documentId: string, _p: ActionResult, _fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "document.upload");
  const r = await reprocessDocument(ctx.db, { tenantId: ctx.tenantId, userId: ctx.userId }, documentId);
  revalidatePath(`/auftraege/${orderId}`);
  return r.ok ? { ok: true } : { error: r.message };
}
