import { describe, expect, it } from "vitest";
import { parseTariffDataset, validateOrder, type InvoiceInput, type TariffLookup } from "@/domain";

describe("Tarif-Datenstand", () => {
  it("liest Tarifnummer, Schlüssel und Beschreibung, überspringt Ungültiges und Duplikate", () => {
    const r = parseTariffDataset([
      ["Export Tares (Testdaten)"],
      ["Tarifnummer", "Schlüssel", "Warenbezeichnung", "Zusatzmenge"],
      ["6109.1000", "000", "T-Shirts aus Baumwolle (Testeintrag)", "Stk"],
      ["61091000", "000", "Duplikat", ""],
      ["6109.10", "", "nur HS-6", ""],
      ["8504.4000", "", "Statische Umformer (Testeintrag)", ""],
      ["", "", "", ""],
    ]);
    expect(r.entries).toEqual([
      { tariffNumber: "6109.1000", statisticalKey: "000", description: "T-Shirts aus Baumwolle (Testeintrag)", unit: "Stk" },
      { tariffNumber: "8504.4000", statisticalKey: null, description: "Statische Umformer (Testeintrag)", unit: null },
    ]);
    expect(r.skipped).toBe(2);
  });
  it("meldet fehlende Kopfzeile", () => {
    expect(parseTariffDataset([["a", "b"], ["1", "2"]]).error).toBeDefined();
  });
});

describe("Abgleich mit Datenstand", () => {
  const inv: InvoiceInput = { id: "I", invoiceNumber: "R", supplierName: "S", invoiceDate: "2026-01-01", currency: "CHF", lines: [
    { id: "L1", invoiceId: "I", lineNo: 1, tariffNumber: "6109.1000", statisticalKey: "000", originCountry: "CN", lineAmount: "1", quantity: "1", unit: "PCE", description: "x", netWeightKg: "1", grossWeightKg: "1" },
    { id: "L2", invoiceId: "I", lineNo: 2, tariffNumber: "9999.9900", statisticalKey: "000", originCountry: "CN", lineAmount: "1", quantity: "1", unit: "PCE", description: "x", netWeightKg: "1", grossWeightKg: "1" },
    { id: "L3", invoiceId: "I", lineNo: 3, tariffNumber: "6109.1000", statisticalKey: "911", originCountry: "CN", lineAmount: "1", quantity: "1", unit: "PCE", description: "x", netWeightKg: "1", grossWeightKg: "1" },
  ] };
  const lookup: TariffLookup = { name: "Test", validFrom: "2026-01-01", known: new Map([["6109.1000", new Set(["000"])]]) };
  it("warnt bei unbekannter Nummer und unbekanntem Schlüssel", () => {
    const codes = validateOrder([inv], "CHF", {}, lookup).map((i) => `${i.code}:${i.entityId}`);
    expect(codes).toContain("TARIFF_UNKNOWN:L2");
    expect(codes).toContain("STAT_KEY_UNKNOWN:L3");
    expect(codes).not.toContain("TARIFF_UNKNOWN:L1");
  });
  it("ohne Datenstand keine Aussage", () => {
    expect(validateOrder([inv], "CHF").some((i) => i.code === "TARIFF_UNKNOWN")).toBe(false);
  });
});
