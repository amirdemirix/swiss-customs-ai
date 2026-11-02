"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getContext, assertCan, audit } from "@/server/context";
import { recomputeOrder } from "@/server/services/consolidation";
import { isLocked } from "@/domain";
import type { ActionResult } from "@/components/action-form";

const schema = z.object({
  fromCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Währung: 3 Buchstaben"),
  rate: z.string().trim().transform((v) => v.replace(/[\s']/g, "").replace(",", ".")).pipe(z.string().regex(/^\d{1,6}(\.\d{1,8})?$/, "Kurs: Zahl mit max. 8 Nachkommastellen")),
  validOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Kursdatum erforderlich"),
  source: z.string().trim().min(2, "Kursquelle angeben (z. B. BAZG Tageskurs)").max(100),
});

/** Erfasst/ersetzt den Kurs einer Währung für den Auftrag – Quelle und Datum sind Pflicht. */
export async function saveRate(orderId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "order.write");
  const o = await ctx.db.customsOrder.findFirst({ where: { id: orderId }, select: { status: true, declarationCurrency: true } });
  if (!o) return { error: "Auftrag nicht gefunden." };
  if (isLocked(o.status)) return { error: "Auftrag ist abgeschlossen." };
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join(" · ") };
  const d = p.data;
  if (d.fromCurrency === o.declarationCurrency) return { error: `Für ${o.declarationCurrency} ist kein Kurs nötig.` };
  if (Number(d.rate) <= 0) return { error: "Kurs muss grösser als 0 sein." };
  const prev = await ctx.db.exchangeRate.findFirst({ where: { orderId, fromCurrency: d.fromCurrency, toCurrency: o.declarationCurrency } });
  if (prev) await ctx.db.exchangeRate.delete({ where: { id: prev.id } });
  const r = await ctx.db.exchangeRate.create({ data: { tenantId: ctx.tenantId, orderId, fromCurrency: d.fromCurrency, toCurrency: o.declarationCurrency, rate: d.rate, validOn: new Date(d.validOn), source: d.source, enteredById: ctx.userId } });
  await audit(ctx, { action: prev ? "UPDATE" : "CREATE", entityType: "ExchangeRate", entityId: r.id, field: `${d.fromCurrency}/${o.declarationCurrency}`,
    oldValue: prev ? { rate: prev.rate.toString(), validOn: prev.validOn, source: prev.source } : undefined, newValue: d });
  await recomputeOrder(ctx.db, orderId, ctx.userId);
  revalidatePath(`/auftraege/${orderId}`);
  return { ok: true };
}

export async function deleteRate(orderId: string, rateId: string, _p: ActionResult, _fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "order.write");
  const r = await ctx.db.exchangeRate.findFirst({ where: { id: rateId, orderId }, include: { order: { select: { status: true } } } });
  if (!r) return { error: "Kurs nicht gefunden." };
  if (r.order && isLocked(r.order.status)) return { error: "Auftrag ist abgeschlossen." };
  await ctx.db.exchangeRate.delete({ where: { id: r.id } });
  await audit(ctx, { action: "DELETE", entityType: "ExchangeRate", entityId: r.id, oldValue: { pair: `${r.fromCurrency}/${r.toCurrency}`, rate: r.rate.toString(), source: r.source } });
  await recomputeOrder(ctx.db, orderId, ctx.userId);
  revalidatePath(`/auftraege/${orderId}`);
  return { ok: true };
}
