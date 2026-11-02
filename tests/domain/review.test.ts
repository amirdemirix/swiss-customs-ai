import { describe, expect, it } from "vitest";
import { mapExtraction, mergeLines, normalizeLineInput, splitCheck, type AiResult, type LineValues } from "@/domain";

const f = (value: string | null, confidence = 0.95, page: number | null = 1) => ({ value, confidence, page });
const ai = (over: Partial<AiResult> = {}): AiResult => ({
  isInvoice: true, invoiceNumber: f("R-1"), invoiceDate: f("2026-10-22"), supplierName: f("Beispiel AG"), currency: f("eur"), totalAmount: f("1577.00"),
  incoterm: f("dap"), totalNetWeightKg: f("48.5"), totalGrossWeightKg: f("55.2"), packages: f(null, 0), notes: [],
  lines: [{ lineNo: 1, page: 1, articleNumber: "WZ-10", description: "Set", tariffNumber: "82054000", originCountry: "de", quantity: "50", unit: "pce", unitPrice: "12.40", lineAmount: "620.00", netWeightKg: null, grossWeightKg: null, confidence: 0.97, uncertainFields: [] }],
  ...over,
});

describe("KI-Ergebnis → Rechnungsdaten", () => {
  it("normalisiert gültige Werte", () => {
    const m = mapExtraction(ai(), 0.85);
    expect(m).toMatchObject({ invoiceNumber: "R-1", invoiceDate: "2026-10-22", currency: "EUR", totalAmount: "1577", incoterm: "DAP", needsReview: true });
    expect(m.lines[0]).toMatchObject({ tariffNumber: "8205.4000", originCountry: "DE", unit: "PCE", lineAmount: "620", needsReview: false, netWeightKg: null });
  });
  it("verwirft ungültige KI-Werte statt sie zu übernehmen", () => {
    const m = mapExtraction(ai({ currency: f("Euro"), lines: [{ ...ai().lines[0], originCountry: "Germany", lineAmount: "ca. 600", quantity: "50 Stk" }] }), 0.85);
    expect(m.currency).toBeNull();
    expect(m.lines[0]).toMatchObject({ originCountry: null, lineAmount: null, quantity: null, needsReview: true });
    expect(m.lines[0].fieldMeta.rejected).toMatchObject({ originCountry: "GERMANY", lineAmount: "ca. 600" });
  });
  it("markiert unsichere Positionen zur Kontrolle", () => {
    const base = ai().lines[0];
    const m = mapExtraction(ai({ lines: [{ ...base, confidence: 0.6 }, { ...base, lineNo: 2, uncertainFields: ["originCountry"] }] }), 0.85);
    expect(m.lines.map((l) => l.needsReview)).toEqual([true, true]);
  });
  it("vergibt eindeutige Positionsnummern", () => {
    const base = ai().lines[0];
    const m = mapExtraction(ai({ lines: [base, { ...base }, { ...base, lineNo: null }] }), 0.85);
    expect(m.lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
  });
  it("vermerkt, wenn das Dokument keine Rechnung ist; KI-Ergebnis ist nie automatisch bestätigt", () => {
    const m = mapExtraction(ai({ isInvoice: false, lines: [] }), 0.85);
    expect(m.notes[0]).toContain("nicht als Handelsrechnung");
    expect(m.needsReview).toBe(true);
  });
});

describe("Manuelle Korrektur", () => {
  it("normalisiert Schweizer Eingaben", () => {
    const { values, errors } = normalizeLineInput({ tariffNumber: "6109 10 00", originCountry: "cn", quantity: "1'200", lineAmount: "1'234,50", netWeightKg: "12.5", grossWeightKg: "13" });
    expect(errors).toEqual({});
    expect(values).toMatchObject({ tariffNumber: "6109.1000", originCountry: "CN", quantity: "1200", lineAmount: "1234.5", netWeightKg: "12.5" });
  });
  it("meldet ungültige Eingaben statt sie zu verwerfen", () => {
    const { errors } = normalizeLineInput({ tariffNumber: "610910", originCountry: "Deutschland", quantity: "viele", lineAmount: "-5", netWeightKg: "10", grossWeightKg: "8", statisticalKey: "1" });
    expect(Object.keys(errors).sort()).toEqual(["grossWeightKg", "lineAmount", "originCountry", "quantity", "statisticalKey", "tariffNumber"]);
  });
});

const lv = (p: Partial<LineValues>): LineValues => ({ articleNumber: "A", description: "T-Shirt", tariffNumber: "6109.1000", statisticalKey: "000", originCountry: "CN", preferenceStatus: "NONE", customsProcedure: null, quantity: "10", unit: "PCE", unitPrice: "2.5", lineAmount: "25", netWeightKg: "1.5", grossWeightKg: "1.7", ...p });

describe("Zusammenführen & Aufteilen", () => {
  it("führt gleichartige Positionen exakt zusammen", () => {
    const r = mergeLines([lv({}), lv({ quantity: "20", lineAmount: "50", netWeightKg: "3", grossWeightKg: "3.4" })]);
    expect(r.ok && r.merged).toMatchObject({ quantity: "30", lineAmount: "75", netWeightKg: "4.5", grossWeightKg: "5.1", unitPrice: "2.5" });
  });
  it("verweigert Zusammenführung bei abweichendem Ursprung oder Tarif", () => {
    expect(mergeLines([lv({}), lv({ originCountry: "TR" })])).toMatchObject({ ok: false });
    expect(mergeLines([lv({}), lv({ tariffNumber: "6109.9000" })])).toMatchObject({ ok: false });
    expect(mergeLines([lv({})])).toMatchObject({ ok: false });
  });
  it("erfindet beim Zusammenführen keine Gewichte und keinen Durchschnittspreis", () => {
    const r = mergeLines([lv({}), lv({ grossWeightKg: null, unitPrice: "3" })]);
    expect(r.ok && r.merged.grossWeightKg).toBeNull();
    expect(r.ok && r.merged.unitPrice).toBeNull();
    expect(r.ok && r.notes.length).toBe(2);
  });
  it("prüft Summen beim Aufteilen", () => {
    expect(splitCheck(lv({}), [lv({ quantity: "4", lineAmount: "10", netWeightKg: "0.6", grossWeightKg: "0.7" }), lv({ quantity: "6", lineAmount: "15", netWeightKg: "0.9", grossWeightKg: "1" })])).toEqual([]);
    expect(splitCheck(lv({}), [lv({ quantity: "4" }), lv({ quantity: "5", netWeightKg: null })]).length).toBeGreaterThan(0);
  });
});
