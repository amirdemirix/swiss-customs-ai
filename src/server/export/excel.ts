import ExcelJS from "exceljs";
import { round, sum } from "@/domain";
import type { ExportData } from "./data";

const MONEY = "#,##0.00", KG = "#,##0.000", QTY = "#,##0.####";
const num = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));

function head(ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number; fmt?: string }[]) {
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }));
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E9A" } };
  r.alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

/**
 * Excel-Export mit 4 Blättern. Summen werden als Formel UND als Kontrollwert aus der
 * Berechnung ausgegeben, damit Abweichungen sofort sichtbar wären.
 */
export async function buildOrderWorkbook(d: ExportData, meta: { userName: string; generatedAt: Date }): Promise<Buffer> {
  const { order } = d;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Swiss Customs AI";
  wb.created = meta.generatedAt;
  const cur = order.declarationCurrency;
  const provisional = d.critical > 0 || d.unconfirmed > 0;

  // ── Blatt 1: Zollübersicht ──
  const s1 = wb.addWorksheet("Zollübersicht");
  head(s1, [
    { header: "Pos.", key: "pos", width: 6 }, { header: "Tarifnummer", key: "tariff", width: 12 }, { header: "Schlüssel", key: "key", width: 9 },
    { header: "Ursprung", key: "origin", width: 9 }, { header: "Präferenz", key: "pref", width: 11 }, { header: "Verfahren", key: "proc", width: 11 },
    { header: "Warenbeschreibung", key: "desc", width: 40 }, { header: `Wert ${cur}`, key: "value", width: 14, fmt: MONEY }, { header: "Währung", key: "cur", width: 8 },
    { header: "Menge", key: "qty", width: 11, fmt: QTY }, { header: "Einheit", key: "unit", width: 8 }, { header: "Netto kg", key: "net", width: 12, fmt: KG },
    { header: "Brutto kg", key: "gross", width: 12, fmt: KG }, { header: "Anz. Rechnungspos.", key: "n", width: 10 }, { header: "Hinweise", key: "notes", width: 50 },
  ]);
  for (const l of order.declarationLines) {
    const a = (l.attributes ?? {}) as { valueComplete?: boolean; mergeable?: boolean; problems?: { code: string }[] };
    const notes = [a.valueComplete === false && "Wert unvollständig", a.mergeable === false && "nicht zusammengefasst (Pflichtmerkmal fehlt)",
      l.netWeightKg == null && "Nettogewicht unvollständig", l.grossWeightKg == null && "Bruttogewicht unvollständig"].filter(Boolean).join("; ");
    s1.addRow({ pos: l.position, tariff: l.tariffNumber, key: l.statisticalKey, origin: l.originCountry, pref: l.preferenceStatus === "CLAIMED" ? "Präferenz" : l.preferenceStatus === "NONE" ? "Normal" : "unbekannt",
      proc: l.customsProcedure, desc: l.description, value: a.valueComplete === false ? null : num(l.totalValue), cur, qty: num(l.totalQuantity), unit: l.quantityUnit,
      net: num(l.netWeightKg), gross: num(l.grossWeightKg), n: l.sources.length, notes });
  }
  const last = s1.rowCount;
  const total = sum(order.declarationLines.map((l) => l.totalValue.toString()));
  const tr = s1.addRow({ desc: "Total (Formel)", value: { formula: `SUM(H2:H${last})`, result: Number(round(total).toFixed(2)) },
    net: { formula: `SUM(L2:L${last})` }, gross: { formula: `SUM(M2:M${last})` }, n: { formula: `SUM(N2:N${last})` } });
  tr.font = { bold: true };
  s1.addRow({ desc: "Kontrollwert (Berechnung)", value: Number(round(total).toFixed(2)) }).font = { italic: true };
  s1.addRow([]);
  for (const [k, v] of [
    ["Auftrag", order.orderNumber], ["Kunde", order.customer?.name ?? ""], ["Richtung", order.direction === "IMPORT" ? "Einfuhr" : order.direction === "EXPORT" ? "Ausfuhr" : "Transit"],
    ["Referenz", order.reference ?? ""], ["Gruppierungsprofil", order.groupingProfile?.name ?? "Standard"], ["Erstellt", `${meta.generatedAt.toISOString()} durch ${meta.userName}`],
    ["Status", provisional ? `VORLÄUFIG – ${d.critical} kritische Befunde, ${d.unconfirmed} unbestätigte Rechnung(en)` : "Alle Rechnungen bestätigt, keine kritischen Befunde"],
    ["Hinweis", "Arbeitsunterlage zur Vorbereitung der Zollanmeldung. Tarifeinreihung und Anmeldung verantwortet das Fachpersonal."],
  ]) s1.addRow({ pos: k, desc: v }).getCell(1).font = { bold: true };
  if (order.exchangeRates.length) for (const r of order.exchangeRates) s1.addRow({ pos: "Kurs", desc: `1 ${r.fromCurrency} = ${r.rate.toString()} ${r.toCurrency} · Stand ${r.validOn.toISOString().slice(0, 10)} · Quelle: ${r.source}` });

  // ── Blatt 2: Rechnungsdetails ──
  const s2 = wb.addWorksheet("Rechnungsdetails");
  head(s2, [
    { header: "Rechnung", key: "inv", width: 14 }, { header: "Pos.", key: "no", width: 6 }, { header: "Artikel", key: "art", width: 14 }, { header: "Beschreibung", key: "desc", width: 36 },
    { header: "Tarifnummer", key: "tariff", width: 12 }, { header: "Quelle Tarif", key: "tsrc", width: 11 }, { header: "Schl.", key: "key", width: 7 }, { header: "Ursprung", key: "origin", width: 9 },
    { header: "Menge", key: "qty", width: 10, fmt: QTY }, { header: "Einheit", key: "unit", width: 8 }, { header: "Einzelpreis", key: "up", width: 12, fmt: "#,##0.00####" },
    { header: "Wert (Original)", key: "amt", width: 14, fmt: MONEY }, { header: "Währung", key: "cur", width: 8 }, { header: `Wert ${cur}`, key: "conv", width: 14, fmt: "#,##0.0000" },
    { header: "Netto kg", key: "net", width: 11, fmt: KG }, { header: "Brutto kg", key: "gross", width: 11, fmt: KG }, { header: "Anmeldepos.", key: "decl", width: 10 },
    { header: "Prüfstatus", key: "rev", width: 11 }, { header: "Quelle (Datei / Seite / Zeile)", key: "src", width: 40 },
  ]);
  for (const inv of order.invoices) for (const l of inv.lines) {
    const fm = (l.fieldMeta ?? {}) as { source?: { sheet?: string; row?: number } | string; page?: number };
    const loc = typeof fm.source === "object" && fm.source ? `Blatt ${fm.source.sheet}, Zeile ${fm.source.row}` : fm.page ? `Seite ${fm.page}` : fm.source === "user" ? "manuell erfasst" : "";
    s2.addRow({ inv: inv.invoiceNumber, no: l.lineNo, art: l.articleNumber, desc: l.description, tariff: l.tariffNumber,
      tsrc: l.tariffNumberSource === "USER" ? "manuell" : l.tariffNumberSource === "INVOICE" ? "Rechnung" : l.tariffNumberSource ?? "", key: l.statisticalKey, origin: l.originCountry,
      qty: num(l.quantity), unit: l.unit, up: num(l.unitPrice), amt: num(l.lineAmount), cur: inv.currency, conv: d.converted.has(l.id) ? Number(d.converted.get(l.id)) : null,
      net: num(l.netWeightKg), gross: num(l.grossWeightKg), decl: d.posOf.get(l.id) ?? null,
      rev: l.reviewStatus === "CONFIRMED" ? "bestätigt" : l.reviewStatus === "NEEDS_REVIEW" ? "zu prüfen" : "erfasst",
      src: [inv.document?.fileName, loc].filter(Boolean).join(" · ") });
  }

  // ── Blatt 3: Rechnungsübersicht ──
  const s3 = wb.addWorksheet("Rechnungsübersicht");
  head(s3, [
    { header: "Rechnungsnummer", key: "no", width: 16 }, { header: "Lieferant", key: "sup", width: 30 }, { header: "Rechnungsdatum", key: "date", width: 13 },
    { header: "Währung", key: "cur", width: 8 }, { header: "Rechnungsbetrag", key: "total", width: 15, fmt: MONEY }, { header: "Summe Positionen", key: "lines", width: 15, fmt: MONEY },
    { header: "Differenz", key: "diff", width: 12, fmt: MONEY }, { header: "Positionen", key: "n", width: 10 }, { header: "Prüfstatus", key: "rev", width: 11 }, { header: "Beleg", key: "doc", width: 34 },
  ]);
  for (const inv of order.invoices) {
    const complete = inv.lines.every((l) => l.lineAmount != null);
    const ls = complete ? sum(inv.lines.map((l) => l.lineAmount!.toString())) : null;
    s3.addRow({ no: inv.invoiceNumber, sup: inv.supplierName, date: inv.invoiceDate ? inv.invoiceDate.toISOString().slice(0, 10) : null, cur: inv.currency,
      total: num(inv.totalAmount), lines: ls ? Number(ls.toFixed(2)) : null, diff: ls && inv.totalAmount ? Number(ls.minus(inv.totalAmount.toString()).toFixed(2)) : null,
      n: inv.lines.length, rev: inv.reviewStatus === "CONFIRMED" ? "bestätigt" : inv.reviewStatus === "NEEDS_REVIEW" ? "zu prüfen" : "erfasst", doc: inv.document?.fileName ?? "" });
  }

  // ── Blatt 4: Prüfprotokoll ──
  const s4 = wb.addWorksheet("Prüfprotokoll");
  head(s4, [{ header: "Art", key: "kind", width: 12 }, { header: "Stufe / Aktion", key: "sev", width: 16 }, { header: "Zeitpunkt", key: "at", width: 20 }, { header: "Benutzer", key: "user", width: 18 },
    { header: "Feld", key: "field", width: 22 }, { header: "Alt", key: "old", width: 24 }, { header: "Neu", key: "new", width: 24 }, { header: "Beschreibung", key: "msg", width: 70 }]);
  const SEV = { CRITICAL: "Kritischer Fehler", WARNING: "Warnung", INFO: "Information" } as const;
  for (const i of order.issues) s4.addRow({ kind: "Befund", sev: SEV[i.severity], at: i.createdAt.toISOString().replace("T", " ").slice(0, 19), msg: i.message });
  const show = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 500) : String(v));
  for (const a of d.audit) s4.addRow({ kind: "Protokoll", sev: a.action, at: a.createdAt.toISOString().replace("T", " ").slice(0, 19), user: a.userId ? d.users.get(a.userId) ?? a.userId : "System",
    field: a.field ?? "", old: show(a.oldValue), new: show(a.newValue), msg: `${a.entityType} ${a.entityId}` });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
