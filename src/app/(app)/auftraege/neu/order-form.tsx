"use client";
import { useActionState } from "react";
import type { FormState } from "../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const select = "h-9 w-full rounded-md border bg-surface px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function Field({ label, name, err, children, required }: { label: string; name: string; err?: string[]; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block space-y-1.5" htmlFor={name}>
      <span className="text-xs font-medium text-muted-foreground">{label}{required && <span className="text-critical"> *</span>}</span>
      {children}
      {err?.map((e) => <span key={e} className="block text-xs text-critical">{e}</span>)}
    </label>
  );
}

export interface OrderDefaults {
  orderNumber?: string; customerId?: string | null; direction?: string; consignor?: string | null; consignee?: string | null;
  dispatchCountry?: string | null; destinationCountry?: string | null; transportMode?: string | null; reference?: string | null; orderDate?: string; remarks?: string | null;
  groupingProfileId?: string | null;
}

export function OrderForm({ customers, profiles = [], action: submit, defaults, submitLabel }: {
  customers: { id: string; name: string }[];
  profiles?: { id: string; name: string; isDefault: boolean }[];
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults: OrderDefaults;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submit, {});
  const v = (x: string | null | undefined) => x ?? "";
  // Nach Fehlern: eingegebene Werte statt Ausgangswerte (React setzt Formulare nach Actions zurück)
  if (state.values) defaults = { ...defaults, ...state.values };
  const e = state.errors ?? {};
  return (
    <form action={action}>
      <Card>
        {state.message && <p role="alert" className="mx-5 mt-5 rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{state.message}</p>}
        <CardContent className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Auftragsnummer" name="orderNumber" err={e.orderNumber} required><Input id="orderNumber" name="orderNumber" autoFocus defaultValue={v(defaults.orderNumber)} /></Field>
          <Field label="Kunde" name="customerId" err={e.customerId}>
            <select id="customerId" name="customerId" className={select} key={`c-${defaults.customerId}`} defaultValue={v(defaults.customerId)}><option value="">– wählen –</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
          <Field label="Richtung" name="direction" err={e.direction} required>
            <select id="direction" name="direction" className={select} key={`d-${defaults.direction}`} defaultValue={defaults.direction ?? "IMPORT"}><option value="IMPORT">Einfuhr</option><option value="EXPORT">Ausfuhr</option><option value="TRANSIT">Transit</option></select>
          </Field>
          <Field label="Absender" name="consignor" err={e.consignor}><Input id="consignor" name="consignor" defaultValue={v(defaults.consignor)} /></Field>
          <Field label="Empfänger" name="consignee" err={e.consignee}><Input id="consignee" name="consignee" defaultValue={v(defaults.consignee)} /></Field>
          <Field label="Transportart" name="transportMode" err={e.transportMode}>
            <select id="transportMode" name="transportMode" className={select} key={`t-${defaults.transportMode}`} defaultValue={v(defaults.transportMode)}><option value="">–</option><option value="ROAD">Strasse</option><option value="RAIL">Bahn</option><option value="AIR">Luft</option><option value="SEA">See</option><option value="POST">Post</option><option value="OTHER">Andere</option></select>
          </Field>
          <Field label="Versandland (ISO)" name="dispatchCountry" err={e.dispatchCountry}><Input id="dispatchCountry" name="dispatchCountry" maxLength={2} placeholder="DE" defaultValue={v(defaults.dispatchCountry)} /></Field>
          <Field label="Bestimmungsland (ISO)" name="destinationCountry" err={e.destinationCountry}><Input id="destinationCountry" name="destinationCountry" maxLength={2} defaultValue={v(defaults.destinationCountry)} /></Field>
          <Field label="Referenznummer" name="reference" err={e.reference}><Input id="reference" name="reference" defaultValue={v(defaults.reference)} /></Field>
          <Field label="Datum" name="orderDate" err={e.orderDate} required><Input id="orderDate" name="orderDate" type="date" defaultValue={defaults.orderDate} /></Field>
          <Field label="Gruppierungsprofil" name="groupingProfileId" err={e.groupingProfileId}>
            <select id="groupingProfileId" name="groupingProfileId" className={select} key={`g-${defaults.groupingProfileId}`} defaultValue={v(defaults.groupingProfileId)}>
              <option value="">Standardprofil</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (Standard)" : ""}</option>)}
            </select>
          </Field>
          <div className="md:col-span-2"><Field label="Bemerkungen" name="remarks" err={e.remarks}><textarea id="remarks" name="remarks" rows={2} className={`${select} h-auto py-2`} defaultValue={v(defaults.remarks)} /></Field></div>
        </CardContent>
        <div className="flex justify-end gap-2 border-t px-5 py-3"><Button type="submit" disabled={pending}>{pending ? "Speichern …" : submitLabel}</Button></div>
      </Card>
    </form>
  );
}
