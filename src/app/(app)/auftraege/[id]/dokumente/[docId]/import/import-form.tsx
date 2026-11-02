"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { IMPORT_FIELDS, rowsToInvoices, type ColumnMap, type ImportField } from "@/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { runImport, type ImportState } from "../../actions";

interface SheetPrep { name: string; totalRows: number; rows: string[][]; headerRow: number; map: ColumnMap; fromSaved: boolean }
const sel = "h-8 w-full rounded-md border bg-surface px-2 text-sm";
const REQUIRED: ImportField[] = ["tariffNumber", "originCountry", "lineAmount"];

export function ImportForm({ orderId, documentId, sheets }: { orderId: string; documentId: string; sheets: SheetPrep[] }) {
  const [sheetIdx, setSheetIdx] = useState(0);
  const sheet = sheets[sheetIdx];
  const [headerRow, setHeaderRow] = useState(sheet.headerRow);
  const [map, setMap] = useState<ColumnMap>(sheet.map);
  const [defaults, setDefaults] = useState({ invoiceNumber: "", invoiceDate: "", supplierName: "", currency: "" });
  const [state, action, pending] = useActionState<ImportState, FormData>(runImport.bind(null, orderId, documentId), {});

  const headers = sheet.rows[headerRow] ?? [];
  const preview = useMemo(() => rowsToInvoices(sheet.rows.slice(headerRow + 1), map, {
    invoiceNumber: defaults.invoiceNumber || null, invoiceDate: defaults.invoiceDate || null, supplierName: defaults.supplierName || null, currency: defaults.currency.toUpperCase() || null,
  }, headerRow + 2), [sheet, headerRow, map, defaults]);
  const lines = preview.invoices.flatMap((i) => i.lines.map((l) => ({ ...l, inv: i })));
  const used = new Map<number, ImportField>();
  for (const [f, i] of Object.entries(map)) if (i !== undefined) used.set(i, f as ImportField);

  const switchSheet = (i: number) => { setSheetIdx(i); setHeaderRow(sheets[i].headerRow); setMap(sheets[i].map); };

  if (state.result) {
    const r = state.result;
    return (
      <Card>
        <CardContent className="space-y-4">
          <p className="text-sm"><Badge tone="success">Import abgeschlossen</Badge> {r.invoices} Rechnung(en) mit {r.lines} Positionen übernommen. Der Auftrag wurde neu geprüft und gruppiert.</p>
          {r.problems.length > 0 && <ProblemList problems={r.problems} />}
          <Link href={`/auftraege/${orderId}`} className={buttonVariants()}>Zum Auftrag</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={action} className="grid gap-6 [&>*]:min-w-0">
      <input type="hidden" name="sheet" value={sheetIdx} />
      <input type="hidden" name="headerRow" value={headerRow} />
      <Card>
        <CardHeader>
          <CardTitle>1. Tabelle & Kopfzeile</CardTitle>
          {sheet.fromSaved && <Badge tone="success">Gespeicherte Zuordnung erkannt</Badge>}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {sheets.length > 1 && (
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Tabellenblatt
              <select className={sel} value={sheetIdx} onChange={(e) => switchSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.totalRows} Zeilen)</option>)}</select>
            </label>
          )}
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Kopfzeile ist Zeile
            <select className={sel} value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))}>
              {sheet.rows.slice(0, 15).map((r, i) => <option key={i} value={i}>{i + 1}: {r.filter(Boolean).slice(0, 4).join(" · ").slice(0, 60)}</option>)}
            </select>
          </label>
          <p className="self-end text-xs text-muted-foreground">{sheet.totalRows - headerRow - 1} Datenzeilen</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Spalten zuordnen</CardTitle><span className="text-xs text-muted-foreground">Automatisch vorgeschlagen – bitte prüfen</span></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((f) => (
            <label key={f} className="space-y-1 text-xs font-medium text-muted-foreground">
              {IMPORT_FIELDS[f].label}{REQUIRED.includes(f) && <span className="text-critical"> *</span>}
              <select name={`map.${f}`} className={sel} value={map[f] ?? ""}
                onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value === "") delete n[f]; else n[f] = Number(e.target.value); return n; })}>
                <option value="">– nicht vorhanden –</option>
                {headers.map((h, i) => <option key={i} value={i} disabled={used.has(i) && used.get(i) !== f}>{h || `Spalte ${i + 1}`}</option>)}
              </select>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Standardwerte für fehlende Spalten</CardTitle><span className="text-xs text-muted-foreground">Gelten nur, wenn die Spalte nicht zugeordnet oder leer ist</span></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([["invoiceNumber", "Rechnungsnummer"], ["supplierName", "Lieferant"], ["currency", "Währung (ISO)"]] as const).map(([k, l]) => (
            <label key={k} className="space-y-1 text-xs font-medium text-muted-foreground">{l}
              <Input name={`default.${k}`} value={defaults[k]} maxLength={k === "currency" ? 3 : 100} onChange={(e) => setDefaults((d) => ({ ...d, [k]: e.target.value }))} /></label>
          ))}
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Rechnungsdatum
            <Input type="date" name="default.invoiceDate" value={defaults.invoiceDate} onChange={(e) => setDefaults((d) => ({ ...d, invoiceDate: e.target.value }))} /></label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Vorschau ({lines.length} Positionen in {preview.invoices.length} Rechnung(en){sheet.totalRows > sheet.rows.length ? ", Ausschnitt" : ""})</CardTitle>
          {preview.problems.length > 0 && <Badge tone="warning">{preview.problems.length} Hinweise</Badge>}
        </CardHeader>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr>
              {["Zeile", "Rechnung", "Whg.", "Pos.", "Artikel", "Beschreibung", "Tarif-Nr.", "Urspr.", "Menge", "Einzelpreis", "Wert", "Netto kg", "Brutto kg"].map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {lines.slice(0, 50).map((l) => (
                <tr key={l.sourceRow} className="border-t">
                  <td className="px-2 py-1 tabular-nums text-muted-foreground">{l.sourceRow}</td>
                  <td className="px-2 py-1">{l.inv.invoiceNumber ?? <Miss />}</td>
                  <td className="px-2 py-1">{l.inv.currency ?? <Miss />}</td>
                  <td className="px-2 py-1 tabular-nums">{l.lineNo}</td>
                  <td className="px-2 py-1 font-mono">{l.articleNumber ?? "–"}</td>
                  <td className="max-w-56 truncate px-2 py-1">{l.description ?? "–"}</td>
                  <td className="px-2 py-1 font-mono">{l.tariffNumber ?? <Miss />}</td>
                  <td className="px-2 py-1">{l.originCountry ?? <Miss />}</td>
                  <td className="num px-2 py-1">{l.quantity ?? "–"} {l.unit ?? ""}</td>
                  <td className="num px-2 py-1">{l.unitPrice ?? "–"}</td>
                  <td className="num px-2 py-1">{l.lineAmount ?? <Miss />}</td>
                  <td className="num px-2 py-1">{l.netWeightKg ?? "–"}</td>
                  <td className="num px-2 py-1">{l.grossWeightKg ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.problems.length > 0 && <div className="border-t p-4"><ProblemList problems={preview.problems.slice(0, 30)} /></div>}
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={pending}>{pending ? "Importiere …" : `Alle ${sheet.totalRows - headerRow - 1} Zeilen importieren`}</Button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="saveMapping" defaultChecked /> Zuordnung für dieses Dateiformat speichern</label>
        <Link href={`/auftraege/${orderId}`} className="text-sm text-muted-foreground hover:underline">Abbrechen</Link>
        {state.error && <p role="alert" className="text-sm text-critical">{state.error}</p>}
      </div>
    </form>
  );
}

const Miss = () => <span className="rounded bg-critical-soft px-1 text-critical">fehlt</span>;

function ProblemList({ problems }: { problems: { row: number; severity: string; message: string }[] }) {
  return (
    <ul className="space-y-1 text-xs">
      {problems.map((p, i) => <li key={i}><Badge tone={p.severity === "WARNING" ? "warning" : "info"}>Zeile {p.row}</Badge> {p.message}</li>)}
    </ul>
  );
}
