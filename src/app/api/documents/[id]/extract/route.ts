import { NextResponse } from "next/server";
import { getContextOrNull, can } from "@/server/context";
import { runAiExtraction } from "@/server/services/ai-extraction";

export const runtime = "nodejs";
export const maxDuration = 300; // grosse Rechnungen können mehrere Minuten dauern

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContextOrNull();
  if (!ctx) return NextResponse.json({ ok: false, message: "Nicht angemeldet." }, { status: 401 });
  if (!can(ctx.role, "document.upload")) return NextResponse.json({ ok: false, message: "Keine Berechtigung." }, { status: 403 });
  const { id } = await params;
  const r = await runAiExtraction(ctx.db, { tenantId: ctx.tenantId, userId: ctx.userId }, id);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
