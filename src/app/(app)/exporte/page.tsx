import Link from "next/link";
import { getContext } from "@/server/context";
import { prismaRoot } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export default async function ExportsPage() {
  const ctx = await getContext();
  const rows = await ctx.db.exportFile.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { order: { select: { id: true, orderNumber: true } } } });
  const users = new Map((await prismaRoot.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Exporte" description="Protokoll aller erzeugten Exporte. Ein erneuter Download erzeugt die Datei aus dem aktuellen Datenstand; der Hash zeigt, ob sie unverändert ist." />
      <Card>
        <Table>
          <THead><TR><TH>Zeitpunkt</TH><TH>Auftrag</TH><TH>Art</TH><TH>Erstellt von</TH><TH>SHA-256</TH><TH /></TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>{formatDateTime(r.createdAt)}</TD>
                <TD><Link href={`/auftraege/${r.order.id}`} className="font-medium text-primary hover:underline">{r.order.orderNumber}</Link></TD>
                <TD>{r.kind === "EXCEL_OVERVIEW" ? <Badge tone="info">Excel-Zollübersicht</Badge> : <Badge tone="primary">Anmeldevorbereitung (JSON)</Badge>}</TD>
                <TD>{users.get(r.createdById) ?? "?"}</TD>
                <TD className="font-mono text-xs text-muted-foreground" title={r.sha256}>{r.sha256.slice(0, 16)}…</TD>
                <TD><a className="text-sm text-primary hover:underline" href={`/api/orders/${r.order.id}/export?format=${r.kind === "EXCEL_OVERVIEW" ? "xlsx" : "json"}`}>Neu erzeugen</a></TD>
              </TR>
            ))}
            {!rows.length && <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">Noch keine Exporte.</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
