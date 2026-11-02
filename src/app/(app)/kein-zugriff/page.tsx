import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getContext, ROLE_LABEL } from "@/server/context";

export default async function NoAccess() {
  const ctx = await getContext();
  return (
    <Card className="mx-auto mt-10 max-w-md">
      <CardContent className="space-y-3 text-center">
        <ShieldAlert className="mx-auto size-8 text-warning" />
        <h1>Keine Berechtigung</h1>
        <p className="text-sm text-muted-foreground">Ihre Rolle „{ROLE_LABEL[ctx.role]}“ erlaubt diese Aktion nicht. Wenden Sie sich an einen Administrator Ihrer Firma.</p>
        <Link href="/" className="text-sm text-primary hover:underline">Zum Dashboard</Link>
      </CardContent>
    </Card>
  );
}
