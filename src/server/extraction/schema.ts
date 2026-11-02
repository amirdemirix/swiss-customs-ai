import { z } from "zod/v4";

/**
 * Ausgabeformat der KI-Extraktion (Structured Outputs). Zahlen als Dezimal-STRINGS, damit
 * keine Float-Rundung entsteht; jeder Wert darf null sein (= im Dokument nicht vorhanden).
 */
const str = z.string().nullable();

export const ExtractedField = z.object({
  value: str.describe("Wert genau wie im Dokument (normalisiert), null wenn nicht vorhanden"),
  page: z.number().int().nullable().describe("1-basierte Seitennummer der Fundstelle"),
  confidence: z.number().describe("0 bis 1"),
});

export const ExtractedLine = z.object({
  lineNo: z.number().int().nullable(),
  page: z.number().int().nullable(),
  articleNumber: str,
  description: str,
  tariffNumber: str.describe("Nur wenn auf der Rechnung gedruckt; nicht selbst einreihen"),
  originCountry: str.describe("ISO-3166-Alpha-2, nur wenn für die Position angegeben"),
  quantity: str,
  unit: str,
  unitPrice: str,
  lineAmount: str,
  netWeightKg: str,
  grossWeightKg: str,
  confidence: z.number().describe("Gesamtsicherheit der Position 0 bis 1"),
  uncertainFields: z.array(z.string()).describe("Feldnamen, die unsicher gelesen wurden"),
});

export const ExtractionResult = z.object({
  isInvoice: z.boolean().describe("false, wenn das Dokument keine Handelsrechnung ist"),
  invoiceNumber: ExtractedField,
  invoiceDate: ExtractedField.describe("ISO-Datum YYYY-MM-DD"),
  supplierName: ExtractedField,
  currency: ExtractedField.describe("ISO-4217, z. B. EUR"),
  totalAmount: ExtractedField,
  incoterm: ExtractedField,
  totalNetWeightKg: ExtractedField,
  totalGrossWeightKg: ExtractedField,
  packages: ExtractedField,
  lines: z.array(ExtractedLine),
  notes: z.array(z.string()).describe("Hinweise auf Unklarheiten, unlesbare Stellen, Rabatte, Fracht"),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;
