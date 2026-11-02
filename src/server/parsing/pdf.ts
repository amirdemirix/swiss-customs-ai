import { extractText, getDocumentProxy } from "unpdf";

/** Liest den Textlayer eines PDFs seitenweise (keine OCR, keine KI). */
export async function extractPdfText(data: Buffer): Promise<{ pages: string[]; pageCount: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return { pages: pages.map((p) => p.slice(0, 50_000)), pageCount: totalPages };
}
