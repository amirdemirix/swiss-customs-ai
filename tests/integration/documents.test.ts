import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "@/server/tenant-db";
import { ingestDocument } from "@/server/services/documents";
import { importSpreadsheet, getSheets } from "@/server/services/spreadsheet-import";
import { readFile } from "@/server/storage/file-store";
import { autoMapColumns, findHeaderRow } from "@/domain";
import { CSV_SAMPLE, buildPdf, buildXlsx } from "../../scripts/generate-samples";

const prisma = new PrismaClient();
const s = `${Date.now()}`;
let A: string, B: string, user: string, order1: string, order2: string, orderB: string;
const actorA = () => ({ tenantId: A, userId: user });

beforeAll(async () => {
  A = (await prisma.tenant.create({ data: { name: "Doc A", slug: `doc-a-${s}` } })).id;
  B = (await prisma.tenant.create({ data: { name: "Doc B", slug: `doc-b-${s}` } })).id;
  user = (await prisma.user.create({ data: { email: `doc-${s}@test.invalid`, name: "Doc" } })).id;
  const dbA = tenantDb(A, prisma), dbB = tenantDb(B, prisma);
  order1 = (await dbA.customsOrder.create({ data: { tenantId: A, orderNumber: "D-1", direction: "IMPORT", orderDate: new Date(), createdById: user, declarationCurrency: "CHF" } })).id;
  order2 = (await dbA.customsOrder.create({ data: { tenantId: A, orderNumber: "D-2", direction: "IMPORT", orderDate: new Date(), createdById: user } })).id;
  orderB = (await dbB.customsOrder.create({ data: { tenantId: B, orderNumber: "DB-1", direction: "IMPORT", orderDate: new Date(), createdById: user } })).id;
  await dbA.exchangeRate.create({ data: { tenantId: A, orderId: order1, fromCurrency: "EUR", toCurrency: "CHF", rate: "0.93", validOn: new Date(), source: "Test" } });
});
afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.user.deleteMany({ where: { id: user } });
  await prisma.$disconnect();
});

