import { NextResponse, type NextRequest } from "next/server";

/**
 * Grobe Vorprüfung: ohne Session-Cookie → Login. Die eigentliche Prüfung (Gültigkeit,
 * Ablauf, Mitgliedschaft) erfolgt serverseitig in getContext().
 */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("sca_session");
  const isLogin = req.nextUrl.pathname === "/login";
  if (req.nextUrl.pathname.startsWith("/api/cron/")) return NextResponse.next(); // eigener Schutz per CRON_SECRET
  if (!has && !isLogin) {
    const url = new URL("/login", req.url);
    if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
