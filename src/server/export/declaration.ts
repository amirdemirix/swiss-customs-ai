import { round, sum } from "@/domain";
import type { ExportData } from "./data";

/**
 * Schnittstelle für die Übergabe an Zollsysteme. Bewusst KEINE Passar-Implementierung:
 * eine echte Anbindung erfolgt erst nach Prüfung der offiziellen BAZG-Schnittstellendokumentation
 * und Tests in der Abnahmeumgebung. Ein künftiger Adapter implementiert dieses Interface.
 */
export interface DeclarationExportAdapter {
  id: string;
  label: string;
  build(d: ExportData, meta: { userName: string; generatedAt: Date }): { fileName: string; contentType: string; body: string };
}

export class DeclarationNotReadyError extends Error {}

/** Neutraler, versionierter JSON-Datensatz zur Weiterverarbeitung (kein offizielles BAZG-Format). */
export const neutralJsonAdapter: DeclarationExportAdapter = {
  id: "neutral-json-v1",
  label: "Neutraler JSON-Datensatz (sca-declaration/1.0)",
  build(d, meta) {
    const { order } = d;
    if (d.critical > 0) throw new DeclarationNotReadyError(`${d.critical} kritische Befunde sind offen.`);
    if (d.unconfirmed > 0) throw new DeclarationNotReadyError(`${d.unconfirmed} Rechnung(en) sind noch nicht fachlich bestätigt.`);
    if (!order.declarationLines.length) throw new DeclarationNotReadyError("Keine Anmeldepositionen vorhanden.");
    const incomplete = order.declarationLines.filter((l) => l.grossWeightKg == null || (l.attributes as { valueComplete?: boolean } | null)?.valueComplete === false);
    if (incomplete.length) throw new DeclarationNotReadyError(`Positionen ${incomplete.map((l) => l.position).join(", ")}: Wert oder Bruttogewicht unvollständig.`);
    const items = order.declarationLines.map((l) => ({
      position: l.position, tariffNumber: l.tariffNumber, statisticalKey: l.statisticalKey, originCountry: l.originCountry,
      preference: l.preferenceStatus, customsProcedure: l.customsProcedure, description: l.description,
      value: { amount: l.totalValue.toFixed(2), currency: l.currency },
      netMassKg: l.netWeightKg?.toFixed(3) ?? null, grossMassKg: l.grossWeightKg?.toFixed(3) ?? null,
      quantity: l.totalQuantity ? { amount: l.totalQuantity.toString(), unit: l.quantityUnit } : null,
      sourceInvoiceLineIds: l.sources.map((s) => s.invoiceLineId),
    }));
    const body = {
      format: "sca-declaration/1.0",
      notice: "Vorbereiteter Datensatz – keine eingereichte Zollanmeldung. Prüfung und Anmeldung durch das Fachpersonal.",
      generatedAt: meta.generatedAt.toISOString(), generatedBy: meta.userName,
      order: { number: order.orderNumber, reference: order.reference, direction: order.direction, consignor: order.consignor, consignee: order.consignee,
        dispatchCountry: order.dispatchCountry, destinationCountry: order.destinationCountry, transportMode: order.transportMode, date: order.orderDate.toISOString().slice(0, 10) },
      currency: order.declarationCurrency,
      exchangeRates: order.exchangeRates.map((r) => ({ from: r.fromCurrency, to: r.toCurrency, rate: r.rate.toString(), validOn: r.validOn.toISOString().slice(0, 10), source: r.source })),
      totals: { value: round(sum(order.declarationLines.map((l) => l.totalValue.toString()))).toFixed(2),
        grossMassKg: sum(order.declarationLines.map((l) => l.grossWeightKg!.toString())).toFixed(3), items: items.length },
      invoices: order.invoices.map((i) => ({ number: i.invoiceNumber, date: i.invoiceDate?.toISOString().slice(0, 10) ?? null, supplier: i.supplierName, currency: i.currency, total: i.totalAmount?.toString() ?? null, documentSha256: i.document?.sha256 ?? null })),
      items,
    };
    return { fileName: `Anmeldevorbereitung_${order.orderNumber}.json`, contentType: "application/json; charset=utf-8", body: JSON.stringify(body, null, 2) };
  },
};
export const DECLARATION_ADAPTERS = [neutralJsonAdapter];
