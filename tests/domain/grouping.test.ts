import { describe, expect, it } from "vitest";
import { consolidate, DEFAULT_PROFILE, type LineInput, type GroupingProfileConfig } from "@/domain";

let n = 0;
const line = (p: Partial<LineInput>): LineInput => ({
  id: `L${++n}`, invoiceId: "I1", lineNo: n, currency: "CHF", statisticalKey: "000",
  preferenceStatus: "NONE", customsProcedure: "STD", unit: "PCE", quantity: "1",
  netWeightKg: "1.000", grossWeightKg: "1.200", ...p,
});
const simple: GroupingProfileConfig = { name: "T/U", keyFields: ["tariffNumber", "originCountry"], extraKeys: [], requiredFields: ["tariffNumber", "originCountry"] };

describe("Konsolidierung – Beispiel aus Anforderung", () => {
  const lines = [
    line({ invoiceId: "R1", tariffNumber: "6109.1000", originCountry: "CN", lineAmount: "500" }),
    line({ invoiceId: "R1", tariffNumber: "6109.1000", originCountry: "TR", lineAmount: "700" }),
    line({ invoiceId: "R2", tariffNumber: "6109.1000", originCountry: "CN", lineAmount: "900" }),
    line({ invoiceId: "R2", tariffNumber: "8504.4000", originCountry: "DE", lineAmount: "1200" }),
  ];
  const r = consolidate(lines, DEFAULT_PROFILE, "CHF");

  it("ergibt drei Anmeldepositionen mit korrekten Summen", () => {
    expect(r.groups.map((g) => [g.keys.tariffNumber, g.keys.originCountry, g.totalValue])).toEqual([
      ["6109.1000", "CN", "1400.00"],
      ["6109.1000", "TR", "700.00"],
      ["8504.4000", "DE", "1200.00"],
    ]);
  });
  it("behält alle Originalpositionen (Rückverfolgbarkeit)", () => {
    const ids = r.groups.flatMap((g) => g.members.map((m) => m.lineId)).sort();
    expect(ids).toEqual(lines.map((l) => l.id).sort());
    expect(r.groups[0].members.map((m) => m.invoiceId)).toEqual(["R1", "R2"]);
  });
  it("Gesamtsumme = Summe der Gruppen", () => {
    expect(r.totals.value).toBe("3300.00");
    expect(r.totals.lineCount).toBe(4);
  });
  it("vergibt fortlaufende Positionen", () => {
    expect(r.groups.map((g) => g.position)).toEqual([1, 2, 3]);
  });
});

describe("Trennmerkmale", () => {
  it("trennt nach Ursprungsland", () => {
    const r = consolidate([line({ tariffNumber: "61091000", originCountry: "CN", lineAmount: "1" }), line({ tariffNumber: "6109.1000", originCountry: "BD", lineAmount: "1" })], DEFAULT_PROFILE, "CHF");
    expect(r.groups).toHaveLength(2);
  });
  it("trennt nach Tarifnummer, normalisiert aber Schreibweise", () => {
    const r = consolidate([
      line({ tariffNumber: "6109.1000", originCountry: "CN", lineAmount: "1" }),
      line({ tariffNumber: "6109 10 00", originCountry: "CN", lineAmount: "1" }),
      line({ tariffNumber: "6109.9000", originCountry: "CN", lineAmount: "1" }),
    ], DEFAULT_PROFILE, "CHF");
    expect(r.groups.map((g) => g.members.length)).toEqual([2, 1]);
  });
  it("trennt nach Präferenzstatus, statistischem Schlüssel und Verfahren", () => {
    const base = { tariffNumber: "6109.1000", originCountry: "TR", lineAmount: "1" };
    const r = consolidate([
      line({ ...base, preferenceStatus: "CLAIMED" }),
      line({ ...base, preferenceStatus: "NONE" }),
      line({ ...base, statisticalKey: "911" }),
      line({ ...base, customsProcedure: "ZOLLERLEICHTERUNG" }),
    ], DEFAULT_PROFILE, "CHF");
    expect(r.groups).toHaveLength(4);
  });
  it("trennt nach konfigurierbaren Zusatzmerkmalen", () => {
    const profile = { ...simple, extraKeys: ["permitNumber"] };
    const r = consolidate([
      line({ tariffNumber: "3004.9000", originCountry: "DE", lineAmount: "1", extraAttributes: { permitNumber: "A1" } }),
      line({ tariffNumber: "3004.9000", originCountry: "DE", lineAmount: "1", extraAttributes: { permitNumber: "B2" } }),
    ], profile, "CHF");
    expect(r.groups).toHaveLength(2);
  });
  it("fasst Positionen mit fehlendem Pflichtmerkmal NIE zusammen", () => {
    const r = consolidate([
      line({ tariffNumber: "6109.1000", originCountry: null, lineAmount: "1" }),
      line({ tariffNumber: "6109.1000", originCountry: null, lineAmount: "1" }),
    ], DEFAULT_PROFILE, "CHF");
    expect(r.groups).toHaveLength(2);
    expect(r.groups.every((g) => !g.mergeable)).toBe(true);
    expect(r.groups[0].problems).toContainEqual({ code: "MISSING_KEY_FIELD", field: "originCountry" });
  });
});

