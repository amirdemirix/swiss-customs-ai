"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { getContext, assertCan, type RequestContext } from "@/server/context";
import { recomputeOrder } from "@/server/services/consolidation";
import { diffFields, isLocked, LINE_FIELDS, mergeLines, normalizeLineInput, parseAmount, parseDate, type LineValues } from "@/domain";

export type SaveState = { ok?: boolean; message?: string; lineErrors?: Record<string, Record<string, string>>; headerErrors?: Record<string, string> };

const lineSchema = z.object({ id: z.string().nullable(), lineNo: z.number().int().positive(), values: z.record(z.string(), z.string().nullable()), deleted: z.boolean().optional() });
const payloadSchema = z.object({
  header: z.record(z.string(), z.string().nullable()),
  lines: z.array(lineSchema).max(5000),
});

const HEADER_FIELDS = ["invoiceNumber", "invoiceDate", "supplierName", "currency", "totalAmount", "discountAmount", "freightAmount", "insuranceAmount", "incoterm", "netWeightKg", "grossWeightKg", "packages"] as const;

async function loadEditable(ctx: RequestContext, orderId: string, invoiceId: string) {
  const inv = await ctx.db.invoice.findFirst({ where: { id: invoiceId, orderId }, include: { order: { select: { status: true } }, lines: true } });
  if (!inv) throw new Error("Rechnung nicht gefunden.");
  if (isLocked(inv.order.status)) throw new Error("Auftrag ist abgeschlossen.");
  return inv;
}

const lineToValues = (l: Record<string, unknown>): LineValues =>
  Object.fromEntries(LINE_FIELDS.map((f) => [f, l[f] == null ? null : String(l[f])])) as LineValues;

