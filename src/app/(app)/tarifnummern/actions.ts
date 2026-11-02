"use server";
import { revalidatePath } from "next/cache";
import { getContext, assertCan, audit } from "@/server/context";
import { readCsv, readXlsx } from "@/server/parsing/spreadsheet";
import { detectFileType, parseTariffDataset } from "@/domain";

export type ImportTariffState = { ok?: boolean; message?: string };

/** Import eines Tarif-Datenstands (CSV/XLSX-Export aus einer offiziellen Quelle). Ersetzt den aktiven Stand. */
export async function importTariffDataset(_p: ImportTariffState, fd: FormData): Promise<ImportTariffState> {
  const ctx = await getContext();
  assertCan(ctx, "settings.manage");
  const file = fd.get("file");
  const name = String(fd.get("name") ?? "").trim();
  const source = String(fd.get("source") ?? "").trim();
  const validFrom = String(fd.get("validFrom") ?? "");
  if (!(file instanceof File) || !file.size) return { message: "Bitte Datei wählen." };
  if (name.length < 2 || source.length < 2) return { message: "Bezeichnung und Quelle sind Pflicht (Nachvollziehbarkeit des Datenstands)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) return { message: "Gültig-ab-Datum angeben." };
  const data = Buffer.from(await file.arrayBuffer());
  const t = detectFileType(data, file.name);
  if (!t.ok || (t.type !== "CSV" && t.type !== "XLSX")) return { message: t.ok ? "Nur CSV oder XLSX." : t.reason };
  const sheets = t.type === "XLSX" ? await readXlsx(data) : readCsv(data);
  const r = parseTariffDataset(sheets[0]?.rows ?? []);
  if (r.error) return { message: r.error };
  if (!r.entries.length) return { message: "Keine gültigen Einträge gefunden." };

  await ctx.db.$transaction(async (tx) => {
    await tx.tariffDataset.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const ds = await tx.tariffDataset.create({ data: { tenantId: ctx.tenantId, name, source, validFrom: new Date(validFrom), isActive: true, entryCount: r.entries.length, importedById: ctx.userId } });
    for (let i = 0; i < r.entries.length; i += 2000)
      await tx.tariffEntry.createMany({ data: r.entries.slice(i, i + 2000).map((e) => ({ ...e, tenantId: ctx.tenantId, datasetId: ds.id })) });
    await tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action: "TARIFF_IMPORT", entityType: "TariffDataset", entityId: ds.id, newValue: { name, source, validFrom, entries: r.entries.length, skipped: r.skipped, file: file.name } } });
  }, { timeout: 120_000 });
  revalidatePath("/tarifnummern");
  return { ok: true, message: `${r.entries.length} Einträge importiert${r.skipped ? `, ${r.skipped} Zeilen übersprungen (ungültig/doppelt)` : ""}. Datenstand ist aktiv; Aufträge werden bei der nächsten Prüfung abgeglichen.` };
}

export async function deactivateDataset(id: string) {
  const ctx = await getContext();
  assertCan(ctx, "settings.manage");
  await ctx.db.tariffDataset.updateMany({ where: { id }, data: { isActive: false } });
  await audit(ctx, { action: "TARIFF_DEACTIVATE", entityType: "TariffDataset", entityId: id });
  revalidatePath("/tarifnummern");
}
