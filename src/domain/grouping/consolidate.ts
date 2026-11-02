import { D, dec, round, type Dec } from "../money/decimal";
import { convert, MissingExchangeRateError, type ExchangeRateRecord } from "../money/currency";
import { parseTariffNumber } from "../tariff/tariff-number";
import type { LineInput } from "../types";
import type { GroupableField, GroupingProfileConfig } from "./profile";

export interface GroupMember {
  lineId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  lineNo: number;
  originalAmount: string | null;
  originalCurrency: string | null;
  /** In Zielwährung, ungerundet */
  convertedValue: string | null;
  exchangeRate: ExchangeRateRecord | null;
}

export type GroupProblem =
  | { code: "MISSING_KEY_FIELD"; field: string }
  | { code: "MISSING_VALUE"; lineIds: string[] }
  | { code: "MISSING_EXCHANGE_RATE"; from: string; to: string; lineIds: string[] }
  | { code: "MISSING_CURRENCY"; lineIds: string[] }
  | { code: "QUANTITY_UNIT_CONFLICT"; units: string[] }
  | { code: "QUANTITY_INCOMPLETE"; lineIds: string[] }
  | { code: "NET_WEIGHT_INCOMPLETE"; lineIds: string[] }
  | { code: "GROSS_WEIGHT_INCOMPLETE"; lineIds: string[] };

export interface DeclarationGroup {
  position: number;
  groupKey: string;
  /** false = Position wurde wegen fehlender Pflichtmerkmale nicht mit anderen zusammengefasst */
  mergeable: boolean;
  keys: Partial<Record<GroupableField, string | null>> & { extra: Record<string, string | null> };
  description: string | null;
  members: GroupMember[];
  currency: string;
  /** Summe ungerundet und auf 2 Stellen gerundet. null, wenn nicht vollständig berechenbar */
  totalValueExact: string | null;
  totalValue: string | null;
  totalQuantity: string | null;
  quantityUnit: string | null;
  /** Gewichte nur, wenn ALLE Positionen ein Gewicht haben – nie geschätzt */
  netWeightKg: string | null;
  grossWeightKg: string | null;
  knownNetWeightKg: string;
  knownGrossWeightKg: string;
  problems: GroupProblem[];
}

export interface ConsolidationResult {
  targetCurrency: string;
  groups: DeclarationGroup[];
  /** Kontrollsummen über alle Positionen (Konsistenz mit Gruppensummen) */
  totals: { lineCount: number; valueExact: string | null; value: string | null };
}

const norm = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return s === "" ? null : s;
};

function keyValue(line: LineInput, field: GroupableField): string | null {
  if (field === "tariffNumber") {
    const p = parseTariffNumber(line.tariffNumber);
    return p.ok ? p.normalized : norm(line.tariffNumber);
  }
  if (field === "preferenceStatus") return norm(line.preferenceStatus ?? "UNKNOWN");
  return norm(line[field]);
}

const isPresent = (v: unknown) => v !== null && v !== undefined && v !== "";

