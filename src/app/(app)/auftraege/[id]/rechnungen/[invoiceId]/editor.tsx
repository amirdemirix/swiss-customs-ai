"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import { CheckCheck, Copy, Merge, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { normalizeLineInput, splitCheck, type LineField, type LineValues } from "@/domain";
import { confirmInvoice, mergeInvoiceLines, saveInvoice, type SaveState } from "../actions";

export interface EditorLine {
  id: string | null;
  lineNo: number;
  reviewStatus: "EXTRACTED" | "NEEDS_REVIEW" | "CONFIRMED";
  values: Record<LineField, string>;
  sources: { tariffNumber: string | null; originCountry: string | null };
  meta: { page?: number | null; confidence?: number; uncertain?: string[]; rejected?: Record<string, string>; splitFrom?: number } | null;
  deleted?: boolean;
}

const COLS: { f: LineField; label: string; w: string; num?: boolean; mono?: boolean }[] = [
  { f: "articleNumber", label: "Artikel", w: "w-24", mono: true },
  { f: "description", label: "Beschreibung", w: "w-56" },
  { f: "tariffNumber", label: "Tarif-Nr.", w: "w-24", mono: true },
  { f: "statisticalKey", label: "Schl.", w: "w-12", mono: true },
  { f: "originCountry", label: "Urspr.", w: "w-12" },
  { f: "quantity", label: "Menge", w: "w-20", num: true },
  { f: "unit", label: "ME", w: "w-14" },
  { f: "unitPrice", label: "Einzelpreis", w: "w-24", num: true },
  { f: "lineAmount", label: "Wert", w: "w-24", num: true },
  { f: "netWeightKg", label: "Netto kg", w: "w-20", num: true },
  { f: "grossWeightKg", label: "Brutto kg", w: "w-20", num: true },
];
const HEADER: { k: string; label: string; ph?: string }[] = [
  { k: "invoiceNumber", label: "Rechnungsnummer" }, { k: "invoiceDate", label: "Datum", ph: "TT.MM.JJJJ" }, { k: "supplierName", label: "Lieferant" },
  { k: "currency", label: "Währung", ph: "EUR" }, { k: "totalAmount", label: "Rechnungstotal" }, { k: "discountAmount", label: "Rabatt (Kopf)" },
  { k: "freightAmount", label: "Fracht" }, { k: "insuranceAmount", label: "Versicherung" }, { k: "incoterm", label: "Incoterm", ph: "DAP" },
  { k: "netWeightKg", label: "Netto kg (Sendung)" }, { k: "grossWeightKg", label: "Brutto kg (Sendung)" }, { k: "packages", label: "Packstücke" },
];
const empty = (): Record<LineField, string> => ({ articleNumber: "", description: "", tariffNumber: "", statisticalKey: "", originCountry: "", preferenceStatus: "UNKNOWN", customsProcedure: "", quantity: "", unit: "", unitPrice: "", lineAmount: "", netWeightKg: "", grossWeightKg: "" });
const toValues = (r: Record<LineField, string>) => normalizeLineInput(r).values as LineValues;

