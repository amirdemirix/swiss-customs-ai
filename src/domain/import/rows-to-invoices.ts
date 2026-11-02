import { inferDecimalSeparator, parseAmount } from "../money/decimal";
import { parseTariffNumber } from "../tariff/tariff-number";
import type { ColumnMap, ImportField } from "./columns";

export interface ImportDefaults {
  invoiceNumber?: string | null;
  invoiceDate?: string | null; // ISO
  supplierName?: string | null;
  currency?: string | null;
}

export interface LineDraft {
  lineNo: number;
  sourceRow: number; // 1-basierte Zeilennummer in der Datei (Rückverfolgbarkeit)
  articleNumber: string | null;
  description: string | null;
  tariffNumber: string | null;
  statisticalKey: string | null;
  originCountry: string | null;
  preferenceStatus: "NONE" | "CLAIMED" | "UNKNOWN";
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  lineAmount: string | null;
  netWeightKg: string | null;
  grossWeightKg: string | null;
  packaging: string | null;
  raw: Record<string, string>; // Originalwerte der zugeordneten Spalten
}

export interface InvoiceDraft {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  supplierName: string | null;
  currency: string | null;
  /** Total aus einer Summenzeile der Datei (falls vorhanden) – sonst null, nie berechnet */
  totalAmount: string | null;
  lines: LineDraft[];
}

export interface RowProblem {
  row: number;
  field?: ImportField;
  severity: "WARNING" | "INFO";
  message: string;
}

const TOTAL_ROW = /^(total|summe|gesamt|gesamtbetrag|subtotal|zwischensumme|grand total|totale)\b/i;

const clean = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

export function parseDate(raw: string | null): { value: string | null; ambiguous: boolean } {
  if (!raw) return { value: null, ambiguous: false };
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/); // Schweizer/deutsches Format: eindeutig TT.MM.JJJJ
  if (m) return valid(year(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) return valid(year(+m[3]), b, a); // TT/MM
    if (b > 12 && a <= 12) return valid(year(+m[3]), a, b); // MM/TT (US)
    return { value: null, ambiguous: true };
  }
  return { value: null, ambiguous: false };
}
const year = (y: number) => (y < 100 ? 2000 + y : y);
function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { value: null, ambiguous: false };
  return { value: dt.toISOString().slice(0, 10), ambiguous: false };
}

function preference(raw: string | null): LineDraft["preferenceStatus"] {
  if (!raw) return "UNKNOWN";
  if (/^(ja|yes|y|j|x|true|1|oui|si|sì|präferenz|preferential)$/i.test(raw.trim())) return "CLAIMED";
  if (/^(nein|no|n|false|0|non)$/i.test(raw.trim())) return "NONE";
  return "UNKNOWN";
}

/**
 * Wandelt Tabellenzeilen in Rechnungsentwürfe um. Grundsatz: Werte werden nur übernommen,
 * nie ergänzt oder geschätzt. Nicht lesbare Werte → null + Hinweis mit Zeilennummer.
 */
