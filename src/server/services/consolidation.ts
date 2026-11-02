import { consolidate, validateOrder, DEFAULT_PROFILE, type GroupingProfileConfig, type GroupableField, type InvoiceInput, type LineInput } from "@/domain";
import type { TenantDb } from "../tenant-db";

const str = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());

/**
 * Führt Validierung und Konsolidierung für einen Auftrag aus und speichert das Ergebnis.
 * Idempotent: bestehende Anmeldepositionen und offene automatische Befunde werden ersetzt.
 * Manuell aufgelöste Befunde bleiben erhalten (Prüfprotokoll).
 */
export async function recomputeOrder(db: TenantDb, orderId: string, userId: string | null) {
  const order = await db.customsOrder.findFirstOrThrow({
    where: { id: orderId },
    include: { groupingProfile: true, exchangeRates: true, invoices: { include: { lines: { orderBy: { lineNo: "asc" } }, document: { select: { sha256: true } } } } },
  });
  const profile: GroupingProfileConfig = order.groupingProfile
    ? { name: order.groupingProfile.name, keyFields: order.groupingProfile.keyFields as GroupableField[], extraKeys: order.groupingProfile.extraKeys, requiredFields: order.groupingProfile.requiredFields as GroupingProfileConfig["requiredFields"] }
    : DEFAULT_PROFILE;

  const invoices: InvoiceInput[] = order.invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    supplierName: inv.supplierName,
    invoiceDate: inv.invoiceDate?.toISOString().slice(0, 10) ?? null,
    currency: inv.currency,
    totalAmount: str(inv.totalAmount),
    headerAdjustments: inv.discountAmount ? inv.discountAmount.negated().toString() : null,
    documentSha256: inv.document?.sha256 ?? null,
    documentId: inv.documentId,
    lines: inv.lines.map<LineInput>((l) => ({
      id: l.id, invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, lineNo: l.lineNo, articleNumber: l.articleNumber,
      description: l.description, tariffNumber: l.tariffNumber, statisticalKey: l.statisticalKey, originCountry: l.originCountry,
      preferenceStatus: l.preferenceStatus, customsProcedure: l.customsProcedure, quantity: str(l.quantity), unit: l.unit,
      unitPrice: str(l.unitPrice), lineAmount: str(l.lineAmount), currency: inv.currency, netWeightKg: str(l.netWeightKg),
      grossWeightKg: str(l.grossWeightKg), extraAttributes: (l.extraAttributes as LineInput["extraAttributes"]) ?? null,
    })),
  }));

  const rates = order.exchangeRates.map((r) => ({ id: r.id, fromCurrency: r.fromCurrency, toCurrency: r.toCurrency, rate: r.rate.toString(), validOn: r.validOn.toISOString().slice(0, 10), source: r.source }));
  const issues = validateOrder(invoices, order.declarationCurrency);
  const result = consolidate(invoices.flatMap((i) => i.lines), profile, order.declarationCurrency, rates);
  // Fehlende Umrechnungskurse als kritischer Befund (einmal je Währungspaar)
  const missingRates = new Map<string, number>();
  for (const g of result.groups) for (const p of g.problems) if (p.code === "MISSING_EXCHANGE_RATE") missingRates.set(`${p.from}>${p.to}`, (missingRates.get(`${p.from}>${p.to}`) ?? 0) + p.lineIds.length);
  for (const [k, n] of missingRates) {
    const [from, to] = k.split(">");
    issues.push({ code: "EXCHANGE_RATE_MISSING", severity: "CRITICAL", entityType: "Invoice", entityId: orderId, field: "currency",
      message: `Kein Umrechnungskurs ${from} → ${to} hinterlegt (${n} Positionen ohne Wert in ${to}). Bitte Kurs mit Quelle und Datum erfassen.` });
  }

  const hasCritical = issues.some((i) => i.severity === "CRITICAL") || result.groups.some((g) => g.totalValue === null);
  const status = order.status === "DRAFT" || order.status === "PROCESSING" || order.status === "NEEDS_REVIEW" || order.status === "READY" ? (hasCritical ? "NEEDS_REVIEW" : "READY") : order.status;

  // Interaktive Transaktion über den Mandanten-Client
  await db.$transaction(async (tx) => {
    // Serialisiert parallele Neuberechnungen desselben Auftrags (z. B. mehrere Uploads gleichzeitig)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
    await tx.declarationLine.deleteMany({ where: { orderId } });
    await tx.validationIssue.deleteMany({ where: { orderId, resolvedAt: null } });
    for (const g of result.groups) {
      await tx.declarationLine.create({
        data: {
          tenantId: order.tenantId, orderId, position: g.position, groupKey: g.groupKey,
          tariffNumber: g.keys.tariffNumber ?? null, statisticalKey: g.keys.statisticalKey ?? null, originCountry: g.keys.originCountry ?? null,
          preferenceStatus: (g.keys.preferenceStatus as "NONE" | "CLAIMED" | "UNKNOWN" | null) ?? "UNKNOWN", customsProcedure: g.keys.customsProcedure ?? null,
          description: g.description, totalValue: g.totalValue ?? "0", currency: g.currency, totalQuantity: g.totalQuantity, quantityUnit: g.quantityUnit,
          netWeightKg: g.netWeightKg, grossWeightKg: g.grossWeightKg,
          attributes: { mergeable: g.mergeable, problems: g.problems, valueComplete: g.totalValue !== null, valueExact: g.totalValueExact, knownNetWeightKg: g.knownNetWeightKg, knownGrossWeightKg: g.knownGrossWeightKg, extra: g.keys.extra },
          sources: { create: g.members.map((m) => ({ invoiceLineId: m.lineId, convertedValue: m.convertedValue ?? "0", exchangeRateId: m.exchangeRate?.id ?? null })) },
        },
      });
    }
    if (issues.length) await tx.validationIssue.createMany({ data: issues.map((i) => ({ tenantId: order.tenantId, orderId, ...i })) });
    await tx.customsOrder.update({ where: { id: orderId }, data: { status } });
    await tx.auditLog.create({ data: { tenantId: order.tenantId, userId, action: "RECOMPUTE", entityType: "CustomsOrder", entityId: orderId,
      newValue: { profile: profile.name, groups: result.groups.length, lines: result.totals.lineCount, total: result.totals.value, issues: issues.length } } });
  }, { timeout: 60_000 });
  return { groups: result.groups.length, issues: issues.length, status };
}
