import { D, dec, type Dec } from "../money/decimal";
import { isCurrencyCode } from "../money/currency";
import { parseTariffNumber } from "../tariff/tariff-number";
import { isCountryCode } from "../tariff/country";
import type { LineInput } from "../types";
import type { DecInput } from "../money/decimal";

export type Severity = "CRITICAL" | "WARNING" | "INFO";

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  entityType: "Invoice" | "InvoiceLine" | "Document";
  entityId: string;
  field?: string;
}

export interface InvoiceInput {
  id: string;
  invoiceNumber?: string | null;
  supplierName?: string | null;
  invoiceDate?: string | null;
  currency?: string | null;
  totalAmount?: DecInput | null;
  /** Kopfabzüge/-zuschläge, die in totalAmount enthalten sind (Rabatt negativ erfassen) */
  headerAdjustments?: DecInput | null;
  documentSha256?: string | null;
  lines: LineInput[];
}

export interface ValidationOptions {
  /** Toleranz für Menge × Preis vs. Positionswert (absolut, Rechnungswährung) */
  lineTolerance?: DecInput;
  /** Toleranz Summe Positionen vs. Rechnungstotal */
  totalTolerance?: DecInput;
  /** Max. plausibles Verhältnis brutto/netto */
  maxGrossNetRatio?: DecInput;
}

const present = (v: unknown) => v !== null && v !== undefined && v !== "";
const lineLabel = (inv: InvoiceInput, l: LineInput) => `Rechnung ${inv.invoiceNumber ?? "?"}, Position ${l.lineNo}`;

export function validateLine(inv: InvoiceInput, l: LineInput, o: ValidationOptions = {}): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, severity: Severity, message: string, field?: string) =>
    out.push({ code, severity, message: `${lineLabel(inv, l)}: ${message}`, entityType: "InvoiceLine", entityId: l.id, field });

  const t = parseTariffNumber(l.tariffNumber);
  if (!t.ok) {
    if (t.reason === "EMPTY") add("TARIFF_MISSING", "CRITICAL", "Tarifnummer fehlt.", "tariffNumber");
    else if (t.reason === "HS6_ONLY")
      add("TARIFF_HS6_ONLY", "CRITICAL", `Nur 6-stelliger HS-Code (${l.tariffNumber}) – Schweizer 8-stellige Tarifnummer erforderlich.`, "tariffNumber");
    else add("TARIFF_FORMAT", "CRITICAL", `Ungültiges Tarifnummernformat „${l.tariffNumber}“ (erwartet NNNN.NNNN).`, "tariffNumber");
  }
  if (!present(l.originCountry)) add("ORIGIN_MISSING", "CRITICAL", "Ursprungsland fehlt.", "originCountry");
  else if (!isCountryCode(l.originCountry)) add("ORIGIN_FORMAT", "CRITICAL", `Ungültiger Ländercode „${l.originCountry}“.`, "originCountry");

  if (!present(l.lineAmount)) add("VALUE_MISSING", "CRITICAL", "Warenwert fehlt.", "lineAmount");
  else if (dec(l.lineAmount!).lte(0)) add("VALUE_NOT_POSITIVE", "WARNING", "Warenwert ist 0 oder negativ.", "lineAmount");

  if (!present(l.quantity)) add("QUANTITY_MISSING", "WARNING", "Menge fehlt.", "quantity");
  if (!present(l.unit) && present(l.quantity)) add("UNIT_MISSING", "WARNING", "Mengeneinheit fehlt.", "unit");
  if (!present(l.description)) add("DESCRIPTION_MISSING", "WARNING", "Warenbeschreibung fehlt.", "description");

  if (present(l.quantity) && present(l.unitPrice) && present(l.lineAmount)) {
    const diff = dec(l.quantity!).times(l.unitPrice!).minus(l.lineAmount!).abs();
    if (diff.gt(o.lineTolerance ?? "0.05"))
      add("LINE_MATH", "WARNING", `Menge × Einzelpreis weicht um ${diff.toFixed(2)} vom Positionswert ab.`, "lineAmount");
  }

  if (!present(l.netWeightKg)) add("NET_WEIGHT_MISSING", "WARNING", "Nettogewicht (Eigenmasse) fehlt.", "netWeightKg");
  else if (dec(l.netWeightKg!).lte(0)) add("NET_WEIGHT_IMPLAUSIBLE", "CRITICAL", "Nettogewicht ist 0 oder negativ.", "netWeightKg");

  if (!present(l.grossWeightKg))
    add("GROSS_WEIGHT_MISSING", "WARNING", "Bruttogewicht fehlt (Zollbemessungsgrundlage) – auf Anmeldeposition zwingend zu ergänzen, nicht schätzen.", "grossWeightKg");
  if (present(l.netWeightKg) && present(l.grossWeightKg)) {
    const n = dec(l.netWeightKg!);
    const g = dec(l.grossWeightKg!);
    if (g.lt(n)) add("GROSS_LT_NET", "CRITICAL", "Bruttogewicht ist kleiner als Nettogewicht.", "grossWeightKg");
    else if (n.gt(0) && g.div(n).gt(o.maxGrossNetRatio ?? 5))
      add("GROSS_NET_RATIO", "WARNING", "Bruttogewicht ist mehr als 5× so hoch wie das Nettogewicht.", "grossWeightKg");
  }
  if (present(l.currency) && present(inv.currency) && l.currency !== inv.currency)
    add("LINE_CURRENCY_MISMATCH", "WARNING", `Positionswährung ${l.currency} ≠ Rechnungswährung ${inv.currency}.`, "currency");
  return out;
}

