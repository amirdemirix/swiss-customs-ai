import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "@/server/tenant-db";
import { ingestDocument, reprocessDocument } from "@/server/services/documents";
import { INVOICES } from "../../scripts/generate-test-invoices";

const prisma = new PrismaClient();
const s = `${Date.now()}`;
let T = "", user = "";
afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: T } }); await prisma.user.deleteMany({ where: { id: user } }); await prisma.$disconnect(); });

describe("PDF-Rechnungen ohne KI", () => {
  it("3 PDFs → gleiches Ergebnis wie Excel: 8 Anmeldepositionen, Positionen zur Kontrolle", async () => {
    T = (await prisma.tenant.create({ data: { name: "PDF", slug: `pdf-${s}` } })).id;
    user = (await prisma.user.create({ data: { email: `pdf-${s}@test.invalid`, name: "PDF" } })).id;
    const db = tenantDb(T, prisma);
    const order = await db.customsOrder.create({ data: { tenantId: T, orderNumber: "PDF-1", direction: "IMPORT", orderDate: new Date(), createdById: user } });
    await db.exchangeRate.createMany({ data: [
      { tenantId: T, orderId: order.id, fromCurrency: "EUR", toCurrency: "CHF", rate: "0.93", validOn: new Date(), source: "Test" },
      { tenantId: T, orderId: order.id, fromCurrency: "USD", toCurrency: "CHF", rate: "0.80", validOn: new Date(), source: "Test" },
    ] });
    for (const inv of INVOICES) {
      const r = await ingestDocument(db, { tenantId: T, userId: user }, order.id, `${inv.file}.pdf`, readFileSync(`testdaten/${inv.file}.pdf`));
      expect(r.ok && r.message).toContain("Positionen aus der Tabelle erkannt");
    }
    const invoices = await db.invoice.findMany({ where: { orderId: order.id }, include: { lines: true }, orderBy: { invoiceNumber: "asc" } });
    expect(invoices.map((i) => [i.invoiceNumber, i.currency, i.totalAmount?.toString(), i.lines.length, i.reviewStatus])).toEqual([
      ["INV-77102", "EUR", "3500", 3, "NEEDS_REVIEW"], ["PT-2026-0458", "USD", "7278", 4, "NEEDS_REVIEW"], ["RE-2026-3001", "EUR", "4260", 3, "NEEDS_REVIEW"],
    ]);
    const ts = invoices.find((i) => i.invoiceNumber === "RE-2026-3001")!.lines.find((l) => l.articleNumber === "TS-100")!;
    expect([ts.tariffNumber, ts.originCountry, ts.quantity?.toString(), ts.lineAmount?.toString(), ts.netWeightKg?.toString(), ts.grossWeightKg?.toString()])
      .toEqual(["6109.1000", "CN", "300", "840", "54", "58.5"]);
    expect(ts.fieldMeta).toMatchObject({ page: 1 });
    const decl = await db.declarationLine.findMany({ where: { orderId: order.id }, include: { _count: { select: { sources: true } } } });
    const rows = decl.map((d) => `${d.tariffNumber}/${d.originCountry}=${d.totalValue.toString()}(${d._count.sources})`);
    expect(decl).toHaveLength(8);
    expect(rows).toEqual(expect.arrayContaining(["6109.1000/CN=1069.5(2)", "6110.2000/TR=2280.6(2)", "8504.4000/DE=2083.2(1)", "8504.4000/CN=760(1)"]));
    const crit = await db.validationIssue.findMany({ where: { orderId: order.id, severity: "CRITICAL" } });
    expect(crit.map((c) => c.message)).toEqual([]);

    // „Neu einlesen“: alter Stand (nur Kopf, keine Positionen) wird durch Tabellenerkennung ersetzt
    const doc = await db.document.findFirstOrThrow({ where: { orderId: order.id, fileName: { startsWith: "rechnung-1" } } });
    await db.invoiceLine.deleteMany({ where: { invoice: { documentId: doc.id } } });
    const rr = await reprocessDocument(db, { tenantId: T, userId: user }, doc.id);
    expect(rr).toMatchObject({ ok: true });
    const again = await db.invoice.findMany({ where: { documentId: doc.id }, include: { _count: { select: { lines: true } } } });
    expect(again.map((i) => i._count.lines)).toEqual([3]);
    await db.invoice.updateMany({ where: { documentId: doc.id }, data: { reviewStatus: "CONFIRMED" } });
    expect((await reprocessDocument(db, { tenantId: T, userId: user }, doc.id)).ok).toBe(false); // bestätigte Daten bleiben geschützt
  });
});
