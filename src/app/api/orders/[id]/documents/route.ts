import { NextResponse } from "next/server";
import { getContextOrNull, can } from "@/server/context";
import { ingestDocument } from "@/server/services/documents";
import { MAX_UPLOAD_BYTES } from "@/domain";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Upload einer einzelnen Datei (der Client lädt mehrere Dateien parallel einzeln hoch → Fortschritt je Datei). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContextOrNull();
  if (!ctx) return NextResponse.json({ ok: false, message: "Nicht angemeldet." }, { status: 401 });
  if (!can(ctx.role, "document.upload")) return NextResponse.json({ ok: false, message: "Keine Berechtigung zum Hochladen." }, { status: 403 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ ok: false, message: `Datei zu gross (max. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).` }, { status: 413 });

  const { id } = await params;
  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ ok: false, message: "Ungültige Anfrage." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ ok: false, message: "Keine Datei erhalten." }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer());
  const r = await ingestDocument(ctx.db, { tenantId: ctx.tenantId, userId: ctx.userId }, id, file.name, data);
  return NextResponse.json(r, { status: r.ok ? 200 : r.duplicate ? 409 : 422 });
}
