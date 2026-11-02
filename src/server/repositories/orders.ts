import type { TenantDb } from "../tenant-db";

export function listOrders(db: TenantDb, q?: string) {
  return db.customsOrder.findMany({
    where: q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { customer: { select: { name: true } }, _count: { select: { invoices: true, declarationLines: true } } },
  });
}

export async function getOrderOverview(db: TenantDb, id: string) {
  const order = await db.customsOrder.findFirst({
    where: { id },
    include: {
      customer: true,
      exchangeRates: { orderBy: { fromCurrency: "asc" } },
      documents: {
        where: { deletedAt: null }, orderBy: { createdAt: "desc" },
        select: { id: true, fileName: true, kind: true, status: true, sizeBytes: true, pageCount: true, errorMessage: true, duplicateOfId: true, createdAt: true,
          _count: { select: { invoices: true } }, invoices: { select: { _count: { select: { lines: true } } } } },
      },
      invoices: { orderBy: { invoiceNumber: "asc" }, include: { _count: { select: { lines: true } } } },
      declarationLines: {
        orderBy: { position: "asc" },
        include: { sources: { include: { invoiceLine: { include: { invoice: { select: { invoiceNumber: true, currency: true } } } } } } },
      },
      issues: { where: { resolvedAt: null }, orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
    },
  });
  return order;
}
