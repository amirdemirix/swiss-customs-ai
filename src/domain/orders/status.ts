export type OrderStatus = "DRAFT" | "PROCESSING" | "NEEDS_REVIEW" | "READY" | "EXPORTED" | "COMPLETED" | "ARCHIVED";

/**
 * Erlaubte manuelle Statuswechsel. Automatische Wechsel (DRAFT → NEEDS_REVIEW/READY)
 * erfolgen durch die Prüfung. Abschliessen nur, wenn keine kritischen Befunde offen sind.
 */
const MANUAL: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["ARCHIVED"],
  PROCESSING: [],
  NEEDS_REVIEW: ["ARCHIVED"],
  READY: ["COMPLETED", "ARCHIVED"],
  EXPORTED: ["COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED", "READY"],
  ARCHIVED: ["DRAFT"],
};

export function canTransition(from: OrderStatus, to: OrderStatus, openCriticalIssues: number): { ok: boolean; reason?: string } {
  if (!MANUAL[from].includes(to)) return { ok: false, reason: `Statuswechsel ${from} → ${to} ist nicht zulässig.` };
  if (to === "COMPLETED" && openCriticalIssues > 0) return { ok: false, reason: `${openCriticalIssues} kritische Befunde sind noch offen.` };
  return { ok: true };
}
export const manualTargets = (from: OrderStatus) => MANUAL[from];
/** Abgeschlossene/archivierte Aufträge sind schreibgeschützt. */
export const isLocked = (s: OrderStatus) => s === "COMPLETED" || s === "ARCHIVED";
