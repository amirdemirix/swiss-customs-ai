"use server";
import { formValues } from "@/lib/utils";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { orderSchema } from "./schema";
import { getContext, assertCan, audit } from "@/server/context";
import { recomputeOrder } from "@/server/services/consolidation";
import type { ActionResult } from "@/components/action-form";
import { canTransition, diffFields, isLocked, type OrderStatus } from "@/domain";

export type FormState = { errors?: Record<string, string[] | undefined>; message?: string; values?: Record<string, string> };

const ORDER_FIELDS = ["orderNumber", "customerId", "direction", "consignor", "consignee", "dispatchCountry", "destinationCountry", "transportMode", "reference", "orderDate", "remarks"] as const;

function normalizeOrder(d: ReturnType<typeof orderSchema.parse>) {
  return {
    ...d,
    customerId: d.customerId ?? null, consignor: d.consignor ?? null, consignee: d.consignee ?? null, dispatchCountry: d.dispatchCountry ?? null,
    destinationCountry: d.destinationCountry ?? null, transportMode: d.transportMode ?? null, reference: d.reference ?? null, remarks: d.remarks || null,
    orderDate: new Date(d.orderDate),
  };
}

export async function createOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getContext();
  assertCan(ctx, "order.write");
  const parsed = orderSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values: formValues(fd) };
  const d = normalizeOrder(parsed.data);
  if (await ctx.db.customsOrder.findFirst({ where: { orderNumber: d.orderNumber } })) return { errors: { orderNumber: ["Auftragsnummer existiert bereits"] }, values: formValues(fd) };
  if (d.customerId && !(await ctx.db.customer.findFirst({ where: { id: d.customerId } }))) return { errors: { customerId: ["Unbekannter Kunde"] }, values: formValues(fd) };
  const profile = await ctx.db.groupingProfile.findFirst({ where: { isDefault: true } });
  const order = await ctx.db.customsOrder.create({ data: { ...d, tenantId: ctx.tenantId, createdById: ctx.userId, groupingProfileId: profile?.id } });
  await audit(ctx, { action: "CREATE", entityType: "CustomsOrder", entityId: order.id, newValue: parsed.data });
  redirect(`/auftraege/${order.id}`);
}

export async function updateOrder(orderId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getContext();
  assertCan(ctx, "order.write");
  const before = await ctx.db.customsOrder.findFirst({ where: { id: orderId } });
  if (!before) return { message: "Auftrag nicht gefunden.", values: formValues(fd) };
  if (isLocked(before.status)) return { message: "Abgeschlossene oder archivierte Aufträge können nicht bearbeitet werden.", values: formValues(fd) };
  const parsed = orderSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values: formValues(fd) };
  const d = normalizeOrder(parsed.data);
  if (d.orderNumber !== before.orderNumber && (await ctx.db.customsOrder.findFirst({ where: { orderNumber: d.orderNumber } })))
    return { errors: { orderNumber: ["Auftragsnummer existiert bereits"] }, values: formValues(fd) };
  if (d.customerId && !(await ctx.db.customer.findFirst({ where: { id: d.customerId } }))) return { errors: { customerId: ["Unbekannter Kunde"] }, values: formValues(fd) };
  const changes = diffFields(before as unknown as Record<string, unknown>, d, [...ORDER_FIELDS]);
  if (changes.length) {
    await ctx.db.$transaction([
      ctx.db.customsOrder.update({ where: { id: orderId }, data: d }),
      ...changes.map((c) => ctx.db.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action: "UPDATE", entityType: "CustomsOrder", entityId: orderId,
        field: c.field, oldValue: c.oldValue as never, newValue: c.newValue as never } })),
    ]);
  }
  redirect(`/auftraege/${orderId}`);
}

export async function changeOrderStatus(orderId: string, to: OrderStatus, _p: ActionResult, _fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "order.write");
  const o = await ctx.db.customsOrder.findFirst({ where: { id: orderId }, include: { _count: { select: { issues: { where: { severity: "CRITICAL", resolvedAt: null } } } } } });
  if (!o) return { error: "Auftrag nicht gefunden." };
  const t = canTransition(o.status, to, o._count.issues);
  if (!t.ok) return { error: t.reason };
  await ctx.db.customsOrder.update({ where: { id: orderId }, data: { status: to } });
  await audit(ctx, { action: "STATUS", entityType: "CustomsOrder", entityId: orderId, field: "status", oldValue: o.status, newValue: to });
  revalidatePath(`/auftraege/${orderId}`);
  return { ok: true };
}

export async function deleteOrder(orderId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "order.delete");
  const o = await ctx.db.customsOrder.findFirst({ where: { id: orderId } });
  if (!o) return { error: "Auftrag nicht gefunden." };
  if (String(fd.get("confirm") ?? "").trim() !== o.orderNumber) return { error: "Bestätigung stimmt nicht mit der Auftragsnummer überein." };
  // Audit-Log bleibt erhalten (keine FK auf den Auftrag)
  await audit(ctx, { action: "DELETE", entityType: "CustomsOrder", entityId: orderId, oldValue: { orderNumber: o.orderNumber, status: o.status } });
  await ctx.db.customsOrder.delete({ where: { id: orderId } });
  redirect("/auftraege");
}

export async function recompute(orderId: string, _p: ActionResult, _fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "order.write");
  const o = await ctx.db.customsOrder.findFirst({ where: { id: orderId }, select: { status: true } });
  if (!o || isLocked(o.status)) return { error: "Auftrag ist gesperrt." };
  await recomputeOrder(ctx.db, orderId, ctx.userId);
  revalidatePath(`/auftraege/${orderId}`);
  return { ok: true };
}