/** Speichert Kopf + alle Positionen; jede Feldänderung wird einzeln protokolliert. */
export async function saveInvoice(orderId: string, invoiceId: string, _p: SaveState, fd: FormData): Promise<SaveState> {
  const ctx = await getContext();
  assertCan(ctx, "invoice.edit");
  let inv;
  try { inv = await loadEditable(ctx, orderId, invoiceId); } catch (e) { return { message: (e as Error).message }; }
  const parsed = payloadSchema.safeParse(JSON.parse(String(fd.get("payload") ?? "{}")));
  if (!parsed.success) return { message: "Ungültige Daten." };
  const { header, lines } = parsed.data;

  // Kopf validieren
  const headerErrors: Record<string, string> = {};
  const h: Record<string, string | null> = {};
  for (const f of HEADER_FIELDS) { const v = (header[f] ?? "").trim(); h[f] = v === "" ? null : v; }
  if (h.invoiceDate) { const d = parseDate(h.invoiceDate); if (!d.value) headerErrors.invoiceDate = "Datum ungültig"; else h.invoiceDate = d.value; }
  if (h.currency) { h.currency = h.currency.toUpperCase(); if (!/^[A-Z]{3}$/.test(h.currency)) headerErrors.currency = "ISO-Code (3 Buchstaben)"; }
  if (h.incoterm) { h.incoterm = h.incoterm.toUpperCase(); if (!/^[A-Z]{3}$/.test(h.incoterm)) headerErrors.incoterm = "3 Buchstaben (z. B. DAP)"; }
  for (const f of ["totalAmount", "discountAmount", "freightAmount", "insuranceAmount", "netWeightKg", "grossWeightKg"] as const) {
    if (h[f] == null) continue;
    const p = parseAmount(h[f]!.includes(".") ? h[f] : h[f]!.replace(",", "."));
    if (!p) headerErrors[f] = "Zahl nicht lesbar"; else h[f] = p.toString();
  }

  // Positionen validieren
  const lineErrors: Record<string, Record<string, string>> = {};
  const normalized = lines.filter((l) => !l.deleted).map((l, i) => {
    const n = normalizeLineInput(l.values);
    if (Object.keys(n.errors).length) lineErrors[l.id ?? `new-${i}`] = n.errors as Record<string, string>;
    return { ...l, values: n.values };
  });
  const nos = normalized.map((l) => l.lineNo);
  if (new Set(nos).size !== nos.length) return { message: "Positionsnummern müssen eindeutig sein." };
  if (Object.keys(headerErrors).length || Object.keys(lineErrors).length) return { message: "Bitte markierte Felder korrigieren.", lineErrors, headerErrors };

  const existing = new Map(inv.lines.map((l) => [l.id, l]));
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const A = (entityType: string, entityId: string, action: string, field?: string, oldValue?: unknown, newValue?: unknown) =>
    audits.push({ tenantId: ctx.tenantId, userId: ctx.userId, action, entityType, entityId, field, oldValue: oldValue as never, newValue: newValue as never });

  await ctx.db.$transaction(async (tx) => {
    const hDiff = diffFields(inv as unknown as Record<string, unknown>, { ...h, invoiceDate: h.invoiceDate ? new Date(h.invoiceDate) : null }, [...HEADER_FIELDS]);
    if (hDiff.length) {
      await tx.invoice.update({ where: { id: inv.id }, data: { ...h, invoiceDate: h.invoiceDate ? new Date(h.invoiceDate) : null, reviewStatus: inv.reviewStatus === "CONFIRMED" ? "NEEDS_REVIEW" : inv.reviewStatus } });
      for (const c of hDiff) A("Invoice", inv.id, "UPDATE", c.field, c.oldValue, c.newValue);
    }
    // Löschungen
    const keep = new Set(normalized.filter((l) => l.id).map((l) => l.id!));
    for (const l of inv.lines) if (!keep.has(l.id)) { await tx.invoiceLine.delete({ where: { id: l.id } }); A("InvoiceLine", l.id, "DELETE", undefined, { lineNo: l.lineNo, ...lineToValues(l) }); }
    // Positionsnummern temporär freimachen (Unique invoiceId+lineNo)
    for (const l of normalized) if (l.id && existing.get(l.id)?.lineNo !== l.lineNo) await tx.invoiceLine.update({ where: { id: l.id }, data: { lineNo: 100000 + l.lineNo } });
    for (const l of normalized) {
      const v = l.values;
      const data = { ...v, preferenceStatus: (v.preferenceStatus ?? "UNKNOWN") as "NONE" | "CLAIMED" | "UNKNOWN", lineNo: l.lineNo };
      if (!l.id) {
        const c = await tx.invoiceLine.create({ data: { ...data, tenantId: ctx.tenantId, invoiceId: inv.id, tariffNumberSource: v.tariffNumber ? "USER" : null, originSource: v.originCountry ? "USER" : null, reviewStatus: "EXTRACTED", fieldMeta: { source: "user" } } });
        A("InvoiceLine", c.id, "CREATE", undefined, undefined, { lineNo: l.lineNo, ...v });
        continue;
      }
      const old = existing.get(l.id)!;
      const changes = diffFields({ ...lineToValues(old), lineNo: old.lineNo } as Record<string, unknown>, { ...v, lineNo: l.lineNo }, [...LINE_FIELDS, "lineNo"]);
      if (!changes.length && old.lineNo === l.lineNo) continue;
      const touched = new Set(changes.map((c) => c.field));
      await tx.invoiceLine.update({ where: { id: l.id }, data: {
        ...data,
        ...(touched.has("tariffNumber") ? { tariffNumberSource: v.tariffNumber ? "USER" : null } : {}),
        ...(touched.has("originCountry") ? { originSource: v.originCountry ? "USER" : null } : {}),
        ...(old.reviewStatus === "CONFIRMED" && changes.length ? { reviewStatus: "NEEDS_REVIEW" } : {}),
      } });
      for (const c of changes) A("InvoiceLine", l.id, "UPDATE", `#${l.lineNo} ${c.field}`, c.oldValue, c.newValue);
    }
    if (audits.length) await tx.auditLog.createMany({ data: audits });
  }, { timeout: 60_000 });

  await recomputeOrder(ctx.db, orderId, ctx.userId);
  revalidatePath(`/auftraege/${orderId}/rechnungen/${invoiceId}`);
  return { ok: true, message: audits.length ? `${audits.length} Änderung(en) gespeichert und protokolliert.` : "Keine Änderungen." };
}

