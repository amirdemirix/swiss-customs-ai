/**
 * Schweizer Tarifnummer (Tares): 8 Ziffern, Darstellung NNNN.NNNN.
 * Statistischer Schlüssel: 3 Ziffern. (Annahme A1, siehe docs/01-fachanalyse.md)
 *
 * Diese Funktionen prüfen NUR das Format – nicht, ob die Nummer im gültigen Tares existiert.
 * Die Existenzprüfung erfolgt gegen den importierten offiziellen Datenstand.
 */

export type TariffParseResult =
  | { ok: true; normalized: string; digits: string }
  | { ok: false; reason: "EMPTY" | "INVALID_CHARS" | "HS6_ONLY" | "WRONG_LENGTH"; digits: string };

export function parseTariffNumber(raw: string | null | undefined): TariffParseResult {
  const input = (raw ?? "").trim();
  if (!input) return { ok: false, reason: "EMPTY", digits: "" };
  if (!/^[\d.\s]+$/.test(input)) return { ok: false, reason: "INVALID_CHARS", digits: input.replace(/\D/g, "") };
  const digits = input.replace(/\D/g, "");
  if (digits.length === 6) return { ok: false, reason: "HS6_ONLY", digits };
  if (digits.length !== 8) return { ok: false, reason: "WRONG_LENGTH", digits };
  return { ok: true, normalized: `${digits.slice(0, 4)}.${digits.slice(4)}`, digits };
}

export const isValidStatisticalKey = (k: string | null | undefined) => k != null && /^\d{3}$/.test(k);

/** Kapitel 1–24: Landwirtschaft (Hinweis für erhöhte Prüfintensität, z. B. Eigenmasse/Präferenz). */
export function tariffChapter(normalized: string): number {
  return Number.parseInt(normalized.slice(0, 2), 10);
}
