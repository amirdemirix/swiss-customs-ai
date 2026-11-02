import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { login, resolveSession, logout, switchTenant } from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { hashToken } from "@/server/auth/token";
import { RateLimiter } from "@/server/auth/rate-limit";

const prisma = new PrismaClient();
const s = `${Date.now()}`;
const email = `auth-${s}@test.invalid`;
const PW = "Sicheres-Passwort-2026";
let A: string, B: string, userId: string;
const lim = () => new RateLimiter(100, 60_000);

beforeAll(async () => {
  A = (await prisma.tenant.create({ data: { name: "Auth A", slug: `auth-a-${s}` } })).id;
  B = (await prisma.tenant.create({ data: { name: "Auth B", slug: `auth-b-${s}` } })).id;
  userId = (await prisma.user.create({ data: { email, name: "Auth Test", passwordHash: await hashPassword(PW) } })).id;
  await prisma.membership.create({ data: { tenantId: A, userId, role: "DECLARANT" } });
});
afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("Anmeldung & Sessions", () => {
  it("falsches Passwort und unbekannter Benutzer liefern dieselbe Antwort", async () => {
    expect(await login(prisma, { email, password: "falsch" }, lim())).toEqual({ ok: false, reason: "INVALID" });
    expect(await login(prisma, { email: `nobody-${s}@test.invalid`, password: PW }, lim())).toEqual({ ok: false, reason: "INVALID" });
  });
  it("erfolgreiche Anmeldung speichert nur den Token-Hash", async () => {
    const r = await login(prisma, { email: email.toUpperCase(), password: PW, ip: "10.0.0.1" }, lim());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = await prisma.session.findFirst({ where: { userId } });
    expect(row?.tokenHash).toBe(hashToken(r.token));
    expect(JSON.stringify(row)).not.toContain(r.token);
    const info = await resolveSession(prisma, r.token);
    expect(info).toMatchObject({ userId, tenantId: A, role: "DECLARANT" });
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: A, action: "LOGIN", entityId: userId } });
    expect(audit).not.toBeNull();
  });
  it("ungültige oder manipulierte Tokens werden abgewiesen", async () => {
    expect(await resolveSession(prisma, "x".repeat(43))).toBeNull();
    expect(await resolveSession(prisma, "")).toBeNull();
    expect(await resolveSession(prisma, "y".repeat(500))).toBeNull();
  });
  it("abgelaufene Session wird abgewiesen und gelöscht", async () => {
    const r = await login(prisma, { email, password: PW }, lim());
    if (!r.ok) throw new Error();
    await prisma.session.update({ where: { tokenHash: hashToken(r.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveSession(prisma, r.token)).toBeNull();
    expect(await prisma.session.findUnique({ where: { tokenHash: hashToken(r.token) } })).toBeNull();
  });
  it("entzogene Mitgliedschaft wirkt sofort", async () => {
    const r = await login(prisma, { email, password: PW }, lim());
    if (!r.ok) throw new Error();
    await prisma.membership.create({ data: { tenantId: B, userId, role: "READ_ONLY" } });
    const info = await resolveSession(prisma, r.token);
    expect(await switchTenant(prisma, info!.sessionId, userId, B)).toBe(true);
    expect((await resolveSession(prisma, r.token))?.role).toBe("READ_ONLY");
    await prisma.membership.deleteMany({ where: { tenantId: B, userId } });
    expect(await resolveSession(prisma, r.token)).toBeNull();
  });
  it("Wechsel in fremden Mandanten ohne Mitgliedschaft ist nicht möglich", async () => {
    const r = await login(prisma, { email, password: PW }, lim());
    if (!r.ok) throw new Error();
    const info = await resolveSession(prisma, r.token);
    expect(await switchTenant(prisma, info!.sessionId, userId, B)).toBe(false);
    expect((await resolveSession(prisma, r.token))?.tenantId).toBe(A);
  });
  it("deaktivierter Benutzer kann sich nicht anmelden und verliert Sessions", async () => {
    const r = await login(prisma, { email, password: PW }, lim());
    if (!r.ok) throw new Error();
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    expect(await resolveSession(prisma, r.token)).toBeNull();
    expect((await login(prisma, { email, password: PW }, lim())).ok).toBe(false);
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
  });
  it("Abmelden löscht die Session", async () => {
    const r = await login(prisma, { email, password: PW }, lim());
    if (!r.ok) throw new Error();
    await logout(prisma, r.token);
    expect(await resolveSession(prisma, r.token)).toBeNull();
  });
  it("Rate-Limit greift auch bei korrektem Passwort", async () => {
    const l = new RateLimiter(2, 60_000);
    await login(prisma, { email, password: "x", ip: "1.1.1.1" }, l);
    await login(prisma, { email, password: "x", ip: "1.1.1.1" }, l);
    expect(await login(prisma, { email, password: PW, ip: "1.1.1.1" }, l)).toMatchObject({ ok: false, reason: "RATE_LIMITED" });
  });
});
