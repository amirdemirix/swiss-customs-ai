import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { tenantDb, TENANT_SCOPED_MODELS, TENANT_GUARD_EXEMPT, TenantViolationError } from "@/server/tenant-db";

/** Benötigt eine laufende Datenbank (DATABASE_URL). Legt eigene Testmandanten an und löscht sie wieder. */
const prisma = new PrismaClient();
let A: string, B: string, user: string, orderB: string;

beforeAll(async () => {
  const s = `${Date.now()}`;
  A = (await prisma.tenant.create({ data: { name: "Test A", slug: `test-a-${s}` } })).id;
  B = (await prisma.tenant.create({ data: { name: "Test B", slug: `test-b-${s}` } })).id;
  user = (await prisma.user.create({ data: { email: `iso-${s}@test.invalid`, name: "Iso" } })).id;
  await tenantDb(A, prisma).customsOrder.create({ data: { tenantId: A, orderNumber: "A-1", direction: "IMPORT", orderDate: new Date(), createdById: user } });
  orderB = (await tenantDb(B, prisma).customsOrder.create({ data: { tenantId: B, orderNumber: "B-1", direction: "IMPORT", orderDate: new Date(), createdById: user } })).id;
});
afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.user.delete({ where: { id: user } });
  await prisma.$disconnect();
});

describe("Mandantentrennung", () => {
  it("jedes Modell mit tenantId ist im Guard registriert", () => {
    const withTenant = Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === "tenantId")).map((m) => m.name).sort();
    expect([...TENANT_SCOPED_MODELS, ...TENANT_GUARD_EXEMPT].sort()).toEqual(withTenant);
  });
  it("findMany liefert nur eigene Daten", async () => {
    const rows = await tenantDb(A, prisma).customsOrder.findMany();
    expect(rows.map((r) => r.orderNumber)).toEqual(["A-1"]);
  });
  it("Zugriff per ID auf fremde Daten liefert nichts", async () => {
    const db = tenantDb(A, prisma);
    expect(await db.customsOrder.findFirst({ where: { id: orderB } })).toBeNull();
    expect(await db.customsOrder.findUnique({ where: { id: orderB } })).toBeNull();
    expect(await db.customsOrder.count({ where: { id: orderB } })).toBe(0);
  });
  it("OR-Bedingungen können den Filter nicht umgehen", async () => {
    const rows = await tenantDb(A, prisma).customsOrder.findMany({ where: { OR: [{ id: orderB }, { tenantId: B }] } });
    expect(rows).toEqual([]);
  });
  it("fremde Daten können nicht geändert oder gelöscht werden", async () => {
    const db = tenantDb(A, prisma);
    expect((await db.customsOrder.updateMany({ where: { id: orderB }, data: { remarks: "x" } })).count).toBe(0);
    await expect(db.customsOrder.update({ where: { id: orderB }, data: { remarks: "x" } })).rejects.toThrow();
    expect((await db.customsOrder.deleteMany({ where: { id: orderB } })).count).toBe(0);
    expect(await prisma.customsOrder.findUnique({ where: { id: orderB } })).not.toBeNull();
  });
  it("Schreiben in fremden Mandanten wird abgewiesen", async () => {
    await expect(tenantDb(A, prisma).customer.create({ data: { tenantId: B, name: "Fremd" } })).rejects.toBeInstanceOf(TenantViolationError);
    await expect(tenantDb(A, prisma).customsOrder.updateMany({ data: { tenantId: B } })).rejects.toBeInstanceOf(TenantViolationError);
  });
  it("create setzt tenantId automatisch", async () => {
    const c = await tenantDb(A, prisma).customer.create({ data: { name: "Auto" } as never });
    expect(c.tenantId).toBe(A);
  });
  it("Aggregationen sind mandantenbeschränkt", async () => {
    const g = await tenantDb(B, prisma).customsOrder.groupBy({ by: ["tenantId"], _count: { _all: true } });
    expect(g).toEqual([{ tenantId: B, _count: { _all: 1 } }]);
  });
});