describe("Ungültige Tarifnummern", () => {
  it("fasst Positionen mit ungültigem Tarifformat nicht zusammen", () => {
    const r = consolidate([
      line({ tariffNumber: "8471.30", originCountry: "CN", lineAmount: "1" }),
      line({ tariffNumber: "8471.30", originCountry: "CN", lineAmount: "1" }),
    ], DEFAULT_PROFILE, "CHF");
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0].problems).toContainEqual({ code: "MISSING_KEY_FIELD", field: "tariffNumber" });
  });
});

describe("Werte & Währungen", () => {
  const rates = [{ fromCurrency: "EUR", toCurrency: "CHF", rate: "0.93", validOn: "2026-11-02", source: "manuell" }];
  it("rechnet Fremdwährungen um und dokumentiert den Kurs", () => {
    const r = consolidate([
      line({ tariffNumber: "8504.4000", originCountry: "DE", lineAmount: "1000", currency: "EUR" }),
      line({ tariffNumber: "8504.4000", originCountry: "DE", lineAmount: "100", currency: "CHF" }),
    ], DEFAULT_PROFILE, "CHF", rates);
    expect(r.groups[0].totalValue).toBe("1030.00");
    expect(r.groups[0].members[0].exchangeRate?.source).toBe("manuell");
    expect(r.groups[0].members[0].originalAmount).toBe("1000");
  });
  it("ohne Kurs kein Total, sondern Problem", () => {
    const r = consolidate([line({ tariffNumber: "8504.4000", originCountry: "DE", lineAmount: "10", currency: "USD" })], DEFAULT_PROFILE, "CHF", rates);
    expect(r.groups[0].totalValue).toBeNull();
    expect(r.groups[0].problems[0]).toMatchObject({ code: "MISSING_EXCHANGE_RATE", from: "USD" });
    expect(r.totals.value).toBeNull();
  });
  it("rundet erst auf Gruppenebene", () => {
    const r = consolidate(
      Array.from({ length: 3 }, () => line({ tariffNumber: "8504.4000", originCountry: "DE", lineAmount: "0.005", currency: "EUR" })),
      DEFAULT_PROFILE, "CHF", [{ ...rates[0], rate: "1" }]);
    expect(r.groups[0].totalValue).toBe("0.02");
  });
  it("fehlender Warenwert verhindert Total", () => {
    const r = consolidate([line({ tariffNumber: "8504.4000", originCountry: "DE", lineAmount: null })], DEFAULT_PROFILE, "CHF");
    expect(r.groups[0].totalValue).toBeNull();
    expect(r.groups[0].problems[0].code).toBe("MISSING_VALUE");
  });
});

describe("Mengen & Gewichte", () => {
  const b = { tariffNumber: "6109.1000", originCountry: "CN", lineAmount: "1" };
  it("summiert Gewichte exakt", () => {
    const r = consolidate([line({ ...b, netWeightKg: "0.125", grossWeightKg: "0.2" }), line({ ...b, netWeightKg: "0.250", grossWeightKg: "0.3" })], DEFAULT_PROFILE, "CHF");
    expect(r.groups[0].netWeightKg).toBe("0.375");
    expect(r.groups[0].grossWeightKg).toBe("0.500");
  });
  it("erfindet kein Gewicht, wenn eines fehlt", () => {
    const r = consolidate([line({ ...b, grossWeightKg: "2" }), line({ ...b, grossWeightKg: null })], DEFAULT_PROFILE, "CHF");
    expect(r.groups[0].grossWeightKg).toBeNull();
    expect(r.groups[0].knownGrossWeightKg).toBe("2.000");
    expect(r.groups[0].problems.map((p) => p.code)).toContain("GROSS_WEIGHT_INCOMPLETE");
  });
  it("summiert Mengen nur bei kompatibler Einheit", () => {
    const ok = consolidate([line({ ...b, quantity: "10", unit: "pce" }), line({ ...b, quantity: "5", unit: "PCE" })], DEFAULT_PROFILE, "CHF");
    expect(ok.groups[0].totalQuantity).toBe("15");
    const bad = consolidate([line({ ...b, quantity: "10", unit: "PCE" }), line({ ...b, quantity: "5", unit: "KG" })], DEFAULT_PROFILE, "CHF");
    expect(bad.groups[0].totalQuantity).toBeNull();
    expect(bad.groups[0].problems[0]).toMatchObject({ code: "QUANTITY_UNIT_CONFLICT" });
  });
});

describe("Performance", () => {
  it("konsolidiert 10'000 Positionen schnell und verlustfrei", () => {
    const tariffs = Array.from({ length: 45 }, (_, i) => `${6100 + i}.1000`);
    const origins = ["CN", "TR", "DE", "IT", "BD", "VN", "IN", "PT", "FR", "US", "JP", "KR"];
    const lines = Array.from({ length: 10_000 }, (_, i) =>
      line({ tariffNumber: tariffs[i % 45], originCountry: origins[i % 12], lineAmount: "12.35", invoiceId: `R${i % 35}` }));
    const t0 = performance.now();
    const r = consolidate(lines, DEFAULT_PROFILE, "CHF");
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r.groups.reduce((a, g) => a + g.members.length, 0)).toBe(10_000);
    expect(r.totals.value).toBe("123500.00");
  });
});
