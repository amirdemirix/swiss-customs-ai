import { getContext, can, ROLE_LABEL } from "@/server/context";
import { prismaRoot } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";
import { TenantForm, AddUserForm, PasswordForm } from "./forms";
import { ProfilesCard } from "./profiles-card";
import { saveTenantSettings, setAiConsent, addUser, changeRole, removeMember, changeOwnPassword } from "./actions";

const ROLES = ["ADMIN", "DECLARANT", "REVIEWER", "READ_ONLY"] as const;

export default async function Settings() {
  const ctx = await getContext();
  const admin = can(ctx.role, "settings.manage");
  const [tenant, members, profiles] = admin
    ? await Promise.all([
        prismaRoot.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
        ctx.db.membership.findMany({ include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true, isActive: true } } }, orderBy: { createdAt: "asc" } }),
        ctx.db.groupingProfile.findMany({ orderBy: { name: "asc" } }),
      ])
    : [null, [], []];
  const granter = tenant?.aiConsentGrantedById ? await prismaRoot.user.findUnique({ where: { id: tenant.aiConsentGrantedById }, select: { name: true } }) : null;

  return (
    <>
      <PageHeader title="Einstellungen" description={ctx.tenantName} />
      <div className="grid gap-6 [&>*]:min-w-0">
        {tenant && (
          <>
            <Card>
              <CardHeader><CardTitle>Firma</CardTitle></CardHeader>
              <CardContent>
                <TenantForm action={saveTenantSettings} defaults={{ name: tenant.name, retentionDays: tenant.retentionDays?.toString() ?? "", reviewConfidenceThreshold: tenant.reviewConfidenceThreshold.toString() }} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>KI-Verarbeitung von Belegen</CardTitle>
                {tenant.aiProcessingConsent ? <Badge tone="success">Freigegeben</Badge> : <Badge tone="neutral">Nicht freigegeben</Badge>}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Ist die Freigabe aktiv, werden Rechnungsinhalte zur Datenerfassung an den KI-Dienstleister Anthropic (Claude API) übermittelt.
                  Ohne Freigabe werden nur strukturierte Dateien (Excel/CSV) und PDF-Textlayer lokal verarbeitet. Voraussetzung ist ein
                  Auftragsbearbeitungsvertrag sowie die Prüfung nach revDSG und ggf. DSGVO (Datenübermittlung ins Ausland).
                </p>
                {tenant.aiProcessingConsent ? (
                  <ActionForm action={setAiConsent.bind(null, false)} className="flex flex-wrap items-center gap-4">
                    <span>Freigegeben von <strong>{granter?.name ?? "?"}</strong> am {tenant.aiConsentGrantedAt && formatDateTime(tenant.aiConsentGrantedAt)}</span>
                    <Button variant="outline" size="sm">Freigabe widerrufen</Button>
                  </ActionForm>
                ) : (
                  <ActionForm action={setAiConsent.bind(null, true)} className="space-y-3">
                    <label className="flex items-start gap-2">
                      <input type="checkbox" name="confirm" className="mt-1" />
                      <span>Ich bestätige im Namen von {tenant.name}, dass die rechtlichen Voraussetzungen für die Übermittlung von Belegdaten an den KI-Dienstleister erfüllt sind.</span>
                    </label>
                    <Button size="sm">KI-Verarbeitung freigeben</Button>
                  </ActionForm>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Benutzer & Rollen ({members.length})</CardTitle></CardHeader>
              <div className="border-b p-5"><AddUserForm action={addUser} /></div>
              <Table>
                <THead><TR><TH>Name</TH><TH>E-Mail</TH><TH>Rolle</TH><TH>Letzte Anmeldung</TH><TH /></TR></THead>
                <TBody>
                  {members.map((m) => (
                    <TR key={m.id}>
                      <TD className="font-medium">{m.user.name}{m.userId === ctx.userId && <Badge tone="primary" className="ml-2">Sie</Badge>}</TD>
                      <TD className="text-muted-foreground">{m.user.email}</TD>
                      <TD>
                        <ActionForm action={changeRole.bind(null, m.userId)} className="flex max-w-xs flex-wrap gap-2">
                          <select name="role" defaultValue={m.role} aria-label={`Rolle von ${m.user.name}`} className="h-8 rounded-md border bg-surface px-2 text-sm">
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                          <Button variant="outline" size="sm">Ändern</Button>
                        </ActionForm>
                      </TD>
                      <TD className="text-muted-foreground">{m.user.lastLoginAt ? formatDateTime(m.user.lastLoginAt) : "nie"}</TD>
                      <TD className="text-right">
                        {m.userId !== ctx.userId && <ActionForm action={removeMember.bind(null, m.userId)}><Button variant="ghost" size="sm" className="text-critical">Entfernen</Button></ActionForm>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>

            <ProfilesCard profiles={profiles} />
          </>
        )}

        <Card>
          <CardHeader><CardTitle>Mein Konto</CardTitle><span className="text-sm text-muted-foreground">{ctx.email} · {ROLE_LABEL[ctx.role]}</span></CardHeader>
          <CardContent><PasswordForm action={changeOwnPassword} /></CardContent>
        </Card>
      </div>
    </>
  );
}
