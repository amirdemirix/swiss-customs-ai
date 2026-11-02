"use server";
import { formValues } from "@/lib/utils";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContext, assertCan, audit } from "@/server/context";
import { diffFields } from "@/domain";
import { customerSchema, articleSchema } from "./schema";

export type FormState = { errors?: Record<string, string[] | undefined>; message?: string; ok?: boolean; values?: Record<string, string> };

export async function saveCustomer(id: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getContext();
  assertCan(ctx, "customer.write");
  const p = customerSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { errors: p.error.flatten().fieldErrors, values: formValues(fd) };
  const d = p.data;
  if (d.number) {
    const dup = await ctx.db.customer.findFirst({ where: { number: d.number, ...(id ? { NOT: { id } } : {}) } });
    if (dup) return { errors: { number: ["Kundennummer existiert bereits"] }, values: formValues(fd) };
  }
  if (!id) {
    const c = await ctx.db.customer.create({ data: { ...d, tenantId: ctx.tenantId } });
    await audit(ctx, { action: "CREATE", entityType: "Customer", entityId: c.id, newValue: d });
    redirect(`/kunden/${c.id}`);
  }
  const before = await ctx.db.customer.findFirst({ where: { id } });
  if (!before) return { message: "Kunde nicht gefunden.", values: formValues(fd) };
  const changes = diffFields(before as unknown as Record<string, unknown>, d, ["name", "number", "uid", "address", "country"]);
  await ctx.db.customer.update({ where: { id }, data: d });
  for (const c of changes) await audit(ctx, { action: "UPDATE", entityType: "Customer", entityId: id, field: c.field, oldValue: c.oldValue, newValue: c.newValue });
  revalidatePath(`/kunden/${id}`);
  return { ok: true, message: changes.length ? "Gespeichert." : "Keine Änderungen." };
}

export async function saveArticle(customerId: string, _p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getContext();
  assertCan(ctx, "tariff.confirm");
  if (!(await ctx.db.customer.findFirst({ where: { id: customerId } }))) return { message: "Kunde nicht gefunden.", values: formValues(fd) };
  const p = articleSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { errors: p.error.flatten().fieldErrors, values: formValues(fd) };
  const d = p.data;
  const existing = await ctx.db.articleMaster.findFirst({ where: { customerId, articleNumber: d.articleNumber } });
  const data = { ...d, confirmedById: ctx.userId, confirmedAt: new Date() };
  if (existing) {
    await ctx.db.articleMaster.update({ where: { id: existing.id }, data });
    for (const c of diffFields(existing as unknown as Record<string, unknown>, d, ["description", "tariffNumber", "statisticalKey", "originCountry"]))
      await audit(ctx, { action: "UPDATE", entityType: "ArticleMaster", entityId: existing.id, field: c.field, oldValue: c.oldValue, newValue: c.newValue });
  } else {
    const a = await ctx.db.articleMaster.create({ data: { ...data, tenantId: ctx.tenantId, customerId } });
    await audit(ctx, { action: "CREATE", entityType: "ArticleMaster", entityId: a.id, newValue: d });
  }
  revalidatePath(`/kunden/${customerId}`);
  return { ok: true, message: existing ? `Artikel ${d.articleNumber} aktualisiert.` : `Artikel ${d.articleNumber} angelegt.` };
}

export async function deleteArticle(customerId: string, articleId: string) {
  const ctx = await getContext();
  assertCan(ctx, "tariff.confirm");
  const a = await ctx.db.articleMaster.findFirst({ where: { id: articleId, customerId } });
  if (!a) return;
  await ctx.db.articleMaster.delete({ where: { id: a.id } });
  await audit(ctx, { action: "DELETE", entityType: "ArticleMaster", entityId: a.id, oldValue: { articleNumber: a.articleNumber, tariffNumber: a.tariffNumber, originCountry: a.originCountry } });
  revalidatePath(`/kunden/${customerId}`);
}
