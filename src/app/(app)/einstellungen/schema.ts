import { z } from "zod";

export const roleEnum = z.enum(["ADMIN", "DECLARANT", "REVIEWER", "READ_ONLY"]);

export const tenantSettingsSchema = z.object({
  name: z.string().trim().min(1, "Pflichtfeld").max(200),
  retentionDays: z.string().trim().optional().transform((v, c) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 30 || n > 36500) {
      c.addIssue({ code: "custom", message: "30–36'500 Tage oder leer" });
      return z.NEVER;
    }
    return n;
  }),
  reviewConfidenceThreshold: z.string().trim().regex(/^(0(\.\d{1,2})?|1(\.0{1,2})?)$/, "Wert zwischen 0 und 1"),
});

export const newUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail").max(200),
  name: z.string().trim().min(1, "Pflichtfeld").max(200),
  role: roleEnum,
  password: z.string().max(200),
});
