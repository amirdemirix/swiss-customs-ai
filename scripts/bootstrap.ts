/**
 * Läuft bei jedem Deployment (vercel-build). Macht nur etwas, wenn ausdrücklich angefordert:
 *
 *  BOOTSTRAP_RESET=1  → löscht ALLE Daten (alle Firmen, Benutzer, Belege, Protokolle) – aber nur,
 *                       solange noch der Demo-Mandant „demo-zoll“ existiert (danach wirkungslos,
 *                       ein versehentlich stehengelassenes Flag löscht also keine Echtdaten).
 *  BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD_HASH (bcrypt) / BOOTSTRAP_TENANT_NAME
 *                     → legt nach dem Zurücksetzen bzw. in einer leeren Datenbank den ersten
 *                       Administrator an. Das Passwort steht nie im Klartext in der Konfiguration.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const reset = process.env.BOOTSTRAP_RESET === "1";
  const demo = await prisma.tenant.findUnique({ where: { slug: "demo-zoll" } });
  if (reset && demo) {
    const counts = { tenants: await prisma.tenant.count(), users: await prisma.user.count(), documents: await prisma.document.count() };
    await prisma.$transaction([
      prisma.session.deleteMany({}),
      prisma.loginAttempt.deleteMany({}),
      prisma.tenant.deleteMany({}), // Cascade: Aufträge, Rechnungen, Belege (verschlüsselt), Protokolle, Stammdaten
      prisma.user.deleteMany({}),
    ]);
    console.log(`Bootstrap: alle Daten gelöscht (${JSON.stringify(counts)}).`);
  } else if (reset) {
    console.log("Bootstrap: BOOTSTRAP_RESET gesetzt, aber kein Demo-Mandant vorhanden – nichts gelöscht.");
  }

  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const hash = process.env.BOOTSTRAP_ADMIN_PASSWORD_HASH;
  if (username && hash && (await prisma.user.count()) === 0) {
    if (!/^\$2[aby]\$\d{2}\$/.test(hash)) throw new Error("BOOTSTRAP_ADMIN_PASSWORD_HASH ist kein bcrypt-Hash.");
    const name = process.env.BOOTSTRAP_TENANT_NAME?.trim() || "Meine Zollagentur";
    const tenant = await prisma.tenant.create({ data: { name, slug: `firma-${Date.now().toString(36)}` } });
    const user = await prisma.user.create({ data: { email: username, name: username, passwordHash: hash } });
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "ADMIN" } });
    await prisma.groupingProfile.create({ data: { tenantId: tenant.id, name: "Standard CH Einfuhr (konservativ)", isDefault: true,
      keyFields: ["tariffNumber", "statisticalKey", "originCountry", "preferenceStatus", "customsProcedure"], extraKeys: [], requiredFields: ["tariffNumber", "originCountry"] } });
    await prisma.auditLog.create({ data: { tenantId: tenant.id, userId: null, action: "BOOTSTRAP", entityType: "User", entityId: user.id, newValue: { username, tenant: name } } });
    console.log(`Bootstrap: Administrator „${username}“ und Firma „${name}“ angelegt.`);
  }
}
main().finally(() => prisma.$disconnect());
