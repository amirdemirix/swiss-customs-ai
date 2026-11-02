import { Sidebar } from "@/components/layout/sidebar";
import { getContext, can, ROLE_LABEL } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const hidden = can(ctx.role, "order.write") ? [] : ["/auftraege/neu"];
  return (
    <div className="flex min-h-screen">
      <Sidebar tenantId={ctx.tenantId} tenantName={ctx.tenantName} tenants={ctx.tenants} userName={ctx.userName} roleLabel={ROLE_LABEL[ctx.role]} hidden={hidden} />
      <main className="min-w-0 flex-1 px-6 py-7 lg:px-10"><div className="mx-auto max-w-7xl">{children}</div></main>
    </div>
  );
}
