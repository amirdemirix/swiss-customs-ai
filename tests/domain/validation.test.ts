import { describe, expect, it } from "vitest";
import { validateOrder, validateInvoice, countBySeverity, type InvoiceInput, type LineInput } from "@/domain";

const l = (p: Partial<LineInput> = {}): LineInput => ({
  id: "L1", invoiceId: "I1", lineNo: 1, description: "T-Shirt", articleNumber: "A-1", tariffNumber: "6109.1000",
  originCountry: "CN", quantity: "10", unit: "PCE", unitPrice: "5", lineAmount: "50", currency: "CHF",
  netWeightKg: "2", grossWeightKg: "2.4", ...p,
});
const inv = (p: Partial<InvoiceInput> = {}): InvoiceInput => ({
  id: "I1", invoiceNumber: "R-100", supplierName: "Muster AG", invoiceDate: "2026-10-01", currency: "CHF", totalAmount: "50", lines: [l()], ...p,
});
const codes = (x: { code: string }[]) => x.map((i) => i.code);

describe("Prüfregeln", () => {
  it("vollständige Rechnung ohne Befund", () => {
    expect(validateInvoice(inv())).toEqual([]);
  });
  it("erkennt fehlende Pflichtangaben als kritisch", () => {
    const issues = validateInvoice(inv({ lines: [l({ tariffNumber: null, originCountry: null, lineAmount: null })], totalAmount: null }));
    expect(codes(issues)).toEqual(expect.arrayContaining(["TARIFF_MISSING", "ORIGIN_MISSING", "VALUE_MISSING"]));
    expect(issues.find((i) => i.code === "TARIFF_MISSING")!.severity).toBe("CRITICAL");
  });
  it("erkennt HS-6 und falsches Format", () => {
    expect(codes(validateInvoice(inv({ lines: [l({ tariffNumber: "610910" })] })))).toContain("TARIFF_HS6_ONLY");
    expect(codes(validateInvoice(inv({ lines: [l({ tariffNumber: "6109.10.00.90" })] })))).toContain("TARIFF_FORMAT");
  });
  it("prüft Rechnungstotal gegen Positionen", () => {
    expect(codes(validateInvoice(inv({ totalAmount: "60" })))).toContain("TOTAL_MISMATCH");
    expect(codes(validateInvoice(inv({ totalAmount: "45", headerAdjustments: "-5" })))).not.toContain("TOTAL_MISMATCH");
  });
  it("prüft Menge × Preis und Gewichtsplausibilität", () => {
    expect(codes(validateInvoice(inv({ lines: [l({ unitPrice: "6" })], totalAmount: "50" })))).toContain("LINE_MATH");
    expect(codes(validateInvoice(inv({ lines: [l({ grossWeightKg: "1" })] })))).toContain("GROSS_LT_NET");
    expect(codes(validateInvoice(inv({ lines: [l({ netWeightKg: "0" })] })))).toContain("NET_WEIGHT_IMPLAUSIBLE");
    expect(codes(validateInvoice(inv({ lines: [l({ grossWeightKg: null })] })))).toContain("GROSS_WEIGHT_MISSING");
  });
  it("erkennt doppelte Rechnungen (Datei und Nummer)", () => {
    const a = inv({ id: "I1", documentSha256: "h1" });
    const b = inv({ id: "I2", documentSha256: "h1", lines: [l({ id: "L2", invoiceId: "I2" })] });
    const c = inv({ id: "I3", invoiceNumber: "r-100 ", supplierName: "muster ag", lines: [l({ id: "L3", invoiceId: "I3" })] });
    const r = codes(validateOrder([a, b, c], "CHF"));
    expect(r).toContain("DUPLICATE_FILE");
    expect(r.filter((x) => x === "DUPLICATE_INVOICE")).toHaveLength(2);
  });
  it("erkennt Widersprüche je Artikelnummer", () => {
    const r = codes(validateOrder([
      inv({ id: "I1", lines: [l({ id: "L1" })] }),
      inv({ id: "I2", invoiceNumber: "R-200", lines: [l({ id: "L2", invoiceId: "I2", originCountry: "TR", tariffNumber: "6109.9000" })] }),
    ], "CHF"));
    expect(r).toContain("ARTICLE_ORIGIN_CONFLICT");
    expect(r).toContain("ARTICLE_TARIFF_CONFLICT");
    const msgs = validateOrder([inv({ id: "I1", lines: [l({ id: "L1" })] }), inv({ id: "I2", invoiceNumber: "R-200", lines: [l({ id: "L2", invoiceId: "I2", originCountry: "TR" })] })], "CHF")
      .filter((i) => i.code === "ARTICLE_ORIGIN_CONFLICT").map((i) => i.message);
    expect(msgs[0]).toContain("Rechnung R-100, Position 1");
    expect(msgs[1]).toContain("Rechnung R-200, Position 1");
  });
  it("informiert über Fremdwährungen", () => {
    const issues = validateOrder([inv({ currency: "EUR", lines: [l({ currency: "EUR" })] })], "CHF");
    expect(countBySeverity(issues).INFO).toBe(1);
  });
  it("lehnt fehlerhafte Dokumente ohne Positionen ab", () => {
    expect(codes(validateInvoice(inv({ lines: [], totalAmount: null })))).toContain("NO_LINES");
  });
});
