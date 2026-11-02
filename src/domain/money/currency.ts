import { dec, type Dec, type DecInput } from "./decimal";

export interface ExchangeRateRecord {
  id?: string;
  fromCurrency: string;
  toCurrency: string;
  /** Einheiten Zielwährung je 1 Einheit Ausgangswährung */
  rate: DecInput;
  validOn: string; // ISO-Datum
  source: string;
}

export class MissingExchangeRateError extends Error {
  constructor(public from: string, public to: string) {
    super(`Kein Umrechnungskurs ${from} → ${to} hinterlegt`);
  }
}

export const isCurrencyCode = (c: unknown): c is string => typeof c === "string" && /^[A-Z]{3}$/.test(c);

/** Rechnet um, ohne Zwischenrundung. Kein Kurs → Fehler (kein stilles Fallback). */
export function convert(
  amount: DecInput,
  from: string,
  to: string,
  rates: ExchangeRateRecord[],
): { value: Dec; rate: ExchangeRateRecord | null } {
  if (from === to) return { value: dec(amount), rate: null };
  const r = rates.find((x) => x.fromCurrency === from && x.toCurrency === to);
  if (!r) throw new MissingExchangeRateError(from, to);
  if (dec(r.rate).lte(0)) throw new Error(`Ungültiger Kurs ${from} → ${to}`);
  return { value: dec(amount).times(r.rate), rate: r };
}
