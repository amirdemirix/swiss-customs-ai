import { z } from "zod";

const opt = z.string().trim().max(200).optional().transform((v) => (v ? v : undefined));
const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "ISO-Ländercode (2 Buchstaben)").optional().or(z.literal("").transform(() => undefined));

export const orderSchema = z.object({
  orderNumber: z.string().trim().min(1, "Pflichtfeld").max(50),
  customerId: opt,
  direction: z.enum(["IMPORT", "EXPORT", "TRANSIT"]),
  consignor: opt,
  consignee: opt,
  dispatchCountry: country,
  destinationCountry: country,
  transportMode: z.enum(["ROAD", "RAIL", "AIR", "SEA", "POST", "PIPELINE", "OTHER"]).optional().or(z.literal("").transform(() => undefined)),
  reference: opt,
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum erforderlich"),
  remarks: z.string().trim().max(2000).optional(),
  groupingProfileId: opt,
});

