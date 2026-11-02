/**
 * Dateityp-Erkennung anhand des Inhalts (Magic Bytes) – Dateiendung und MIME-Type des
 * Browsers werden nicht vertraut.
 */
export type DetectedType = "PDF" | "PNG" | "JPEG" | "XLSX" | "CSV";

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 4 * 1024 * 1024); // Vercel-Limit 4.5 MB je Anfrage

export const MIME: Record<DetectedType, string> = {
  PDF: "application/pdf",
  PNG: "image/png",
  JPEG: "image/jpeg",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv; charset=utf-8",
};

const starts = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

export function detectFileType(bytes: Uint8Array, fileName: string): { ok: true; type: DetectedType } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: "Die Datei ist leer." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: `Die Datei ist grösser als ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` };
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ok: true, type: "PDF" }; // %PDF-
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, type: "PNG" };
  if (starts(bytes, [0xff, 0xd8, 0xff])) return { ok: true, type: "JPEG" };
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // ZIP-Container: nur .xlsx akzeptieren (kein .docx/.zip/.xlsm mit Makros)
    if (/\.xlsx$/i.test(fileName)) return { ok: true, type: "XLSX" };
    return { ok: false, reason: "ZIP-Dateien werden nur als Excel-Arbeitsmappe (.xlsx) akzeptiert." };
  }
  if (starts(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return { ok: false, reason: "Altes Excel-Format (.xls) – bitte als .xlsx oder CSV speichern." };
  if (/\.(csv|txt)$/i.test(fileName) && isText(bytes)) return { ok: true, type: "CSV" };
  return { ok: false, reason: "Dateiformat nicht unterstützt (erlaubt: PDF, JPG, PNG, XLSX, CSV)." };
}

/** Text, wenn keine NUL-Bytes vorkommen (UTF-8 oder Windows-1252, siehe decodeText). */
function isText(b: Uint8Array) {
  const n = Math.min(b.length, 8192);
  for (let i = 0; i < n; i++) if (b[i] === 0) return false;
  return true;
}

/** Dekodiert CSV-Text: UTF-8 (mit/ohne BOM), sonst Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return t.replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Dateiname bereinigen (Pfadangaben, Steuerzeichen entfernen). */
export const safeFileName = (n: string) =>
  (n.split(/[\\/]/).pop() ?? "datei").replace(/[\u0000-\u001f"<>|]/g, "").slice(0, 200) || "datei";