describe("Beleg-Upload & Verarbeitung", () => {
  let csvDoc: string;
  it("CSV: verschlüsselt gespeichert, gelesen, bereit zur Zuordnung", async () => {
    const r = await ingestDocument(tenantDb(A, prisma), actorA(), order1, "lieferant.csv", Buffer.from(CSV_SAMPLE));
    expect(r).toMatchObject({ ok: true, status: "EXTRACTED", kind: "CSV" });
    if (!r.ok) return;
    csvDoc = r.documentId;
    const stored = await prisma.storedFile.findUniqueOrThrow({ where: { documentId: csvDoc } });
    expect(Buffer.from(stored.ciphertext).includes(Buffer.from("Muster Textil"))).toBe(false);
    expect((await readFile(tenantDb(A, prisma), A, csvDoc))!.toString()).toBe(CSV_SAMPLE);
  });
  it("identische Datei im selben Auftrag wird abgewiesen", async () => {
    const r = await ingestDocument(tenantDb(A, prisma), actorA(), order1, "kopie.csv", Buffer.from(CSV_SAMPLE));
    expect(r).toMatchObject({ ok: false, duplicate: true });
  });
  it("identische Datei in anderem Auftrag wird angenommen, aber markiert", async () => {
    const r = await ingestDocument(tenantDb(A, prisma), actorA(), order2, "kopie.csv", Buffer.from(CSV_SAMPLE));
    expect(r.ok && r.warning).toContain("D-1");
    const d = await prisma.document.findFirstOrThrow({ where: { orderId: order2 } });
    expect(d.duplicateOfId).toBe(csvDoc);
  });
  it("Import erzeugt Rechnungen, Positionen mit Quellzeile, Gruppierung läuft", async () => {
    const db = tenantDb(A, prisma);
    const doc = await db.document.findFirstOrThrow({ where: { id: csvDoc } });
    const sheet = getSheets(doc)[0];
    const headerRow = findHeaderRow(sheet.rows);
    const res = await importSpreadsheet(db, actorA(), { documentId: csvDoc, sheetIndex: 0, headerRow, map: autoMapColumns(sheet.rows[headerRow]), defaults: {}, saveMapping: true });
    expect(res).toMatchObject({ invoices: 2, lines: 5 });
    const line = await db.invoiceLine.findFirstOrThrow({ where: { articleNumber: "TS-200" } });
    expect(line.lineAmount?.toString()).toBe("700");
    expect(line.netWeightKg?.toString()).toBe("46.25");
    expect(line.fieldMeta).toMatchObject({ source: { row: 3 } });
    const decl = await db.declarationLine.findMany({ where: { orderId: order1 }, orderBy: { position: "asc" } });
    const cn = decl.find((d) => d.tariffNumber === "6109.1000" && d.originCountry === "CN")!;
    expect(cn.totalValue.toString()).toBe("1302"); // (500 + 900) EUR × 0.93
    expect(await db.columnMapping.count()).toBe(1);
  });
  it("erneuter Import ersetzt statt verdoppelt", async () => {
    const db = tenantDb(A, prisma);
    const doc = await db.document.findFirstOrThrow({ where: { id: csvDoc } });
    const sheet = getSheets(doc)[0];
    await importSpreadsheet(db, actorA(), { documentId: csvDoc, sheetIndex: 0, headerRow: 0, map: autoMapColumns(sheet.rows[0]), defaults: {}, saveMapping: false });
    expect(await db.invoice.count({ where: { documentId: csvDoc } })).toBe(2);
    expect(await db.invoiceLine.count({ where: { invoice: { documentId: csvDoc } } })).toBe(5);
  });
  it("XLSX mit Titelzeilen, Formeln und Summenzeile", async () => {
    const db = tenantDb(A, prisma);
    const r = await ingestDocument(db, actorA(), order1, "invoice.xlsx", await buildXlsx());
    expect(r).toMatchObject({ ok: true, status: "EXTRACTED", kind: "SPREADSHEET" });
    if (!r.ok) return;
    const doc = await db.document.findFirstOrThrow({ where: { id: r.documentId } });
    const sheet = getSheets(doc)[0];
    const headerRow = findHeaderRow(sheet.rows);
    expect(headerRow).toBe(3);
    const res = await importSpreadsheet(db, actorA(), { documentId: r.documentId, sheetIndex: 0, headerRow, map: autoMapColumns(sheet.rows[headerRow]), defaults: { invoiceNumber: "INV-88017", currency: "EUR" }, saveMapping: false });
    expect(res.lines).toBe(4);
    const inv = await db.invoice.findFirstOrThrow({ where: { documentId: r.documentId } });
    expect(inv.totalAmount?.toString()).toBe("4255"); // aus Summenzeile, nicht berechnet
    expect(res.problems.some((p) => p.message.includes("Summenzeile"))).toBe(true);
    const psu = await db.invoiceLine.findFirstOrThrow({ where: { articleNumber: "PSU-24", invoice: { documentId: r.documentId } } });
    expect(psu.fieldMeta).toMatchObject({ source: { row: 5 } }); // = Excel-Zeile 5
  });
  it("PDF mit Textlayer: Kopfdaten als Vorschlag, Status zur Kontrolle", async () => {
    const db = tenantDb(A, prisma);
    const r = await ingestDocument(db, actorA(), order1, "rechnung.pdf", await buildPdf());
    expect(r).toMatchObject({ ok: true, status: "EXTRACTED", kind: "PDF_TEXT" });
    if (!r.ok) return;
    const inv = await db.invoice.findFirstOrThrow({ where: { documentId: r.documentId } });
    expect(inv).toMatchObject({ invoiceNumber: "R-55120", currency: "EUR", reviewStatus: "NEEDS_REVIEW" });
    expect(inv.totalAmount?.toString()).toBe("1577");
    expect(inv.invoiceDate?.toISOString().slice(0, 10)).toBe("2026-10-22");
  });
  it("getarnte Datei wird abgewiesen und nicht gespeichert", async () => {
    const before = await prisma.document.count({ where: { tenantId: A } });
    const r = await ingestDocument(tenantDb(A, prisma), actorA(), order1, "rechnung.pdf", Buffer.from("<html><script>alert(1)</script></html>"));
    expect(r.ok).toBe(false);
    expect(await prisma.document.count({ where: { tenantId: A } })).toBe(before);
  });
});

describe("Mandantentrennung bei Belegen", () => {
  it("fremder Mandant kann Datei weder lesen noch in fremden Auftrag hochladen", async () => {
    const doc = await prisma.document.findFirstOrThrow({ where: { tenantId: A } });
    expect(await readFile(tenantDb(B, prisma), B, doc.id)).toBeNull();
    expect(await tenantDb(B, prisma).document.findFirst({ where: { id: doc.id } })).toBeNull();
    const r = await ingestDocument(tenantDb(B, prisma), { tenantId: B, userId: user }, order1, "x.csv", Buffer.from("a;b\n1;2"));
    expect(r).toMatchObject({ ok: false, message: "Auftrag nicht gefunden." });
  });
  it("Chiffrat kann nicht unter fremder Mandanten-ID entschlüsselt werden", async () => {
    const doc = await prisma.document.findFirstOrThrow({ where: { tenantId: A } });
    await expect(readFile(tenantDb(A, prisma), B, doc.id)).rejects.toThrow();
  });
  it("Löschen eines Dokuments entfernt verschlüsselte Datei (Cascade)", async () => {
    const db = tenantDb(A, prisma);
    const doc = await db.document.findFirstOrThrow({ where: { orderId: order2 } });
    await db.document.delete({ where: { id: doc.id } });
    expect(await prisma.storedFile.count({ where: { documentId: doc.id } })).toBe(0);
    void orderB;
  });
});
