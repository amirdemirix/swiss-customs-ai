import ExcelJS from "exceljs";
import { decodeText, parseCsv } from "@/domain";

export const MAX_ROWS = 20_000;

export interface SheetData { name: string; rows: string[][] }

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(15)));
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue); // Formel → Ergebnis
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
  }
  return String(v);
}

/** Liest alle Tabellenblätter einer .xlsx-Datei als Text (Formeln → berechnetes Ergebnis). */
export async function readXlsx(data: Buffer): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const sheets: SheetData[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    // Index = Excel-Zeilennummer − 1: leere Zeilen bleiben erhalten, damit Quellverweise stimmen
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (row.number > MAX_ROWS) return;
      const vals: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(row.getCell(c).value).trim());
      while (rows.length < row.number - 1) rows.push([]);
      rows.push(vals);
    });
    if (rows.length) sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

export function readCsv(data: Buffer): SheetData[] {
  return [{ name: "CSV", rows: parseCsv(decodeText(data)).slice(0, MAX_ROWS) }];
}
