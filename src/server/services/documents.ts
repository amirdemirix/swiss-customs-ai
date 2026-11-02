import type { DocumentKind, DocumentStatus, Prisma } from "@prisma/client";
import { detectFileType, detectInvoiceHeader, looksScanned, MIME, safeFileName, type DetectedHeader } from "@/domain";
import type { TenantDb } from "../tenant-db";
import { sha256 } from "../storage/crypto";
import { storeFile } from "../storage/file-store";
import { extractPdfText } from "../parsing/pdf";
import { readCsv, readXlsx } from "../parsing/spreadsheet";
import { recomputeOrder } from "./consolidation";

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
    const r = await processDocument(db, actor, doc.id, orderId, t.type, data);
    await db.document.update({ where: { id: doc.id }, data: { storageKey, ...r.update } });
    if (r.update.kind === "PDF_TEXT") await recomputeOrder(db, orderId, actor.userId); // neuer Rechnungskopf → Prüfung aktualisieren
    return { ok: true, documentId: doc.id, status: r.update.status, kind: r.update.kind ?? kind, message: r.message, warning };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Unbekannter Fehler";
    await db.document.update({ where: { id: doc.id }, data: { storageKey, status: "FAILED", errorMessage: msg } });
    return { ok: true, documentId: doc.id, status: "FAILED", kind, message: `Datei gespeichert, aber nicht lesbar: ${msg}`, warning };
  }
}

async function processDocument(db: TenantDb, actor: Actor, documentId: string, orderId: string, type: string, data: Buffer):
  Promise<{ update: Prisma.DocumentUpdateInput & { status: DocumentStatus; kind?: DocumentKind }; message: string }> {
  if (type === "PDF") {
    const { pages, pageCount } = await extractPdfText(data);
    if (looksScanned(pages)) {
      return { update: { kind: "PDF_SCAN", status: "UPLOADED", pageCount, extractedText: { pages } }, message: "Gescanntes PDF ohne Textlayer – Erkennung folgt mit OCR/KI (Phase 5)." };
    }
    const header = detectInvoiceHeader(pages);
    await createHeaderDraft(db, actor, orderId, documentId, header);
    const found = Object.values(header).filter(Boolean).length;
    return {
      update: { kind: "PDF_TEXT", status: "EXTRACTED", pageCount, extractedText: { pages }, detectedHeader: header as unknown as Prisma.InputJsonValue },
      message: `${pageCount} Seite(n) gelesen, ${found}/4 Kopfdaten erkannt (Vorschläge). Positionen: Erfassung/KI in Phase 5.`,
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
