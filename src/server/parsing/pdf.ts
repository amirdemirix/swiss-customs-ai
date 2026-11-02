import { extractText, extractTextItems, getDocumentProxy } from "unpdf";
import type { PdfTextItem } from "@/domain";

/** Liest den Textlayer eines PDFs seitenweise inkl. Positionen der Textstücke (keine OCR, keine KI). */
export async function extractPdfText(data: Buffer): Promise<{ pages: string[]; pageCount: number; items: PdfTextItem[][] }> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  let items: PdfTextItem[][] = [];
  try {
    const r = await extractTextItems(pdf);
    items = r.items.map((p) => p.map((i) => ({ str: i.str, x: i.x, y: i.y, width: i.width, height: i.height })));
  } catch { /* Positionen optional – ohne sie keine Tabellenerkennung */ }
  return { pages: pages.map((p) => p.slice(0, 50_000)), pageCount: totalPages, items };
}
