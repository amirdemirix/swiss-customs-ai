import Link from "next/link";
import { Eye, FileSpreadsheet, FileText, Image as ImageIcon, Table2, Trash2 } from "lucide-react";
import type { Document } from "@prisma/client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/action-form";
import { Dropzone } from "@/components/upload/dropzone";
import { MAX_UPLOAD_BYTES } from "@/domain";
import { formatDateTime } from "@/lib/utils";
import { deleteDocument } from "./actions";
import { AiExtractButton } from "@/components/upload/ai-extract-button";

const STATUS: Record<Document["status"], { label: string; tone: "neutral" | "info" | "success" | "critical" | "warning" }> = {
  UPLOADED: { label: "Gespeichert", tone: "neutral" }, QUEUED: { label: "In Warteschlange", tone: "info" }, PROCESSING: { label: "In Verarbeitung", tone: "info" },
  EXTRACTED: { label: "Gelesen", tone: "success" }, FAILED: { label: "Fehler", tone: "critical" }, DUPLICATE: { label: "Duplikat", tone: "warning" },
};
const KIND: Record<Document["kind"], string> = { PDF_TEXT: "PDF", PDF_SCAN: "PDF-Scan", IMAGE: "Bild", SPREADSHEET: "Excel", CSV: "CSV", UNKNOWN: "?" };

type Doc = Pick<Document, "id" | "fileName" | "kind" | "status" | "sizeBytes" | "pageCount" | "errorMessage" | "duplicateOfId" | "createdAt"> & { _count: { invoices: number } };

export function DocumentsCard({ orderId, docs, canUpload, canDelete, locked, ai }: { orderId: string; docs: Doc[]; canUpload: boolean; canDelete: boolean; locked: boolean; ai: { available: boolean; reason?: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Belege ({docs.length})</CardTitle>
        <span className="text-xs text-muted-foreground">Verschlüsselt gespeichert · {ai.available ? "KI-Erkennung freigegeben (nur auf Knopfdruck)" : `Ohne KI: ${ai.reason ?? ""}`}</span>
      </CardHeader>
      {canUpload && !locked && (
        <div className="space-y-2 border-b p-5">
          <Dropzone orderId={orderId} maxBytes={MAX_UPLOAD_BYTES} />
          <p className="text-xs text-muted-foreground">
            Synthetische Beispieldateien zum Testen:{" "}
            <a className="text-primary hover:underline" href="/beispiele/beispiel-lieferant-textil.csv" download>CSV (2 Rechnungen)</a> ·{" "}
            <a className="text-primary hover:underline" href="/beispiele/beispiel-commercial-invoice.xlsx" download>Excel (Commercial Invoice)</a> ·{" "}
            <a className="text-primary hover:underline" href="/beispiele/beispiel-rechnung-werkzeuge.pdf" download>PDF-Rechnung</a>
          </p>
        </div>
      )}
      <ul className="divide-y text-sm">
        {docs.map((d) => {
          const Icon = d.kind === "SPREADSHEET" || d.kind === "CSV" ? FileSpreadsheet : d.kind === "IMAGE" ? ImageIcon : FileText;
          const sheet = d.kind === "SPREADSHEET" || d.kind === "CSV";
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/auftraege/${orderId}/dokumente/${d.id}`} className="truncate font-medium text-primary hover:underline">{d.fileName}</Link>
                  <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                  {d.duplicateOfId && <Badge tone="warning" title="Identische Datei in anderem Auftrag">Duplikat</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {KIND[d.kind]} · {(d.sizeBytes / 1024).toFixed(0)} KB{d.pageCount ? ` · ${d.pageCount} S.` : ""} · {formatDateTime(d.createdAt)}
                  {d._count.invoices > 0 && ` · ${d._count.invoices} Rechnung(en)`}
                  {d.errorMessage && <span className="text-critical"> · {d.errorMessage}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {sheet && d.status === "EXTRACTED" && canUpload && !locked && (
                  <Link href={`/auftraege/${orderId}/dokumente/${d.id}/import`} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">
                    <Table2 className="size-3.5" />{d._count.invoices ? "Neu zuordnen" : "Spalten zuordnen"}
                  </Link>
                )}
                {(d.kind === "PDF_TEXT" || d.kind === "PDF_SCAN" || d.kind === "IMAGE") && canUpload && !locked && ai.available && (d.status !== "PROCESSING") && (
                  <AiExtractButton documentId={d.id} label={d._count.invoices && d.kind !== "PDF_TEXT" ? "Erneut erkennen" : "KI-Erkennung"} />
                )}
                <Link href={`/auftraege/${orderId}/dokumente/${d.id}`} title="Ansehen" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"><Eye className="size-4" /></Link>
                {canDelete && !locked && (
                  <ActionForm action={deleteDocument.bind(null, orderId, d.id)} confirm={`„${d.fileName}“ und daraus erzeugte Rechnungen endgültig löschen?`}>
                    <button title="Löschen (inkl. daraus erzeugter Rechnungen)" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-critical"><Trash2 className="size-4" /></button>
                  </ActionForm>
                )}
              </div>
            </li>
          );
        })}
        {!docs.length && <li className="px-5 py-6 text-center text-muted-foreground">Noch keine Belege hochgeladen.</li>}
      </ul>
    </Card>
  );
}
