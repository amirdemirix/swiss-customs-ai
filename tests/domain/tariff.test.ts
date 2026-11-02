import { describe, expect, it } from "vitest";
import { parseTariffNumber, isValidStatisticalKey } from "@/domain";

describe("Tarifnummer", () => {
  it.each([
    ["6109.1000", "6109.1000"],
    ["61091000", "6109.1000"],
    ["6109 10 00", "6109.1000"],
    [" 8504.40.00 ", "8504.4000"],
  ])("normalisiert %s", (raw, expected) => {
    const r = parseTariffNumber(raw);
    expect(r.ok && r.normalized).toBe(expected);
  });
  it("erkennt HS-6 als unzureichend", () => {
    expect(parseTariffNumber("6109.10")).toMatchObject({ ok: false, reason: "HS6_ONLY" });
  });
  it("lehnt falsche Länge und Zeichen ab", () => {
    expect(parseTariffNumber("6109.100")).toMatchObject({ ok: false, reason: "WRONG_LENGTH" });
    expect(parseTariffNumber("6109.10000")).toMatchObject({ ok: false, reason: "WRONG_LENGTH" }); // EU-TARIC 10-stellig
    expect(parseTariffNumber("61O9.1000")).toMatchObject({ ok: false, reason: "INVALID_CHARS" });
    expect(parseTariffNumber(null)).toMatchObject({ ok: false, reason: "EMPTY" });
  });
  it("prüft statistischen Schlüssel", () => {
    expect(isValidStatisticalKey("000")).toBe(true);
    expect(isValidStatisticalKey("00")).toBe(false);
  });
});
