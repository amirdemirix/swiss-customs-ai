import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext, can } from "@/server/context";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ctx = await getContext();
  const rows = await ctx.db.customer.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }] } : undefined,
    orderBy: { name: "asc" }, take: 500,
    include: { _count: { select: { orders: true, articles: true } } },
  });
  return (
    <>
      <PageHeader title="Kunden" description={`${rows.length} Kunden`}
        actions={can(ctx.role, "customer.write") && <Link href="/kunden/neu" className={buttonVariants()}><Plus />Neuer Kunde</Link>} />
      <Card>
        <form className="border-b p-3"><Input name="q" defaultValue={q} placeholder="Name oder Kundennummer …" className="max-w-sm" /></form>
        <Table>
          <THead><TR><TH>Name</TH><TH>Nr.</TH><TH>UID</TH><TH>Land</TH><TH className="num">Aufträge</TH><TH className="num">Artikelstamm</TH></TR></THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD><Link href={`/kunden/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link></TD>
                <TD>{c.number ?? "–"}</TD><TD className="font-mono text-xs">{c.uid ?? "–"}</TD><TD>{c.country ?? "–"}</TD>
                <TD className="num">{c._count.orders}</TD><TD className="num">{c._count.articles}</TD>
              </TR>
            ))}
            {!rows.length && <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">Keine Kunden.</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
