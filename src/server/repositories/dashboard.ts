import type { TenantDb } from "../tenant-db";

export async function getDashboardStats(db: TenantDb) {
  const [byStatus, invoices, lines, ordersWithCritical, recent] = await Promise.all([
    db.customsOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    db.invoice.count(),
    db.invoiceLine.count(),
    db.validationIssue.findMany({ where: { severity: "CRITICAL", resolvedAt: null }, distinct: ["orderId"], select: { orderId: true } }),
    db.customsOrder.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        customer: { select: { name: true } },
        _count: { select: { invoices: true, issues: { where: { resolvedAt: null, severity: "CRITICAL" } } } },
      },
    }),
  ]);
  const c = (s: string[]) => byStatus.filter((b) => s.includes(b.status)).reduce((a, b) => a + b._count._all, 0);
  return {
    open: c(["DRAFT", "PROCESSING", "NEEDS_REVIEW", "READY"]),
    completed: c(["EXPORTED", "COMPLETED"]),
    needsReview: c(["NEEDS_REVIEW"]),
    withErrors: ordersWithCritical.length,
    invoices,
    lines,
    recent,
  };
}
