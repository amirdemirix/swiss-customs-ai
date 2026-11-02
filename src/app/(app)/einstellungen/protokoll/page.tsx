import Link from "next/link";
import { getContext, requireCan } from "@/server/context";
import { prismaRoot } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

const show = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 160) : String(v));

/** Mandantenweites Audit-Log (Anmeldungen, Änderungen, KI-Übermittlungen, Exporte, Löschungen). */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const { a } = await searchParams;
  const ctx = await getContext();
  requireCan(ctx, "audit.read");
  const rows = await ctx.db.auditLog.findMany({ where: a ? { action: { contains: a.toUpperCase() } } : undefined, orderBy: { createdAt: "desc" }, take: 300 });
  const users = new Map((await prismaRoot.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Audit-Protokoll" description="Letzte 300 Ereignisse · unveränderlich protokolliert" actions={<Link href="/einstellungen" className="text-sm text-primary hover:underline">Zurück zu den Einstellungen</Link>} />
      <Card>
        <form className="border-b p-3"><Input name="a" defaultValue={a} placeholder="Aktion filtern, z. B. LOGIN, AI_SEND, EXPORT, DELETE …" className="max-w-sm" /></form>
        <Table>
          <THead><TR><TH>Zeitpunkt</TH><TH>Benutzer</TH><TH>Aktion</TH><TH>Objekt</TH><TH>Feld</TH><TH>Alt → Neu</TH><TH>IP</TH></TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="text-muted-foreground">{formatDateTime(r.createdAt)}</TD>
                <TD>{r.userId ? users.get(r.userId) ?? "?" : "System"}</TD>
                <TD className="font-mono text-xs">{r.action}</TD>
                <TD className="text-xs">{r.entityType}</TD>
                <TD className="text-xs">{r.field ?? ""}</TD>
                <TD className="max-w-md truncate text-xs" title={`${show(r.oldValue)} → ${show(r.newValue)}`}>{r.oldValue != null && <s className="text-muted-foreground">{show(r.oldValue)}</s>} {show(r.newValue)}</TD>
                <TD className="text-xs text-muted-foreground">{r.ip ?? ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
