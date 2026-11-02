import Link from "next/link";
import { FileJson, FileSpreadsheet, Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { OrderStatus, Role } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { OrderStatusBadge } from "@/components/ui/status";
import { can } from "@/server/auth/permissions";
import { isLocked, manualTargets } from "@/domain";
import { changeOrderStatus, deleteOrder, recompute } from "../actions";

const LABEL: Partial<Record<OrderStatus, string>> = { COMPLETED: "Abschliessen", ARCHIVED: "Archivieren", READY: "Wieder öffnen", DRAFT: "Reaktivieren" };

export function OrderToolbar({ order, role, criticalOpen }: { order: { id: string; orderNumber: string; status: OrderStatus }; role: Role; criticalOpen: number }) {
  const write = can(role, "order.write");
  const locked = isLocked(order.status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <OrderStatusBadge status={order.status} />
      {write && !locked && (
        <>
          <Link href={`/auftraege/${order.id}/bearbeiten`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil />Bearbeiten</Link>
          <ActionForm action={recompute.bind(null, order.id)}><Button variant="outline" size="sm"><RefreshCw />Neu prüfen &amp; gruppieren</Button></ActionForm>
        </>
      )}
      {can(role, "export.create") && (
        <>
          <a href={`/api/orders/${order.id}/export?format=xlsx`} className={buttonVariants({ variant: "outline", size: "sm" })} title="Zollübersicht, Rechnungsdetails, Rechnungsübersicht, Prüfprotokoll"><FileSpreadsheet />Excel</a>
          <a href={`/api/orders/${order.id}/export?format=json`} className={buttonVariants({ variant: "outline", size: "sm" })}
            title={criticalOpen ? "Erst ohne kritische Befunde und mit bestätigten Rechnungen möglich" : "Strukturierter Datensatz für die Weiterverarbeitung (keine Passar-Übermittlung)"}><FileJson />Anmeldevorbereitung</a>
        </>
      )}
      {write && manualTargets(order.status).map((to) => {
        const blocked = to === "COMPLETED" && criticalOpen > 0;
        return (
          <ActionForm key={to} action={changeOrderStatus.bind(null, order.id, to)}>
            <Button variant={to === "COMPLETED" ? "default" : "outline"} size="sm" disabled={blocked} title={blocked ? `${criticalOpen} kritische Befunde offen` : undefined}>{LABEL[to] ?? to}</Button>
          </ActionForm>
        );
      })}
      {can(role, "order.delete") && (
        <details className="relative">
          <summary className={buttonVariants({ variant: "ghost", size: "icon" }) + " list-none text-critical [&::-webkit-details-marker]:hidden"} title="Auftrag löschen"><Trash2 /></summary>
          <ActionForm action={deleteOrder.bind(null, order.id)} className="absolute right-0 z-10 mt-2 w-72 space-y-2 rounded-lg border bg-surface p-3 shadow-lg">
            <p className="text-xs">Löscht den Auftrag mit allen Rechnungen und Positionen endgültig. Zur Bestätigung <strong className="font-mono">{order.orderNumber}</strong> eingeben:</p>
            <Input name="confirm" autoComplete="off" />
            <Button variant="destructive" size="sm" className="w-full">Endgültig löschen</Button>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
