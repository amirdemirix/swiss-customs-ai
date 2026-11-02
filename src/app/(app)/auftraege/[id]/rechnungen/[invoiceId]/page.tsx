import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getContext, can } from "@/server/context";
import { getSheets } from "@/server/services/spreadsheet-import";
import { aiAvailability } from "@/server/services/ai-extraction";
import { prismaRoot } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AiExtractButton } from "@/components/upload/ai-extract-button";
import { LINE_FIELDS, isLocked } from "@/domain";
import { formatDateTime } from "@/lib/utils";
import { InvoiceEditor, type EditorLine } from "./editor";

const SEV = { CRITICAL: "critical", WARNING: "warning", INFO: "info" } as const;
const REVIEW = { EXTRACTED: { t: "Erfasst", tone: "neutral" }, NEEDS_REVIEW: { t: "Zu prüfen", tone: "warning" }, CONFIRMED: { t: "Bestätigt", tone: "success" } } as const;

export default async function ReviewPage({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const { id, invoiceId } = await params;
  const ctx = await getContext();
  const inv = await ctx.db.invoice.findFirst({
    where: { id: invoiceId, orderId: id },
    include: { order: { select: { orderNumber: true, status: true } }, document: true, lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!inv) notFound();
  const ids = [inv.id, ...inv.lines.map((l) => l.id)];
  const [issues, history, avail] = await Promise.all([
    ctx.db.validationIssue.findMany({ where: { orderId: id, resolvedAt: null, entityId: { in: ids } }, orderBy: [{ severity: "asc" }] }),
    ctx.db.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 80 }),
    aiAvailability(ctx.tenantId),
  ]);
  const users = new Map((await prismaRoot.user.findMany({ where: { id: { in: [...new Set(history.map((h) => h.userId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const editable = can(ctx.role, "invoice.edit") && !isLocked(inv.order.status);
  const doc = inv.document;
  const lineIssues: Record<string, { severity: string; message: string }[]> = {};
  for (const i of issues) (lineIssues[i.entityId] ??= []).push({ severity: i.severity, message: i.message.replace(/^Rechnung [^,]+, Position \d+: /, "") });
  const meta = (inv.extractionMeta ?? {}) as { method?: string; model?: string; notes?: string[] };

  const lines: EditorLine[] = inv.lines.map((l) => ({
    id: l.id, lineNo: l.lineNo, reviewStatus: l.reviewStatus,
    values: Object.fromEntries(LINE_FIELDS.map((f) => [f, l[f] == null ? "" : String(l[f])])) as EditorLine["values"],
    sources: { tariffNumber: l.tariffNumberSource, originCountry: l.originSource },
    meta: (l.fieldMeta ?? null) as EditorLine["meta"],
  }));
  const header = {
    invoiceNumber: inv.invoiceNumber ?? "", invoiceDate: inv.invoiceDate?.toISOString().slice(0, 10) ?? "", supplierName: inv.supplierName ?? "", currency: inv.currency ?? "",
    totalAmount: inv.totalAmount?.toString() ?? "", discountAmount: inv.discountAmount?.toString() ?? "", freightAmount: inv.freightAmount?.toString() ?? "",
    insuranceAmount: inv.insuranceAmount?.toString() ?? "", incoterm: inv.incoterm ?? "", netWeightKg: inv.netWeightKg?.toString() ?? "",
    grossWeightKg: inv.grossWeightKg?.toString() ?? "", packages: inv.packages ?? "",
  };

  return (
    <>
      <PageHeader title={`Kontrolle Rechnung ${inv.invoiceNumber ?? "(ohne Nummer)"}`}
        description={`Auftrag ${inv.order.orderNumber}${doc ? ` · Beleg ${doc.fileName}` : ""}${meta.method ? ` · Quelle: ${meta.method === "ai" ? `KI (${meta.model})` : meta.method === "spreadsheet-import" ? "Tabellenimport" : "PDF-Text"}` : ""}`}
        actions={<><Badge tone={REVIEW[inv.reviewStatus].tone}>{REVIEW[inv.reviewStatus].t}</Badge>
          <Link href={`/auftraege/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><ArrowLeft />Zum Auftrag</Link></>} />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [&>*]:min-w-0">
        <Card className="overflow-hidden 2xl:sticky 2xl:top-4 2xl:self-start">
          <CardHeader>
            <CardTitle>Original</CardTitle>
            {doc && editable && (doc.kind === "PDF_TEXT" || doc.kind === "PDF_SCAN" || doc.kind === "IMAGE") && (
              avail.available ? <AiExtractButton documentId={doc.id} label={inv.lines.length ? "Erneut mit KI erkennen" : "Positionen mit KI erkennen"} />
                : <span className="max-w-xs text-right text-xs text-muted-foreground">{avail.reason}</span>
            )}
          </CardHeader>
          {!doc && <p className="p-5 text-sm text-muted-foreground">Kein Beleg verknüpft (manuell erfasste Rechnung).</p>}
          {doc?.mimeType === "application/pdf" && <iframe src={`/api/documents/${doc.id}/file`} title={doc.fileName} className="h-[78vh] w-full" />}
          {doc?.mimeType.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/documents/${doc.id}/file`} alt={doc.fileName} className="mx-auto max-h-[78vh] object-contain" />
          )}
          {doc && (doc.kind === "SPREADSHEET" || doc.kind === "CSV") && (
            <div className="max-h-[78vh] overflow-auto">
              <table className="text-xs"><tbody>
                {(getSheets(doc)[0]?.rows ?? []).slice(0, 300).map((r, i) => (
                  <tr key={i} id={`row-${i + 1}`} className="border-b"><td className="sticky left-0 bg-muted/60 px-2 py-1 text-right tabular-nums text-muted-foreground">{i + 1}</td>
                    {r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>)}</tr>
                ))}
              </tbody></table>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          {meta.notes && meta.notes.length > 0 && (
            <Card className="p-4 text-sm"><strong>Hinweise der Erkennung:</strong><ul className="mt-1 list-disc pl-5 text-muted-foreground">{meta.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Card>
          )}
          <InvoiceEditor orderId={id} invoiceId={inv.id} header={header} lines={lines} lineIssues={lineIssues} editable={editable}
            canConfirm={can(ctx.role, "tariff.confirm") && !isLocked(inv.order.status)} confirmed={inv.reviewStatus === "CONFIRMED"} />
          <Card>
            <CardHeader><CardTitle>Befunde zu dieser Rechnung ({issues.length})</CardTitle></CardHeader>
            <ul className="max-h-72 divide-y overflow-y-auto text-sm">
              {issues.map((i) => <li key={i.id} className="flex gap-3 px-5 py-2"><Badge tone={SEV[i.severity]} className="shrink-0">{i.severity === "CRITICAL" ? "Kritisch" : i.severity === "WARNING" ? "Warnung" : "Info"}</Badge>{i.message}</li>)}
              {!issues.length && <li className="px-5 py-5 text-center text-muted-foreground">Keine offenen Befunde.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader><CardTitle>Änderungsverlauf</CardTitle></CardHeader>
            <ul className="max-h-80 divide-y overflow-y-auto text-xs">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3 px-5 py-1.5">
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{formatDateTime(h.createdAt)}</span>
                  <span className="w-28 shrink-0 truncate">{h.userId ? users.get(h.userId) ?? "?" : "System"}</span>
                  <span className="min-w-0 break-words">{h.action}{h.field ? ` · ${h.field}` : ""}{h.action === "UPDATE" ? <>: <s className="text-muted-foreground">{show(h.oldValue)}</s> → <strong>{show(h.newValue)}</strong></> : ""}</span>
                </li>
              ))}
              {!history.length && <li className="px-5 py-5 text-center text-muted-foreground">Noch keine Änderungen.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
const show = (v: unknown) => (v == null || v === "" ? "leer" : typeof v === "object" ? JSON.stringify(v) : String(v));
