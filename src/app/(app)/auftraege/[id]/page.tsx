import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getContext, can } from "@/server/context";
import { getOrderOverview } from "@/server/repositories/orders";
import { getHistory } from "@/server/repositories/audit";
import { OrderToolbar } from "./toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCH, sum } from "@/domain";
import { formatDate, formatDateTime } from "@/lib/utils";

const SEV = { CRITICAL: { tone: "critical", label: "Kritisch" }, WARNING: { tone: "warning", label: "Warnung" }, INFO: { tone: "info", label: "Info" } } as const;
const PREF = { NONE: "Normal", CLAIMED: "Präferenz", UNKNOWN: "Unbekannt" } as const;
const COLS = "grid-cols-[4rem_6.5rem_3.5rem_5rem_6rem_minmax(12rem,1fr)_8rem_7rem_6.5rem_6.5rem_4.5rem]";
const TRANSPORT = { ROAD: "Strasse", RAIL: "Bahn", AIR: "Luft", SEA: "See", POST: "Post", PIPELINE: "Rohrleitung", OTHER: "Andere" } as const;
const FIELD: Record<string, string> = { orderNumber: "Auftragsnummer", customerId: "Kunde", direction: "Richtung", consignor: "Absender", consignee: "Empfänger",
  dispatchCountry: "Versandland", destinationCountry: "Bestimmungsland", transportMode: "Transportart", reference: "Referenz", orderDate: "Datum", remarks: "Bemerkungen", status: "Status" };
