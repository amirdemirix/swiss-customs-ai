"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction, switchTenantAction } from "@/app/login/actions";
import { NAV } from "./nav";

interface Props {
  tenantId: string;
  tenantName: string;
  tenants: { id: string; name: string }[];
  userName: string;
  roleLabel: string;
  hidden: string[];
}

export function Sidebar({ tenantId, tenantName, tenants, userName, roleLabel, hidden }: Props) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" : href === "/auftraege" ? path === "/auftraege" || (path.startsWith("/auftraege/") && !path.startsWith("/auftraege/neu")) : path.startsWith(href);
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-surface max-md:hidden">
      <div className="flex h-14 items-center gap-2.5 border-b px-5">
        <span aria-hidden className="grid size-6 place-items-center rounded bg-critical text-[13px] font-bold leading-none text-white">+</span>
        <span className="text-sm font-semibold tracking-tight">Swiss Customs AI</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.filter((n) => !hidden.includes(n.href)).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              active(href) && "bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary")}>
            <Icon className="size-4" />{label}
          </Link>
        ))}
      </nav>
      <div className="space-y-2 border-t px-5 py-3 text-xs">
        {tenants.length > 1 ? (
          <form action={switchTenantAction}>
            <select name="tenantId" defaultValue={tenantId} aria-label="Firma wechseln" onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="h-7 w-full rounded border bg-surface px-1.5 text-xs">
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </form>
        ) : <div className="text-muted-foreground">{tenantName}</div>}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><div className="truncate font-medium">{userName}</div><div className="text-muted-foreground">{roleLabel}</div></div>
          <form action={logoutAction}>
            <button title="Abmelden" aria-label="Abmelden" className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="size-4" /></button>
          </form>
        </div>
      </div>
    </aside>
  );
}
