import { getContext, requireCan } from "@/server/context";
import { PageHeader } from "@/components/layout/page-header";
import { OrderForm } from "./order-form";
import { createOrder } from "../actions";

export default async function NewOrder() {
  const ctx = await getContext();
  requireCan(ctx, "order.write");
  const customers = await ctx.db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const profiles = await ctx.db.groupingProfile.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isDefault: true } });
  return (
    <>
      <PageHeader title="Neuer Zollauftrag" description="Rechnungen werden nach dem Anlegen im Auftrag hochgeladen." />
      <OrderForm customers={customers} profiles={profiles} action={createOrder} submitLabel="Auftrag anlegen"
        defaults={{ orderDate: new Date().toISOString().slice(0, 10), destinationCountry: "CH", direction: "IMPORT" }} />
    </>
  );
}
