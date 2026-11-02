import type { Prisma } from "@prisma/client";
import { mapExtraction } from "@/domain";
import type { TenantDb } from "../tenant-db";
import { prismaRoot } from "../db";
import { readFile } from "../storage/file-store";
import { extractInvoice, extractionConfigured, EXTRACTION_MODEL } from "../extraction/claude";
import { recomputeOrder } from "./consolidation";
import type { Actor } from "./documents";

export type AiExtractionResult = { ok: true; lines: number; needsReview: number; notes: string[] } | { ok: false; message: string };

/** Ist die KI-Erkennung für diesen Mandanten nutzbar? (Konfiguration + ausdrückliche Freigabe) */
export async function aiAvailability(tenantId: string): Promise<{ available: boolean; reason?: string }> {
  if (!extractionConfigured()) return { available: false, reason: "KI-Erkennung ist auf diesem Server nicht eingerichtet (kein API-Schlüssel)." };
  const t = await prismaRoot.tenant.findUnique({ where: { id: tenantId }, select: { aiProcessingConsent: true } });
  if (!t?.aiProcessingConsent) return { available: false, reason: "Die KI-Verarbeitung ist für Ihre Firma nicht freigegeben (Einstellungen)." };
  return { available: true };
}

export async function runAiExtraction(db: TenantDb, actor: Actor, documentId: string): Promise<AiExtractionResult> {
  const avail = await aiAvailability(actor.tenantId);
  if (!avail.available) return { ok: false, message: avail.reason! };
  const doc = await db.document.findFirst({ where: { id: documentId, deletedAt: null }, include: { order: { select: { status: true } }, invoices: { select: { id: true, reviewStatus: true } } } });
  if (!doc) return { ok: false, message: "Dokument nicht gefunden." };
  if (doc.order.status === "COMPLETED" || doc.order.status === "ARCHIVED") return { ok: false, message: "Auftrag ist abgeschlossen." };
  if (!["PDF_TEXT", "PDF_SCAN", "IMAGE"].includes(doc.kind)) return { ok: false, message: "KI-Erkennung ist nur für PDFs und Bilder vorgesehen (Excel/CSV: Spalten zuordnen)." };
  if (doc.invoices.some((i) => i.reviewStatus === "CONFIRMED")) return { ok: false, message: "Eine Rechnung aus diesem Beleg ist bereits bestätigt – erneute Erkennung würde sie überschreiben." };
  const data = await readFile(db, actor.tenantId, doc.id);
  if (!data) return { ok: false, message: "Datei nicht verfügbar." };

  const tenant = await prismaRoot.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { reviewConfidenceThreshold: true } });
  // Übermittlung an externen Dienst VOR dem Senden protokollieren
  await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: "AI_SEND", entityType: "Document", entityId: doc.id,
    newValue: { provider: "Anthropic", model: EXTRACTION_MODEL, fileName: doc.fileName, sha256: doc.sha256, bytes: data.length } } });
  await db.document.update({ where: { id: doc.id }, data: { status: "PROCESSING" } });

  let res;
  try {
    res = await extractInvoice(data, doc.mimeType);
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "KI-Erkennung fehlgeschlagen.";
    await db.document.update({ where: { id: doc.id }, data: { status: "FAILED", errorMessage: message } });
    return { ok: false, message };
  }
  const m = mapExtraction(res.result, Number(tenant.reviewConfidenceThreshold));

  await db.$transaction(async (tx) => {
    await tx.invoice.deleteMany({ where: { documentId: doc.id } });
    await tx.invoice.create({
      data: {
        tenantId: actor.tenantId, orderId: doc.orderId, documentId: doc.id,
        invoiceNumber: m.invoiceNumber, invoiceDate: m.invoiceDate ? new Date(m.invoiceDate) : null, supplierName: m.supplierName,
        currency: m.currency, totalAmount: m.totalAmount, incoterm: m.incoterm, netWeightKg: m.netWeightKg, grossWeightKg: m.grossWeightKg, packages: m.packages,
        reviewStatus: "NEEDS_REVIEW",
        extractionMeta: { method: "ai", model: res.model, usage: res.usage, header: m.headerMeta, notes: m.notes } as Prisma.InputJsonValue,
        lines: { create: m.lines.map((l) => ({
          tenantId: actor.tenantId, lineNo: l.lineNo, articleNumber: l.articleNumber, description: l.description,
          tariffNumber: l.tariffNumber, tariffNumberSource: l.tariffNumber ? "INVOICE" : null, originCountry: l.originCountry, originSource: l.originCountry ? "INVOICE" : null,
          quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, lineAmount: l.lineAmount, netWeightKg: l.netWeightKg, grossWeightKg: l.grossWeightKg,
          reviewStatus: l.needsReview ? "NEEDS_REVIEW" : "EXTRACTED", fieldMeta: l.fieldMeta as unknown as Prisma.InputJsonValue,
        })) },
      },
    });
    await tx.document.update({ where: { id: doc.id }, data: { status: "EXTRACTED", errorMessage: null } });
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: "AI_EXTRACT", entityType: "Document", entityId: doc.id,
      newValue: { model: res.model, lines: m.lines.length, needsReview: m.lines.filter((l) => l.needsReview).length, usage: res.usage } as Prisma.InputJsonValue } });
  }, { timeout: 60_000 });
  await recomputeOrder(db, doc.orderId, actor.userId);
  return { ok: true, lines: m.lines.length, needsReview: m.lines.filter((l) => l.needsReview).length, notes: m.notes };
}
