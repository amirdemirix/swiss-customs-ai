import { D, parseAmount, type Dec } from "../money/decimal";
import { parseTariffNumber } from "../tariff/tariff-number";

export const LINE_FIELDS = ["articleNumber", "description", "tariffNumber", "statisticalKey", "originCountry", "preferenceStatus", "customsProcedure",
  "quantity", "unit", "unitPrice", "lineAmount", "netWeightKg", "grossWeightKg"] as const;
export type LineField = (typeof LINE_FIELDS)[number];
export type LineValues = Record<LineField, string | null>;

const NUMERIC: LineField[] = ["quantity", "unitPrice", "lineAmount", "netWeightKg", "grossWeightKg"];

/**
 * Normalisiert manuelle Eingaben. Ungültige Werte werden NICHT still verworfen, sondern als
 * Fehler gemeldet – der Benutzer muss sie korrigieren.
 */
export function normalizeLineInput(raw: Partial<Record<LineField, string | null>>): { values: LineValues; errors: Partial<Record<LineField, string>> } {
  const errors: Partial<Record<LineField, string>> = {};
  const v = {} as LineValues;
  for (const f of LINE_FIELDS) {
    const s = (raw[f] ?? "").toString().trim();
    v[f] = s === "" ? null : s;
  }
  for (const f of NUMERIC) {
    if (v[f] == null) continue;
    const p = parseAmount(v[f]!.replace(",", v[f]!.includes(".") ? "," : "."));
    if (!p) errors[f] = "Zahl nicht lesbar";
    else if (p.isNegative()) errors[f] = "Darf nicht negativ sein";
    else v[f] = p.toString();
  }
  if (v.tariffNumber) {
    const t = parseTariffNumber(v.tariffNumber);
    if (t.ok) v.tariffNumber = t.normalized;
    else errors.tariffNumber = t.reason === "HS6_ONLY" ? "8-stellige CH-Tarifnummer erforderlich" : "Format NNNN.NNNN";
  }
  if (v.originCountry) {
    v.originCountry = v.originCountry.toUpperCase();
    if (!/^[A-Z]{2}$/.test(v.originCountry)) errors.originCountry = "ISO-Code mit 2 Buchstaben";
  }
  if (v.statisticalKey && !/^\d{3}$/.test(v.statisticalKey)) errors.statisticalKey = "3 Ziffern";
  if (v.unit) v.unit = v.unit.toUpperCase().slice(0, 10);
  if (v.preferenceStatus && !["NONE", "CLAIMED", "UNKNOWN"].includes(v.preferenceStatus)) errors.preferenceStatus = "Ungültig";
  if (v.netWeightKg && v.grossWeightKg && new D(v.grossWeightKg).lt(v.netWeightKg)) errors.grossWeightKg = "Brutto kleiner als Netto";
  return { values: v, errors };
}

export const LINE_FIELD_LABEL: Record<LineField, string> = {
  articleNumber: "Artikelnummer", description: "Beschreibung", tariffNumber: "Tarifnummer", statisticalKey: "Statistischer Schlüssel", originCountry: "Ursprungsland",
  preferenceStatus: "Präferenz", customsProcedure: "Verfahren", quantity: "Menge", unit: "Mengeneinheit", unitPrice: "Einzelpreis", lineAmount: "Wert",
  netWeightKg: "Nettogewicht", grossWeightKg: "Bruttogewicht",
};

/** Merkmale, die für eine Zusammenführung identisch sein müssen (sonst unzulässig). */
export const MERGE_KEYS: LineField[] = ["tariffNumber", "statisticalKey", "originCountry", "preferenceStatus", "customsProcedure", "unit", "articleNumber"];

export function mergeLines(lines: LineValues[]): { ok: true; merged: LineValues; notes: string[] } | { ok: false; reason: string } {
  if (lines.length < 2) return { ok: false, reason: "Mindestens zwei Positionen auswählen." };
  for (const k of MERGE_KEYS) {
    const vals = new Set(lines.map((l) => (l[k] ?? "").toUpperCase()));
    if (vals.size > 1) return { ok: false, reason: `Zusammenführen nicht zulässig: unterschiedliche Werte bei „${LINE_FIELD_LABEL[k]}“ (${[...vals].map((x) => x || "leer").join(", ")}).` };
  }
  if (!lines[0].tariffNumber || !lines[0].originCountry) return { ok: false, reason: "Zusammenführen nur mit Tarifnummer und Ursprungsland möglich." };
  const notes: string[] = [];
  const total = (f: LineField): string | null => {
    if (lines.some((l) => l[f] == null)) { if (lines.some((l) => l[f] != null)) notes.push(`${LINE_FIELD_LABEL[f]}: nicht bei allen Positionen vorhanden – leer gelassen.`); return null; }
    return lines.reduce<Dec>((a, l) => a.plus(l[f]!), new D(0)).toString();
  };
  const merged: LineValues = { ...lines[0], quantity: total("quantity"), lineAmount: total("lineAmount"), netWeightKg: total("netWeightKg"), grossWeightKg: total("grossWeightKg") };
  // Einzelpreis nur übernehmen, wenn bei allen gleich (keine Durchschnittsbildung)
  const prices = new Set(lines.map((l) => l.unitPrice ?? ""));
  merged.unitPrice = prices.size === 1 ? lines[0].unitPrice : null;
  if (prices.size > 1) notes.push("Unterschiedliche Einzelpreise – Einzelpreis leer gelassen.");
  const descs = new Set(lines.map((l) => l.description ?? ""));
  if (descs.size > 1) merged.description = [...descs].filter(Boolean).join(" / ").slice(0, 500);
  return { ok: true, merged, notes };
}

/** Kontrollsumme beim Aufteilen: Teilwerte müssen die Originalwerte ergeben. */
export function splitCheck(original: LineValues, parts: LineValues[]): string[] {
  const out: string[] = [];
  for (const f of ["quantity", "lineAmount", "netWeightKg", "grossWeightKg"] as LineField[]) {
    if (original[f] == null) continue;
    if (parts.some((p) => p[f] == null)) { out.push(`${LINE_FIELD_LABEL[f]}: nicht in allen Teilpositionen erfasst.`); continue; }
    const s = parts.reduce<Dec>((a, p) => a.plus(p[f]!), new D(0));
    if (!s.eq(original[f]!)) out.push(`${LINE_FIELD_LABEL[f]}: Summe der Teile ${s.toString()} ≠ Original ${original[f]}.`);
  }
  return out;
}
