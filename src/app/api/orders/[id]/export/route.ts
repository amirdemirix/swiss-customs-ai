import { NextResponse } from "next/server";
import { getContextOrNull, can } from "@/server/context";
import { loadExportData } from "@/server/export/data";
import { buildOrderWorkbook } from "@/server/export/excel";
import { DeclarationNotReadyError, neutralJsonAdapter } from "@/server/export/declaration";
import { sha256 } from "@/server/storage/crypto";

import { contentDisposition } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Erzeugt einen Export aus dem aktuellen Datenstand und protokolliert ihn (inkl. SHA-256),
 * damit jede ausgegebene Datei nachvollziehbar bleibt.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContextOrNull();
  if (!ctx) return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
  if (!can(ctx.role, "export.create")) return NextResponse.json({ message: "Keine Berechtigung für Exporte." }, { status: 403 });
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
  const order = await ctx.db.customsOrder.findFirst({ where: { id }, select: { id: true, orderNumber: true, status: true } });
  if (!order) return NextResponse.json({ message: "Auftrag nicht gefunden." }, { status: 404 });

  const data = await loadExportData(ctx.db, id);
  const meta = { userName: ctx.userName, generatedAt: new Date() };
  let body: Buffer, fileName: string, contentType: string, kind: "EXCEL_OVERVIEW" | "DECLARATION_JSON";
  if (format === "json") {
    try {
      const r = neutralJsonAdapter.build(data, meta);
      body = Buffer.from(r.body, "utf8"); fileName = r.fileName; contentType = r.contentType; kind = "DECLARATION_JSON";
    } catch (e) {
      if (e instanceof DeclarationNotReadyError) return new Response(`Anmeldevorbereitung nicht möglich: ${e.message}`, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      throw e;
    }
  } else {
    body = await buildOrderWorkbook(data, meta);
    fileName = `Zollübersicht_${order.orderNumber}.xlsx`; contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; kind = "EXCEL_OVERVIEW";
  }
  const hash = sha256(body);
  const ef = await ctx.db.exportFile.create({ data: { tenantId: ctx.tenantId, orderId: id, kind, storageKey: `on-demand:${fileName}`, sha256: hash, createdById: ctx.userId } });
  await ctx.db.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action: "EXPORT", entityType: "CustomsOrder", entityId: id,
    newValue: { exportId: ef.id, kind, fileName, sha256: hash, provisional: data.critical > 0 || data.unconfirmed > 0 } } });
  if (kind === "DECLARATION_JSON" && order.status === "READY") {
    await ctx.db.customsOrder.update({ where: { id }, data: { status: "EXPORTED" } });
    await ctx.db.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action: "STATUS", entityType: "CustomsOrder", entityId: id, field: "status", oldValue: "READY", newValue: "EXPORTED" } });
  }
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": contentType, "Content-Disposition": contentDisposition("attachment", fileName), "Cache-Control": "private, no-store", "X-Content-SHA256": hash },
  });
}
