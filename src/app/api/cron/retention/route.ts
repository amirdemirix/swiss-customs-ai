import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeExpiredDocuments } from "@/server/services/retention";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Täglicher Lauf (Vercel Cron). Geschützt durch CRON_SECRET (Authorization: Bearer …). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want)))
    return NextResponse.json({ ok: false }, { status: 401 });
  const result = await purgeExpiredDocuments();
  return NextResponse.json({ ok: true, result });
}
