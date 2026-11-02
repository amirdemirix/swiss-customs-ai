import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "–";
export const formatDateTime = (d: Date | string) =>
  new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
export const formatInt = (n: number) => n.toLocaleString("de-CH");

/** Formularwerte für erneute Anzeige nach Validierungsfehlern (ohne Passwörter). */
export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !/password|^current$|^next$|^repeat$|^\$ACTION/i.test(k)) out[k] = v;
  return out;
}

/** Content-Disposition mit ASCII-Fallback (Umlaute) und UTF-8-Namen nach RFC 6266/5987. */
export function contentDisposition(kind: "inline" | "attachment", fileName: string) {
  const ascii = fileName.normalize("NFD").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