export function rowsToInvoices(dataRows: string[][], map: ColumnMap, defaults: ImportDefaults, firstRowNumber = 2): { invoices: InvoiceDraft[]; problems: RowProblem[] } {
  const problems: RowProblem[] = [];
  const byInvoice = new Map<string, InvoiceDraft>();
  let lastInv: InvoiceDraft | undefined;
  const get = (r: string[], f: ImportField) => (map[f] === undefined ? null : clean(r[map[f]!]));
  const NUMERIC: ImportField[] = ["quantity", "unitPrice", "lineAmount", "netWeightKg", "grossWeightKg"];
  const decimalHint = inferDecimalSeparator(dataRows.flatMap((r) => NUMERIC.flatMap((f) => (get(r, f) ?? "").split(/\s*[/|]\s*/))));

  dataRows.forEach((r, idx) => {
    const rowNo = firstRowNumber + idx;
    if (!r.some((c) => c.trim() !== "")) return;

    const raw: Record<string, string> = {};
    for (const [f, i] of Object.entries(map)) if (i !== undefined && r[i]?.trim()) raw[f] = r[i].trim();

    // Summenzeilen erkennen: Text „Total/Summe“ ohne Artikel/Tarif. Ohne eigene Rechnungsnummer
    // gehören sie zur zuletzt gelesenen Rechnung (typisch: Total-Zeile unter der Tabelle).
    {
      const label = get(r, "description") ?? get(r, "articleNumber") ?? r.find((c) => c.trim()) ?? "";
      const art = get(r, "articleNumber");
      if (TOTAL_ROW.test(label) && !get(r, "tariffNumber") && !(art && !TOTAL_ROW.test(art))) {
        const amt = parseAmount(get(r, "lineAmount"), decimalHint);
        const ownNo = get(r, "invoiceNumber");
        const target = ownNo ? byInvoice.get(ownNo) : lastInv ?? byInvoice.get(clean(defaults.invoiceNumber ?? undefined) ?? "∅");
        if (amt && target) target.totalAmount = amt.toString();
        problems.push({ row: rowNo, severity: "INFO", message: `Summenzeile „${label}“ übersprungen${amt && target ? ` (Total ${amt.toFixed(2)} als Rechnungstotal übernommen)` : ""}.` });
        return;
      }
    }

    const invNo = get(r, "invoiceNumber") ?? clean(defaults.invoiceNumber ?? undefined);
    const key = invNo ?? "∅";
    let inv = byInvoice.get(key);
    if (!inv) {
      const d = parseDate(get(r, "invoiceDate"));
      if (d.ambiguous) problems.push({ row: rowNo, field: "invoiceDate", severity: "WARNING", message: `Datum „${get(r, "invoiceDate")}“ ist mehrdeutig (TT/MM oder MM/TT) – bitte manuell erfassen.` });
      const cur = (get(r, "currency") ?? defaults.currency ?? null)?.toUpperCase() ?? null;
      inv = {
        invoiceNumber: invNo,
        invoiceDate: d.value ?? defaults.invoiceDate ?? null,
        supplierName: get(r, "supplierName") ?? defaults.supplierName ?? null,
        currency: cur && /^[A-Z]{3}$/.test(cur) ? cur : null,
        totalAmount: null,
        lines: [],
      };
      if (cur && !/^[A-Z]{3}$/.test(cur)) problems.push({ row: rowNo, field: "currency", severity: "WARNING", message: `Währung „${cur}“ ist kein ISO-Code (z. B. CHF, EUR).` });
      if (!invNo) problems.push({ row: rowNo, field: "invoiceNumber", severity: "WARNING", message: "Keine Rechnungsnummer – bitte Spalte zuordnen oder Standardwert angeben." });
      byInvoice.set(key, inv);
    } else {
      const cur = get(r, "currency")?.toUpperCase();
      if (cur && inv.currency && cur !== inv.currency)
        problems.push({ row: rowNo, field: "currency", severity: "WARNING", message: `Abweichende Währung ${cur} innerhalb Rechnung ${invNo ?? "?"} (${inv.currency}).` });
    }

    const description = get(r, "description");
    const article = get(r, "articleNumber");
    const tariffRaw = get(r, "tariffNumber");

    lastInv = inv;
    const num = (f: ImportField) => {
      let v = get(r, f);
      // Kombinierte Gewichtsspalte „netto / brutto“: erster Wert = netto, zweiter = brutto
      if (v && (f === "netWeightKg" || f === "grossWeightKg") && map.netWeightKg !== undefined && map.netWeightKg === map.grossWeightKg) {
        const parts = v.split(/\s*[/|]\s*/).map((x) => x.replace(/\s*kg\s*$/i, "").trim()).filter(Boolean);
        if (parts.length !== 2) { problems.push({ row: rowNo, field: f, severity: "WARNING", message: `Gewichtsangabe „${v}“ ist nicht im Format „netto / brutto“ – leer übernommen.` }); return null; }
        v = f === "netWeightKg" ? parts[0] : parts[1];
      }
      if (v === null) return null;
      const p = parseAmount(v, decimalHint);
      if (!p) { problems.push({ row: rowNo, field: f, severity: "WARNING", message: `Wert „${v}“ in Spalte ${fieldLabel(f)} nicht lesbar – leer übernommen.` }); return null; }
      return p.toString();
    };

    const t = parseTariffNumber(tariffRaw);
    const originRaw = get(r, "originCountry");
    let origin = originRaw?.toUpperCase() ?? null;
    if (origin && !/^[A-Z]{2}$/.test(origin)) {
      problems.push({ row: rowNo, field: "originCountry", severity: "WARNING", message: `Ursprung „${originRaw}“ ist kein ISO-Ländercode (2 Buchstaben) – bitte korrigieren.` });
      origin = null;
    }
    const stat = get(r, "statisticalKey");
    const lineNoRaw = get(r, "lineNo");
    const lineNoNum = lineNoRaw && /^\d{1,6}$/.test(lineNoRaw) ? Number(lineNoRaw) : null;

    inv.lines.push({
      lineNo: lineNoNum ?? 0,
      sourceRow: rowNo,
      articleNumber: article,
      description,
      tariffNumber: t.ok ? t.normalized : tariffRaw,
      statisticalKey: stat && /^\d{3}$/.test(stat) ? stat : null,
      originCountry: origin,
      preferenceStatus: preference(get(r, "preference")),
      quantity: num("quantity"),
      unit: get(r, "unit")?.toUpperCase().slice(0, 10) ?? null,
      unitPrice: num("unitPrice"),
      lineAmount: num("lineAmount"),
      netWeightKg: num("netWeightKg"),
      grossWeightKg: num("grossWeightKg"),
      packaging: get(r, "packaging"),
      raw,
    });
  });

  // Positionsnummern eindeutig machen (fehlend/doppelt → fortlaufend)
  for (const inv of byInvoice.values()) {
    const seen = new Set<number>();
    let next = 1;
    for (const l of inv.lines) {
      if (l.lineNo > 0 && !seen.has(l.lineNo)) { seen.add(l.lineNo); continue; }
      while (seen.has(next)) next++;
      l.lineNo = next; seen.add(next);
    }
  }
  return { invoices: [...byInvoice.values()].filter((i) => i.lines.length > 0 || i.totalAmount), problems };
}

const LABELS: Partial<Record<ImportField, string>> = { quantity: "Menge", unitPrice: "Einzelpreis", lineAmount: "Positionswert", netWeightKg: "Nettogewicht", grossWeightKg: "Bruttogewicht" };
const fieldLabel = (f: ImportField) => LABELS[f] ?? f;
