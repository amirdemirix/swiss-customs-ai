import { notFound } from "next/navigation";
import { getContext, requireCan } from "@/server/context";
import { getSheets, findSavedMapping } from "@/server/services/spreadsheet-import";
import { PageHeader } from "@/components/layout/page-header";
import { autoMapColumns, findHeaderRow, type ColumnMap, type DetectedHeader } from "@/domain";
import { ImportForm } from "./import-form";

const PREVIEW_ROWS = 80;

export default async function ImportPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const ctx = await getContext();
  requireCan(ctx, "document.upload");
  const doc = await ctx.db.document.findFirst({ where: { id: docId, orderId: id }, include: { order: { select: { orderNumber: true, customerId: true } } } });
  if (!doc) notFound();
  const sheets = getSheets(doc);
  const hdr = doc.detectedHeader as DetectedHeader | null;
  const prepared = await Promise.all(sheets.map(async (s) => {
    const headerRow = findHeaderRow(s.rows);
    const headers = s.rows[headerRow] ?? [];
    const saved = await findSavedMapping(ctx.db, headers, doc.order.customerId);
    const map: ColumnMap = saved ?? autoMapColumns(headers);
    return { name: s.name, totalRows: s.rows.length, rows: s.rows.slice(0, PREVIEW_ROWS + headerRow + 1), headerRow, map, fromSaved: !!saved };
  }));
  return (
    <>
      <PageHeader title={`Spalten zuordnen – ${doc.fileName}`} description={`Auftrag ${doc.order.orderNumber} · Werte werden 1:1 übernommen, nichts wird ergänzt oder geschätzt.`} />
      <ImportForm orderId={id} documentId={doc.id} sheets={prepared} initialDefaults={{
        invoiceNumber: hdr?.invoiceNumber?.value ?? "", invoiceDate: hdr?.invoiceDate?.value ?? "", supplierName: "", currency: hdr?.currency?.value ?? "" }} />
    </>
  );
}
