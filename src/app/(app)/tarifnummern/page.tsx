import { getContext, can } from "@/server/context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseTariffNumber } from "@/domain";
import { formatDate } from "@/lib/utils";
import { TariffImportForm } from "./import-form";
import { deactivateDataset } from "./actions";

export default async function TariffPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const ctx = await getContext();
  const [active, datasets] = await Promise.all([
    ctx.db.tariffDataset.findFirst({ where: { isActive: true } }),
    ctx.db.tariffDataset.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const query = q.trim();
  const digits = query.replace(/[\s.]/g, "");
  const results = active && query.length >= 2
    ? await ctx.db.tariffEntry.findMany({
        where: { datasetId: active.id, ...( /^\d+$/.test(digits)
          ? { tariffNumber: { startsWith: digits.length > 4 ? `${digits.slice(0, 4)}.${digits.slice(4)}` : digits } }
          : { description: { contains: query, mode: "insensitive" } }) },
        orderBy: [{ tariffNumber: "asc" }, { statisticalKey: "asc" }], take: 200,
      })
    : [];
  // Verwendung der gesuchten Nummer in eigenen Aufträgen (nur Formatprüfung, wenn kein Datenstand)
  const fmt = query ? parseTariffNumber(query) : null;
  const usage = fmt?.ok ? await ctx.db.invoiceLine.count({ where: { tariffNumber: fmt.normalized } }) : null;

  return (
    <>
      <PageHeader title="Tarifnummern" description="Suche im importierten, verifizierten Datenstand. Die KI schlägt keine Tarifeinreihung vor." />
      <div className="grid gap-6 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Suche</CardTitle>
            {active ? <Badge tone="success">Aktiv: {active.name} · gültig ab {formatDate(active.validFrom)} · {active.entryCount.toLocaleString("de-CH")} Einträge</Badge>
              : <Badge tone="warning">Kein Datenstand importiert – nur Formatprüfung möglich</Badge>}
          </CardHeader>
          <form className="flex gap-2 border-b p-4"><Input name="q" defaultValue={q} placeholder="Tarifnummer (z. B. 6109) oder Warenbeschreibung …" className="max-w-md" /><Button variant="outline">Suchen</Button></form>
          {fmt && (
            <div className="border-b px-5 py-2 text-sm">
              Format: {fmt.ok ? <Badge tone="success">{fmt.normalized} gültig</Badge> : /^\d/.test(query) ? <Badge tone="critical">{fmt.reason === "HS6_ONLY" ? "nur HS-6 – 8 Stellen erforderlich" : "ungültig (NNNN.NNNN)"}</Badge> : <span className="text-muted-foreground">Textsuche</span>}
              {usage != null && <span className="ml-3 text-muted-foreground">in {usage} Rechnungsposition(en) verwendet</span>}
            </div>
          )}
          <Table>
            <THead><TR><TH>Tarifnummer</TH><TH>Schl.</TH><TH>Beschreibung</TH><TH>Einheit</TH></TR></THead>
            <TBody>
              {results.map((r) => <TR key={r.id}><TD className="font-mono">{r.tariffNumber}</TD><TD className="font-mono">{r.statisticalKey ?? "–"}</TD><TD className="whitespace-normal">{r.description}</TD><TD>{r.unit ?? "–"}</TD></TR>)}
              {active && query.length >= 2 && !results.length && <TR><TD colSpan={4} className="py-8 text-center text-muted-foreground">Keine Treffer im Datenstand.</TD></TR>}
              {!query && <TR><TD colSpan={4} className="py-8 text-center text-muted-foreground">Suchbegriff eingeben.</TD></TR>}
            </TBody>
          </Table>
        </Card>
        {can(ctx.role, "settings.manage") && (
          <Card>
            <CardHeader><CardTitle>Datenstand importieren</CardTitle></CardHeader>
            <CardContent><TariffImportForm /></CardContent>
            <Table>
              <THead><TR><TH>Bezeichnung</TH><TH>Quelle</TH><TH>Gültig ab</TH><TH className="num">Einträge</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>
                {datasets.map((d) => (
                  <TR key={d.id}><TD className="font-medium">{d.name}</TD><TD>{d.source}</TD><TD>{formatDate(d.validFrom)}</TD><TD className="num">{d.entryCount.toLocaleString("de-CH")}</TD>
                    <TD>{d.isActive ? <Badge tone="success">aktiv</Badge> : <Badge>inaktiv</Badge>}</TD>
                    <TD>{d.isActive && <form action={deactivateDataset.bind(null, d.id)}><Button variant="ghost" size="sm">Deaktivieren</Button></form>}</TD></TR>
                ))}
                {!datasets.length && <TR><TD colSpan={6} className="py-6 text-center text-muted-foreground">Noch kein Datenstand importiert.</TD></TR>}
              </TBody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
