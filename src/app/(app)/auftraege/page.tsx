import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext, can } from "@/server/context";
import { listOrders } from "@/server/repositories/orders";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function Orders({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ctx = await getContext();
  const orders = await listOrders(ctx.db, q);
  return (
    <>
      <PageHeader title="Aufträge" description={`${orders.length} Aufträge`} actions={can(ctx.role, "order.write") && <Link href="/auftraege/neu" className={buttonVariants()}><Plus />Neuer Auftrag</Link>} />
      <Card>
        <form className="border-b p-3"><Input name="q" defaultValue={q} placeholder="Auftragsnummer, Referenz oder Kunde suchen …" className="max-w-sm" /></form>
        <Table>
          <THead><TR><TH>Auftrag</TH><TH>Datum</TH><TH>Kunde</TH><TH>Referenz</TH><TH>Status</TH><TH className="num">Rechnungen</TH><TH className="num">Anmeldepos.</TH></TR></THead>
          <TBody>
            {orders.map((o) => (
              <TR key={o.id}>
                <TD><Link href={`/auftraege/${o.id}`} className="font-medium text-primary hover:underline">{o.orderNumber}</Link></TD>
                <TD>{formatDate(o.orderDate)}</TD>
                <TD>{o.customer?.name ?? "–"}</TD>
                <TD className="text-muted-foreground">{o.reference ?? "–"}</TD>
                <TD><OrderStatusBadge status={o.status} /></TD>
                <TD className="num">{o._count.invoices}</TD>
                <TD className="num">{o._count.declarationLines}</TD>
              </TR>
            ))}
            {!orders.length && <TR><TD colSpan={7} className="py-10 text-center text-muted-foreground">Keine Aufträge gefunden.</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
