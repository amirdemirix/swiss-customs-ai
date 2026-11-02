import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getContext, can } from "@/server/context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/ui/status";
import { CustomerForm, ArticleForm } from "../forms";
import { saveCustomer, saveArticle, deleteArticle } from "../actions";
import { formatDate } from "@/lib/utils";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const c = await ctx.db.customer.findFirst({
    where: { id },
    include: { articles: { orderBy: { articleNumber: "asc" } }, orders: { orderBy: { orderDate: "desc" }, take: 10 } },
  });
  if (!c) notFound();
  const tariffOk = can(ctx.role, "tariff.confirm");
  return (
    <>
      <PageHeader title={c.name} description={[c.number, c.uid].filter(Boolean).join(" · ")} />
      <div className="grid gap-6 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
          <CardContent><CustomerForm action={saveCustomer.bind(null, c.id)} defaults={{ name: c.name, number: c.number, uid: c.uid, address: c.address, country: c.country }} submitLabel="Speichern" disabled={!can(ctx.role, "customer.write")} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Artikelstamm ({c.articles.length})</CardTitle>
            <span className="text-xs text-muted-foreground">Fachlich bestätigte Zuordnung Artikel-Nr. → CH-Tarifnummer / Ursprung</span>
          </CardHeader>
          {tariffOk && <div className="border-b p-5"><ArticleForm action={saveArticle.bind(null, c.id)} /></div>}
          <Table>
            <THead><TR><TH>Artikel-Nr.</TH><TH>Beschreibung</TH><TH>Tarif-Nr.</TH><TH>Schl.</TH><TH>Ursprung</TH><TH>Bestätigt</TH>{tariffOk && <TH />}</TR></THead>
            <TBody>
              {c.articles.map((a) => (
                <TR key={a.id}>
                  <TD className="font-mono">{a.articleNumber}</TD><TD>{a.description ?? "–"}</TD><TD className="font-mono">{a.tariffNumber ?? "–"}</TD>
                  <TD className="font-mono">{a.statisticalKey ?? "–"}</TD><TD>{a.originCountry ?? "–"}</TD>
                  <TD>{a.confirmedAt ? <Badge tone="success">{formatDate(a.confirmedAt)}</Badge> : <Badge tone="warning">offen</Badge>}</TD>
                  {tariffOk && <TD className="w-10"><form action={deleteArticle.bind(null, c.id, a.id)}><button title="Entfernen" className="text-muted-foreground hover:text-critical"><Trash2 className="size-4" /></button></form></TD>}
                </TR>
              ))}
              {!c.articles.length && <TR><TD colSpan={7} className="py-8 text-center text-muted-foreground">Noch keine Artikel erfasst.</TD></TR>}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>Letzte Aufträge</CardTitle></CardHeader>
          <Table>
            <TBody>
              {c.orders.map((o) => (
                <TR key={o.id}><TD><Link href={`/auftraege/${o.id}`} className="font-medium text-primary hover:underline">{o.orderNumber}</Link></TD><TD>{formatDate(o.orderDate)}</TD><TD><OrderStatusBadge status={o.status} /></TD></TR>
              ))}
              {!c.orders.length && <TR><TD className="py-6 text-center text-muted-foreground">Keine Aufträge.</TD></TR>}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
