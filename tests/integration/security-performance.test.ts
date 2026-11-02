import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "@/server/tenant-db";
import { DbRateLimiter } from "@/server/auth/rate-limit";
import { purgeExpiredDocuments } from "@/server/services/retention";
import { ingestDocument } from "@/server/services/documents";
import { recomputeOrder } from "@/server/services/consolidation";
import { readFile } from "@/server/storage/file-store";

const prisma = new PrismaClient();
const s = `${Date.now()}`;
let T: string, user: string;

beforeAll(async () => {
  T = (await prisma.tenant.create({ data: { name: "Sec", slug: `sec-${s}`, retentionDays: 30 } })).id;
  user = (await prisma.user.create({ data: { email: `sec-${s}@test.invalid`, name: "Sec" } })).id;
});
afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: T } });
  await prisma.user.deleteMany({ where: { id: user } });
  await prisma.$disconnect();
});

describe("Rate-Limit über die Datenbank", () => {
  it("sperrt instanzübergreifend nach dem Limit und speichert keine Klartext-Schlüssel", async () => {
    const a = new DbRateLimiter(3, 60_000), b = new DbRateLimiter(3, 60_000); // zwei „Instanzen“
    const key = `x-${s}@test.invalid|1.2.3.4`;
    expect((await a.check(key)).allowed).toBe(true);
    expect((await b.check(key)).allowed).toBe(true);
    expect((await a.check(key)).allowed).toBe(true);
    expect((await b.check(key)).allowed).toBe(false);
    expect(await prisma.loginAttempt.count({ where: { key: { contains: "test.invalid" } } })).toBe(0);
    await a.reset(key);
    expect((await b.check(key)).allowed).toBe(true);
    await a.reset(key);
  });
});

describe("Aufbewahrungsfrist", () => {
  it("löscht Originale nur abgeschlossener Aufträge nach Fristablauf, Protokoll bleibt", async () => {
    const db = tenantDb(T, prisma);
    const done = await db.customsOrder.create({ data: { tenantId: T, orderNumber: "R-DONE", direction: "IMPORT", orderDate: new Date(), createdById: user } });
    const open = await db.customsOrder.create({ data: { tenantId: T, orderNumber: "R-OPEN", direction: "IMPORT", orderDate: new Date(), createdById: user } });
    const r1 = await ingestDocument(db, { tenantId: T, userId: user }, done.id, "alt.csv", Buffer.from("a;b\n1;2"));
    const r2 = await ingestDocument(db, { tenantId: T, userId: user }, open.id, "offen.csv", Buffer.from("a;b\n3;4"));
    if (!r1.ok || !r2.ok) throw new Error("ingest");
    await prisma.customsOrder.update({ where: { id: done.id }, data: { status: "COMPLETED" } });
    const old = new Date(Date.now() - 40 * 86400_000);
    await prisma.document.updateMany({ where: { tenantId: T }, data: { createdAt: old } });
    const res = await purgeExpiredDocuments();
    expect(res.find((x) => x.tenant === `sec-${s}`)?.purged).toBe(1);
    expect(await readFile(db, T, r1.documentId)).toBeNull();
    expect(await readFile(db, T, r2.documentId)).not.toBeNull(); // offener Auftrag bleibt
    const d1 = await prisma.document.findUniqueOrThrow({ where: { id: r1.documentId } });
    expect(d1.deletedAt).not.toBeNull();
    expect(d1.extractedText).toBeNull();
    expect(d1.sha256).toHaveLength(64); // Metadaten bleiben
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "RETENTION_PURGE", entityId: r1.documentId } })).toBe(1);
  });
});

describe("Lasttest", () => {
  it("prüft und gruppiert 5'000 Positionen aus 35 Rechnungen zügig und verlustfrei", async () => {
    const db = tenantDb(T, prisma);
    const o = await db.customsOrder.create({ data: { tenantId: T, orderNumber: "LOAD", direction: "IMPORT", orderDate: new Date(), createdById: user } });
    const origins = ["CN", "DE", "TR", "IT", "VN", "IN", "US", "JP", "KR", "PL", "CZ", "TW"];
    for (let i = 0; i < 35; i++) {
      const inv = await db.invoice.create({ data: { tenantId: T, orderId: o.id, invoiceNumber: `L-${i}`, supplierName: "S", currency: "CHF", invoiceDate: new Date() } });
      const n = i < 34 ? 143 : 5000 - 34 * 143;
      await db.invoiceLine.createMany({ data: Array.from({ length: n }, (_, k) => ({ tenantId: T, invoiceId: inv.id, lineNo: k + 1, articleNumber: `A-${(i * 143 + k) % 400}`,
        description: "Ware", tariffNumber: `${8471 + (k % 5)}.${String(1000 + (k % 9) * 1000).padStart(4, "0")}`, statisticalKey: "000", originCountry: origins[(i * 143 + k) % 400 % 12],
        preferenceStatus: "NONE", quantity: "2", unit: "PCE", unitPrice: "5.05", lineAmount: "10.10", netWeightKg: "0.125", grossWeightKg: "0.150" })) });
    }
    const t0 = Date.now();
    const r = await recomputeOrder(db, o.id, user);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(15_000);
    const decl = await db.declarationLine.findMany({ where: { orderId: o.id }, include: { _count: { select: { sources: true } } } });
    expect(decl.reduce((a, d) => a + d._count.sources, 0)).toBe(5000);
    const total = decl.reduce((a, d) => a + Math.round(Number(d.totalValue) * 100), 0);
    expect(total).toBe(5000 * 1010); // CHF 50'500.00
    console.log(`Lasttest: 5'000 Positionen → ${r.groups} Anmeldepositionen in ${ms} ms`);
  }, 60_000);
});
