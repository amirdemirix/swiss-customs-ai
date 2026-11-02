import { parseAmount } from "../money/decimal";
import { parseTariffNumber } from "../tariff/tariff-number";
import { parseDate } from "../import/rows-to-invoices";

/** Struktur der KI-Antwort (entspricht server/extraction/schema.ts, hier framework-frei). */
export interface AiField { value: string | null; page: number | null; confidence: number }
export interface AiLine {
  lineNo: number | null; page: number | null; articleNumber: string | null; description: string | null; tariffNumber: string | null;
  originCountry: string | null; quantity: string | null; unit: string | null; unitPrice: string | null; lineAmount: string | null;
  netWeightKg: string | null; grossWeightKg: string | null; confidence: number; uncertainFields: string[];
}
export interface AiResult {
  isInvoice: boolean; invoiceNumber: AiField; invoiceDate: AiField; supplierName: AiField; currency: AiField; totalAmount: AiField;
  incoterm: AiField; totalNetWeightKg: AiField; totalGrossWeightKg: AiField; packages: AiField; lines: AiLine[]; notes: string[];
}

export interface MappedLine {
  lineNo: number; articleNumber: string | null; description: string | null; tariffNumber: string | null; originCountry: string | null;
  quantity: string | null; unit: string | null; unitPrice: string | null; lineAmount: string | null; netWeightKg: string | null; grossWeightKg: string | null;
  needsReview: boolean; fieldMeta: { source: "ai"; page: number | null; confidence: number; uncertain: string[]; rejected: Record<string, string> };
}
export interface MappedInvoice {
  invoiceNumber: string | null; invoiceDate: string | null; supplierName: string | null; currency: string | null; totalAmount: string | null;
  incoterm: string | null; netWeightKg: string | null; grossWeightKg: string | null; packages: string | null;
  needsReview: boolean; lines: MappedLine[]; notes: string[];
  headerMeta: Record<string, { page: number | null; confidence: number }>;
}

const clamp = (c: number) => (Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0);

/**
 * Prüft jeden KI-Wert erneut mit denselben Regeln wie beim Import: unplausible Formate werden
 * verworfen (null) und vermerkt – die KI kann also keine ungültigen Werte in die Daten schreiben.
 */
export function mapExtraction(r: AiResult, threshold: number): MappedInvoice {
  const notes = [...r.notes];
  const hdr = (f: AiField) => (f.value?.trim() ? f.value.trim() : null);

  const date = parseDate(hdr(r.invoiceDate));
  if (hdr(r.invoiceDate) && !date.value) notes.push(`Rechnungsdatum „${hdr(r.invoiceDate)}“ nicht eindeutig lesbar.`);
  const cur = hdr(r.currency)?.toUpperCase() ?? null;
  if (cur && !/^[A-Z]{3}$/.test(cur)) notes.push(`Währung „${cur}“ ist kein ISO-Code.`);
  const amount = (v: string | null) => (v == null ? null : parseAmount(v)?.toString() ?? null);
  const inc = hdr(r.incoterm)?.toUpperCase().slice(0, 3) ?? null;

  const usedNos = new Set<number>();
  let next = 1;
  const lines = r.lines.map<MappedLine>((l) => {
    const rejected: Record<string, string> = {};
    const num = (k: keyof AiLine, v: string | null) => {
      if (v == null || v.trim() === "") return null;
      const p = parseAmount(v);
      if (!p) { rejected[k] = v; return null; }
      return p.toString();
    };
    const t = parseTariffNumber(l.tariffNumber);
    const tariff = l.tariffNumber?.trim() ? (t.ok ? t.normalized : l.tariffNumber.trim()) : null;
    let origin = l.originCountry?.trim().toUpperCase() || null;
    if (origin && !/^[A-Z]{2}$/.test(origin)) { rejected.originCountry = origin; origin = null; }
    let no = l.lineNo && l.lineNo > 0 && !usedNos.has(l.lineNo) ? l.lineNo : 0;
    if (!no) { while (usedNos.has(next)) next++; no = next; }
    usedNos.add(no);
    const m: MappedLine = {
      lineNo: no, articleNumber: l.articleNumber?.trim() || null, description: l.description?.trim() || null, tariffNumber: tariff, originCountry: origin,
      quantity: num("quantity", l.quantity), unit: l.unit?.trim().toUpperCase().slice(0, 10) || null, unitPrice: num("unitPrice", l.unitPrice),
      lineAmount: num("lineAmount", l.lineAmount), netWeightKg: num("netWeightKg", l.netWeightKg), grossWeightKg: num("grossWeightKg", l.grossWeightKg),
      needsReview: false,
      fieldMeta: { source: "ai", page: l.page, confidence: clamp(l.confidence), uncertain: l.uncertainFields ?? [], rejected },
    };
    m.needsReview = m.fieldMeta.confidence < threshold || m.fieldMeta.uncertain.length > 0 || Object.keys(rejected).length > 0;
    return m;
  });

  const headerMeta: MappedInvoice["headerMeta"] = {};
  for (const k of ["invoiceNumber", "invoiceDate", "supplierName", "currency", "totalAmount"] as const) headerMeta[k] = { page: r[k].page, confidence: clamp(r[k].confidence) };
  if (!r.isInvoice) notes.unshift("Die KI hat das Dokument nicht als Handelsrechnung erkannt.");

  return {
    invoiceNumber: hdr(r.invoiceNumber), invoiceDate: date.value, supplierName: hdr(r.supplierName),
    currency: cur && /^[A-Z]{3}$/.test(cur) ? cur : null, totalAmount: amount(hdr(r.totalAmount)),
    incoterm: inc && /^[A-Z]{3}$/.test(inc) ? inc : null, netWeightKg: amount(hdr(r.totalNetWeightKg)), grossWeightKg: amount(hdr(r.totalGrossWeightKg)),
    packages: hdr(r.packages), needsReview: true, // KI-Ergebnisse immer zur Kontrolle, Bestätigung nur durch Fachpersonal
    lines, notes, headerMeta,
  };
}
