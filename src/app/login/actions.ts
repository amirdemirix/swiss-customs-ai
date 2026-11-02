"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prismaRoot } from "@/server/db";
import { login, logout, switchTenant } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/token";
import { getContext, clientIp } from "@/server/context";

const schema = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200), next: z.string().optional() });

export type LoginState = { error?: string; email?: string };

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const p = schema.safeParse(Object.fromEntries(fd));
  const email = String(fd.get("email") ?? "");
  if (!p.success) return { error: "E-Mail oder Passwort ungültig.", email };
  const r = await login(prismaRoot, { email: p.data.email, password: p.data.password, ip: await clientIp(), userAgent: (await headers()).get("user-agent") });
  if (!r.ok) {
    if (r.reason === "RATE_LIMITED") return { email, error: `Zu viele Versuche. Bitte in ${Math.ceil((r.retryAfterMs ?? 0) / 60000)} Minuten erneut versuchen.` };
    if (r.reason === "NO_MEMBERSHIP") return { email, error: "Ihr Konto ist keiner Firma zugeordnet. Bitte Administrator kontaktieren." };
    return { error: "E-Mail oder Passwort ungültig.", email };
  }
  (await cookies()).set(SESSION_COOKIE, r.token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true", sameSite: "lax", path: "/", expires: r.expiresAt,
  });
  redirect(safeNext(p.data.next));
}

export async function logoutAction() {
  const jar = await cookies();
  await logout(prismaRoot, jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function switchTenantAction(fd: FormData) {
  const ctx = await getContext();
  const tenantId = String(fd.get("tenantId") ?? "");
  if (await switchTenant(prismaRoot, ctx.sessionId, ctx.userId, tenantId)) redirect("/");
}
