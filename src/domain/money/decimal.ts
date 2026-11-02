import Decimal from "decimal.js";

/** Eigene Decimal-Instanz: 34 signifikante Stellen, kaufmännisches Runden (HALF_UP). */
export const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type DecInput = Dec | string | number;

export const dec = (v: DecInput): Dec => {
  if (typeof v === "number" && !Number.isFinite(v)) throw new Error(`Ungültige Zahl: ${v}`);
  return new D(v);
};

export const sum = (values: DecInput[]): Dec => values.reduce<Dec>((acc, v) => acc.plus(v), new D(0));

/** Rundet auf n Nachkommastellen (Standard 2 für Geld). */
export const round = (v: DecInput, places = 2): Dec => dec(v).toDecimalPlaces(places, D.ROUND_HALF_UP);

/** Schweizer Darstellung: 1'234.50 */
export function formatCH(v: DecInput, places = 2): string {
  const [int, frac] = round(v, places).toFixed(places).split(".");
  const sign = int.startsWith("-") ? "-" : "";
  const digits = int.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return frac ? `${sign}${digits}.${frac}` : `${sign}${digits}`;
}

/**
 * Parst Beträge aus Rechnungen tolerant (1'234.50 / 1.234,50 / 1,234.50 / 1234,5).
 * Gibt null zurück, wenn die Schreibweise mehrdeutig oder ungültig ist – nie raten.
 */
export function parseAmount(raw: string | null | undefined, decimalHint?: "," | "." | null): Dec | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/[\s'’]/g, "").replace(/^(CHF|EUR|USD|GBP)/i, "").replace(/(CHF|EUR|USD|GBP)$/i, "");
  if (!s) return null;
  const neg = /^-|-$|^\(.*\)$/.test(s);
  s = s.replace(/[()-]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    // "1,234" ist mehrdeutig (Tausender oder Dezimal) → null, ausser die Datei-Konvention ist bekannt
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      if (decimalHint === ",") s = s.replace(",", ".");
      else if (decimalHint === ".") s = parts.join("");
      else return null;
    } else if (parts.length > 2) s = parts.join("");
    else s = s.replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const d0 = dec(s);
    return neg ? d0.negated() : d0;
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length > 2) s = parts.join(""); // 1.234.567
    else if (decimalHint === "," && parts[1].length === 3) s = parts.join(""); // 1.234 bei Komma-Konvention = Tausender
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const d = dec(s);
  return neg ? d.negated() : d;
}

/**
 * Ermittelt die Dezimal-Konvention einer Datei aus eindeutigen Werten (z. B. "2,50" → Komma,
 * "1,234.50" → Punkt). Widersprüchliche oder fehlende Hinweise → null (strikt bleiben).
 */
export function inferDecimalSeparator(values: (string | null | undefined)[]): "," | "." | null {
  let comma = 0, dot = 0;
  for (const raw of values) {
    const v = (raw ?? "").replace(/[\s'’]/g, "");
    if (!v) continue;
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(v) || /^-?\d+,(\d{1,2}|\d{4,})$/.test(v)) comma++;
    else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(v) || /^-?\d+\.(\d{1,2}|\d{4,})$/.test(v)) dot++;
  }
  if (comma && !dot) return ",";
  if (dot && !comma) return ".";
  return null;
}