const STATUS: Record<string, string> = { DRAFT: "Entwurf", PROCESSING: "In Verarbeitung", NEEDS_REVIEW: "Zur Kontrolle", READY: "Bereit", EXPORTED: "Exportiert", COMPLETED: "Abgeschlossen", ARCHIVED: "Archiviert" };
const show = (v: unknown) => (v == null || v === "" ? "leer" : typeof v === "object" ? JSON.stringify(v) : String(v));
function describe(h: { action: string; field: string | null; oldValue: unknown; newValue: unknown }) {
  if (h.action === "STATUS") return <>Status: <s className="text-muted-foreground">{STATUS[String(h.oldValue)] ?? show(h.oldValue)}</s> → <strong>{STATUS[String(h.newValue)] ?? show(h.newValue)}</strong></>;
  if (h.action === "UPDATE") return <>{FIELD[h.field ?? ""] ?? h.field}: <s className="text-muted-foreground">{show(h.oldValue)}</s> → <strong>{show(h.newValue)}</strong></>;
  if (h.action === "CREATE") return "Auftrag angelegt";
  if (h.action === "RECOMPUTE") { const v = h.newValue as { groups?: number; issues?: number } | null; return `Geprüft & gruppiert: ${v?.groups ?? "?"} Positionen, ${v?.issues ?? "?"} Befunde`; }
  return h.action;
}
const kg = (v: { toString(): string } | null) => (v == null ? null : formatCH(v.toString(), 3));

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const o = await getOrderOverview(ctx.db, id);
  if (!o) notFound();
  const history = can(ctx.role, "audit.read") ? await getHistory(ctx.db, "CustomsOrder", o.id, 30) : null;
  const crit = o.issues.filter((i) => i.severity === "CRITICAL").length;
  const total = sum(o.declarationLines.map((d) => d.totalValue.toString()));

  return (
    <>
      <PageHeader
        title={`Auftrag ${o.orderNumber}`}
        description={[o.customer?.name, o.direction === "IMPORT" ? "Einfuhr" : o.direction === "EXPORT" ? "Ausfuhr" : "Transit", formatDate(o.orderDate), o.reference].filter(Boolean).join(" · ")}
        actions={<OrderToolbar order={o} role={ctx.role} criticalOpen={crit} />}
      />

      <div className="grid gap-6 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Zollübersicht – {o.declarationLines.length} Anmeldepositionen</CardTitle>
            <span className="text-sm tabular-nums">Total <strong>{o.declarationCurrency} {formatCH(total.toString())}</strong></span>
          </CardHeader>
          <div className="overflow-x-auto">
            <div className="min-w-[68rem] text-sm">
              <div className={`grid ${COLS} h-9 items-center border-b bg-muted/60 text-xs font-medium uppercase tracking-wide text-muted-foreground`}>
                {["Pos.", "Tarif-Nr.", "Schl.", "Ursprung", "Präferenz", "Beschreibung", "Wert", "Menge", "Netto kg", "Brutto kg", "Quellen"].map((h, i) =>
                  <span key={h} className={`whitespace-nowrap px-3 ${i >= 6 ? "text-right" : ""}`}>{h}</span>)}
              </div>
              {o.declarationLines.map((d) => {
                const a = (d.attributes ?? {}) as { problems?: { code: string }[]; valueComplete?: boolean; mergeable?: boolean; knownGrossWeightKg?: string };
                return (
                        <details key={d.id} className="group border-b">
                          <summary className={`grid ${COLS} cursor-pointer list-none items-center hover:bg-muted/40 [&::-webkit-details-marker]:hidden`}>
                            <span className="flex h-10 items-center gap-1 px-3 tabular-nums"><ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />{d.position}</span>
                            <span className="px-3 font-mono">{d.tariffNumber == null ? <Badge tone="critical">fehlt</Badge> : /^\d{4}\.\d{4}$/.test(d.tariffNumber) ? d.tariffNumber : <Badge tone="critical" title="Ungültiges Format">{d.tariffNumber}</Badge>}</span>
                            <span className="px-3 font-mono">{d.statisticalKey ?? "–"}</span>
                            <span className="px-3">{d.originCountry ?? <Badge tone="critical">fehlt</Badge>}</span>
                            <span className="px-3">{PREF[d.preferenceStatus]}</span>
                            <span className="truncate px-3" title={d.description ?? ""}>{d.description ?? "–"} {a.mergeable === false && <Badge tone="warning">nicht zusammengefasst</Badge>}</span>
                            <span className="num px-3">{a.valueComplete === false ? <Badge tone="critical">unvollständig</Badge> : `${formatCH(d.totalValue.toString())}`}</span>
                            <span className="num px-3">{d.totalQuantity ? `${formatCH(d.totalQuantity.toString(), 0)} ${d.quantityUnit ?? ""}` : <span className="text-muted-foreground">–</span>}</span>
                            <span className="num px-3">{kg(d.netWeightKg) ?? <Badge tone="warning">fehlt</Badge>}</span>
                            <span className="num px-3">{kg(d.grossWeightKg) ?? <Badge tone="critical" title={`bekannt: ${a.knownGrossWeightKg ?? "0"} kg`}>fehlt</Badge>}</span>
                            <span className="num px-3">{d.sources.length}</span>
                          </summary>
                          <div className="border-t bg-muted/30 px-12 py-2">
                            <table className="w-full text-xs">
                              <thead className="text-left text-muted-foreground"><tr><th className="py-1.5">Rechnung</th><th>Pos.</th><th>Artikel</th><th>Beschreibung</th><th className="text-right">Originalwert</th><th className="text-right">in {d.currency}</th><th className="text-right">Netto kg</th><th className="text-right">Brutto kg</th></tr></thead>
                              <tbody>
                                {d.sources.map((s) => (
                                  <tr key={s.invoiceLineId} className="border-t border-border/60">
                                    <td className="py-1.5 font-medium">{s.invoiceLine.invoice.invoiceNumber ?? "–"}</td>
                                    <td>{s.invoiceLine.lineNo}</td>
                                    <td className="font-mono">{s.invoiceLine.articleNumber ?? "–"}</td>
                                    <td>{s.invoiceLine.description ?? "–"}</td>
                                    <td className="num">{s.invoiceLine.lineAmount ? `${s.invoiceLine.invoice.currency ?? ""} ${formatCH(s.invoiceLine.lineAmount.toString())}` : "–"}</td>
                                    <td className="num">{formatCH(s.convertedValue.toString(), 2)}</td>
                                    <td className="num">{kg(s.invoiceLine.netWeightKg) ?? "–"}</td>
                                    <td className="num">{kg(s.invoiceLine.grossWeightKg) ?? "–"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                );
              })}
            </div>
            {!o.declarationLines.length && <p className="py-10 text-center text-sm text-muted-foreground">Noch nicht gruppiert. „Neu prüfen &amp; gruppieren“ ausführen.</p>}
          </div>
        </Card>

        <div className="grid gap-6 2xl:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <CardHeader><CardTitle>Rechnungen ({o.invoices.length})</CardTitle></CardHeader>
            <Table>
              <THead><TR><TH>Nummer</TH><TH>Lieferant</TH><TH>Datum</TH><TH className="num">Betrag</TH><TH className="num">Pos.</TH></TR></THead>
              <TBody>
                {o.invoices.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-medium">{i.invoiceNumber ?? <Badge tone="critical">fehlt</Badge>}</TD>
                    <TD>{i.supplierName ?? "–"}</TD>
                    <TD>{formatDate(i.invoiceDate)}</TD>
                    <TD className="num">{i.totalAmount ? `${i.currency} ${formatCH(i.totalAmount.toString())}` : "–"}</TD>
                    <TD className="num">{i._count.lines}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader><CardTitle>Prüfbefunde</CardTitle>{crit > 0 && <Badge tone="critical">{crit} kritisch</Badge>}</CardHeader>
            <ul className="max-h-[28rem] divide-y overflow-y-auto">
              {o.issues.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  <Badge tone={SEV[i.severity].tone} className="mt-0.5 shrink-0">{SEV[i.severity].label}</Badge>
                  <span>{i.message}</span>
                </li>
              ))}
              {!o.issues.length && <li className="px-5 py-8 text-center text-sm text-muted-foreground">Keine offenen Befunde.</li>}
            </ul>
          </Card>
        </div>
        <div className="grid gap-6 2xl:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <CardHeader><CardTitle>Auftragsdaten</CardTitle></CardHeader>
            <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 p-5 text-sm">
              {[["Absender", o.consignor], ["Empfänger", o.consignee], ["Versandland", o.dispatchCountry], ["Bestimmungsland", o.destinationCountry],
                ["Transportart", o.transportMode && TRANSPORT[o.transportMode]], ["Referenz", o.reference], ["Anmeldewährung", o.declarationCurrency], ["Bemerkungen", o.remarks]].map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{v || "–"}</dd></div>
              ))}
            </dl>
          </Card>
          {history && (
            <Card>
              <CardHeader><CardTitle>Änderungsverlauf</CardTitle></CardHeader>
              <ul className="max-h-80 divide-y overflow-y-auto text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3 px-5 py-2">
                    <span className="w-28 shrink-0 tabular-nums text-muted-foreground">{formatDateTime(h.createdAt)}</span>
                    <span className="w-32 shrink-0 truncate">{h.userName}</span>
                    <span className="min-w-0">{describe(h)}</span>
                  </li>
                ))}
                {!history.length && <li className="px-5 py-6 text-center text-muted-foreground">Keine Einträge.</li>}
              </ul>
            </Card>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Hinweis: Tarifnummern aus Rechnungen oder KI-Vorschlägen sind nicht fachlich bestätigt. Die Tarifeinreihung ist durch das zuständige Fachpersonal zu kontrollieren.
        </p>
      </div>
    </>
  );
}