export async function mergeInvoiceLines(orderId: string, invoiceId: string, lineIds: string[]): Promise<{ ok: boolean; message: string }> {
  const ctx = await getContext();
  assertCan(ctx, "invoice.edit");
  let inv;
  try { inv = await loadEditable(ctx, orderId, invoiceId); } catch (e) { return { ok: false, message: (e as Error).message }; }
  const sel = inv.lines.filter((l) => lineIds.includes(l.id)).sort((a, b) => a.lineNo - b.lineNo);
  if (sel.length !== lineIds.length) return { ok: false, message: "Positionen nicht gefunden." };
  const r = mergeLines(sel.map(lineToValues));
  if (!r.ok) return { ok: false, message: r.reason };
  const [first, ...rest] = sel;
  await ctx.db.$transaction(async (tx) => {
    await tx.invoiceLine.update({ where: { id: first.id }, data: { ...r.merged, preferenceStatus: (r.merged.preferenceStatus ?? "UNKNOWN") as "NONE" | "CLAIMED" | "UNKNOWN", reviewStatus: "NEEDS_REVIEW",
      fieldMeta: { source: "merge", mergedFrom: sel.map((l) => ({ id: l.id, lineNo: l.lineNo, values: lineToValues(l) })) } as Prisma.InputJsonValue } });
    await tx.invoiceLine.deleteMany({ where: { id: { in: rest.map((l) => l.id) } } });
    await tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action: "MERGE", entityType: "Invoice", entityId: invoiceId,
      oldValue: sel.map((l) => ({ lineNo: l.lineNo, ...lineToValues(l) })) as Prisma.InputJsonValue, newValue: { lineNo: first.lineNo, ...r.merged, notes: r.notes } as Prisma.InputJsonValue } });
  });
  await recomputeOrder(ctx.db, orderId, ctx.userId);
  revalidatePath(`/auftraege/${orderId}/rechnungen/${invoiceId}`);
  return { ok: true, message: `${sel.length} Positionen zu Pos. ${first.lineNo} zusammengeführt.${r.notes.length ? " " + r.notes.join(" ") : ""}` };
}

/** Fachliche Bestätigung – nur ohne offene kritische Befunde dieser Rechnung. */
export async function confirmInvoice(orderId: string, invoiceId: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await getContext();
  assertCan(ctx, "tariff.confirm");
  let inv;
  try { inv = await loadEditable(ctx, orderId, invoiceId); } catch (e) { return { ok: false, message: (e as Error).message }; }
  await recomputeOrder(ctx.db, orderId, ctx.userId);
  const ids = [inv.id, ...inv.lines.map((l) => l.id)];
  const crit = await ctx.db.validationIssue.count({ where: { orderId, severity: "CRITICAL", resolvedAt: null, entityId: { in: ids } } });
  if (crit) return { ok: false, message: `${crit} kritische Befunde zu dieser Rechnung sind offen – Bestätigung nicht möglich.` };
  if (!inv.lines.length) return { ok: false, message: "Rechnung ohne Positionen kann nicht bestätigt werden." };
  await ctx.db.$transaction([
    ctx.db.invoice.update({ where: { id: inv.id }, data: { reviewStatus: "CONFIRMED" } }),
    ctx.db.invoiceLine.updateMany({ where: { invoiceId: inv.id }, data: { reviewStatus: "CONFIRMED" } }),
    ctx.db.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action: "CONFIRM", entityType: "Invoice", entityId: inv.id, newValue: { lines: inv.lines.length } } }),
  ]);
  revalidatePath(`/auftraege/${orderId}/rechnungen/${invoiceId}`);
  return { ok: true, message: "Rechnung fachlich bestätigt." };
}
