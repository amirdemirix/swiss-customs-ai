import { notFound } from "next/navigation";
import { getContext, requireCan } from "@/server/context";
import { PageHeader } from "@/components/layout/page-header";
import { OrderForm } from "../../neu/order-form";
import { updateOrder } from "../../actions";

export default async function EditOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  requireCan(ctx, "order.write");
  const [o, customers] = await Promise.all([
    ctx.db.customsOrder.findFirst({ where: { id } }),
    ctx.db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!o) notFound();
  return (
    <>
      <PageHeader title={`Auftrag ${o.orderNumber} bearbeiten`} description="Jede Änderung wird feldgenau im Änderungsverlauf protokolliert." />
      <OrderForm customers={customers} action={updateOrder.bind(null, o.id)} submitLabel="Änderungen speichern"
        defaults={{ ...o, orderDate: o.orderDate.toISOString().slice(0, 10) }} />
    </>
  );
}
