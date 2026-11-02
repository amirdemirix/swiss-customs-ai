import Link from "next/link";
import { getContext } from "@/server/context";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/ui/status";
import { formatCH } from "@/domain";

/** Übersicht aller offenen Aufträge mit Anmeldepositionen und Bereitschaft für Export/Anmeldung. */
export default async function OverviewPage() {
  const ctx = await getContext();
  const orders = await ctx.db.customsOrder.findMany({
    where: { status: { in: ["DRAFT", "PROCESSING", "NEEDS_REVIEW", "READY", "EXPORTED"] } },
    orderBy: { updatedAt: "desc" }, take: 200,
    include: { customer: { select: { name: true } }, _count: { select: { declarationLines: true, invoices: true } } },
  });
  const ids = orders.map((o) => o.id);
  const [sums, crit, unconfirmed] = await Promise.all([
    ctx.db.declarationLine.groupBy({ by: ["orderId"], where: { orderId: { in: ids } }, _sum: { totalValue: true, grossWeightKg: true } }),
    ctx.db.validationIssue.groupBy({ by: ["orderId"], where: { orderId: { in: ids }, severity: "CRITICAL", resolvedAt: null }, _count: { _all: true } }),
    ctx.db.invoice.groupBy({ by: ["orderId"], where: { orderId: { in: ids }, reviewStatus: { not: "CONFIRMED" } }, _count: { _all: true } }),
  ]);
  const get = <T extends { orderId: string }>(a: T[], id: string) => a.find((x) => x.orderId === id);
  return (
    <>
      <PageHeader title="Zollübersicht" description="Offene Aufträge: Anmeldepositionen, Werte und was vor Export/Anmeldung noch fehlt." />
      <Card>
        <Table>
          <THead><TR><TH>Auftrag</TH><TH>Kunde</TH><TH>Status</TH><TH className="num">Anmeldepos.</TH><TH className="num">Total</TH><TH className="num">Brutto kg</TH><TH>Bereitschaft</TH></TR></THead>
          <TBody>
            {orders.map((o) => {
              const s = get(sums, o.id)?._sum;
              const c = get(crit, o.id)?._count._all ?? 0;
              const u = get(unconfirmed, o.id)?._count._all ?? 0;
              return (
                <TR key={o.id}>
                  <TD><Link href={`/auftraege/${o.id}`} className="font-medium text-primary hover:underline">{o.orderNumber}</Link></TD>
                  <TD>{o.customer?.name ?? "–"}</TD>
                  <TD><OrderStatusBadge status={o.status} /></TD>
                  <TD className="num">{o._count.declarationLines}</TD>
                  <TD className="num">{s?.totalValue ? `${o.declarationCurrency} ${formatCH(s.totalValue.toString())}` : "–"}</TD>
                  <TD className="num">{s?.grossWeightKg ? formatCH(s.grossWeightKg.toString(), 3) : "–"}</TD>
                  <TD className="space-x-1">
                    {c > 0 && <Badge tone="critical">{c} kritisch</Badge>}
                    {u > 0 && <Badge tone="warning">{u} Rechnung(en) unbestätigt</Badge>}
                    {!o._count.invoices && <Badge>keine Rechnungen</Badge>}
                    {c === 0 && u === 0 && o._count.invoices > 0 && <Badge tone="success">bereit für Anmeldevorbereitung</Badge>}
                  </TD>
                </TR>
              );
            })}
            {!orders.length && <TR><TD colSpan={7} className="py-10 text-center text-muted-foreground">Keine offenen Aufträge.</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