export function validateInvoice(inv: InvoiceInput, o: ValidationOptions = {}): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, severity: Severity, message: string, field?: string) =>
    out.push({ code, severity, message: `Rechnung ${inv.invoiceNumber ?? "?"}: ${message}`, entityType: "Invoice", entityId: inv.id, field });

  if (!present(inv.invoiceNumber)) add("INVOICE_NUMBER_MISSING", "CRITICAL", "Rechnungsnummer fehlt.", "invoiceNumber");
  if (!present(inv.supplierName)) add("SUPPLIER_MISSING", "WARNING", "Lieferant fehlt.", "supplierName");
  if (!present(inv.invoiceDate)) add("INVOICE_DATE_MISSING", "WARNING", "Rechnungsdatum fehlt.", "invoiceDate");
  if (!present(inv.currency)) add("CURRENCY_MISSING", "CRITICAL", "Rechnungswährung fehlt.", "currency");
  else if (!isCurrencyCode(inv.currency)) add("CURRENCY_FORMAT", "CRITICAL", `Ungültiger Währungscode „${inv.currency}“.`, "currency");
  if (inv.lines.length === 0) add("NO_LINES", "CRITICAL", "Keine Positionen erkannt.");

  if (present(inv.totalAmount) && inv.lines.length) {
    if (inv.lines.some((l) => !present(l.lineAmount))) {
      add("TOTAL_UNCHECKABLE", "INFO", "Rechnungstotal kann nicht geprüft werden (Positionswerte unvollständig).", "totalAmount");
    } else {
      const lineSum = inv.lines.reduce<Dec>((a, l) => a.plus(l.lineAmount!), new D(0)).plus(inv.headerAdjustments ?? 0);
      const diff = lineSum.minus(inv.totalAmount!).abs();
      if (diff.gt(o.totalTolerance ?? "0.05"))
        add("TOTAL_MISMATCH", "CRITICAL", `Summe der Positionen (${lineSum.toFixed(2)}) ≠ Rechnungstotal (${dec(inv.totalAmount!).toFixed(2)}).`, "totalAmount");
    }
  }
  for (const l of inv.lines) out.push(...validateLine(inv, l, o));
  return out;
}

