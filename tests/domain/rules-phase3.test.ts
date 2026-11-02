import { describe, expect, it } from "vitest";
import { canTransition, isLocked, diffFields, checkMembershipChange } from "@/domain";
import { can, PERMISSIONS } from "@/server/auth/permissions";
import { checkPasswordPolicy } from "@/server/auth/password";
import { RateLimiter } from "@/server/auth/rate-limit";
import { hashToken, newSessionToken } from "@/server/auth/token";

describe("Rollen & Berechtigungen", () => {
  it("Nur-Lesen darf nichts schreiben", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can("READ_ONLY", p)).toBe(false);
  });
  it("Prüfer darf Tarif bestätigen, aber keine Aufträge anlegen oder exportieren", () => {
    expect(can("REVIEWER", "tariff.confirm")).toBe(true);
    expect(can("REVIEWER", "order.write")).toBe(false);
    expect(can("REVIEWER", "export.create")).toBe(false);
  });
  it("Deklarant darf Aufträge bearbeiten, aber nicht löschen oder Benutzer verwalten", () => {
    expect(can("DECLARANT", "order.write")).toBe(true);
    expect(can("DECLARANT", "order.delete")).toBe(false);
    expect(can("DECLARANT", "users.manage")).toBe(false);
  });
  it("Administrator darf alles", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can("ADMIN", p)).toBe(true);
  });
});

describe("Schutz vor Aussperrung", () => {
  const base = { actorUserId: "a", targetUserId: "b", targetCurrentRole: "ADMIN" as const, adminCount: 2 };
  it("letzter Admin kann nicht herabgestuft oder entfernt werden", () => {
    expect(checkMembershipChange({ ...base, adminCount: 1, newRole: "DECLARANT" }).ok).toBe(false);
    expect(checkMembershipChange({ ...base, adminCount: 1, newRole: null }).ok).toBe(false);
  });
  it("Admin kann sich nicht selbst herabstufen oder entfernen", () => {
    expect(checkMembershipChange({ ...base, targetUserId: "a", newRole: "READ_ONLY" }).ok).toBe(false);
    expect(checkMembershipChange({ ...base, targetUserId: "a", targetCurrentRole: "DECLARANT", newRole: null }).ok).toBe(false);
  });
  it("zweiter Admin kann herabgestuft werden", () => {
    expect(checkMembershipChange({ ...base, newRole: "DECLARANT" }).ok).toBe(true);
  });
});

describe("Auftragsstatus", () => {
  it("Abschliessen nur ohne offene kritische Befunde", () => {
    expect(canTransition("READY", "COMPLETED", 0).ok).toBe(true);
    expect(canTransition("READY", "COMPLETED", 2)).toMatchObject({ ok: false });
  });
  it("unzulässige Wechsel werden abgewiesen", () => {
    expect(canTransition("NEEDS_REVIEW", "COMPLETED", 0).ok).toBe(false);
    expect(canTransition("PROCESSING", "ARCHIVED", 0).ok).toBe(false);
  });
  it("abgeschlossene und archivierte Aufträge sind gesperrt", () => {
    expect(isLocked("COMPLETED")).toBe(true);
    expect(isLocked("ARCHIVED")).toBe(true);
    expect(isLocked("READY")).toBe(false);
  });
});

describe("Änderungsprotokoll", () => {
  it("erkennt nur echte Änderungen", () => {
    const before: Record<string, unknown> = { a: "x", b: null, c: new Date("2026-01-01T00:00:00Z"), d: "same" };
    const ch = diffFields(before, { a: "y", b: "", c: new Date("2026-01-01T00:00:00Z"), d: "same" }, ["a", "b", "c", "d"]);
    expect(ch).toEqual([{ field: "a", oldValue: "x", newValue: "y" }]);
  });
});

describe("Authentifizierung – Bausteine", () => {
  it("Passwortrichtlinie", () => {
    expect(checkPasswordPolicy("kurz")).not.toHaveLength(0);
    expect(checkPasswordPolicy("alleskleinmit1ziffer")).toContain("Gross- und Kleinbuchstaben");
    expect(checkPasswordPolicy("Sicheres-Passwort-2026")).toEqual([]);
  });
  it("Rate-Limit sperrt nach 5 Versuchen und gibt nach Ablauf frei", () => {
    let t = 0;
    const rl = new RateLimiter(5, 1000, () => t);
    for (let i = 0; i < 5; i++) expect(rl.check("k").allowed).toBe(true);
    expect(rl.check("k").allowed).toBe(false);
    expect(rl.check("anderer").allowed).toBe(true);
    t = 1001;
    expect(rl.check("k").allowed).toBe(true);
  });
  it("Session-Token sind zufällig, nur der Hash wird gespeichert", () => {
    const a = newSessionToken(), b = newSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});
