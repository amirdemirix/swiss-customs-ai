/**
 * Erkennt Rechnungskopfdaten in PDF-Text per Mustersuche. Ergebnis sind VORSCHLÄGE mit
 * Fundstelle (Seite + Textausschnitt); sie müssen in der Kontrolle bestätigt werden.
 * Findet sich nichts Eindeutiges, bleibt das Feld leer.
 */
import { parseAmount } from "../money/decimal";
import { parseDate } from "../import/rows-to-invoices";

export interface Evidence { value: string; page: number; snippet: string }
export interface DetectedHeader {
  invoiceNumber: Evidence | null;
  invoiceDate: Evidence | null;
  currency: Evidence | null;
  totalAmount: Evidence | null;
}

const CURRENCIES = ["CHF", "EUR", "USD", "GBP", "JPY", "CNY", "SEK", "NOK", "DKK", "PLN", "CZK", "TRY"];

const NUMBER_PATTERNS = [
  /(?:rechnungs?[-\s]?(?:nummer|nr\.?|no\.?)|invoice\s*(?:no\.?|number|#)|facture\s*(?:n[o°]\.?)|fattura\s*(?:n\.?|nr\.?))\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,30})/i,
];
const DATE_PATTERNS = [
  /(?:rechnungsdatum|invoice\s*date|date\s*(?:de\s*)?facture|data\s*fattura|datum|date)\s*[:]?\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
];
const TOTAL_PATTERNS = [
  /(?:gesamtbetrag|rechnungsbetrag|total\s*(?:amount|due|à\s*payer)?|summe|totale|amount\s*due)\s*(?:inkl\.?\s*mwst\.?|incl\.?\s*vat)?\s*[:]?\s*(?:CHF|EUR|USD|GBP)?\s*([\d'’.,\s]{1,20}\d)/i,
];

function find(pages: string[], patterns: RegExp[]): Evidence | null {
  for (let p = 0; p < pages.length; p++) {
    for (const re of patterns) {
      const m = pages[p].match(re);
      if (m?.[1]) {
        const i = m.index ?? 0;
        return { value: m[1].trim(), page: p + 1, snippet: pages[p].slice(Math.max(0, i - 10), i + m[0].length + 10).replace(/\s+/g, " ").trim() };
      }
    }
  }
  return null;
}

export function detectInvoiceHeader(pages: string[]): DetectedHeader {
  const invoiceNumber = find(pages, NUMBER_PATTERNS);
  const dateEv = find(pages, DATE_PATTERNS);
  const date = dateEv ? parseDate(dateEv.value) : null;
  const totalEv = find(pages, TOTAL_PATTERNS);
  const total = totalEv ? parseAmount(totalEv.value) : null;

  // Währung: nur wenn genau eine ISO-Währung im Dokument vorkommt (sonst mehrdeutig)
  const counts = new Map<string, { n: number; page: number; snippet: string }>();
  pages.forEach((t, p) => {
    for (const c of CURRENCIES) {
      const re = new RegExp(`\\b${c}\\b`, "g");
      const ms = [...t.matchAll(re)];
      if (ms.length) {
        const e = counts.get(c) ?? { n: 0, page: p + 1, snippet: t.slice(Math.max(0, (ms[0].index ?? 0) - 15), (ms[0].index ?? 0) + 20).replace(/\s+/g, " ").trim() };
        e.n += ms.length;
        counts.set(c, e);
      }
    }
  });
  const currency = counts.size === 1 ? (() => { const [c, e] = [...counts][0]; return { value: c, page: e.page, snippet: e.snippet }; })() : null;

  return {
    invoiceNumber,
    invoiceDate: dateEv && date?.value ? { ...dateEv, value: date.value } : null,
    currency,
    totalAmount: totalEv && total ? { ...totalEv, value: total.toString() } : null,
  };
}

/** Gescannte PDFs haben (fast) keinen Textlayer. */
export const looksScanned = (pages: string[]) => pages.reduce((a, p) => a + p.replace(/\s/g, "").length, 0) < 30 * Math.max(1, pages.length);
