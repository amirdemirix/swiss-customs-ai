/**
 * Rekonstruiert die Positionstabelle aus dem Textlayer eines digitalen PDFs – ohne KI.
 * Prinzip: Textstücke mit Koordinaten → Zeilen (gleiche Höhe) → Kopfzeile über die
 * Spalten-Synonyme des Excel-Imports finden → Spaltengrenzen aus der Kopfzeile →
 * jede folgende Zeile den Spalten zuordnen. Ergebnis sind Tabellenzeilen, die dieselbe
 * Import-Logik durchlaufen wie Excel/CSV (keine Werte werden ergänzt).
 */
import { autoMapColumns, type ImportField } from "../import/columns";
import { parseTariffNumber } from "../tariff/tariff-number";

export interface PdfTextItem { str: string; x: number; y: number; width: number; height?: number }
interface Cell { text: string; x0: number; x1: number }

export interface PdfTable {
  rows: string[][];       // rows[0] = Kopfzeile
  rowPages: number[];     // Seite je Zeile (1-basiert), gleiche Länge wie rows
  columnsMapped: ImportField[];
}

const NUMERIC: ImportField[] = ["quantity", "unitPrice", "lineAmount", "netWeightKg", "grossWeightKg"];
const TOTAL = /^(total|summe|gesamt|gesamtbetrag|subtotal|zwischensumme|grand total|totale|rechnungsbetrag)\b/i;
const looksNumber = (s: string) => /^-?[\d'’.,\s]*\d[\d'’.,]*$/.test(s.trim());

function lines(items: PdfTextItem[]): Cell[][] {
  const its = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const out: PdfTextItem[][] = [];
  for (const it of its) {
    const tol = Math.max(2, (it.height ?? 8) * 0.45);
    const line = out.find((l) => Math.abs(l[0].y - it.y) <= tol);
    if (line) line.push(it); else out.push([it]);
  }
  return out.map((l) => {
    const sorted = l.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const it of sorted) {
      const last = cells[cells.length - 1];
      const gap = last ? it.x - last.x1 : Infinity;
      // Textstücke mit sehr kleinem Abstand gehören zur selben Zelle
      if (last && gap < Math.max(2.5, (it.height ?? 8) * 0.35)) { last.text += (gap > 0.8 ? " " : "") + it.str; last.x1 = it.x + it.width; }
      else cells.push({ text: it.str, x0: it.x, x1: it.x + it.width });
    }
    return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() }));
  });
}

function scoreHeader(cells: Cell[]) {
  const m = autoMapColumns(cells.map((c) => c.text));
  const keys = Object.keys(m) as ImportField[];
  const hasValue = keys.includes("lineAmount") || (keys.includes("unitPrice") && keys.includes("quantity"));
  return { m, score: hasValue ? keys.length : 0 };
}

export function reconstructPdfTable(pages: PdfTextItem[][]): PdfTable | null {
  const pageLines = pages.map(lines);
  // Kopfzeile: Zeile mit den meisten erkannten Spalten (mind. 3, inkl. Wert)
  let best: { page: number; idx: number; score: number; cells: Cell[] } | null = null;
  pageLines.forEach((ls, p) => ls.forEach((cells, idx) => {
    const { score } = scoreHeader(cells);
    if (score >= 3 && (!best || score > best.score)) best = { page: p, idx, score, cells };
  }));
  if (!best) return null;
  const header = (best as { page: number; idx: number; score: number; cells: Cell[] });
  const cols = header.cells;
  const map = autoMapColumns(cols.map((c) => c.text));
  const colOf = (f: ImportField) => map[f];
  const numericCols = new Set(NUMERIC.map(colOf).filter((x): x is number => x !== undefined));
  const descCol = colOf("description");

  // Spaltenbereiche: von Kopf-Start bis Start der nächsten Spalte
  const bounds = cols.map((c, i) => [i === 0 ? -Infinity : c.x0 - 1, i === cols.length - 1 ? Infinity : cols[i + 1].x0 - 1] as const);
  const assign = (c: Cell) => {
    let bestI = -1, bestOv = 0;
    bounds.forEach(([a, b], i) => { const ov = Math.min(b, c.x1) - Math.max(a, c.x0); if (ov > bestOv) { bestOv = ov; bestI = i; } });
    if (bestI >= 0) return bestI;
    const mid = (c.x0 + c.x1) / 2;
    return cols.reduce((bi, h, i) => (Math.abs((h.x0 + h.x1) / 2 - mid) < Math.abs((cols[bi].x0 + cols[bi].x1) / 2 - mid) ? i : bi), 0);
  };

  const rows: string[][] = [cols.map((c) => c.text)];
  const rowPages: number[] = [header.page + 1];
  let done = false;
  for (let p = header.page; p < pageLines.length && !done; p++) {
    const ls = pageLines[p];
    let start = p === header.page ? header.idx + 1 : 0;
    if (p !== header.page) { // wiederholte Kopfzeile auf Folgeseiten überspringen
      const rep = ls.findIndex((cells) => scoreHeader(cells).score >= 3);
      if (rep >= 0) start = rep + 1;
    }
    for (let i = start; i < ls.length; i++) {
      const row = cols.map(() => "");
      for (const c of ls[i]) { const k = assign(c); row[k] = row[k] ? `${row[k]} ${c.text}` : c.text; }
      const text = row.find((v) => v.trim()) ?? "";
      const numericFilled = [...numericCols].filter((k) => row[k] && looksNumber(row[k])).length;
      const tariffLike = map.tariffNumber !== undefined && parseTariffNumber(row[map.tariffNumber]).ok;
      const totalCell = row.find((v) => TOTAL.test(v.trim()));
      if (totalCell !== undefined || TOTAL.test(text)) {
        // Saubere Summenzeile: „Total“ + Betrag (aus der Betragsspalte oder dem Total-Text selbst)
        const amtCol = map.lineAmount;
        const src = amtCol !== undefined && row[amtCol] && /\d/.test(row[amtCol]) ? row[amtCol] : (totalCell ?? text);
        const amount = src.match(/-?\d[\d'’.,]*\d|\d/g)?.pop() ?? "";
        const clean = cols.map(() => "");
        clean[descCol ?? 0] = "Total";
        if (amtCol !== undefined) clean[amtCol] = amount;
        rows.push(clean); rowPages.push(p + 1); done = true; break;
      }
      if (numericFilled >= 2 || (tariffLike && numericFilled >= 1)) { rows.push(row); rowPages.push(p + 1); continue; }
      // Folgezeile einer Beschreibung (nur Text in der Beschreibungsspalte)
      const filled = row.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
      if (descCol !== undefined && filled.length === 1 && filled[0] === descCol && rows.length > 1) {
        const prev = rows[rows.length - 1];
        prev[descCol] = `${prev[descCol]} ${row[descCol]}`.trim();
      }
      // sonstige Zeilen (Fusstext, Bankverbindung …) werden ignoriert
    }
  }
  if (rows.length < 2) return null;
  return { rows, rowPages, columnsMapped: Object.keys(map) as ImportField[] };
}
