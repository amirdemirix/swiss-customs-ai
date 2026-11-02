import { Trash2 } from "lucide-react";
import type { ExchangeRate } from "@prisma/client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { formatDate } from "@/lib/utils";
import { deleteRate, saveRate } from "./actions";

/** Umrechnungskurse je Fremdwährung des Auftrags (Kursquelle und Kursdatum sind Pflicht). */
export function RatesCard({ orderId, target, currencies, rates, canEdit }: { orderId: string; target: string; currencies: string[]; rates: ExchangeRate[]; canEdit: boolean }) {
  const needed = [...new Set([...currencies.filter((c) => c !== target), ...rates.map((r) => r.fromCurrency)])].sort();
  if (!needed.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Umrechnungskurse → {target}</CardTitle>
        <span className="text-xs text-muted-foreground">Verbindliche Kursquelle mit Ihrer Praxis abklären (z. B. BAZG-Kurs am Tag der Anmeldung)</span>
      </CardHeader>
      <ul className="divide-y text-sm">
        {needed.map((cur) => {
          const r = rates.find((x) => x.fromCurrency === cur);
          return (
            <li key={cur} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="w-24 font-mono font-medium">{cur} → {target}</span>
              {r ? (
                <>
                  <span className="tabular-nums"><strong>{r.rate.toString()}</strong></span>
                  <span className="text-muted-foreground">Stand {formatDate(r.validOn)} · {r.source}</span>
                  {canEdit && <ActionForm action={deleteRate.bind(null, orderId, r.id)} className="ml-auto"><button title="Kurs entfernen" className="text-muted-foreground hover:text-critical"><Trash2 className="size-4" /></button></ActionForm>}
                </>
              ) : <Badge tone="critical">Kurs fehlt</Badge>}
              {canEdit && !r && (
                <ActionForm action={saveRate.bind(null, orderId)} className="flex basis-full flex-wrap items-center gap-2">
                  <input type="hidden" name="fromCurrency" value={cur} />
                  <Input name="rate" placeholder={`1 ${cur} = ? ${target}`} className="h-8 w-36" inputMode="decimal" required aria-label="Kurs" />
                  <Input name="validOn" type="date" defaultValue={today} className="h-8 w-40" required aria-label="Kursdatum" />
                  <Input name="source" placeholder="Kursquelle, z. B. BAZG Tageskurs" className="h-8 w-64" required aria-label="Kursquelle" />
                  <Button size="sm">Kurs speichern</Button>
                </ActionForm>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
