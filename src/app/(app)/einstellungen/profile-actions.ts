"use server";
import { revalidatePath } from "next/cache";
import { getContext, assertCan } from "@/server/context";
import { GROUPABLE_FIELDS } from "@/domain";
import type { ActionResult } from "@/components/action-form";

const MANDATORY = ["tariffNumber", "originCountry"] as const;

/** Speichert ein Gruppierungsprofil. Tarifnummer und Ursprung sind immer Trenn- und Pflichtmerkmal. */
export async function saveProfile(id: string | null, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "settings.manage");
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Name angeben." };
  const keyFields = GROUPABLE_FIELDS.filter((f) => fd.get(`key.${f}`) === "on" || (MANDATORY as readonly string[]).includes(f));
  const extraKeys = String(fd.get("extraKeys") ?? "").split(",").map((s) => s.trim()).filter(Boolean).filter((s) => /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(s));
  const requiredFields = [...new Set([...MANDATORY, ...GROUPABLE_FIELDS.filter((f) => fd.get(`req.${f}`) === "on" && keyFields.includes(f)),
    ...extraKeys.filter((k) => fd.get(`reqx.${k}`) === "on").map((k) => `extra.${k}`)])];
  const isDefault = fd.get("isDefault") === "on";
  const dup = await ctx.db.groupingProfile.findFirst({ where: { name, ...(id ? { NOT: { id } } : {}) } });
  if (dup) return { error: "Name existiert bereits." };
  const data = { name, keyFields, extraKeys, requiredFields, isDefault };
  const before = id ? await ctx.db.groupingProfile.findFirst({ where: { id } }) : null;
  if (id && !before) return { error: "Profil nicht gefunden." };
  await ctx.db.$transaction(async (tx) => {
    if (isDefault) await tx.groupingProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const p = id ? await tx.groupingProfile.update({ where: { id }, data }) : await tx.groupingProfile.create({ data: { ...data, tenantId: ctx.tenantId } });
    await tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action: id ? "UPDATE" : "CREATE", entityType: "GroupingProfile", entityId: p.id,
      oldValue: before ? { keyFields: before.keyFields, extraKeys: before.extraKeys, requiredFields: before.requiredFields } : undefined, newValue: data } });
  });
  revalidatePath("/einstellungen");
  return { ok: true };
}
