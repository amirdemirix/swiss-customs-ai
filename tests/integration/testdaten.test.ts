import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "@/server/tenant-db";
import { ingestDocument } from "@/server/services/documents";
import { importSpreadsheet, getSheets, findSavedMapping } from "@/server/services/spreadsheet-import";
import { autoMapColumns, findHeaderRow } from "@/domain";
import { INVOICES } from "../../scripts/generate-test-invoices";

const prisma = new PrismaClient();
const s = `${Date.now()}`;
let T = "", user = "";
afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: T } }); await prisma.user.deleteMany({ where: { id: user } }); await prisma.$disconnect(); });

describe("Testrechnungen (testdaten/)", () => {
  it("3 Excel-Rechnungen → 10 Positionen → 8 Anmeldepositionen ohne Fehler", async () => {
    T = (await prisma.tenant.create({ data: { name: "TD", slug: `td-${s}` } })).id;
    user = (await prisma.user.create({ data: { email: `td-${s}@test.invalid`, name: "TD" } })).id;
    const db = tenantDb(T, prisma);
    const order = await db.customsOrder.create({ data: { tenantId: T, orderNumber: "TD-1", direction: "IMPORT", orderDate: new Date(), createdById: user } });
    await db.exchangeRate.createMany({ data: [
      { tenantId: T, orderId: order.id, fromCurrency: "EUR", toCurrency: "CHF", rate: "0.93", validOn: new Date(), source: "Test" },
      { tenantId: T, orderId: order.id, fromCurrency: "USD", toCurrency: "CHF", rate: "0.80", validOn: new Date(), source: "Test" },
    ] });
    for (const inv of INVOICES) {
      const r = await ingestDocument(db, { tenantId: T, userId: user }, order.id, `${inv.file}.xlsx`, readFileSync(`testdaten/${inv.file}.xlsx`));
      if (!r.ok) throw new Error(r.message);
      const doc = await db.document.findFirstOrThrow({ where: { id: r.documentId } });
      const sheet = getSheets(doc)[0];
      const hr = findHeaderRow(sheet.rows);
      const map = (await findSavedMapping(db, sheet.rows[hr], null)) ?? autoMapColumns(sheet.rows[hr]);
      const res = await importSpreadsheet(db, { tenantId: T, userId: user }, { documentId: r.documentId, sheetIndex: 0, headerRow: hr, map, defaults: {}, saveMapping: true });
      expect(res.invoices).toBe(1);
    }
    const decl = await db.declarationLine.findMany({ where: { orderId: order.id }, orderBy: { position: "asc" }, include: { _count: { select: { sources: true } } } });
    const rows = decl.map((d) => `${d.tariffNumber}/${d.originCountry}=${d.totalValue.toString()}(${d._count.sources})`);
    console.log(rows.join("\n"));
    expect(decl).toHaveLength(8);
    expect(rows).toContain("6109.1000/CN=1069.5(2)"); // (840 + 310) × 0.93
    expect(rows).toContain("6110.2000/TR=2280.6(2)"); // 1740 × 0.93 + 828 × 0.80 = 1618.20 + 662.40
    expect(rows).toContain("8504.4000/DE=2083.2(1)");
    expect(rows).toContain("8504.4000/CN=760(1)");
    const issues = await db.validationIssue.findMany({ where: { orderId: order.id, severity: { in: ["CRITICAL", "WARNING"] } } });
    expect(issues.map((i) => i.message)).toEqual([]);
  });
});