export function InvoiceEditor({ orderId, invoiceId, header: h0, lines: l0, lineIssues, editable, canConfirm, confirmed }: {
  orderId: string; invoiceId: string; header: Record<string, string>; lines: EditorLine[];
  lineIssues: Record<string, { severity: string; message: string }[]>; editable: boolean; canConfirm: boolean; confirmed: boolean;
}) {
  const [header, setHeader] = useState(h0);
  const [lines, setLines] = useState<EditorLine[]>(l0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null);
  const [state, action, saving] = useActionState<SaveState, FormData>(async (p, fd) => {
    const r = await saveInvoice(orderId, invoiceId, p, fd);
    if (r.ok) { setDirty(false); window.location.reload(); }
    return r;
  }, {});
  const [pending, start] = useTransition();
  const visible = lines.filter((l) => !l.deleted);

  const set = (idx: number, f: LineField, v: string) => { setDirty(true); setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, values: { ...l.values, [f]: v } } : l))); };
  const nextNo = () => Math.max(0, ...lines.filter((l) => !l.deleted).map((l) => l.lineNo)) + 1;
  const add = () => { setDirty(true); setLines((ls) => [...ls, { id: null, lineNo: nextNo(), reviewStatus: "EXTRACTED", values: empty(), sources: { tariffNumber: null, originCountry: null }, meta: null }]); };
  const split = (idx: number) => {
    setDirty(true);
    const o = lines[idx];
    // Teilposition übernimmt nur beschreibende Merkmale; Mengen, Werte, Gewichte sind neu zu erfassen (keine Schätzung)
    const part: EditorLine = { id: null, lineNo: nextNo(), reviewStatus: "NEEDS_REVIEW", sources: o.sources, meta: { splitFrom: o.lineNo },
      values: { ...o.values, quantity: "", lineAmount: "", netWeightKg: "", grossWeightKg: "" } };
    setLines((ls) => [...ls.slice(0, idx + 1), part, ...ls.slice(idx + 1)]);
    setInfo({ ok: true, text: `Teilposition zu Pos. ${o.lineNo} angelegt: Menge, Wert und Gewichte bei beiden Positionen anpassen.` });
  };
  const remove = (idx: number) => { setDirty(true); setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, deleted: true } : l))); };

  // Kontrollsummen
  const totals = useMemo(() => {
    let amount = 0n, ok = true;
    for (const l of visible) {
      const v = toValues(l.values).lineAmount;
      if (v == null) { ok = false; continue; }
      amount += BigInt(Math.round(Number(v) * 10000)); // nur Anzeige; massgebend ist die Serverberechnung (Decimal)
    }
    return { amount: Number(amount) / 10000, complete: ok };
  }, [visible]);
  const splitWarnings = useMemo(() => {
    const out: string[] = [];
    for (const l of visible) {
      if (!l.meta?.splitFrom) continue;
      const orig = l0.find((x) => x.lineNo === l.meta!.splitFrom);
      if (!orig) continue;
      const parts = visible.filter((x) => x === l || x.lineNo === orig.lineNo || x.meta?.splitFrom === orig.lineNo);
      out.push(...splitCheck(toValues(orig.values), parts.map((p) => toValues(p.values))).map((w) => `Pos. ${orig.lineNo}: ${w}`));
    }
    return [...new Set(out)];
  }, [visible, l0]);

  const payload = JSON.stringify({ header, lines: lines.filter((l) => l.id || !l.deleted).map((l) => ({ id: l.id, lineNo: l.lineNo, values: l.values, deleted: !!l.deleted })) });
  const errs = state.lineErrors ?? {};

  return (
    <Card>
      <form action={action}>
        <input type="hidden" name="payload" value={payload} />
        <CardHeader>
          <CardTitle>Rechnungsdaten</CardTitle>
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              {dirty && <Badge tone="warning">Ungespeicherte Änderungen</Badge>}
              <Button size="sm" disabled={saving || !dirty}><Save />{saving ? "Speichere …" : "Speichern"}</Button>
            </div>
          )}
        </CardHeader>
        <fieldset disabled={!editable} className="grid gap-3 border-b p-5 sm:grid-cols-3 xl:grid-cols-4">
          {HEADER.map(({ k, label, ph }) => (
            <label key={k} className="space-y-1 text-xs font-medium text-muted-foreground">{label}
              <input value={header[k] ?? ""} placeholder={ph} onChange={(e) => { setDirty(true); setHeader((x) => ({ ...x, [k]: e.target.value })); }}
                className={cn("h-8 w-full rounded border bg-surface px-2 text-sm text-foreground", state.headerErrors?.[k] && "border-critical")} />
              {state.headerErrors?.[k] && <span className="text-critical">{state.headerErrors[k]}</span>}
            </label>
          ))}
        </fieldset>

        {editable && (
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2">
            <Button type="button" size="sm" variant="outline" onClick={add}><Plus />Position</Button>
            <Button type="button" size="sm" variant="outline" disabled={selected.size < 2 || dirty || pending}
              title={dirty ? "Zuerst speichern" : "Nur bei gleicher Tarifnummer, Ursprung, Schlüssel, Präferenz, Verfahren, Einheit und Artikelnummer"}
              onClick={() => start(async () => { const r = await mergeInvoiceLines(orderId, invoiceId, [...selected]); setInfo({ ok: r.ok, text: r.message }); if (r.ok) window.location.reload(); })}>
              <Merge />Zusammenführen ({selected.size})
            </Button>
            {canConfirm && (
              <Button type="button" size="sm" disabled={dirty || pending || confirmed} title={dirty ? "Zuerst speichern" : undefined}
                onClick={() => start(async () => { const r = await confirmInvoice(orderId, invoiceId); setInfo({ ok: r.ok, text: r.message }); if (r.ok) window.location.reload(); })}>
                <CheckCheck />{confirmed ? "Bestätigt" : "Fachlich bestätigen"}
              </Button>
            )}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {visible.length} Positionen · Summe Werte {totals.amount.toLocaleString("de-CH", { minimumFractionDigits: 2 })}{!totals.complete && " (unvollständig)"}
              {header.totalAmount && ` · Rechnungstotal ${Number(header.totalAmount).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`}
            </span>
          </div>
        )}
        {(state.message || info) && (
          <p role="status" className={cn("px-5 pt-3 text-sm", (info ? info.ok : state.ok) ? "text-success" : "text-critical")}>{info?.text ?? state.message}</p>
        )}
        {splitWarnings.length > 0 && <ul className="px-5 pt-2 text-xs text-warning">{splitWarnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="w-6 px-1" />
                <th className="w-12 px-1 py-2 font-medium">Pos.</th>
                {COLS.map((c) => <th key={c.f} className={cn("px-1 py-2 font-medium", c.num && "text-right")}>{c.label}</th>)}
                <th className="px-1 py-2 font-medium">Status</th>
                <th className="w-14" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                if (l.deleted) return null;
                const key = l.id ?? `new-${idx}`;
                const iss = l.id ? lineIssues[l.id] ?? [] : [];
                const le = errs[l.id ?? `new-${visible.indexOf(l)}`] ?? {};
                const low = l.meta?.confidence != null && l.meta.confidence < 0.85;
                return (
                  <tr key={key} className={cn("border-t align-top", iss.some((i) => i.severity === "CRITICAL") && "bg-critical-soft/40", l.reviewStatus === "NEEDS_REVIEW" && "bg-warning-soft/30")}>
                    <td className="px-1 py-1">{l.id && editable && <input type="checkbox" aria-label={`Position ${l.lineNo} auswählen`} checked={selected.has(l.id)}
                      onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id!); else n.delete(l.id!); return n; })} />}</td>
                    <td className="px-1 py-1"><input type="number" min={1} value={l.lineNo} disabled={!editable} aria-label="Positionsnummer"
                      onChange={(e) => { setDirty(true); setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, lineNo: Number(e.target.value) || 1 } : x))); }}
                      className="h-7 w-12 rounded border bg-surface px-1 tabular-nums" /></td>
                    {COLS.map((c) => {
                      const uncertain = l.meta?.uncertain?.includes(c.f) || l.meta?.rejected?.[c.f] != null;
                      const src = c.f === "tariffNumber" ? l.sources.tariffNumber : c.f === "originCountry" ? l.sources.originCountry : null;
                      return (
                        <td key={c.f} className="px-1 py-1">
                          <input value={l.values[c.f]} disabled={!editable} aria-label={`${c.label} Position ${l.lineNo}`}
                            title={[le[c.f], uncertain && "Von der Erkennung als unsicher markiert", l.meta?.rejected?.[c.f] && `Gelesen: „${l.meta.rejected[c.f]}“ (ungültig, nicht übernommen)`, src && `Quelle: ${src === "USER" ? "manuell" : src === "INVOICE" ? "Rechnung" : src}`].filter(Boolean).join(" · ") || undefined}
                            onChange={(e) => set(idx, c.f, e.target.value)}
                            className={cn("h-7 rounded border bg-surface px-1", c.w, c.num && "text-right tabular-nums", c.mono && "font-mono",
                              le[c.f] && "border-critical bg-critical-soft", uncertain && !le[c.f] && "border-warning bg-warning-soft", src === "USER" && "border-primary/50")} />
                          {le[c.f] && <div className="text-[10px] text-critical">{le[c.f]}</div>}
                        </td>
                      );
                    })}
                    <td className="px-1 py-1">
                      <div className="flex flex-col gap-0.5">
                        {l.reviewStatus === "CONFIRMED" ? <Badge tone="success">bestätigt</Badge> : l.reviewStatus === "NEEDS_REVIEW" ? <Badge tone="warning">prüfen</Badge> : null}
                        {low && <Badge tone="warning" title="Konfidenz der KI-Erkennung">{Math.round((l.meta!.confidence ?? 0) * 100)} %</Badge>}
                        {l.meta?.page && <span className="text-[10px] text-muted-foreground">S. {l.meta.page}</span>}
                        {iss.slice(0, 2).map((i, k) => <span key={k} title={i.message} className={cn("max-w-40 truncate text-[10px]", i.severity === "CRITICAL" ? "text-critical" : "text-warning")}>{i.message}</span>)}
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      {editable && (
                        <div className="flex gap-1">
                          <button type="button" title="Position aufteilen" onClick={() => split(idx)} className="text-muted-foreground hover:text-primary"><Copy className="size-3.5" /></button>
                          <button type="button" title="Position löschen" onClick={() => remove(idx)} className="text-muted-foreground hover:text-critical"><Trash2 className="size-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!visible.length && <tr><td colSpan={COLS.length + 4} className="py-8 text-center text-sm text-muted-foreground">Keine Positionen. {editable && "„Position“ hinzufügen oder KI-Erkennung starten."}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11px] text-muted-foreground">
          Gelb = von der Erkennung unsicher markiert · blau umrandet = manuell geändert · Tarifnummern sind erst nach fachlicher Bestätigung verbindlich vorbereitet; die Einreihung verantwortet das Fachpersonal.
        </p>
      </form>
    </Card>
  );
}
