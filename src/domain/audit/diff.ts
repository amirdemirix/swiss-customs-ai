export interface FieldChange { field: string; oldValue: unknown; newValue: unknown }

const normalize = (v: unknown): unknown => {
  if (v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === "object" && "toFixed" in v && typeof (v as { toString: unknown }).toString === "function") return String(v); // Decimal
  return v;
};

/** Ermittelt geänderte Felder für das Audit-Log (nur die angegebenen Felder). */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields: (keyof T & string)[]): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = normalize(before[f]);
    const b = normalize(after[f]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: f, oldValue: a, newValue: b });
  }
  return out;
}
