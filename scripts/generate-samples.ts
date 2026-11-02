/**
 * Erzeugt SYNTHETISCHE Beispielrechnungen zum Testen des Uploads (keine echten Daten).
 * Aufruf: npm run samples  → public/beispiele/
 * Tarifnummern sind formal gültige Beispielwerte, keine geprüfte Tarifeinreihung.
 */
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CSV_SAMPLE = [
  "Rechnung Nr;Datum;Lieferant;Währung;Pos;Artikel-Nr;Bezeichnung;Zolltarifnummer;Ursprungsland;Menge;Einheit;Einzelpreis;Betrag;Nettogewicht;Bruttogewicht",
  "RE-2026-1001;15.10.2026;Muster Textil GmbH;EUR;1;TS-100;T-Shirt Baumwolle, gestrickt;6109.1000;CN;200;PCE;2,50;500,00;37,000;40,200",
  "RE-2026-1001;15.10.2026;Muster Textil GmbH;EUR;2;TS-200;T-Shirt Baumwolle, gestrickt;6109.1000;TR;250;PCE;2,80;700,00;46,250;50,100",
  "RE-2026-1001;15.10.2026;Muster Textil GmbH;EUR;3;PO-300;Polo-Shirt Baumwolle;6105.1000;BD;100;PCE;6,20;620,00;25,000;27,300",
  "RE-2026-1002;16.10.2026;Muster Textil GmbH;EUR;1;TS-100;T-Shirt Baumwolle, gestrickt;6109.1000;CN;360;PCE;2,50;900,00;66,600;71,900",
  "RE-2026-1002;16.10.2026;Muster Textil GmbH;EUR;2;SO-400;Socken Baumwolle;6115.9500;PT;500;PAA;2,30;1'150,00;;",
].join("\r\n");

export async function buildXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice");
  ws.addRow(["COMMERCIAL INVOICE – Sample Electronics Ltd (synthetic test data)"]);
  ws.addRow(["Invoice No:", "INV-88017", "", "Date:", new Date(Date.UTC(2026, 9, 20))]);
  ws.addRow([]);
  ws.addRow(["Item No", "Description", "HS Code", "Country of Origin", "Qty", "Unit", "Unit Price", "Amount", "Net Weight", "Gross Weight"]);
  const items: [string, string, string, string, number, string, number, number, number][] = [
    ["PSU-24", "Power supply 24 V", "8504.4000", "DE", 40, "PCE", 30, 9.6, 12.8],
    ["PSU-48", "Power supply 48 V", "8504.4000", "DE", 20, "PCE", 45.5, 6.2, 8.1],
    ["CAB-01", "Cable assembly", "8544.4200", "CZ", 300, "PCE", 1.15, 18.0, 21.5],
    ["CTRL-9", "Controller board", "8537.1000", "CN", 15, "PCE", 120, 3.75, 6.0],
  ];
  const first = 5;
  items.forEach(([a, d, h, o, q, u, p, nw, gw], i) => {
    const r = first + i;
    ws.addRow([a, d, h, o, q, u, p, { formula: `E${r}*G${r}`, result: Math.round(q * p * 100) / 100 }, nw, gw]);
  });
  const last = first + items.length - 1;
  const total = items.reduce((s, it) => s + Math.round(it[4] * it[6] * 100) / 100, 0);
  ws.addRow(["", "Total", "", "", "", "", "", { formula: `SUM(H${first}:H${last})`, result: total }]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const line = (t: string, f = font, size = 10) => { page.drawText(t, { x: 50, y, size, font: f }); y -= size + 6; };
  line("Beispiel Werkzeuge AG (synthetische Testrechnung)", bold, 13);
  line("Industriestrasse 1, 70173 Stuttgart, DE");
  y -= 10;
  line("Rechnung Nr.: R-55120", bold, 12);
  line("Rechnungsdatum: 22.10.2026");
  line("Kunde: Beispiel Technik GmbH, Zuerich");
  y -= 10;
  const cols = [50, 80, 140, 300, 370, 425, 470, 530];
  const row = (cells: string[], f = font) => { cells.forEach((c, i) => page.drawText(c, { x: cols[i], y, size: 9, font: f })); y -= 15; };
  row(["Pos", "Artikel", "Bezeichnung", "Tarif-Nr.", "Ursprung", "Menge", "Preis EUR", "Betrag EUR"], bold);
  row(["1", "WZ-10", "Schraubendreher-Set", "8205.4000", "DE", "50", "12.40", "620.00"]);
  row(["2", "WZ-20", "Zange, verchromt", "8203.2000", "DE", "30", "18.90", "567.00"]);
  row(["3", "WZ-30", "Bohrer-Set HSS", "8207.5000", "CN", "40", "9.75", "390.00"]);
  y -= 10;
  line("Gesamtbetrag EUR 1'577.00", bold, 11);
  line("Nettogewicht 48.500 kg / Bruttogewicht 55.200 kg");
  return Buffer.from(await pdf.save());
}

async function main() {
  const dir = join(process.cwd(), "public", "beispiele");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "beispiel-lieferant-textil.csv"), "﻿" + CSV_SAMPLE, "utf8");
  writeFileSync(join(dir, "beispiel-commercial-invoice.xlsx"), await buildXlsx());
  writeFileSync(join(dir, "beispiel-rechnung-werkzeuge.pdf"), await buildPdf());
  console.log("Beispieldateien erzeugt in", dir);
}
if (process.argv[1]?.endsWith("generate-samples.ts")) main();
