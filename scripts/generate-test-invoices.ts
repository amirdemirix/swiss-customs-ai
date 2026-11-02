/**
 * Drei SYNTHETISCHE Testrechnungen (Excel zum Import + PDF zur Ansicht).
 * Tarifnummern sind Beispielwerte – keine geprüfte Tarifeinreihung.
 * Aufruf: npx tsx scripts/generate-test-invoices.ts → testdaten/
 */
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Line = [art: string, desc: string, tariff: string, origin: string, qty: number, price: number, nw: number, gw: number];
interface Inv { file: string; no: string; date: string; supplier: string; address: string; currency: string; lines: Line[] }

export const INVOICES: Inv[] = [
  { file: "rechnung-1-alpenblick-textil", no: "RE-2026-3001", date: "2026-10-20", supplier: "Alpenblick Textil GmbH", address: "Musterweg 12, 80331 München, DE", currency: "EUR", lines: [
    ["TS-100", "T-Shirt Baumwolle, gestrickt", "6109.1000", "CN", 300, 2.8, 54.0, 58.5],
    ["PU-200", "Pullover Baumwolle", "6110.2000", "TR", 120, 14.5, 60.0, 64.8],
    ["HO-300", "Herrenhose Baumwolle", "6203.4200", "BD", 150, 11.2, 82.5, 88.0],
  ] },
  { file: "rechnung-2-beispiel-elektro", no: "INV-77102", date: "2026-10-22", supplier: "Beispiel Elektro AG", address: "Industriestrasse 5, 70173 Stuttgart, DE", currency: "EUR", lines: [
    ["NT-24", "Netzteil 24 V", "8504.4000", "DE", 80, 28.0, 24.0, 29.6],
    ["KB-05", "Kabelkonfektion 5 m", "8544.4200", "CZ", 500, 1.9, 40.0, 44.5],
    ["TS-100", "T-Shirt Baumwolle, gestrickt (Werbeartikel)", "6109.1000", "CN", 100, 3.1, 18.0, 19.5],
  ] },
  { file: "rechnung-3-pacific-trading", no: "PT-2026-0458", date: "2026-10-24", supplier: "Pacific Trading Co. Ltd", address: "88 Harbour Road, Hong Kong", currency: "USD", lines: [
    ["NB-14", "Notebook 14 Zoll", "8471.3000", "CN", 10, 420.0, 18.5, 26.0],
    ["NT-24C", "Netzteil 24 V", "8504.4000", "CN", 50, 19.0, 15.0, 18.0],
    ["PU-200", "Pullover Baumwolle", "6110.2000", "TR", 60, 13.8, 30.0, 32.4],
    ["TA-50", "Umhängetasche Textil", "4202.9200", "VN", 200, 6.5, 45.0, 52.0],
  ] },
];

const amount = (q: number, p: number) => Math.round(q * p * 100) / 100;
const fmt = (n: number, d = 2) => n.toLocaleString("de-CH", { minimumFractionDigits: d, maximumFractionDigits: d });

async function xlsx(inv: Inv) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rechnung");
  ws.addRow([`HANDELSRECHNUNG – ${inv.supplier} (synthetische Testdaten)`]).font = { bold: true, size: 13 };
  ws.addRow([inv.address]);
  ws.addRow([]);
  const hdr = ws.addRow(["Rechnung Nr", "Datum", "Lieferant", "Währung", "Pos", "Artikel-Nr", "Bezeichnung", "Zolltarifnummer", "Ursprungsland", "Menge", "Einheit", "Einzelpreis", "Betrag", "Nettogewicht", "Bruttogewicht"]);
  hdr.font = { bold: true };
  inv.lines.forEach((l, i) => {
    const r = ws.rowCount + 1;
    ws.addRow([inv.no, new Date(`${inv.date}T00:00:00Z`), inv.supplier, inv.currency, i + 1, l[0], l[1], l[2], l[3], l[4], "PCE", l[5], { formula: `J${r}*L${r}`, result: amount(l[4], l[5]) }, l[6], l[7]]);
  });
  const first = 5, last = ws.rowCount;
  const total = inv.lines.reduce((s, l) => s + amount(l[4], l[5]), 0);
  ws.addRow(["", "", "", "", "", "", "Total", "", "", "", "", "", { formula: `SUM(M${first}:M${last})`, result: Math.round(total * 100) / 100 }]).font = { bold: true };
  ws.getColumn(2).numFmt = "dd.mm.yyyy";
  [12, 13].forEach((c) => (ws.getColumn(c).numFmt = "#,##0.00"));
  [14, 15].forEach((c) => (ws.getColumn(c).numFmt = "#,##0.000"));
  ws.columns.forEach((c, i) => (c.width = [14, 11, 24, 8, 5, 10, 40, 15, 13, 8, 8, 11, 12, 12, 12][i]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function pdf(inv: Inv) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 quer
  const f = await doc.embedFont(StandardFonts.Helvetica), b = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = (s: string, x: number, y: number, size = 9, font = f) => page.drawText(s, { x, y, size, font });
  t(inv.supplier, 40, 550, 15, b); t(inv.address, 40, 533); t("Synthetische Testrechnung – keine echten Daten", 40, 519, 8);
  t(`Rechnung Nr.: ${inv.no}`, 560, 550, 11, b);
  t(`Rechnungsdatum: ${inv.date.split("-").reverse().join(".")}`, 560, 535, 10);
  t(`Währung: ${inv.currency}`, 560, 521, 10);
  t("Empfänger: Beispiel Import AG, Bahnhofstrasse 1, 8001 Zürich, CH", 40, 495, 10);
  const cols = [40, 65, 120, 320, 390, 440, 490, 535, 605, 680, 745];
  const head = ["Pos", "Artikel", "Bezeichnung", "Tarif-Nr.", "Ursprung", "Menge", "Einheit", `Preis ${inv.currency}`, `Betrag ${inv.currency}`, "Netto kg", "Brutto kg"];
  let y = 465;
  page.drawRectangle({ x: 36, y: y - 4, width: 770, height: 16, color: rgb(0.9, 0.92, 0.96) });
  head.forEach((h, i) => t(h, cols[i], y, 8, b));
  let total = 0, nw = 0, gw = 0;
  inv.lines.forEach((l, i) => {
    y -= 18;
    const a = amount(l[4], l[5]); total += a; nw += l[6]; gw += l[7];
    [String(i + 1), l[0], l[1], l[2], l[3], String(l[4]), "PCE", fmt(l[5]), fmt(a), fmt(l[6], 3), fmt(l[7], 3)].forEach((v, k) => t(v, cols[k], y, 8));
  });
  y -= 28;
  t(`Gesamtbetrag ${inv.currency} ${fmt(total)}`, 535, y, 11, b);
  t(`Nettogewicht ${fmt(nw, 3)} kg / Bruttogewicht ${fmt(gw, 3)} kg`, 40, y, 9);
  t("Lieferbedingung: DAP Zürich. Ursprungsangaben gemäss Lieferant.", 40, y - 16, 9);
  return Buffer.from(await doc.save());
}

async function main() {
  const dir = join(process.cwd(), "testdaten");
  mkdirSync(dir, { recursive: true });
  for (const inv of INVOICES) {
    writeFileSync(join(dir, `${inv.file}.xlsx`), await xlsx(inv));
    writeFileSync(join(dir, `${inv.file}.pdf`), await pdf(inv));
  }
  console.log("Testrechnungen erzeugt in", dir);
}
if (process.argv[1]?.endsWith("generate-test-invoices.ts")) main();
