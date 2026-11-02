import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Table2 } from "lucide-react";
import { getContext, can } from "@/server/context";
import { getSheets } from "@/server/services/spreadsheet-import";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { DetectedHeader, Evidence } from "@/domain";
import { formatCH } from "@/domain";
import { formatDate } from "@/lib/utils";

const LABEL: Record<keyof DetectedHeader, string> = { invoiceNumber: "Rechnungsnummer", invoiceDate: "Rechnungsdatum", currency: "Währung", totalAmount: "Rechnungsbetrag" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const ctx = await getContext();
  const doc = await ctx.db.document.findFirst({
    where: { id: docId, orderId: id },
    include: { order: { select: { orderNumber: true, status: true } }, invoices: { include: { _count: { select: { lines: true } } } } },
  });
  if (!doc) notFound();
  const fileUrl = `/api/documents/${doc.id}/file`;
  const header = doc.detectedHeader as DetectedHeader | null;
  const sheets = getSheets(doc);
  const isSheet = doc.kind === "SPREADSHEET" || doc.kind === "CSV";
  const pages = (doc.extractedText as { pages?: string[] } | null)?.pages;

  return (
    <>
      <PageHeader title={doc.fileName} description={`Auftrag ${doc.order.orderNumber}`}
        actions={<>
          <Link href={`/auftraege/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><ArrowLeft />Zum Auftrag</Link>
          {isSheet && can(ctx.role, "document.upload") && <Link href={`/auftraege/${id}/dokumente/${doc.id}/import`} className={buttonVariants({ size: "sm" })}><Table2 />Spalten zuordnen</Link>}
          <a href={`${fileUrl}?download=1`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download />Original</a>
        </>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <Card className="overflow-hidden">
          {doc.mimeType === "application/pdf" && <iframe src={fileUrl} title={doc.fileName} className="h-[75vh] w-full" />}
          {doc.mimeType.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt={doc.fileName} className="mx-auto max-h-[75vh] object-contain" />
          )}
          {isSheet && sheets.map((s) => (
            <div key={s.name}>
              <div className="border-b bg-muted/40 px-4 py-2 text-xs font-medium">Blatt „{s.name}“ · {s.rows.length} Zeilen (Vorschau 100)</div>
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {s.rows.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="sticky left-0 bg-muted/60 px-2 py-1 text-right tabular-nums text-muted-foreground">{i + 1}</td>
                        {r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </Card>
        <div className="space-y-6">
          {header && (
            <Card>
              <CardHeader><CardTitle>Erkannte Kopfdaten</CardTitle><Badge tone="warning">Vorschlag – zu prüfen</Badge></CardHeader>
              <dl className="divide-y text-sm">
                {(Object.keys(LABEL) as (keyof DetectedHeader)[]).map((k) => {
                  const e = header[k] as Evidence | null;
                  return (
                    <div key={k} className="px-5 py-2.5">
                      <dt className="text-xs text-muted-foreground">{LABEL[k]}</dt>
                      <dd>{e ? <><strong>{k === "invoiceDate" ? formatDate(e.value) : k === "totalAmount" ? formatCH(e.value) : e.value}</strong>
                        <span className="block text-xs text-muted-foreground">Seite {e.page}: „…{e.snippet}…“</span></> : <span className="text-muted-foreground">nicht gefunden – nicht ergänzt</span>}</dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          )}
          {doc.kind === "PDF_SCAN" && <Card className="p-5 text-sm">Gescanntes Dokument ohne Textlayer. Die Erkennung (OCR/KI) folgt in Phase 5 – nur nach KI-Freigabe des Mandanten.</Card>}
          {doc.kind === "IMAGE" && <Card className="p-5 text-sm">Bild gespeichert. Die Erkennung (OCR/KI) folgt in Phase 5 – nur nach KI-Freigabe des Mandanten.</Card>}
          <Card>
            <CardHeader><CardTitle>Daraus erzeugte Rechnungen</CardTitle></CardHeader>
            <ul className="divide-y text-sm">
              {doc.invoices.map((i) => (
                <li key={i.id} className="flex justify-between px-5 py-2"><span className="font-medium">{i.invoiceNumber ?? <Badge tone="critical">ohne Nummer</Badge>}</span>
                  <span className="text-muted-foreground">{i.currency ?? "–"} {i.totalAmount ? formatCH(i.totalAmount.toString()) : ""} · {i._count.lines} Pos.</span></li>
              ))}
              {!doc.invoices.length && <li className="px-5 py-5 text-center text-muted-foreground">Keine.</li>}
            </ul>
          </Card>
          {pages && doc.kind === "PDF_TEXT" && (
            <details className="rounded-lg border bg-surface">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Gelesener Text ({pages.length} Seite(n))</summary>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t px-5 py-3 text-xs">{pages.map((p, i) => `— Seite ${i + 1} —\n${p}`).join("\n\n")}</pre>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
