import { parseTariffNumber } from "./tariff-number";
import { normHeader } from "../import/columns";

export interface TariffRow { tariffNumber: string; statisticalKey: string | null; description: string; unit: string | null }

/**
 * Liest einen Tarif-Datenstand aus Tabellenzeilen (z. B. CSV-Export aus Tares).
 * Erwartet Spalten für Tarifnummer und Beschreibung; Schlüssel und Einheit optional.
 * Es werden nur formal gültige 8-stellige Nummern übernommen – nichts wird ergänzt.
 */
export function parseTariffDataset(rows: string[][]): { entries: TariffRow[]; skipped: number; error?: string } {
  const headerIdx = rows.findIndex((r) => r.some((c) => /tarif|hs|nummer|number/i.test(c)) && r.some((c) => /beschreib|bezeichn|description|text|warenbez/i.test(c)));
  if (headerIdx < 0) return { entries: [], skipped: 0, error: "Kopfzeile mit Tarifnummer und Beschreibung nicht gefunden." };
  const h = rows[headerIdx].map(normHeader);
  const col = (re: RegExp) => h.findIndex((x) => re.test(x));
  const cT = col(/tarif|^hs|nummer|number/), cD = col(/beschreib|bezeichn|description|text|warenbez/), cK = col(/schl|key/), cU = col(/einheit|unit|zusatzmenge/);
  const entries: TariffRow[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of rows.slice(headerIdx + 1)) {
    const t = parseTariffNumber(r[cT]);
    const d = (r[cD] ?? "").trim();
    if (!t.ok || !d) { if (r.some((c) => c.trim())) skipped++; continue; }
    const k = cK >= 0 && /^\d{3}$/.test((r[cK] ?? "").trim()) ? r[cK].trim() : null;
    const key = `${t.normalized}|${k ?? ""}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    entries.push({ tariffNumber: t.normalized, statisticalKey: k, description: d.slice(0, 1000), unit: cU >= 0 ? (r[cU] ?? "").trim() || null : null });
  }
  return { entries, skipped };
}

/** Nachschlagestruktur für die Prüfung: Tarifnummer → bekannte Schlüssel. */
export interface TariffLookup { name: string; validFrom: string; known: Map<string, Set<string | null>> }
