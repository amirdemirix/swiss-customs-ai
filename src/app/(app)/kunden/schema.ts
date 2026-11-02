import { z } from "zod";
import { parseTariffNumber } from "@/domain";

const opt = z.string().trim().max(300).optional().transform((v) => (v ? v : null));

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Pflichtfeld").max(200),
  number: opt,
  uid: z.string().trim().toUpperCase().regex(/^CHE-?\d{3}\.?\d{3}\.?\d{3}$/, "Format CHE-123.456.789").optional().or(z.literal("")).transform((v) => (v ? v : null)),
  address: opt,
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "ISO-Ländercode").optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

export const articleSchema = z.object({
  articleNumber: z.string().trim().min(1, "Pflichtfeld").max(100),
  description: opt,
  tariffNumber: z.string().trim().min(1, "Pflichtfeld").transform((v, c) => {
    const r = parseTariffNumber(v);
    if (!r.ok) { c.addIssue({ code: "custom", message: r.reason === "HS6_ONLY" ? "8-stellige CH-Tarifnummer erforderlich" : "Format NNNN.NNNN" }); return z.NEVER; }
    return r.normalized;
  }),
  statisticalKey: z.string().trim().regex(/^\d{3}$/, "3 Ziffern").optional().or(z.literal("")).transform((v) => (v ? v : null)),
  originCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "ISO-Ländercode").optional().or(z.literal("")).transform((v) => (v ? v : null)),
});
