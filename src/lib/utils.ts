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
