import { describe, expect, it } from "vitest";
import { dec, sum, round, formatCH, parseAmount, convert, MissingExchangeRateError } from "@/domain";

describe("Money", () => {
  it("vermeidet Floating-Point-Fehler", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sum(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(sum(Array(1000).fill("0.01")).toString()).toBe("10");
  });
  it("rundet kaufmännisch HALF_UP", () => {
    expect(round("2.345").toFixed(2)).toBe("2.35");
    expect(round("2.344").toFixed(2)).toBe("2.34");
    expect(round("-2.345").toFixed(2)).toBe("-2.35");
  });
  it("formatiert Schweizer Schreibweise", () => {
    expect(formatCH("1234567.5")).toBe("1'234'567.50");
    expect(formatCH("-1200")).toBe("-1'200.00");
  });
  it("parst Rechnungsbeträge und lehnt Mehrdeutiges ab", () => {
    expect(parseAmount("1'234.50")!.toString()).toBe("1234.5");
    expect(parseAmount("1.234,50")!.toString()).toBe("1234.5");
    expect(parseAmount("1,234.50")!.toString()).toBe("1234.5");
    expect(parseAmount("12,5")!.toString()).toBe("12.5");
    expect(parseAmount("EUR 900.00")!.toString()).toBe("900");
    expect(parseAmount("1,234")).toBeNull(); // mehrdeutig
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("Währungsumrechnung", () => {
  const rates = [{ fromCurrency: "EUR", toCurrency: "CHF", rate: "0.9312", validOn: "2026-11-02", source: "Test" }];
  it("rechnet ohne Zwischenrundung", () => {
    expect(convert("1000", "EUR", "CHF", rates).value.toString()).toBe("931.2");
    expect(convert("0.01", "EUR", "CHF", rates).value.toString()).toBe("0.009312");
  });
  it("gleiche Währung ohne Kurs", () => {
    expect(convert("5", "CHF", "CHF", []).rate).toBeNull();
  });
  it("wirft bei fehlendem Kurs statt zu raten", () => {
    expect(() => convert("1", "USD", "CHF", rates)).toThrow(MissingExchangeRateError);
  });
  it("Summe ungerundeter Umrechnungen ≠ Summe gerundeter (Rundungsdifferenz vermeiden)", () => {
    const parts = Array(3).fill(convert("0.005", "EUR", "CHF", [{ ...rates[0], rate: "1" }]).value);
    expect(round(sum(parts)).toFixed(2)).toBe("0.02"); // 0.015 → 0.02
    expect(sum(parts.map((p) => round(p))).toFixed(2)).toBe("0.03"); // falscher Weg
    expect(dec("0.015").toFixed(3)).toBe("0.015");
  });
});
