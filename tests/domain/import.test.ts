import { describe, expect, it } from "vitest";
import { autoMapColumns, decodeText, detectDelimiter, findHeaderRow, parseCsv, parseDate, rowsToInvoices, headerSignature, detectFileType, detectInvoiceHeader, looksScanned } from "@/domain";
import { CSV_SAMPLE } from "../../scripts/generate-samples";

describe("CSV-Parser", () => {
  it("erkennt Semikolon, Komma und Tab", () => {
    expect(detectDelimiter("a;b;c\n1;2,5;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
  it("verarbeitet Anführungszeichen, Zeilenumbrüche in Feldern und CRLF", () => {
    const rows = parseCsv('Art;Text;Wert\r\n1;"Schraube; M8 ""verzinkt""";"1\'200,50"\r\n2;"zwei\nZeilen";3\r\n');
    expect(rows).toEqual([["Art", "Text", "Wert"], ["1", 'Schraube; M8 "verzinkt"', "1'200,50"], ["2", "zwei\nZeilen", "3"]]);
  });
  it("entfernt BOM und dekodiert Windows-1252", () => {
    expect(decodeText(new TextEncoder().encode("﻿abc"))).toBe("abc");
    expect(decodeText(new Uint8Array([0x57, 0xe4, 0x68, 0x72, 0x75, 0x6e, 0x67]))).toBe("Währung"); // cp1252
  });
});

describe("Spaltenzuordnung", () => {
  it("ordnet deutsche Kopfzeile vollständig zu", () => {
    const headers = parseCsv(CSV_SAMPLE)[0];
    const m = autoMapColumns(headers);
    expect(m).toMatchObject({ invoiceNumber: 0, invoiceDate: 1, supplierName: 2, currency: 3, lineNo: 4, articleNumber: 5, description: 6, tariffNumber: 7, originCountry: 8, quantity: 9, unit: 10, unitPrice: 11, lineAmount: 12, netWeightKg: 13, grossWeightKg: 14 });
  });
  it("ordnet englische Kopfzeile zu und vergibt keine Spalte doppelt", () => {
    const m = autoMapColumns(["Item No", "Description", "HS Code", "Country of Origin", "Qty", "Unit", "Unit Price", "Amount", "Net Weight", "Gross Weight"]);
    expect(m).toMatchObject({ articleNumber: 0, description: 1, tariffNumber: 2, originCountry: 3, quantity: 4, unit: 5, unitPrice: 6, lineAmount: 7, netWeightKg: 8, grossWeightKg: 9 });
    const cols = Object.values(m);
    expect(new Set(cols).size).toBe(cols.length);
  });
  it("findet die Kopfzeile unter Titelzeilen", () => {
    const rows = [["COMMERCIAL INVOICE"], ["Invoice No:", "INV-1"], [], ["Item No", "Description", "HS Code", "Qty", "Amount"], ["A", "x", "8504.4000", "1", "2"]];
    expect(findHeaderRow(rows)).toBe(3);
  });
  it("Signatur ist unabhängig von Gross-/Kleinschreibung und Satzzeichen", () => {
    expect(headerSignature(["Net Weight (kg)", "HS-Code"])).toBe(headerSignature(["net weight", "hs code"]));
  });
});

describe("Zeilen → Rechnungen", () => {
  const rows = parseCsv(CSV_SAMPLE);
  const map = autoMapColumns(rows[0]);
  const { invoices, problems } = rowsToInvoices(rows.slice(1), map, {});

  it("gruppiert nach Rechnungsnummer und übernimmt Kopfdaten", () => {
    expect(invoices.map((i) => [i.invoiceNumber, i.lines.length, i.currency, i.invoiceDate])).toEqual([
      ["RE-2026-1001", 3, "EUR", "2026-10-15"], ["RE-2026-1002", 2, "EUR", "2026-10-16"],
    ]);
  });
  it("parst Schweizer/deutsche Zahlen exakt", () => {
    const l = invoices[0].lines[0];
    expect([l.quantity, l.unitPrice, l.lineAmount, l.netWeightKg, l.grossWeightKg]).toEqual(["200", "2.5", "500", "37", "40.2"]);
    expect(invoices[1].lines[1].lineAmount).toBe("1150");
  });
  it("lässt fehlende Gewichte leer – keine Schätzung", () => {
    const socks = invoices[1].lines[1];
    expect(socks.netWeightKg).toBeNull();
    expect(socks.grossWeightKg).toBeNull();
  });
  it("speichert Quellzeile und Rohwerte (Rückverfolgbarkeit)", () => {
    expect(invoices[0].lines[0].sourceRow).toBe(2);
    expect(invoices[0].lines[0].raw.lineAmount).toBe("500,00");
    expect(problems).toEqual([]);
  });
  it("unlesbare Werte → leer + Hinweis mit Zeilennummer", () => {
    const r = rowsToInvoices([["R1", "abc", "8504.4000", "Germany", "zwölf"]], { invoiceNumber: 0, lineAmount: 1, tariffNumber: 2, originCountry: 3, quantity: 4 }, {}, 5);
    const l = r.invoices[0].lines[0];
    expect(l.lineAmount).toBeNull();
    expect(l.quantity).toBeNull();
    expect(l.originCountry).toBeNull();
    expect(r.problems.map((p) => p.row)).toEqual([5, 5, 5]);
    expect(r.problems.some((p) => p.message.includes("Germany"))).toBe(true);
  });
  it("Summenzeile wird übersprungen und als Rechnungstotal übernommen", () => {
    const r = rowsToInvoices([["A", "Teil", "8504.4000", "10"], ["", "Total", "", "10"]], { articleNumber: 0, description: 1, tariffNumber: 2, lineAmount: 3 }, { invoiceNumber: "X" });
    expect(r.invoices[0].lines).toHaveLength(1);
    expect(r.invoices[0].totalAmount).toBe("10");
  });
  it("Standardwerte greifen nur bei fehlender Spalte", () => {
    const r = rowsToInvoices([["8504.4000", "5"]], { tariffNumber: 0, lineAmount: 1 }, { invoiceNumber: "R-9", currency: "usd", supplierName: "S" });
    expect(r.invoices[0]).toMatchObject({ invoiceNumber: "R-9", currency: "USD", supplierName: "S" });
  });
  it("Positionsnummern werden eindeutig", () => {
    const r = rowsToInvoices([["1", "1"], ["1", "2"], ["", "3"]], { lineNo: 0, lineAmount: 1 }, { invoiceNumber: "R" });
    expect(r.invoices[0].lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
  });
  it("normalisiert Tarifnummern, behält ungültige zur Prüfung", () => {
    const r = rowsToInvoices([["61091000", "1"], ["6109.10", "1"]], { tariffNumber: 0, lineAmount: 1 }, { invoiceNumber: "R" });
    expect(r.invoices[0].lines.map((l) => l.tariffNumber)).toEqual(["6109.1000", "6109.10"]);
  });
});

describe("Datumsformate", () => {
  it.each([["15.10.2026", "2026-10-15"], ["2026-10-15", "2026-10-15"], ["25/10/2026", "2026-10-25"], ["10/25/2026", "2026-10-25"], ["1.2.26", "2026-02-01"]])("%s", (i, o) => {
    expect(parseDate(i).value).toBe(o);
  });
  it("erkennt mehrdeutige und ungültige Daten", () => {
    expect(parseDate("03/04/2026")).toEqual({ value: null, ambiguous: true });
    expect(parseDate("31.02.2026").value).toBeNull();
  });
});

describe("Dateityp-Erkennung (Magic Bytes)", () => {
  const b = (s: number[] | string) => (typeof s === "string" ? new TextEncoder().encode(s) : new Uint8Array(s));
  it("erkennt erlaubte Typen am Inhalt", () => {
    expect(detectFileType(b("%PDF-1.7 ..."), "x.pdf")).toMatchObject({ ok: true, type: "PDF" });
    expect(detectFileType(b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "x.png")).toMatchObject({ type: "PNG" });
    expect(detectFileType(b([0xff, 0xd8, 0xff, 0xe0]), "scan.jpg")).toMatchObject({ type: "JPEG" });
    expect(detectFileType(b([0x50, 0x4b, 0x03, 0x04]), "liste.xlsx")).toMatchObject({ type: "XLSX" });
    expect(detectFileType(b("a;b\n1;2"), "liste.csv")).toMatchObject({ type: "CSV" });
  });
  it("lehnt getarnte und unerwünschte Dateien ab", () => {
    expect(detectFileType(b("<html><script>alert(1)</script>"), "rechnung.pdf").ok).toBe(false);
    expect(detectFileType(b([0x50, 0x4b, 0x03, 0x04]), "brief.docx").ok).toBe(false);
    expect(detectFileType(b([0xd0, 0xcf, 0x11, 0xe0]), "alt.xls").ok).toBe(false);
    expect(detectFileType(b(""), "leer.pdf").ok).toBe(false);
    expect(detectFileType(new Uint8Array(5 * 1024 * 1024), "gross.pdf").ok).toBe(false);
  });
});

describe("PDF-Kopfdaten-Heuristik", () => {
  const text = "Beispiel AG\nRechnung Nr.: R-55120\nRechnungsdatum: 22.10.2026\nPos Preis EUR\nGesamtbetrag EUR 1'577.00";
  it("findet Nummer, Datum, Währung und Total mit Fundstelle", () => {
    const h = detectInvoiceHeader([text]);
    expect(h.invoiceNumber).toMatchObject({ value: "R-55120", page: 1 });
    expect(h.invoiceDate?.value).toBe("2026-10-22");
    expect(h.currency?.value).toBe("EUR");
    expect(h.totalAmount?.value).toBe("1577");
    expect(h.invoiceNumber?.snippet).toContain("R-55120");
  });
  it("lässt mehrdeutige Währung und fehlende Angaben leer", () => {
    const h = detectInvoiceHeader(["Preis in EUR, Umrechnung CHF"]);
    expect(h.currency).toBeNull();
    expect(h.invoiceNumber).toBeNull();
    expect(h.totalAmount).toBeNull();
  });
  it("erkennt Scans ohne Textlayer", () => {
    expect(looksScanned(["", " "])).toBe(true);
    expect(looksScanned([text])).toBe(false);
  });
});
