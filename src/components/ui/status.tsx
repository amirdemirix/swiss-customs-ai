import { Badge } from "./badge";
import type { OrderStatus } from "@prisma/client";

const MAP: Record<OrderStatus, { label: string; tone: "neutral" | "primary" | "critical" | "warning" | "info" | "success" }> = {
  DRAFT: { label: "Entwurf", tone: "neutral" },
  PROCESSING: { label: "In Verarbeitung", tone: "info" },
  NEEDS_REVIEW: { label: "Zur Kontrolle", tone: "warning" },
  READY: { label: "Bereit", tone: "primary" },
  EXPORTED: { label: "Exportiert", tone: "success" },
  COMPLETED: { label: "Abgeschlossen", tone: "success" },
  ARCHIVED: { label: "Archiviert", tone: "neutral" },
};
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={MAP[status].tone}>{MAP[status].label}</Badge>;
