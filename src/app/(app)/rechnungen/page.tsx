import Link from "next/link";
import type { ReviewStatus } from "@prisma/client";
import { getContext } from "@/server/context";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCH } from "@/domain";
import { formatDate } from "@/lib/utils";

const TABS: { key: ReviewStatus | "ALL"; label: string }[] = [
  { key: "NEEDS_REVIEW", label: "Zu prüfen" }, { key: "EXTRACTED", label: "Erfasst" }, { key: "CONFIRMED", label: "Bestätigt" }, { key: "ALL", label: "Alle" },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  const { s = "NEEDS_REVIEW", q } = await searchParams;
  const ctx = await getContext();
  const status = (TABS.find((t) => t.key === s)?.key ?? "NEEDS_REVIEW") as ReviewStatus | "ALL";
  const where = {
    ...(status === "ALL" ? {} : { reviewStatus: status }),
    ...(q ? { OR: [{ invoiceNumber: { contains: q, mode: "insensitive" as const } }, { supplierName: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, counts] = await Promise.all([
    ctx.db.invoice.findMany({ where, orderBy: { updatedAt: "desc" }, take: 300,
      include: { order: { select: { id: true, orderNumber: true } }, document: { select: { fileName: true } }, _count: { select: { lines: true } } } }),
    ctx.db.invoice.groupBy({ by: ["reviewStatus"], _count: { _all: true } }),
  ]);
  const n = (k: string) => (k === "ALL" ? counts.reduce((a, c) => a + c._count._all, 0) : counts.find((c) => c.reviewStatus === k)?._count._all ?? 0);
  return (
    <>
      <PageHeader title="Rechnungen" description="Alle Rechnungen über alle Aufträge – Klick öffnet die Kontrollansicht." />
      <Card>
        <div className="flex flex-wrap items-center gap-1 border-b p-3">
          {TABS.map((t) => (
            <Link key={t.key} href={`/rechnungen?s=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-sm ${status === t.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>{t.label} <span className="tabular-nums">({n(t.key)})</span></Link>
          ))}
          <form className="ml-auto"><input type="hidden" name="s" value={status} /><input name="q" defaultValue={q} placeholder="Nummer oder Lieferant …" className="h-8 w-64 rounded-md border bg-surface px-2 text-sm" /></form>
        </div>
        <Table>
          <THead><TR><TH>Rechnung</TH><TH>Auftrag</TH><TH>Lieferant</TH><TH>Datum</TH><TH className="num">Betrag</TH><TH className="num">Pos.</TH><TH>Beleg</TH><TH>Status</TH></TR></THead>
          <TBody>
            {rows.map((i) => (
              <TR key={i.id}>
                <TD><Link href={`/auftraege/${i.order.id}/rechnungen/${i.id}`} className="font-medium text-primary hover:underline">{i.invoiceNumber ?? "(ohne Nummer)"}</Link></TD>
                <TD><Link href={`/auftraege/${i.order.id}`} className="hover:underline">{i.order.orderNumber}</Link></TD>
                <TD>{i.supplierName ?? "–"}</TD><TD>{formatDate(i.invoiceDate)}</TD>
                <TD className="num">{i.totalAmount ? `${i.currency ?? ""} ${formatCH(i.totalAmount.toString())}` : "–"}</TD>
                <TD className="num">{i._count.lines}</TD>
                <TD className="max-w-48 truncate text-muted-foreground">{i.document?.fileName ?? "–"}</TD>
                <TD>{i.reviewStatus === "CONFIRMED" ? <Badge tone="success">bestätigt</Badge> : i.reviewStatus === "NEEDS_REVIEW" ? <Badge tone="warning">zu prüfen</Badge> : <Badge>erfasst</Badge>}</TD>
              </TR>
            ))}
            {!rows.length && <TR><TD colSpan={8} className="py-10 text-center text-muted-foreground">Keine Rechnungen in dieser Ansicht.</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
