import type { DecInput } from "./money/decimal";

export type PreferenceStatus = "NONE" | "CLAIMED" | "UNKNOWN";

/** Fachliche Sicht auf eine Rechnungsposition (unabhängig von Prisma). */
export interface LineInput {
  id: string;
  invoiceId: string;
  invoiceNumber?: string | null;
  lineNo: number;
  articleNumber?: string | null;
  description?: string | null;
  tariffNumber?: string | null;
  statisticalKey?: string | null;
  originCountry?: string | null;
  preferenceStatus?: PreferenceStatus | null;
  customsProcedure?: string | null;
  quantity?: DecInput | null;
  unit?: string | null;
  unitPrice?: DecInput | null;
  lineAmount?: DecInput | null;
  currency?: string | null;
  netWeightKg?: DecInput | null;
  grossWeightKg?: DecInput | null;
  extraAttributes?: Record<string, string | number | boolean | null> | null;
}
