import type { DocumentKind, DocumentStatus, Prisma } from "@prisma/client";
import { autoMapColumns, detectFileType, detectInvoiceHeader, looksScanned, MIME, reconstructPdfTable, safeFileName, type DetectedHeader } from "@/domain";
import type { TenantDb } from "../tenant-db";
import { sha256 } from "../storage/crypto";
import { readFile, storeFile } from "../storage/file-store";
import { extractPdfText } from "../parsing/pdf";
import { readCsv, readXlsx } from "../parsing/spreadsheet";
import { recomputeOrder } from "./consolidation";
import { importSpreadsheet } from "./spreadsheet-import";

export interface Actor { tenantId: string; userId: string }

export type IngestResult =
  | { ok: true; documentId: string; status: DocumentStatus; kind: DocumentKind; message: string; warning?: string }
  | { ok: false; message: string; duplicate?: boolean };

/**
 * Nimmt eine hochgeladene Datei an: Typprüfung (Magic Bytes), Duplikatprüfung (SHA-256),
 * verschlüsselte Ablage, danach lokale Verarbeitung (PDF-Textlayer, Excel/CSV lesen).
 * Es werden keine Daten an externe Dienste übertragen.
 */
export async function ingestDocument(db: TenantDb, actor: Actor, orderId: string, rawName: string, data: Buffer): Promise<IngestResult> {
  const fileName = safeFileName(rawName);
  const t = detectFileType(data, fileName);
  if (!t.ok) return { ok: false, message: `${fileName}: ${t.reason}` };

  const order = await db.customsOrder.findFirst({ where: { id: orderId }, select: { id: true, status: true } });
  if (!order) return { ok: false, message: "Auftrag nicht gefunden." };
  if (order.status === "COMPLETED" || order.status === "ARCHIVED") return { ok: false, message: "Auftrag ist abgeschlossen – keine Uploads möglich." };

  const hash = sha256(data);
  const same = await db.document.findFirst({ where: { sha256: hash, deletedAt: null }, include: { order: { select: { id: true, orderNumber: true } } } });
  if (same && same.orderId === orderId) return { ok: false, duplicate: true, message: `${fileName}: identische Datei ist bereits in diesem Auftrag (${same.fileName}).` };

  const kind: DocumentKind = t.type === "PDF" ? "PDF_TEXT" : t.type === "XLSX" ? "SPREADSHEET" : t.type === "CSV" ? "CSV" : "IMAGE";
  const doc = await db.document.create({
    data: {
      tenantId: actor.tenantId, orderId, fileName, mimeType: MIME[t.type], sizeBytes: data.length, sha256: hash,
      storageKey: "pending", kind, status: "PROCESSING", uploadedById: actor.userId, duplicateOfId: same?.id ?? null,
    },
  });
  const storageKey = await storeFile(db, actor.tenantId, doc.id, data);
  await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: "UPLOAD", entityType: "Document", entityId: doc.id,
    newValue: { fileName, sha256: hash, sizeBytes: data.length, orderId } } });
  const warning = same ? `Identische Datei existiert bereits in Auftrag ${same.order.orderNumber}.` : undefined;

  try {
    const r = await finishProcessing(db, actor, doc.id, orderId, t.type, data, storageKey);
    return { ok: true, documentId: doc.id, status: r.status, kind: r.kind ?? kind, message: r.message, warning };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Unbekannter Fehler";
    await db.document.update({ where: { id: doc.id }, data: { storageKey, status: "FAILED", errorMessage: msg } });
    return { ok: true, documentId: doc.id, status: "FAILED", kind, message: `Datei gespeichert, aber nicht lesbar: ${msg}`, warning };
  }
}

/** Verarbeitet einen gespeicherten Beleg und übernimmt erkannte Tabellen (gemeinsam für Upload und „Neu einlesen“). */
async function finishProcessing(db: TenantDb, actor: Actor, documentId: string, orderId: string, type: string, data: Buffer, storageKey?: string) {
  const r = await processDocument(db, actor, documentId, orderId, type, data);
  await db.document.update({ where: { id: documentId }, data: { ...(storageKey ? { storageKey } : {}), errorMessage: null, ...r.update } });
  let message = r.message;
  if (r.autoImport) {
    // Positionstabelle im PDF erkannt → wie Excel importieren, Ergebnis immer „zu prüfen“
    try {
      const res = await importSpreadsheet(db, actor, { documentId, sheetIndex: 0, headerRow: 0, map: r.autoImport.map, defaults: r.autoImport.defaults, saveMapping: false,
        reviewStatus: "NEEDS_REVIEW", method: "pdf-table" });
      message = `${r.update.pageCount ?? 1} Seite(n) gelesen, ${res.lines} Positionen aus der Tabelle erkannt (ohne KI) – bitte in der Kontrolle prüfen.`;
    } catch (e) {
      await createHeaderDraft(db, actor, orderId, documentId, r.autoImport.header);
      await recomputeOrder(db, orderId, actor.userId);
      message = `Kopfdaten gelesen; Tabelle konnte nicht übernommen werden (${e instanceof Error ? e.message : "Fehler"}).`;
    }
  } else if (r.update.kind === "PDF_TEXT") await recomputeOrder(db, orderId, actor.userId);
  return { status: r.update.status, kind: r.update.kind, message };
}

