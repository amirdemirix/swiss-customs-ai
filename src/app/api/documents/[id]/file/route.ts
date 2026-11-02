import { getContextOrNull } from "@/server/context";
import { readFile } from "@/server/storage/file-store";

export const runtime = "nodejs";

/** Liefert die entschlüsselte Originaldatei – nur für Mitglieder des Mandanten. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContextOrNull();
  if (!ctx) return new Response("Nicht angemeldet.", { status: 401 });
  const { id } = await params;
  const doc = await ctx.db.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return new Response("Nicht gefunden.", { status: 404 });
  const data = await readFile(ctx.db, ctx.tenantId, doc.id);
  if (!data) return new Response("Datei nicht verfügbar.", { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const inline = !download && /^(application\/pdf|image\/(png|jpeg))/.test(doc.mimeType);
  await ctx.db.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action: download ? "DOWNLOAD" : "VIEW", entityType: "Document", entityId: doc.id } });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Typ stammt aus der Magic-Byte-Prüfung + nosniff → Browser interpretiert Uploads nie als HTML/JS.
      // Für Nicht-PDFs zusätzlich alles sperren (der PDF-Viewer von Chrome verträgt keine Sandbox-CSP).
      ...(doc.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}
