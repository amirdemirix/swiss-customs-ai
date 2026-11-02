"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">E-Mail</span>
        <Input name="email" type="email" autoComplete="username" required autoFocus defaultValue={state.email} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Passwort</span>
        <Input name="password" type="password" autoComplete="current-password" required /></label>
      {state.error && <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Anmelden …" : "Anmelden"}</Button>
    </form>
  );
}