/** Liest einen bereits gespeicherten PDF-Beleg mit der aktuellen Erkennung neu ein (ersetzt nicht bestätigte Rechnungen). */
export async function reprocessDocument(db: TenantDb, actor: Actor, documentId: string): Promise<{ ok: boolean; message: string }> {
  const doc = await db.document.findFirst({ where: { id: documentId, deletedAt: null }, include: { order: { select: { status: true } }, invoices: { select: { reviewStatus: true } } } });
  if (!doc) return { ok: false, message: "Dokument nicht gefunden." };
  if (doc.order.status === "COMPLETED" || doc.order.status === "ARCHIVED") return { ok: false, message: "Auftrag ist abgeschlossen." };
  if (doc.mimeType !== "application/pdf") return { ok: false, message: "Neu einlesen ist für PDFs vorgesehen." };
  if (doc.invoices.some((i) => i.reviewStatus === "CONFIRMED")) return { ok: false, message: "Rechnung aus diesem Beleg ist bereits bestätigt." };
  const data = await readFile(db, actor.tenantId, doc.id);
  if (!data) return { ok: false, message: "Datei nicht verfügbar." };
  await db.invoice.deleteMany({ where: { documentId: doc.id } });
  const r = await finishProcessing(db, actor, doc.id, doc.orderId, "PDF", data);
  await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: "REPROCESS", entityType: "Document", entityId: doc.id, newValue: { message: r.message } } });
  return { ok: true, message: r.message };
}

type AutoImport = { map: ReturnType<typeof autoMapColumns>; defaults: { invoiceNumber: string | null; invoiceDate: string | null; currency: string | null }; header: DetectedHeader };

async function processDocument(db: TenantDb, actor: Actor, documentId: string, orderId: string, type: string, data: Buffer):
  Promise<{ update: Prisma.DocumentUpdateInput & { status: DocumentStatus; kind?: DocumentKind; pageCount?: number }; message: string; autoImport?: AutoImport }> {
  if (type === "PDF") {
    const { pages, pageCount, items } = await extractPdfText(data);
    if (looksScanned(pages)) {
      return { update: { kind: "PDF_SCAN", status: "UPLOADED", pageCount, extractedText: { pages } }, message: "Gescanntes PDF ohne Textlayer – Positionen über die KI-Erkennung oder manuell erfassen." };
    }
    const header = detectInvoiceHeader(pages);
    const table = items.length ? reconstructPdfTable(items) : null;
    if (table) {
      const map = autoMapColumns(table.rows[0]);
      return {
        update: { kind: "PDF_TEXT", status: "EXTRACTED", pageCount, detectedHeader: header as unknown as Prisma.InputJsonValue,
          extractedText: { pages, sheets: [{ name: "PDF-Tabelle", rows: table.rows, rowPages: table.rowPages }] } as unknown as Prisma.InputJsonValue },
        message: "Tabelle erkannt.",
        autoImport: { map, header, defaults: { invoiceNumber: header.invoiceNumber?.value ?? null, invoiceDate: header.invoiceDate?.value ?? null, currency: header.currency?.value ?? null } },
      };
    }
    await createHeaderDraft(db, actor, orderId, documentId, header);
    const found = Object.values(header).filter(Boolean).length;
    return {
      update: { kind: "PDF_TEXT", status: "EXTRACTED", pageCount, extractedText: { pages }, detectedHeader: header as unknown as Prisma.InputJsonValue },
      message: `${pageCount} Seite(n) gelesen, ${found}/4 Kopfdaten erkannt. Keine Positionstabelle erkannt – KI-Erkennung oder manuelle Erfassung.`,
    };
  }
  if (type === "XLSX" || type === "CSV") {
    const sheets = type === "XLSX" ? await readXlsx(data) : readCsv(data);
    const rows = sheets.reduce((a, s) => a + s.rows.length, 0);
    if (!rows) throw new Error("Keine Zeilen gefunden.");
    return { update: { status: "EXTRACTED", extractedText: { sheets } as unknown as Prisma.InputJsonValue }, message: `${rows} Zeilen gelesen – bitte Spalten zuordnen.` };
  }
  return { update: { kind: "IMAGE", status: "UPLOADED" }, message: "Bild gespeichert – Erkennung folgt mit OCR/KI (Phase 5)." };
}

/** Rechnungskopf aus PDF-Heuristik: nur gefundene Werte, Status „zur Kontrolle“. */
async function createHeaderDraft(db: TenantDb, actor: Actor, orderId: string, documentId: string, h: DetectedHeader) {
  await db.invoice.create({
    data: {
      tenantId: actor.tenantId, orderId, documentId,
      invoiceNumber: h.invoiceNumber?.value ?? null,
      invoiceDate: h.invoiceDate ? new Date(h.invoiceDate.value) : null,
      currency: h.currency?.value ?? null,
      totalAmount: h.totalAmount?.value ?? null,
      reviewStatus: "NEEDS_REVIEW",
      extractionMeta: { method: "pdf-text-heuristic", evidence: h } as unknown as Prisma.InputJsonValue,
    },
  });
}
