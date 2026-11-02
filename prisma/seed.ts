/**
 * Synthetische Testdaten – KEINE echten Kunden- oder Rechnungsdaten.
 * Tarifnummern sind formal gültige Beispielwerte und keine geprüfte Tarifeinreihung.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { tenantDb } from "../src/server/tenant-db";
import { recomputeOrder } from "../src/server/services/consolidation";

const prisma = new PrismaClient();

// Deterministischer Zufall für reproduzierbare Testdaten
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

async function main() {
  // --if-empty: nur seeden, wenn der Demo-Mandant noch nicht existiert (für Deployments)
  if (process.argv.includes("--if-empty") && (await prisma.tenant.findUnique({ where: { slug: "demo-zoll" } }))) {
    console.log("Demo-Daten vorhanden – Seed übersprungen.");
    return;
  }
  await prisma.tenant.deleteMany({ where: { slug: { in: ["demo-zoll", "andere-agentur"] } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@example.ch" } } });

  const pw = await bcrypt.hash("Demo-Passwort-2026!", 12);
  const tenant = await prisma.tenant.create({ data: { name: "Demo Zollagentur AG", slug: "demo-zoll" } });
  const other = await prisma.tenant.create({ data: { name: "Andere Agentur GmbH", slug: "andere-agentur" } });

  const users = [
    { email: "admin@example.ch", name: "Anna Admin", role: "ADMIN" as const },
    { email: "deklarant@example.ch", name: "Dario Deklarant", role: "DECLARANT" as const },
    { email: "pruefer@example.ch", name: "Petra Prüferin", role: "REVIEWER" as const },
    { email: "leser@example.ch", name: "Lukas Leser", role: "READ_ONLY" as const },
  ];
  const created = [];
  for (const u of users) {
    const user = await prisma.user.create({ data: { email: u.email, name: u.name, passwordHash: pw } });
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: u.role } });
    created.push(user);
  }
  const otherAdmin = await prisma.user.create({ data: { email: "admin.andere@example.ch", name: "Otto Andere", passwordHash: pw } });
  await prisma.membership.create({ data: { tenantId: other.id, userId: otherAdmin.id, role: "ADMIN" } });

  const db = tenantDb(tenant.id);
  const admin = created[0];
  const profile = await db.groupingProfile.create({ data: {
    tenantId: tenant.id, name: "Standard CH Einfuhr (konservativ)", isDefault: true,
    keyFields: ["tariffNumber", "statisticalKey", "originCountry", "preferenceStatus", "customsProcedure"], extraKeys: [], requiredFields: ["tariffNumber", "originCountry"] } });

  const [textil, technik] = await Promise.all([
    db.customer.create({ data: { tenantId: tenant.id, name: "Muster Textil AG", number: "K-1001", country: "CH" } }),
    db.customer.create({ data: { tenantId: tenant.id, name: "Beispiel Technik GmbH", number: "K-1002", country: "CH" } }),
  ]);

  // ── Auftrag 1: Beispiel aus der Anforderung ──
  const o1 = await db.customsOrder.create({ data: { tenantId: tenant.id, orderNumber: "ZA-2026-0001", customerId: textil.id, direction: "IMPORT",
    consignor: "Sample Supplier Ltd", consignee: "Muster Textil AG", dispatchCountry: "DE", destinationCountry: "CH", transportMode: "ROAD",
    reference: "REF-BEISPIEL", orderDate: new Date("2026-10-28"), createdById: admin.id, groupingProfileId: profile.id } });
  const mk = (inv: string, no: number, t: string, o: string, amt: string, desc: string, art: string, nw: string, gw: string, qty = "100") => ({
    tenantId: tenant.id, invoiceId: inv, lineNo: no, tariffNumber: t, tariffNumberSource: "INVOICE" as const, statisticalKey: "000", originCountry: o,
    originSource: "INVOICE" as const, preferenceStatus: "NONE" as const, customsProcedure: "STD", quantity: qty, unit: "PCE",
    unitPrice: new Prisma.Decimal(amt).div(qty).toString(), lineAmount: amt, netWeightKg: nw, grossWeightKg: gw, description: desc, articleNumber: art });
  const r1 = await db.invoice.create({ data: { tenantId: tenant.id, orderId: o1.id, invoiceNumber: "R-1", invoiceDate: new Date("2026-10-20"), supplierName: "Sample Supplier Ltd", currency: "CHF", totalAmount: "1200" } });
  const r2 = await db.invoice.create({ data: { tenantId: tenant.id, orderId: o1.id, invoiceNumber: "R-2", invoiceDate: new Date("2026-10-21"), supplierName: "Sample Supplier Ltd", currency: "CHF", totalAmount: "2100" } });
  await db.invoiceLine.createMany({ data: [
    mk(r1.id, 1, "6109.1000", "CN", "500", "T-Shirt Baumwolle, gestrickt", "TS-100", "18.500", "20.100"),
    mk(r1.id, 2, "6109.1000", "TR", "700", "T-Shirt Baumwolle, gestrickt", "TS-200", "22.000", "24.300"),
    mk(r2.id, 1, "6109.1000", "CN", "900", "T-Shirt Baumwolle, gestrickt", "TS-100", "31.250", "34.000", "180"),
    mk(r2.id, 2, "8504.4000", "DE", "1200", "Netzteil 24 V", "PSU-24", "9.600", "12.800", "40"),
  ] as never });

  // ── Auftrag 2: Grossauftrag 35 Rechnungen / ~650 Positionen ──
  const o2 = await db.customsOrder.create({ data: { tenantId: tenant.id, orderNumber: "ZA-2026-0002", customerId: technik.id, direction: "IMPORT",
    consignee: "Beispiel Technik GmbH", dispatchCountry: "DE", destinationCountry: "CH", transportMode: "ROAD", reference: "SAMMEL-KW44",
    orderDate: new Date("2026-10-30"), createdById: admin.id, groupingProfileId: profile.id } });
  await db.exchangeRate.createMany({ data: [
    { tenantId: tenant.id, orderId: o2.id, fromCurrency: "EUR", toCurrency: "CHF", rate: "0.93250000", validOn: new Date("2026-10-30"), source: "Testkurs (synthetisch, nicht offiziell)" },
    { tenantId: tenant.id, orderId: o2.id, fromCurrency: "USD", toCurrency: "CHF", rate: "0.80120000", validOn: new Date("2026-10-30"), source: "Testkurs (synthetisch, nicht offiziell)" },
  ] });
  const tariffs = Array.from({ length: 45 }, (_, i) => `${8471 + Math.floor(i / 9)}.${String(1000 + (i % 9) * 1000).padStart(4, "0")}`);
  const origins = ["CN", "DE", "TR", "IT", "VN", "IN", "US", "JP", "KR", "PL", "CZ", "TW"];
  const suppliers = ["Alpha Components GmbH", "Beta Electronics Co.", "Gamma Parts S.p.A.", "Delta Supply Inc.", "Epsilon Trade Ltd"];
  // Artikelstamm: jede Artikelnummer hat feste Tarifnummer & Ursprung
  const articles = Array.from({ length: 220 }, (_, i) => ({ no: `ART-${String(i + 1).padStart(4, "0")}`, t: pick(tariffs), o: pick(origins), price: (5 + rnd() * 400).toFixed(2), kg: (0.05 + rnd() * 4).toFixed(3) }));
  let total = 0;
  for (let i = 1; i <= 35; i++) {
    const cur = i % 7 === 0 ? "USD" : i % 3 === 0 ? "CHF" : "EUR";
    const n = i === 35 ? 650 - total : 14 + Math.floor(rnd() * 10);
    total += n;
    const lines = Array.from({ length: n }, (_, k) => {
      const a = pick(articles);
      const qty = 1 + Math.floor(rnd() * 50);
      const amount = new Prisma.Decimal(a.price).times(qty);
      const nw = new Prisma.Decimal(a.kg).times(qty);
      return { tenantId: tenant.id, lineNo: k + 1, articleNumber: a.no, description: `Elektronikkomponente ${a.no}`, tariffNumber: a.t, tariffNumberSource: "INVOICE" as const,
        statisticalKey: "000", originCountry: a.o, originSource: "INVOICE" as const, preferenceStatus: "NONE" as const, customsProcedure: "STD",
        quantity: String(qty), unit: "PCE", unitPrice: a.price, lineAmount: amount.toFixed(2), netWeightKg: nw.toFixed(3), grossWeightKg: nw.times(1.12).toFixed(3) };
    });
    // Bewusst eingebaute Fehler zur Demonstration der Prüfungen
    if (i === 4) lines[2].originCountry = null as never;
    if (i === 9) lines[0].tariffNumber = "8471.30";
    if (i === 12) lines[5].grossWeightKg = null as never;
    if (i === 17) lines[1].originCountry = lines[1].originCountry === "CN" ? "VN" : "CN";
    const sumLines = lines.reduce((s, l) => s.plus(l.lineAmount), new Prisma.Decimal(0));
    const invTotal = i === 22 ? sumLines.plus(150) : sumLines; // Rechnung 22: Total stimmt nicht
    const content = `synthetic-invoice-${i}`;
    const doc = await db.document.create({ data: { tenantId: tenant.id, orderId: o2.id, fileName: `rechnung_${String(i).padStart(2, "0")}.pdf`, mimeType: "application/pdf",
      sizeBytes: 48000 + i, sha256: createHash("sha256").update(content).digest("hex"), storageKey: `synthetic/${i}`, kind: "PDF_TEXT", status: "EXTRACTED", uploadedById: admin.id } });
    await db.invoice.create({ data: { tenantId: tenant.id, orderId: o2.id, documentId: doc.id, invoiceNumber: `INV-${26000 + i}`, invoiceDate: new Date(`2026-10-${String(1 + (i % 28)).padStart(2, "0")}`),
      supplierName: suppliers[i % suppliers.length], currency: cur, totalAmount: invTotal.toFixed(2), lines: { create: lines as never } } });
  }

  // ── Fremder Mandant: darf nie sichtbar sein ──
  const odb = tenantDb(other.id);
  await odb.customsOrder.create({ data: { tenantId: other.id, orderNumber: "FREMD-0001", direction: "IMPORT", orderDate: new Date("2026-10-01"), createdById: otherAdmin.id } });

  for (const o of [o1, o2]) console.log(o.orderNumber, await recomputeOrder(db, o.id, admin.id));
  console.log(`Seed abgeschlossen: Mandant ${tenant.slug}, ${total + 4} Positionen. Login: admin@example.ch (auch deklarant@, pruefer@, leser@example.ch) / Demo-Passwort-2026!`);
}

main().finally(() => prisma.$disconnect());
