import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Externer KI-Dienst wird in Tests NIE aufgerufen
const extractMock = vi.fn();
vi.mock("@/server/extraction/claude", () => ({
  EXTRACTION_MODEL: "test-model",
  extractionConfigured: () => true,
  extractInvoice: (...a: unknown[]) => extractMock(...a),
}));

const { tenantDb } = await import("@/server/tenant-db");
const { ingestDocument } = await import("@/server/services/documents");
const { runAiExtraction } = await import("@/server/services/ai-extraction");
const { buildPdf } = await import("../../scripts/generate-samples");

const prisma = new PrismaClient();
const s = `${Date.now()}`;
let T: string, user: string, order: string, docId: string;

beforeAll(async () => {
  T = (await prisma.tenant.create({ data: { name: "AI", slug: `ai-${s}` } })).id;
  user = (await prisma.user.create({ data: { email: `ai-${s}@test.invalid`, name: "AI" } })).id;
  order = (await tenantDb(T, prisma).customsOrder.create({ data: { tenantId: T, orderNumber: "AI-1", direction: "IMPORT", orderDate: new Date(), createdById: user } })).id;
  const r = await ingestDocument(tenantDb(T, prisma), { tenantId: T, userId: user }, order, "r.pdf", await buildPdf());
  if (!r.ok) throw new Error(r.message);
  docId = r.documentId;
});
afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: T } });
  await prisma.user.deleteMany({ where: { id: user } });
  await prisma.$disconnect();
});

const f = (value: string | null, confidence = 0.95) => ({ value, confidence, page: 1 });
const result = {
  isInvoice: true, invoiceNumber: f("R-55120"), invoiceDate: f("2026-10-22"), supplierName: f("Beispiel Werkzeuge AG"), currency: f("EUR"), totalAmount: f("1577.00"),
  incoterm: f(null, 0), totalNetWeightKg: f("48.5"), totalGrossWeightKg: f("55.2"), packages: f(null, 0), notes: ["Gewichte nur als Sendungstotal angegeben."],
  lines: [
    { lineNo: 1, page: 1, articleNumber: "WZ-10", description: "Schraubendreher-Set", tariffNumber: "8205.4000", originCountry: "DE", quantity: "50", unit: "PCE", unitPrice: "12.40", lineAmount: "620.00", netWeightKg: null, grossWeightKg: null, confidence: 0.98, uncertainFields: [] },
    { lineNo: 2, page: 1, articleNumber: "WZ-30", description: "Bohrer-Set HSS", tariffNumber: "8207.5000", originCountry: "CN", quantity: "40", unit: "PCE", unitPrice: "9.75", lineAmount: "390.00", netWeightKg: null, grossWeightKg: null, confidence: 0.7, uncertainFields: ["originCountry"] },
  ],
};

describe("KI-Erkennung", () => {
  it("ohne Freigabe des Mandanten wird nichts gesendet", async () => {
    const r = await runAiExtraction(tenantDb(T, prisma), { tenantId: T, userId: user }, docId);
    expect(r).toMatchObject({ ok: false });
    expect(extractMock).not.toHaveBeenCalled();
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "AI_SEND" } })).toBe(0);
  });
  it("mit Freigabe: Übermittlung protokolliert, Positionen zur Kontrolle, Heuristik-Entwurf ersetzt", async () => {
    await prisma.tenant.update({ where: { id: T }, data: { aiProcessingConsent: true } });
    extractMock.mockResolvedValueOnce({ result, model: "test-model", usage: { input_tokens: 1, output_tokens: 1 } });
    const db = tenantDb(T, prisma);
    const r = await runAiExtraction(db, { tenantId: T, userId: user }, docId);
    expect(r).toMatchObject({ ok: true, lines: 2, needsReview: 1 });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "AI_SEND", entityId: docId } })).toBe(1);
    const invs = await db.invoice.findMany({ where: { documentId: docId }, include: { lines: { orderBy: { lineNo: "asc" } } } });
    expect(invs).toHaveLength(1);
    expect(invs[0]).toMatchObject({ reviewStatus: "NEEDS_REVIEW", grossWeightKg: expect.anything() });
    expect(invs[0].lines.map((l) => [l.reviewStatus, l.tariffNumberSource, l.grossWeightKg])).toEqual([["EXTRACTED", "INVOICE", null], ["NEEDS_REVIEW", "INVOICE", null]]);
  });
  it("fehlerhafte KI-Antwort hinterlässt Dokument im Fehlerstatus, Daten bleiben erhalten", async () => {
    extractMock.mockRejectedValueOnce(new Error("KI-Antwort entspricht nicht dem erwarteten Schema."));
    const r = await runAiExtraction(tenantDb(T, prisma), { tenantId: T, userId: user }, docId);
    expect(r).toMatchObject({ ok: false });
    expect((await prisma.document.findUniqueOrThrow({ where: { id: docId } })).status).toBe("FAILED");
    expect(await prisma.invoiceLine.count({ where: { invoice: { documentId: docId } } })).toBe(2);
  });
  it("bestätigte Rechnungen werden nicht überschrieben", async () => {
    await prisma.invoice.updateMany({ where: { documentId: docId }, data: { reviewStatus: "CONFIRMED" } });
    const r = await runAiExtraction(tenantDb(T, prisma), { tenantId: T, userId: user }, docId);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.message).toContain("bestätigt");
  });
});
