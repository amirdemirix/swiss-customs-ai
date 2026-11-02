"use client";
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Action = (p: FormState, fd: FormData) => Promise<FormState>;

function F({ label, name, err, required, ...rest }: { label: string; name: string; err?: string[]; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}{required && <span className="text-critical"> *</span>}</span>
      <Input name={name} aria-invalid={!!err} {...rest} />
      {err?.map((e) => <span key={e} className="block text-xs text-critical">{e}</span>)}
    </label>
  );
}
const Msg = ({ s }: { s: FormState }) => s.message ? <p role="status" className={`text-sm ${s.ok ? "text-success" : "text-critical"}`}>{s.message}</p> : null;

export function CustomerForm({ action, defaults = {}, submitLabel, disabled }: { action: Action; defaults?: Record<string, string | null>; submitLabel: string; disabled?: boolean }) {
  const [s, act, pending] = useActionState(action, {});
  const e = s.errors ?? {};
  const v = (k: string) => s.values?.[k] ?? defaults[k] ?? "";
  return (
    <form action={act} className="space-y-4">
      <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-2">
        <F label="Name" name="name" required defaultValue={v("name")} err={e.name} />
        <F label="Kundennummer" name="number" defaultValue={v("number")} err={e.number} />
        <F label="UID" name="uid" placeholder="CHE-123.456.789" defaultValue={v("uid")} err={e.uid} />
        <F label="Land (ISO)" name="country" maxLength={2} defaultValue={v("country")} err={e.country} />
        <div className="md:col-span-2"><F label="Adresse" name="address" defaultValue={v("address")} err={e.address} /></div>
      </fieldset>
      {!disabled && <div className="flex items-center gap-3"><Button disabled={pending}>{pending ? "Speichern …" : submitLabel}</Button><Msg s={s} /></div>}
    </form>
  );
}

export function ArticleForm({ action }: { action: Action }) {
  const [s, act, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.ok) ref.current?.reset(); }, [s]);
  const e = s.errors ?? {};
  const v = (k: string) => s.values?.[k] ?? "";
  return (
    <form ref={ref} action={act} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_1fr_5rem_5rem_auto] md:items-start">
        <F label="Artikel-Nr." name="articleNumber" defaultValue={v("articleNumber")} required err={e.articleNumber} />
        <F label="Beschreibung" name="description" defaultValue={v("description")} err={e.description} />
        <F label="CH-Tarif-Nr." name="tariffNumber" defaultValue={v("tariffNumber")} placeholder="NNNN.NNNN" required err={e.tariffNumber} className="font-mono" />
        <F label="Schl." name="statisticalKey" defaultValue={v("statisticalKey")} placeholder="000" maxLength={3} err={e.statisticalKey} />
        <F label="Ursprung" name="originCountry" defaultValue={v("originCountry")} maxLength={2} err={e.originCountry} />
        <Button className="md:mt-[22px]" disabled={pending}>Speichern</Button>
      </div>
      <Msg s={s} />
    </form>
  );
}
