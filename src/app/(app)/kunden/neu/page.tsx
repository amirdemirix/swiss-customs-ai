import { getContext, requireCan } from "@/server/context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerForm } from "../forms";
import { saveCustomer } from "../actions";

export default async function NewCustomer() {
  requireCan(await getContext(), "customer.write");
  return (
    <>
      <PageHeader title="Neuer Kunde" />
      <Card><CardContent><CustomerForm action={saveCustomer.bind(null, null)} submitLabel="Kunde anlegen" /></CardContent></Card>
    </>
  );
}
