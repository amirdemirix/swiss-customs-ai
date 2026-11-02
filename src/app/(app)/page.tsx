import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, FolderOpen, ListChecks, Rows3, Plus } from "lucide-react";
import { getContext, can } from "@/server/context";
import { getDashboardStats } from "@/server/repositories/dashboard";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime, formatInt } from "@/lib/utils";

export default async function Dashboard() {
  const ctx = await getContext();
  const s = await getDashboardStats(ctx.db);
  const kpis = [
    { label: "Offene Aufträge", value: s.open, icon: FolderOpen, href: "/auftraege" },
    { label: "Zur Kontrolle", value: s.needsReview, icon: ListChecks, href: "/auftraege", tone: s.needsReview ? "text-warning" : "" },
    { label: "Mit kritischen Fehlern", value: s.withErrors, icon: AlertTriangle, href: "/auftraege", tone: s.withErrors ? "text-critical" : "" },
    { label: "Abgeschlossen", value: s.completed, icon: CheckCircle2, href: "/auftraege" },
    { label: "Rechnungen", value: s.invoices, icon: FileText, href: "/rechnungen" },
    { label: "Artikelpositionen", value: s.lines, icon: Rows3, href: "/rechnungen" },
  ];
  return (
    <>
      <PageHeader title="Dashboard" description={ctx.tenantName}
        actions={can(ctx.role, "order.write") && <Link href="/auftraege/neu" className={buttonVariants()}><Plus />Neuer Auftrag</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="rounded-lg border bg-surface p-4 hover:border-primary/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground">{k.label}<k.icon className="size-4" /></div>
            <div className={`mt-2 text-2xl font-semibold tabular-nums ${k.tone ?? ""}`}>{formatInt(k.value)}</div>
          </Link>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Kürzlich bearbeitete Aufträge</CardTitle><Link href="/auftraege" className="text-xs text-primary hover:underline">Alle anzeigen</Link></CardHeader>
        <Table>
          <THead><TR><TH>Auftrag</TH><TH>Kunde</TH><TH>Richtung</TH><TH>Status</TH><TH className="num">Rechnungen</TH><TH className="num">Kritisch</TH><TH>Geändert</TH></TR></THead>
          <TBody>
            {s.recent.map((o) => (
              <TR key={o.id}>
                <TD><Link href={`/auftraege/${o.id}`} className="font-medium text-primary hover:underline">{o.orderNumber}</Link></TD>
                <TD>{o.customer?.name ?? "–"}</TD>
                <TD>{o.direction === "IMPORT" ? "Einfuhr" : o.direction === "EXPORT" ? "Ausfuhr" : "Transit"}</TD>
                <TD><OrderStatusBadge status={o.status} /></TD>
                <TD className="num">{o._count.invoices}</TD>
                <TD className="num">{o._count.issues ? <Badge tone="critical">{o._count.issues}</Badge> : "–"}</TD>
                <TD className="text-muted-foreground">{formatDateTime(o.updatedAt)}</TD>
              </TR>
            ))}
            {!s.recent.length && <TR><TD colSpan={7} className="py-10 text-center text-muted-foreground">Noch keine Aufträge.</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