/** Auftragsübergreifende Prüfungen: Duplikate, Widersprüche je Artikelnummer, Währungsmix. */
export function validateOrder(invoices: InvoiceInput[], declarationCurrency: string, o: ValidationOptions = {}): Issue[] {
  const out: Issue[] = invoices.flatMap((i) => validateInvoice(i, o));

  // Duplikate: gleicher Dateihash oder gleicher Lieferant + Rechnungsnummer
  const seenHash = new Map<string, InvoiceInput>();
  const seenNo = new Map<string, InvoiceInput>();
  for (const inv of invoices) {
    if (inv.documentSha256) {
      const prev = seenHash.get(inv.documentSha256);
      if (prev) out.push({ code: "DUPLICATE_FILE", severity: "CRITICAL", entityType: "Invoice", entityId: inv.id,
        message: `Rechnung ${inv.invoiceNumber ?? "?"}: identische Datei wurde bereits hochgeladen (Rechnung ${prev.invoiceNumber ?? prev.id}).` });
      else seenHash.set(inv.documentSha256, inv);
    }
    if (inv.invoiceNumber) {
      const k = `${(inv.supplierName ?? "").trim().toLowerCase()}|${inv.invoiceNumber.trim().toLowerCase()}`;
      const prev = seenNo.get(k);
      if (prev) out.push({ code: "DUPLICATE_INVOICE", severity: "CRITICAL", entityType: "Invoice", entityId: inv.id,
        message: `Rechnung ${inv.invoiceNumber}: dieselbe Rechnungsnummer vom selben Lieferanten ist bereits im Auftrag.` });
      else seenNo.set(k, inv);
    }
  }

  // Widersprüche je Artikelnummer
  const byArticle = new Map<string, { tariffs: Set<string>; origins: Set<string>; ids: string[]; labels: string[] }>();
  for (const inv of invoices) for (const l of inv.lines) {
    if (!l.articleNumber) continue;
    const k = l.articleNumber.trim().toUpperCase();
    const e = byArticle.get(k) ?? { tariffs: new Set(), origins: new Set(), ids: [], labels: [] };
    const t = parseTariffNumber(l.tariffNumber);
    if (t.ok) e.tariffs.add(t.normalized);
    if (l.originCountry) e.origins.add(l.originCountry);
    e.ids.push(l.id);
    e.labels.push(lineLabel(inv, l));
    byArticle.set(k, e);
  }
  for (const [art, e] of byArticle) {
    if (e.tariffs.size > 1) e.ids.forEach((id, i) => out.push({ code: "ARTICLE_TARIFF_CONFLICT", severity: "WARNING", entityType: "InvoiceLine", entityId: id, field: "tariffNumber",
      message: `${e.labels[i]}: Artikel ${art} hat im Auftrag unterschiedliche Tarifnummern (${[...e.tariffs].join(", ")}).` }));
    if (e.origins.size > 1) e.ids.forEach((id, i) => out.push({ code: "ARTICLE_ORIGIN_CONFLICT", severity: "WARNING", entityType: "InvoiceLine", entityId: id, field: "originCountry",
      message: `${e.labels[i]}: Artikel ${art} hat im Auftrag unterschiedliche Ursprungsländer (${[...e.origins].join(", ")}). Ursprungsnachweis prüfen.` }));
  }

  for (const cur of new Set(invoices.map((i) => i.currency).filter((c): c is string => !!c && c !== declarationCurrency)))
    for (const inv of invoices.filter((i) => i.currency === cur))
      out.push({ code: "FOREIGN_CURRENCY", severity: "INFO", entityType: "Invoice", entityId: inv.id, field: "currency",
        message: `Rechnung ${inv.invoiceNumber ?? "?"}: Währung ${cur} – Umrechnung in ${declarationCurrency} mit dokumentiertem Kurs erforderlich.` });
  return out;
}

export const countBySeverity = (issues: Issue[]) =>
  issues.reduce((a, i) => ({ ...a, [i.severity]: a[i.severity] + 1 }), { CRITICAL: 0, WARNING: 0, INFO: 0 } as Record<Severity, number>);