export function consolidate(
  lines: LineInput[],
  profile: GroupingProfileConfig,
  targetCurrency: string,
  rates: ExchangeRateRecord[] = [],
): ConsolidationResult {
  const buckets = new Map<string, { lines: LineInput[]; mergeable: boolean; missing: string[] }>();

  for (const line of lines) {
    const parts: string[] = [];
    for (const f of profile.keyFields) parts.push(`${f}=${keyValue(line, f) ?? "∅"}`);
    for (const k of profile.extraKeys) parts.push(`extra.${k}=${norm(line.extraAttributes?.[k]) ?? "∅"}`);

    const missing = profile.requiredFields.filter((rf) => {
      if (rf.startsWith("extra.")) return norm(line.extraAttributes?.[rf.slice(6)]) == null;
      // Ungültiges Tarifformat (z. B. HS-6) gilt als fehlend → keine Zusammenfassung
      if (rf === "tariffNumber") return !parseTariffNumber(line.tariffNumber).ok;
      return keyValue(line, rf as GroupableField) == null || (rf === "preferenceStatus" && keyValue(line, rf) === "UNKNOWN");
    });

    // Unvollständige Positionen bilden IMMER eine eigene Gruppe (keine Zusammenfassung mit "leer = gleich")
    const groupKey = missing.length ? `${parts.join("|")}|line=${line.id}` : parts.join("|");
    const b = buckets.get(groupKey) ?? { lines: [], mergeable: missing.length === 0, missing };
    b.lines.push(line);
    buckets.set(groupKey, b);
  }

  const groups: DeclarationGroup[] = [];
  for (const [groupKey, b] of buckets) groups.push(buildGroup(groupKey, b, profile, targetCurrency, rates));

  groups.sort((a, b) => {
    const ka = `${a.keys.tariffNumber ?? "~"}|${a.keys.originCountry ?? "~"}|${a.groupKey}`;
    const kb = `${b.keys.tariffNumber ?? "~"}|${b.keys.originCountry ?? "~"}|${b.groupKey}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  groups.forEach((g, i) => (g.position = i + 1));

  const complete = groups.every((g) => g.totalValueExact !== null);
  const exact = complete ? groups.reduce<Dec>((acc, g) => acc.plus(g.totalValueExact!), new D(0)) : null;
  return {
    targetCurrency,
    groups,
    totals: {
      lineCount: lines.length,
      valueExact: exact?.toString() ?? null,
      value: exact ? round(exact).toFixed(2) : null,
    },
  };
}

function buildGroup(
  groupKey: string,
  b: { lines: LineInput[]; mergeable: boolean; missing: string[] },
  profile: GroupingProfileConfig,
  target: string,
  rates: ExchangeRateRecord[],
): DeclarationGroup {
  const first = b.lines[0];
  const problems: GroupProblem[] = b.missing.map((field) => ({ code: "MISSING_KEY_FIELD", field }));
  const members: GroupMember[] = [];

  let value: Dec | null = new D(0);
  const missingValue: string[] = [];
  const missingCurrency: string[] = [];
  const missingRates = new Map<string, string[]>();

  for (const l of b.lines) {
    const m: GroupMember = {
      lineId: l.id,
      invoiceId: l.invoiceId,
      invoiceNumber: l.invoiceNumber ?? null,
      lineNo: l.lineNo,
      originalAmount: isPresent(l.lineAmount) ? dec(l.lineAmount!).toString() : null,
      originalCurrency: l.currency ?? null,
      convertedValue: null,
      exchangeRate: null,
    };
    if (!isPresent(l.lineAmount)) missingValue.push(l.id);
    else if (!l.currency) missingCurrency.push(l.id);
    else {
      try {
        const c = convert(l.lineAmount!, l.currency, target, rates);
        m.convertedValue = c.value.toString();
        m.exchangeRate = c.rate;
        if (value) value = value.plus(c.value);
      } catch (e) {
        if (!(e instanceof MissingExchangeRateError)) throw e;
        const k = `${e.from}>${e.to}`;
        missingRates.set(k, [...(missingRates.get(k) ?? []), l.id]);
      }
    }
    members.push(m);
  }
  if (missingValue.length) problems.push({ code: "MISSING_VALUE", lineIds: missingValue });
  if (missingCurrency.length) problems.push({ code: "MISSING_CURRENCY", lineIds: missingCurrency });
  for (const [k, ids] of missingRates) {
    const [from, to] = k.split(">");
    problems.push({ code: "MISSING_EXCHANGE_RATE", from, to, lineIds: ids });
  }
  if (missingValue.length || missingCurrency.length || missingRates.size) value = null;

  // Mengen: nur bei identischer Einheit summieren
  const units = [...new Set(b.lines.map((l) => norm(l.unit)).filter((u): u is string => u != null))];
  const qtyMissing = b.lines.filter((l) => !isPresent(l.quantity)).map((l) => l.id);
  let totalQuantity: string | null = null;
  let quantityUnit: string | null = null;
  if (units.length > 1) problems.push({ code: "QUANTITY_UNIT_CONFLICT", units });
  else if (qtyMissing.length) problems.push({ code: "QUANTITY_INCOMPLETE", lineIds: qtyMissing });
  else {
    totalQuantity = b.lines.reduce<Dec>((a, l) => a.plus(l.quantity!), new D(0)).toString();
    quantityUnit = units[0] ?? null;
  }

  const weight = (key: "netWeightKg" | "grossWeightKg") => {
    const missing = b.lines.filter((l) => !isPresent(l[key])).map((l) => l.id);
    const known = b.lines.filter((l) => isPresent(l[key])).reduce<Dec>((a, l) => a.plus(l[key]!), new D(0));
    return { missing, known: known.toFixed(3), total: missing.length ? null : known.toFixed(3) };
  };
  const nw = weight("netWeightKg");
  const gw = weight("grossWeightKg");
  if (nw.missing.length) problems.push({ code: "NET_WEIGHT_INCOMPLETE", lineIds: nw.missing });
  if (gw.missing.length) problems.push({ code: "GROSS_WEIGHT_INCOMPLETE", lineIds: gw.missing });

  const keys: DeclarationGroup["keys"] = { extra: {} };
  for (const f of profile.keyFields) keys[f] = keyValue(first, f);
  for (const k of profile.extraKeys) keys.extra[k] = norm(first.extraAttributes?.[k]);

  return {
    position: 0,
    groupKey,
    mergeable: b.mergeable,
    keys,
    description: first.description ?? null,
    members,
    currency: target,
    totalValueExact: value?.toString() ?? null,
    totalValue: value ? round(value).toFixed(2) : null,
    totalQuantity,
    quantityUnit,
    netWeightKg: nw.total,
    grossWeightKg: gw.total,
    knownNetWeightKg: nw.known,
    knownGrossWeightKg: gw.known,
    problems,
  };
}
