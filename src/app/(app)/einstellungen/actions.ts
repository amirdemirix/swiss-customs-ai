"use server";
import { formValues } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { getContext, assertCan, audit, type RequestContext } from "@/server/context";
import { prismaRoot } from "@/server/db";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";
import type { ActionResult } from "@/components/action-form";
import { checkMembershipChange, diffFields } from "@/domain";
import { newUserSchema, roleEnum, tenantSettingsSchema } from "./schema";

export type FormState = { errors?: Record<string, string[] | undefined>; message?: string; ok?: boolean; values?: Record<string, string> };

export async function saveTenantSettings(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getContext();
  assertCan(ctx, "settings.manage");
  const p = tenantSettingsSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { errors: p.error.flatten().fieldErrors, values: formValues(fd) };
  const before = await prismaRoot.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  const changes = diffFields(before as unknown as Record<string, unknown>, p.data as Record<string, unknown>, ["name", "retentionDays", "reviewConfidenceThreshold"]);
  await prismaRoot.tenant.update({ where: { id: ctx.tenantId }, data: p.data });
  for (const c of changes)
    await audit(ctx, { action: "UPDATE", entityType: "Tenant", entityId: ctx.tenantId, field: c.field, oldValue: c.oldValue, newValue: c.newValue });
  revalidatePath("/einstellungen");
  return { ok: true, message: changes.length ? "Gespeichert." : "Keine Änderungen." };
}

/** KI-Freigabe: nur mit ausdrücklicher Bestätigung; protokolliert mit Benutzer und Zeitpunkt. */
export async function setAiConsent(grant: boolean, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "settings.manage");
  if (grant && fd.get("confirm") !== "on") return { error: "Bitte die Bestätigung ankreuzen, um die KI-Verarbeitung freizugeben." };
  await prismaRoot.tenant.update({
    where: { id: ctx.tenantId },
    data: grant
      ? { aiProcessingConsent: true, aiConsentGrantedAt: new Date(), aiConsentGrantedById: ctx.userId }
      : { aiProcessingConsent: false, aiConsentGrantedAt: null, aiConsentGrantedById: null },
  });
  await audit(ctx, { action: grant ? "AI_CONSENT_GRANTED" : "AI_CONSENT_REVOKED", entityType: "Tenant", entityId: ctx.tenantId, field: "aiProcessingConsent", oldValue: !grant, newValue: grant });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function addUser(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getContext();
  assertCan(ctx, "users.manage");
  const p = newUserSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { errors: p.error.flatten().fieldErrors, values: formValues(fd) };
  const d = p.data;
  let user = await prismaRoot.user.findUnique({ where: { email: d.email } });
  if (user) {
    if (await prismaRoot.membership.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: user.id } } }))
      return { errors: { email: ["Benutzer ist bereits Mitglied"] }, values: formValues(fd) };
    // Bestehendes Konto (z. B. anderer Mandant) behält sein Passwort – nur Mitgliedschaft wird angelegt.
  } else {
    const pe = checkPasswordPolicy(d.password);
    if (pe.length) return { errors: { password: pe }, values: formValues(fd) };
    user = await prismaRoot.user.create({ data: { email: d.email, name: d.name, passwordHash: await hashPassword(d.password) } });
  }
  await ctx.db.membership.create({ data: { tenantId: ctx.tenantId, userId: user.id, role: d.role } });
  await audit(ctx, { action: "MEMBER_ADDED", entityType: "User", entityId: user.id, newValue: { email: d.email, role: d.role } });
  revalidatePath("/einstellungen");
  return { ok: true, message: `${d.email} hinzugefügt.` };
}

const adminCount = (ctx: RequestContext) => ctx.db.membership.count({ where: { role: "ADMIN" } });

export async function changeRole(userId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "users.manage");
  const role = roleEnum.parse(fd.get("role"));
  const m = await ctx.db.membership.findFirst({ where: { userId } });
  if (!m) return { error: "Mitglied nicht gefunden." };
  if (m.role === role) return {};
  const chk = checkMembershipChange({ actorUserId: ctx.userId, targetUserId: userId, targetCurrentRole: m.role, newRole: role, adminCount: await adminCount(ctx) });
  if (!chk.ok) return { error: chk.reason };
  await ctx.db.membership.update({ where: { id: m.id }, data: { role } });
  await audit(ctx, { action: "ROLE_CHANGED", entityType: "User", entityId: userId, field: "role", oldValue: m.role, newValue: role });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function removeMember(userId: string, _p: ActionResult, _fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  assertCan(ctx, "users.manage");
  const m = await ctx.db.membership.findFirst({ where: { userId } });
  if (!m) return {};
  const chk = checkMembershipChange({ actorUserId: ctx.userId, targetUserId: userId, targetCurrentRole: m.role, newRole: null, adminCount: await adminCount(ctx) });
  if (!chk.ok) return { error: chk.reason };
  await ctx.db.membership.delete({ where: { id: m.id } });
  // Sitzungen dieses Benutzers im Mandanten sofort beenden
  await prismaRoot.session.deleteMany({ where: { userId, tenantId: ctx.tenantId } });
  await audit(ctx, { action: "MEMBER_REMOVED", entityType: "User", entityId: userId, oldValue: { role: m.role } });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function changeOwnPassword(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getContext();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("repeat") ?? "")) return { errors: { repeat: ["Passwörter stimmen nicht überein"] }, values: formValues(fd) };
  const pe = checkPasswordPolicy(next);
  if (pe.length) return { errors: { next: pe }, values: formValues(fd) };
  const u = await prismaRoot.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!(await verifyPassword(current, u.passwordHash))) return { errors: { current: ["Aktuelles Passwort ist falsch"] }, values: formValues(fd) };
  await prismaRoot.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
  await prismaRoot.session.deleteMany({ where: { userId: u.id, NOT: { id: ctx.sessionId } } });
  await audit(ctx, { action: "PASSWORD_CHANGED", entityType: "User", entityId: u.id });
  return { ok: true, message: "Passwort geändert. Andere Sitzungen wurden abgemeldet." };
}
