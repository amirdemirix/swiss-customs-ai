import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "@/server/tenant-db";
import { recomputeOrder } from "@/server/services/consolidation";
import { loadExportData } from "@/server/export/data";
import { buildOrderWorkbook } from "@/server/export/excel";
import { DeclarationNotReadyError, neutralJsonAdapter } from "@/server/export/declaration";

const prisma = new PrismaClient();
const s = `${Date.now()}`;
let T: string, user: string, order: string;
const meta = { userName: "Test", generatedAt: new Date("2026-11-02T12:00:00Z") };

beforeAll(async () => {
  T = (await prisma.tenant.create({ data: { name: "Exp", slug: `exp-${s}` } })).id;
  user = (await prisma.user.create({ data: { email: `exp-${s}@test.invalid`, name: "Exp" } })).id;
  const db = tenantDb(T, prisma);
  order = (await db.customsOrder.create({ data: { tenantId: T, orderNumber: "EX-1", direction: "IMPORT", orderDate: new Date(), createdById: user } })).id;
  await db.exchangeRate.create({ data: { tenantId: T, orderId: order, fromCurrency: "EUR", toCurrency: "CHF", rate: "0.9312", validOn: new Date(), source: "Test" } });
  const mk = (no: number, t: string, o: string, amt: string, nw: string, gw: string) => ({ tenantId: T, lineNo: no, tariffNumber: t, originCountry: o, statisticalKey: "000", preferenceStatus: "NONE" as const,
    quantity: "1", unit: "PCE", unitPrice: amt, lineAmount: amt, netWeightKg: nw, grossWeightKg: gw, description: "Ware" });
  await db.invoice.create({ data: { tenantId: T, orderId: order, invoiceNumber: "E-1", supplierName: "S", invoiceDate: new Date(), currency: "EUR", totalAmount: "1500.01",
    lines: { create: [mk(1, "6109.1000", "CN", "500.005", "1.111", "1.2"), mk(2, "6109.1000", "CN", "1000.005", "2.222", "2.4")] } } });
  await db.invoice.create({ data: { tenantId: T, orderId: order, invoiceNumber: "C-1", supplierName: "S2", invoiceDate: new Date(), currency: "CHF", totalAmount: "333.33",
    lines: { create: [mk(1, "8504.4000", "DE", "333.33", "3", "3.5")] } } });
  await recomputeOrder(db, order, user);
});
afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: T } });
  await prisma.user.deleteMany({ where: { id: user } });
  await prisma.$disconnect();
});

describe("Excel-Export", () => {
  it("hat 4 Blätter und mathematisch korrekte Summen", async () => {
    const d = await loadExportData(tenantDb(T, prisma), order);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildOrderWorkbook(d, meta)) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Zollübersicht", "Rechnungsdetails", "Rechnungsübersicht", "Prüfprotokoll"]);
    const s1 = wb.getWorksheet("Zollübersicht")!;
    // 6109.1000/CN = (500.005 + 1000.005) × 0.9312 = 1396.809312 → 1396.81 ; 8504.4000/DE = 333.33
    const values = [2, 3].map((r) => s1.getRow(r).getCell(8).value);
    expect(values).toEqual([1396.81, 333.33]);
    const totalRow = s1.getRow(4);
    expect(totalRow.getCell(7).value).toBe("Total (Formel)");
    expect((totalRow.getCell(8).value as { formula: string; result: number }).result).toBe(1730.14);
    expect(s1.getRow(5).getCell(8).value).toBe(1730.14); // Kontrollwert
    expect(s1.getRow(2).getCell(13).value).toBe(3.6); // Brutto exakt 1.2 + 2.4
    const s2 = wb.getWorksheet("Rechnungsdetails")!;
    expect(s2.rowCount).toBe(4); // Kopf + 3 Positionen – nichts verloren
    const s3 = wb.getWorksheet("Rechnungsübersicht")!;
    expect(s3.getRow(2).getCell(7).value).toBe(0); // Summe Positionen 1500.01 − Total 1500.01
    const s4 = wb.getWorksheet("Prüfprotokoll")!;
    expect(s4.rowCount).toBeGreaterThan(1);
    expect(String(s1.getColumn(1).values.find((v) => v === "Status") ? "ok" : "")).toBe("ok");
  });
});

describe("Anmeldevorbereitung", () => {
  it("ist blockiert, solange Rechnungen unbestätigt sind", async () => {
    const d = await loadExportData(tenantDb(T, prisma), order);
    expect(() => neutralJsonAdapter.build(d, meta)).toThrow(DeclarationNotReadyError);
  });
  it("liefert nach Bestätigung einen vollständigen, nachvollziehbaren Datensatz", async () => {
    await prisma.invoice.updateMany({ where: { orderId: order }, data: { reviewStatus: "CONFIRMED" } });
    const d = await loadExportData(tenantDb(T, prisma), order);
    expect(d.critical).toBe(0);
    const r = neutralJsonAdapter.build(d, meta);
    const j = JSON.parse(r.body);
    expect(j.format).toBe("sca-declaration/1.0");
    expect(j.notice).toContain("keine eingereichte Zollanmeldung");
    expect(j.totals).toEqual({ value: "1730.14", grossMassKg: "7.100", items: 2 });
    expect(j.items[0]).toMatchObject({ tariffNumber: "6109.1000", originCountry: "CN", value: { amount: "1396.81", currency: "CHF" }, grossMassKg: "3.600" });
    expect(j.items.flatMap((i: { sourceInvoiceLineIds: string[] }) => i.sourceInvoiceLineIds)).toHaveLength(3);
  });
});
