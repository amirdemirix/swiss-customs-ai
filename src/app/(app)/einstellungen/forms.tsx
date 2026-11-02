"use client";
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Action = (p: FormState, fd: FormData) => Promise<FormState>;
const select = "h-9 w-full rounded-md border bg-surface px-2.5 text-sm";

function F({ label, name, err, hint, ...rest }: { label: string; name: string; err?: string[]; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input name={name} aria-invalid={!!err} {...rest} />
      {hint && !err && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {err?.map((e) => <span key={e} className="block text-xs text-critical">{e}</span>)}
    </label>
  );
}
const Msg = ({ s }: { s: FormState }) => (s.message ? <p role="status" className={`text-sm ${s.ok ? "text-success" : "text-critical"}`}>{s.message}</p> : null);

function useResetOnSuccess(s: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.ok) ref.current?.reset(); }, [s]);
  return ref;
}

export function TenantForm({ action, defaults: initial }: { action: Action; defaults: { name: string; retentionDays: string; reviewConfidenceThreshold: string } }) {
  const [s, act, pending] = useActionState(action, {});
  const defaults = { ...initial, ...s.values };
  const e = s.errors ?? {};
  return (
    <form action={act} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <F label="Firmenname" name="name" defaultValue={defaults.name} err={e.name} required />
        <F label="Aufbewahrung Originalbelege (Tage)" name="retentionDays" inputMode="numeric" defaultValue={defaults.retentionDays} err={e.retentionDays}
          hint="Leer = bis zur manuellen Löschung. Gesetzliche Fristen mit Rechtsdienst klären." />
        <F label="Konfidenzschwelle für Kontrolle" name="reviewConfidenceThreshold" defaultValue={defaults.reviewConfidenceThreshold} err={e.reviewConfidenceThreshold}
          hint="KI-Werte unter dieser Schwelle verlangen eine manuelle Kontrolle." />
      </div>
      <div className="flex items-center gap-3"><Button disabled={pending}>Speichern</Button><Msg s={s} /></div>
    </form>
  );
}

export function AddUserForm({ action }: { action: Action }) {
  const [s, act, pending] = useActionState(action, {});
  const ref = useResetOnSuccess(s);
  const e = s.errors ?? {};
  const v = s.values ?? {};
  return (
    <form ref={ref} action={act} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_10rem_1fr_auto] md:items-start">
        <F label="E-Mail" name="email" type="email" autoComplete="off" err={e.email} required defaultValue={v.email} />
        <F label="Name" name="name" err={e.name} required defaultValue={v.name} />
        <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Rolle</span>
          <select name="role" className={select} key={v.role} defaultValue={v.role ?? "DECLARANT"}>
            <option value="DECLARANT">Zolldeklarant</option><option value="REVIEWER">Prüfer</option><option value="READ_ONLY">Nur Lesen</option><option value="ADMIN">Administrator</option>
          </select></label>
        <F label="Startpasswort" name="password" type="password" autoComplete="new-password" err={e.password} hint="Nur für neue Konten" />
        <Button className="md:mt-[22px]" disabled={pending}>Hinzufügen</Button>
      </div>
      <Msg s={s} />
    </form>
  );
}

export function PasswordForm({ action }: { action: Action }) {
  const [s, act, pending] = useActionState(action, {});
  const ref = useResetOnSuccess(s);
  const e = s.errors ?? {};
  return (
    <form ref={ref} action={act} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <F label="Aktuelles Passwort" name="current" type="password" autoComplete="current-password" err={e.current} required />
        <F label="Neues Passwort" name="next" type="password" autoComplete="new-password" err={e.next} hint="Min. 12 Zeichen, Gross-/Kleinbuchstaben, Ziffer" required />
        <F label="Wiederholen" name="repeat" type="password" autoComplete="new-password" err={e.repeat} required />
      </div>
      <div className="flex items-center gap-3"><Button disabled={pending}>Passwort ändern</Button><Msg s={s} /></div>
    </form>
  );
}
